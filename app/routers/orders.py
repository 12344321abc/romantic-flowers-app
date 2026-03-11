"""
Роутер для работы с заказами
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from .. import crud, schemas, telegram
from ..database import get_db
from .dependencies import get_current_user, get_current_admin_user

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("/me/", response_model=List[schemas.Order])
def read_my_orders(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """
    Получить заказы текущего пользователя
    """
    if current_user.role != 'customer':
        raise HTTPException(status_code=403, detail="Admins cannot have order history.")
    return crud.get_orders_by_customer(db, customer_id=current_user.id)


@router.post("/", response_model=schemas.Order)
def create_order_endpoint(
    order: schemas.OrderCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """
    Создать новый заказ
    """
    if current_user.role != 'customer':
        raise HTTPException(status_code=403, detail="Only customers can create orders.")

    result = crud.create_order(db=db, order=order, customer_id=current_user.id)
    if isinstance(result, str):  # Error message returned
        raise HTTPException(status_code=400, detail=result)
    db_order = result

    # Подготовка данных для Telegram уведомления
    items_details = []
    for item in db_order.items:
        flower_batch = crud.get_flower(db, item.flower_batch_id)
        items_details.append({
            "flower_batch_id": item.flower_batch_id,
            "quantity": item.quantity,
            "name": flower_batch.name if flower_batch else "Неизвестный цветок",
            "description": flower_batch.description if flower_batch else ""
        })

    order_details = {
        "order_id": db_order.id,
        "customer_name": current_user.contact_name,
        "customer_username": current_user.username,
        "customer_address": current_user.address,
        "comment": db_order.customer_comment,
        "items": items_details
    }
    
    # Добавляем отправку уведомления в фоновые задачи
    background_tasks.add_task(
        telegram.send_new_order_notification,
        order_details=order_details
    )

    return db_order


@router.get("/", response_model=List[schemas.Order])
def read_orders(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Получить все заказы (только для админа)
    """
    orders = crud.get_orders(db, skip=skip, limit=limit)
    return orders


@router.get("/paginated/", response_model=schemas.PaginatedResponse[schemas.Order])
def read_orders_paginated(
    page: int = 1,
    per_page: int = 20,
    db: Session = Depends(get_db),
    admin_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Получить все заказы с пагинацией (только для админа)
    """
    return crud.get_orders_paginated(db, page=page, per_page=per_page)


@router.get("/statuses/list")
def get_order_statuses(
    admin_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Получить список доступных статусов заказа (только для админа)
    """
    return [status.value for status in schemas.OrderStatus]


@router.get("/{order_id}", response_model=schemas.Order)
def read_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """
    Получить заказ по ID
    """
    db_order = crud.get_order(db, order_id=order_id)
    if db_order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Админ может видеть любой заказ, клиент - только свой
    if current_user.role != 'admin' and db_order.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to view this order")
        
    return db_order


@router.patch("/{order_id}/status", response_model=schemas.Order)
def update_order_status(
    order_id: int,
    status_update: schemas.OrderStatusUpdate,
    db: Session = Depends(get_db),
    admin_user: schemas.User = Depends(get_current_admin_user)
):
    """
    Обновить статус заказа (только для админа).
    Доступные статусы: new, processing, ready, completed, cancelled
    """
    db_order = crud.update_order_status(db, order_id=order_id, new_status=status_update.status)
    
    if db_order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    
    return db_order
