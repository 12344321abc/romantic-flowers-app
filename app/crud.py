import os
from pathlib import Path
from sqlalchemy.orm import Session
from typing import Optional
from . import models, schemas
from datetime import datetime, timedelta

def get_flower(db: Session, flower_id: int):
    return db.query(models.FlowerBatch).filter(models.FlowerBatch.id == flower_id).first()

def get_flowers(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.FlowerBatch).offset(skip).limit(limit).all()


def get_flowers_paginated(db: Session, page: int = 1, per_page: int = 20):
    """Get flowers with pagination metadata"""
    query = db.query(models.FlowerBatch)
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page  # Ceiling division
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages
    }


def get_users_paginated(db: Session, page: int = 1, per_page: int = 20):
    """Get users with pagination metadata"""
    query = db.query(models.User)
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages
    }


def get_orders_paginated(db: Session, page: int = 1, per_page: int = 20):
    """Get orders with pagination metadata"""
    query = db.query(models.Order).order_by(models.Order.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages
    }

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.User).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate, photo_url: Optional[str] = None):
    from .auth import get_password_hash
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        hashed_password=hashed_password,
        role=user.role,
        contact_name=user.contact_name,
        address=user.address,
        photo_url=photo_url, # Use the passed photo_url
        admin_notes=user.admin_notes
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: int, user_update: schemas.UserUpdate):
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    
    update_data = user_update.dict(exclude_unset=True)
    if "password" in update_data and update_data["password"]:
        from .auth import get_password_hash
        hashed_password = get_password_hash(update_data["password"])
        db_user.hashed_password = hashed_password
    
    # Update other fields
    for key, value in update_data.items():
        if key != "password":
            setattr(db_user, key, value)
            
    db.commit()
    db.refresh(db_user)
    return db_user


def update_user_self(db: Session, user_id: int, user_update: schemas.UserSelfUpdate):
    """Update user's own profile with limited fields"""
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    
    update_data = user_update.dict(exclude_unset=True)
    
    if "password" in update_data and update_data["password"]:
        from .auth import get_password_hash
        hashed_password = get_password_hash(update_data["password"])
        db_user.hashed_password = hashed_password
    
    # Update allowed fields
    if "contact_name" in update_data:
        db_user.contact_name = update_data["contact_name"]
    if "address" in update_data:
        db_user.address = update_data["address"]
            
    db.commit()
    db.refresh(db_user)
    return db_user

def delete_user(db: Session, user_id: int):
    db_user = get_user(db, user_id)
    if db_user:
        if db_user.photo_url:
            # Construct absolute path to the file
            file_path = Path(__file__).resolve().parent / "static" / db_user.photo_url.lstrip('/static/')
            if os.path.exists(file_path):
                os.remove(file_path)
        db.delete(db_user)
        db.commit()
    return db_user

# --- Order CRUD ---

def get_order(db: Session, order_id: int):
    return db.query(models.Order).filter(models.Order.id == order_id).first()

def get_orders(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Order).order_by(models.Order.created_at.desc()).offset(skip).limit(limit).all()

def get_orders_by_customer(db: Session, customer_id: int):
    return db.query(models.Order).filter(models.Order.customer_id == customer_id).order_by(models.Order.created_at.desc()).all()


def update_order_status(db: Session, order_id: int, new_status: schemas.OrderStatus):
    """Update order status. Returns the updated order or None if not found."""
    db_order = get_order(db, order_id)
    if not db_order:
        return None
    
    db_order.status = new_status.value
    db.commit()
    db.refresh(db_order)
    return db_order


