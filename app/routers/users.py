"""
Роутер для работы с пользователями
"""
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import crud, schemas
from ..database import get_db
from .dependencies import get_current_user, get_current_admin_user

router = APIRouter(prefix="/users", tags=["users"])

# Путь для загрузки файлов
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = BASE_DIR / "static" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/", response_model=schemas.User)
def create_user_endpoint(
    db: Session = Depends(get_db),
    admin_user: schemas.User = Depends(get_current_admin_user),
    username: str = Form(...),
    password: str = Form(...),
    contact_name: str = Form(...),
    address: str = Form(""),
    admin_notes: str = Form(""),
    photo: Optional[UploadFile] = File(None)
):
    """
    Создать нового пользователя (только для админа)
    """
    db_user = crud.get_user_by_username(db, username=username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    photo_url = None
    if photo:
        file_path = UPLOADS_DIR / photo.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(photo.file, buffer)
        photo_url = f"/static/uploads/{photo.filename}"
    
    user_schema = schemas.UserCreate(
        username=username,
        password=password,
        contact_name=contact_name,
        address=address,
        admin_notes=admin_notes,
    )
    
    return crud.create_user(db=db, user=user_schema, photo_url=photo_url)


@router.get("/", response_model=List[schemas.User])
def read_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Получить список пользователей (только для админа)
    """
    users = crud.get_users(db, skip=skip, limit=limit)
    return users


@router.get("/me/", response_model=schemas.User)
async def read_users_me(
    current_user: schemas.User = Depends(get_current_user)
):
    """
    Получить данные текущего пользователя
    """
    return current_user


@router.get("/me/admin/", response_model=schemas.User)
async def read_admin_me(
    current_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Проверить, что текущий пользователь - админ
    """
    return current_user


@router.get("/{user_id}", response_model=schemas.User)
def read_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Получить пользователя по ID (только для админа)
    """
    db_user = crud.get_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


@router.put("/{user_id}", response_model=schemas.User)
def update_user_endpoint(
    user_id: int,
    user_update: schemas.UserUpdate,
    db: Session = Depends(get_db),
    admin_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Обновить данные пользователя (только для админа)
    """
    db_user = crud.update_user(db, user_id=user_id, user_update=user_update)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


@router.delete("/{user_id}", response_model=schemas.User)
def delete_user_endpoint(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Удалить пользователя (только для админа)
    """
    db_user = crud.delete_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user
