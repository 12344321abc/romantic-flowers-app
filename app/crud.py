from sqlalchemy.orm import Session
from typing import Optional
from . import models, schemas
from datetime import datetime, timedelta

def get_flower(db: Session, flower_id: int):
    return db.query(models.FlowerBatch).filter(models.FlowerBatch.id == flower_id).first()

def get_flowers(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.FlowerBatch).offset(skip).limit(limit).all()

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

def delete_user(db: Session, user_id: int):
    db_user = get_user(db, user_id)
    if db_user:
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

def create_order(db: Session, order: schemas.OrderCreate, customer_id: int):
    db_order = models.Order(
        customer_id=customer_id,
        customer_comment=order.customer_comment
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
            price_at_time_of_order=flower_batch.price
        )
        flower_batch.quantity -= item.quantity
        if flower_batch.quantity == 0:
            flower_batch.status = "sold"
            flower_batch.sold_at = datetime.utcnow()
        db.add(db_order_item)
        total_amount += flower_batch.price * item.quantity

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
    # Delete sold flowers older than 1 week
    one_week_ago = datetime.utcnow() - timedelta(weeks=1)
    db.query(models.FlowerBatch).filter(
        models.FlowerBatch.status == "sold",
        models.FlowerBatch.sold_at <= one_week_ago
    ).delete()

    # Delete available flowers older than 3 weeks
    three_weeks_ago = datetime.utcnow() - timedelta(weeks=3)
    db.query(models.FlowerBatch).filter(
        models.FlowerBatch.status == "available",
        models.FlowerBatch.created_at <= three_weeks_ago
    ).delete()

    db.commit()