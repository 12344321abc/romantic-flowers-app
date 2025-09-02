from pydantic import BaseModel
from typing import Optional, List
import datetime

# --- Flower Schemas ---
class FlowerBatchBase(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    quantity: int
    image_url: str

class FlowerBatchCreate(FlowerBatchBase):
    pass

class FlowerBatchUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    quantity: Optional[int] = None

class FlowerBatch(FlowerBatchBase):
    id: int
    status: str
    created_at: datetime.datetime
    sold_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True

# --- User/Customer Schemas ---
class UserBase(BaseModel):
    username: str
    contact_name: Optional[str] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    admin_notes: Optional[str] = None

class UserCreate(UserBase):
    password: str
    role: str = "customer"

class UserUpdate(UserBase):
    password: Optional[str] = None

class User(UserBase):
    id: int
    role: str
    
    class Config:
        from_attributes = True

# --- Auth Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class SellRequest(BaseModel):
    quantity: int
    
# --- Order Schemas ---
class OrderItemBase(BaseModel):
    flower_batch_id: int
    quantity: int

class OrderItemCreate(OrderItemBase):
    pass

class OrderItem(OrderItemBase):
    id: int
    price_at_time_of_order: float
    
    class Config:
        from_attributes = True

class OrderBase(BaseModel):
    customer_comment: Optional[str] = None

class OrderCreate(OrderBase):
    items: List[OrderItemCreate]

class Order(OrderBase):
    id: int
    customer_id: int
    created_at: datetime.datetime
    status: str
    items: List[OrderItem] = []
    
    class Config:
        from_attributes = True

# --- Telegram Subscriber Schemas ---
class TelegramSubscriberBase(BaseModel):
    chat_id: int

class TelegramSubscriberCreate(TelegramSubscriberBase):
    pass

class TelegramSubscriber(TelegramSubscriberBase):
    is_active: bool

    class Config:
        from_attributes = True