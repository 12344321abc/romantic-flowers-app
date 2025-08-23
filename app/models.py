from sqlalchemy import Column, Integer, String, Float, DateTime, func
from .database import Base
import datetime

class FlowerBatch(Base):
    __tablename__ = "flower_batches"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String)
    price = Column(Float)
    quantity = Column(Integer)
    image_url = Column(String)
    status = Column(String, default="available") # available or sold
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    sold_at = Column(DateTime, nullable=True)

from sqlalchemy.orm import relationship
from sqlalchemy import ForeignKey


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="customer", nullable=False)  # 'admin' or 'customer'

    # Customer-specific fields
    contact_name = Column(String, nullable=True)
    address = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    admin_notes = Column(String, nullable=True)

    orders = relationship("Order", back_populates="customer")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String, default="new") # e.g., 'new', 'completed', 'cancelled'
    customer_comment = Column(String, nullable=True)
    
    customer = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    flower_batch_id = Column(Integer, ForeignKey("flower_batches.id"))
    quantity = Column(Integer)
    price_at_time_of_order = Column(Float)

    order = relationship("Order", back_populates="items")
    flower_batch = relationship("FlowerBatch")