def create_order(db: Session, order: schemas.OrderCreate, customer_id: int):
    # Get customer to denormalize their name
    customer = get_user(db, customer_id)
    customer_name = customer.contact_name if customer else None
    
    db_order = models.Order(
        customer_id=customer_id,
        customer_comment=order.customer_comment,
        customer_name=customer_name  # Denormalized: preserves name at time of order
    )
    db.add(db_order)
    
    total_amount = 0
    for item in order.items:
        flower_batch = get_flower(db, item.flower_batch_id)
        if not flower_batch:
            db.rollback()
            return f"Товар с ID {item.flower_batch_id} не найден."
        if flower_batch.quantity < item.quantity:
            # Not enough stock, rollback transaction
            db.rollback()
            return f"Недостаточно товара '{flower_batch.name}'. В наличии: {flower_batch.quantity}, запрошено: {item.quantity}."

        db_order_item = models.OrderItem(
            order=db_order,
            flower_batch_id=item.flower_batch_id,
            quantity=item.quantity,
            price_at_time_of_order=flower_batch.price,
            flower_name=flower_batch.name  # Denormalized: preserves name at time of order
        )
        flower_batch.quantity -= item.quantity
        if flower_batch.quantity == 0:
            flower_batch.status = "sold"
            flower_batch.sold_at = datetime.utcnow()
        db.add(db_order_item)
        total_amount += flower_batch.price * item.quantity

    if total_amount < 5000:
        db.rollback()
        return f"Минимальная сумма заказа - 5000 руб. Ваша сумма: {int(total_amount)} руб."

    db.commit()
    db.refresh(db_order)
    return db_order

def create_flower_batch(db: Session, flower: schemas.FlowerBatchCreate):
    db_flower = models.FlowerBatch(
        name=flower.name,
        description=flower.description,
        price=flower.price,
        quantity=flower.quantity,
        image_url=flower.image_url
    )
    db.add(db_flower)
    db.commit()
    db.refresh(db_flower)
    return db_flower

def update_flower(db: Session, flower_id: int, flower_update: schemas.FlowerBatchUpdate):
    db_flower = get_flower(db, flower_id)
    if not db_flower:
        return None

    update_data = flower_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_flower, key, value)
    
    db.commit()
    db.refresh(db_flower)
    return db_flower

def sell_flowers(db: Session, flower_id: int, quantity_to_sell: int):
    db_flower = get_flower(db=db, flower_id=flower_id)
    if db_flower and db_flower.quantity >= quantity_to_sell:
        db_flower.quantity -= quantity_to_sell
        if db_flower.quantity == 0:
            db_flower.status = "sold"
            db_flower.sold_at = datetime.utcnow()
        db.commit()
        db.refresh(db_flower)
    return db_flower

def delete_flower(db: Session, flower_id: int):
    db_flower = get_flower(db, flower_id)
    if db_flower:
        if db_flower.image_url:
            # Construct absolute path to the file
            file_path = Path(__file__).resolve().parent / "static" / db_flower.image_url.lstrip('/static/')
            if os.path.exists(file_path):
                os.remove(file_path)
        db.delete(db_flower)
        db.commit()
    return db_flower

def add_quantity(db: Session, flower_id: int, quantity_to_add: int):
    db_flower = get_flower(db=db, flower_id=flower_id)
    if db_flower:
        db_flower.quantity += quantity_to_add
        # If we are adding stock, it should become available again
        if db_flower.status == "sold":
            db_flower.status = "available"
            db_flower.sold_at = None
        db.commit()
        db.refresh(db_flower)
    return db_flower

def delete_old_flowers(db: Session):
    # --- Deleting Sold Flowers ---
    one_week_ago = datetime.utcnow() - timedelta(weeks=1)
    sold_flowers_to_delete = db.query(models.FlowerBatch).filter(
        models.FlowerBatch.status == "sold",
        models.FlowerBatch.sold_at <= one_week_ago
    ).all()

    for flower in sold_flowers_to_delete:
        if flower.image_url:
            file_path = Path(__file__).resolve().parent / "static" / flower.image_url.lstrip('/static/')
            if os.path.exists(file_path):
                os.remove(file_path)
        db.delete(flower)

    # --- Deleting Available Flowers ---
    three_weeks_ago = datetime.utcnow() - timedelta(weeks=3)
    available_flowers_to_delete = db.query(models.FlowerBatch).filter(
        models.FlowerBatch.status == "available",
        models.FlowerBatch.created_at <= three_weeks_ago
    ).all()

    for flower in available_flowers_to_delete:
        if flower.image_url:
            file_path = Path(__file__).resolve().parent / "static" / flower.image_url.lstrip('/static/')
            if os.path.exists(file_path):
                os.remove(file_path)
        db.delete(flower)

    db.commit()

