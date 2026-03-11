"""
Роутер для работы с цветами
"""
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List

from .. import crud, schemas
from ..database import get_db
from .dependencies import get_current_admin_user

router = APIRouter(prefix="/flowers", tags=["flowers"])

# Путь для загрузки файлов
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = BASE_DIR / "static" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/", response_model=schemas.FlowerBatch)
def create_flower(
    name: str = Form(...),
    description: str = Form(...),
    price: float = Form(...),
    quantity: int = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Создать новую партию цветов (только для админа)
    """
    # Сохраняем загруженный файл
    file_path = UPLOADS_DIR / image.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)

    flower_data = schemas.FlowerBatchCreate(
        name=name,
        description=description,
        price=price,
        quantity=quantity,
        image_url=f"/static/uploads/{image.filename}"
    )
    
    return crud.create_flower_batch(db=db, flower=flower_data)


@router.get("/", response_model=List[schemas.FlowerBatch])
def read_flowers(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Получить список всех цветов
    """
    flowers = crud.get_flowers(db, skip=skip, limit=limit)
    return flowers


@router.get("/{flower_id}", response_model=schemas.FlowerBatch)
def read_flower(
    flower_id: int,
    db: Session = Depends(get_db)
):
    """
    Получить цветок по ID
    """
    db_flower = crud.get_flower(db, flower_id=flower_id)
    if db_flower is None:
        raise HTTPException(status_code=404, detail="Flower not found")
    return db_flower


@router.put("/{flower_id}", response_model=schemas.FlowerBatch)
def update_flower_endpoint(
    flower_id: int,
    flower_update: schemas.FlowerBatchUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Обновить данные цветка (только для админа)
    """
    db_flower = crud.update_flower(db, flower_id=flower_id, flower_update=flower_update)
    if db_flower is None:
        raise HTTPException(status_code=404, detail="Flower not found")
    return db_flower


@router.patch("/{flower_id}/sell", response_model=schemas.FlowerBatch)
def sell_flower(
    flower_id: int,
    sell_request: schemas.SellRequest,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Продать цветы (уменьшить количество)
    """
    db_flower = crud.sell_flowers(db, flower_id=flower_id, quantity_to_sell=sell_request.quantity)
    if db_flower is None:
        raise HTTPException(status_code=404, detail="Flower not found or not enough quantity")
    return db_flower


@router.patch("/{flower_id}/add", response_model=schemas.FlowerBatch)
def add_flower_quantity(
    flower_id: int,
    add_request: schemas.SellRequest,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Добавить количество цветов
    """
    db_flower = crud.add_quantity(db, flower_id=flower_id, quantity_to_add=add_request.quantity)
    if db_flower is None:
        raise HTTPException(status_code=404, detail="Flower not found")
    return db_flower


@router.delete("/{flower_id}", response_model=schemas.FlowerBatch)
def delete_flower(
    flower_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Удалить партию цветов
    """
    db_flower = crud.delete_flower(db, flower_id=flower_id)
    if db_flower is None:
        raise HTTPException(status_code=404, detail="Flower not found")
    return db_flower


@router.post("/cleanup")
def cleanup_old_flowers(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Очистить старые записи о цветах
    """
    crud.delete_old_flowers(db)
    return {"message": "Cleanup successful"}
