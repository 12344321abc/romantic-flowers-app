"""
Роутер для уведомлений и рассылок
"""
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session

from .. import models, schemas, telegram
from ..database import get_db
from .dependencies import get_current_admin_user

router = APIRouter(prefix="/api", tags=["notifications"])

# Путь для загрузки файлов
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = BASE_DIR / "static" / "uploads"


@router.post("/notify_new_flowers")
async def notify_new_flowers(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Уведомить подписчиков о новых партиях цветов за последние 3 часа
    """
    three_hours_ago = datetime.utcnow() - timedelta(hours=3)
    new_flowers = db.query(models.FlowerBatch).filter(
        models.FlowerBatch.created_at >= three_hours_ago
    ).all()
    
    if not new_flowers:
        return {"message": "Новых цветов за последние 3 часа не найдено."}

    flower_details_list = [
        {
            "name": f.name,
            "description": f.description,
            "price": f.price,
            "quantity": f.quantity,
            "file_path": str(UPLOADS_DIR / Path(f.image_url).name)
        }
        for f in new_flowers
    ]

    background_tasks.add_task(telegram.broadcast_new_flowers, flower_details_list)
    
    return {"message": f"Рассылка о {len(new_flowers)} новых партиях запущена!"}