# --- Telegram Subscriber CRUD ---

def get_subscriber(db: Session, chat_id: int):
    return db.query(models.TelegramSubscriber).filter(models.TelegramSubscriber.chat_id == chat_id).first()

def create_or_update_subscriber(db: Session, chat_id: int, is_active: bool = True):
    db_subscriber = get_subscriber(db, chat_id)
    if db_subscriber:
        db_subscriber.is_active = is_active
    else:
        db_subscriber = models.TelegramSubscriber(chat_id=chat_id, is_active=is_active)
        db.add(db_subscriber)
    db.commit()
    db.refresh(db_subscriber)
    return db_subscriber

def get_active_subscribers(db: Session):
    return db.query(models.TelegramSubscriber).filter(models.TelegramSubscriber.is_active == True).all()


# --- Refresh Token CRUD ---

def create_refresh_token(
    db: Session,
    token: str,
    user_id: int,
    expires_at: datetime,
    device_info: Optional[str] = None
) -> models.RefreshToken:
    """Create a new refresh token in the database."""
    db_token = models.RefreshToken(
        token=token,
        user_id=user_id,
        expires_at=expires_at,
        device_info=device_info
    )
    db.add(db_token)
    db.commit()
    db.refresh(db_token)
    return db_token


def get_refresh_token(db: Session, token: str) -> Optional[models.RefreshToken]:
    """Get refresh token by token string."""
    return db.query(models.RefreshToken).filter(
        models.RefreshToken.token == token
    ).first()


def get_valid_refresh_token(db: Session, token: str) -> Optional[models.RefreshToken]:
    """Get refresh token if it exists, is not revoked, and not expired."""
    return db.query(models.RefreshToken).filter(
        models.RefreshToken.token == token,
        models.RefreshToken.is_revoked == False,
        models.RefreshToken.expires_at > datetime.utcnow()
    ).first()


def revoke_refresh_token(db: Session, token: str) -> bool:
    """Revoke a specific refresh token. Returns True if found and revoked."""
    db_token = get_refresh_token(db, token)
    if db_token:
        db_token.is_revoked = True
        db.commit()
        return True
    return False


def revoke_all_user_tokens(db: Session, user_id: int) -> int:
    """Revoke all refresh tokens for a user. Returns number of tokens revoked."""
    result = db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == user_id,
        models.RefreshToken.is_revoked == False
    ).update({"is_revoked": True})
    db.commit()
    return result


def get_user_refresh_tokens(db: Session, user_id: int):
    """Get all active (not revoked, not expired) refresh tokens for a user."""
    return db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == user_id,
        models.RefreshToken.is_revoked == False,
        models.RefreshToken.expires_at > datetime.utcnow()
    ).all()


def cleanup_expired_tokens(db: Session) -> int:
    """Delete all expired or revoked tokens. Returns number deleted."""
    result = db.query(models.RefreshToken).filter(
        (models.RefreshToken.expires_at < datetime.utcnow()) |
        (models.RefreshToken.is_revoked == True)
    ).delete()
    db.commit()
    return result


def rotate_refresh_token(
    db: Session,
    old_token: str,
    new_token: str,
    expires_at: datetime
) -> Optional[models.RefreshToken]:
    """
    Rotate refresh token: revoke old token and create new one.
    Returns new token if successful, None if old token not found/invalid.
    """
    old_db_token = get_valid_refresh_token(db, old_token)
    if not old_db_token:
        return None
    
    # Revoke old token
    old_db_token.is_revoked = True
    
    # Create new token with same user and device info
    new_db_token = models.RefreshToken(
        token=new_token,
        user_id=old_db_token.user_id,
        expires_at=expires_at,
        device_info=old_db_token.device_info
    )
    db.add(new_db_token)
    db.commit()
    db.refresh(new_db_token)
    return new_db_token