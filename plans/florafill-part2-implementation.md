# 🌿 FloraFill — Часть 2: Полная спецификация реализации

> Продолжение `florafill-architecture.md`. Этот файл содержит полный код спецификации для всех сервисов, роутеров, Telegram-бота, фронтенда, CI/CD, тестов и deployment.

---

## 8. API Endpoints — Полная спецификация

### 8.1 Exceptions (`backend/app/exceptions.py`)

```python
from fastapi import HTTPException


class InvalidCredentialsError(HTTPException):
    def __init__(self):
        super().__init__(status_code=401, detail="Неверный email или пароль")


class EmailAlreadyExistsError(HTTPException):
    def __init__(self):
        super().__init__(status_code=409, detail="Пользователь с таким email уже существует")


class PrivacyNotAcceptedError(HTTPException):
    def __init__(self):
        super().__init__(status_code=400, detail="Необходимо принять политику конфиденциальности")


class ValidationError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=400, detail=detail)


class AccessDeniedError(HTTPException):
    def __init__(self, detail: str = "Нет доступа"):
        super().__init__(status_code=403, detail=detail)


class NotFoundError(HTTPException):
    def __init__(self, entity: str = "Объект"):
        super().__init__(status_code=404, detail=f"{entity} не найден")


class InsufficientStockError(HTTPException):
    def __init__(self, flower_name: str, available: int, requested: int):
        super().__init__(
            status_code=400,
            detail=f"Недостаточно товара '{flower_name}'. В наличии: {available}, запрошено: {requested}",
        )


class MinOrderAmountError(HTTPException):
    def __init__(self, min_amount: float, actual_amount: float):
        super().__init__(
            status_code=400,
            detail=f"Минимальная сумма заказа: {int(min_amount)} руб. Ваша сумма: {int(actual_amount)} руб.",
        )


class NoAccessToFarmError(HTTPException):
    def __init__(self):
        super().__init__(status_code=403, detail="У вас нет доступа к этой ферме. Подайте заявку.")
```

### 8.2 Auth Router (`backend/app/routers/auth.py`)

```python
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..database import get_db
from ..config import settings
from ..schemas.auth import RegisterRequest, LoginRequest, TokenResponse, RefreshTokenRequest, TelegramLinkCode
from ..services import auth_service
from ..dependencies import get_current_user
from ..models import User, RefreshToken

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60  # 30 days


def _set_refresh_cookie(response: Response, token: str):
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        max_age=REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.is_production,  # True only with HTTPS
        path="/api/auth",
    )


def _clear_refresh_cookie(response: Response):
    response.delete_cookie(key=REFRESH_COOKIE, path="/api/auth")


@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(
    request: Request,
    response: Response,
    data: RegisterRequest,
    db: Session = Depends(get_db),
):
    """
    Регистрация нового пользователя (флорист или ферма).
    Ферма после регистрации ожидает одобрения администратором.
    privacy_accepted=true обязателен.
    """
    user = auth_service.register_user(db, data)
    access_token, refresh_token, expires_in = auth_service.create_tokens(
        db, user, request.headers.get("User-Agent", "")
    )
    _set_refresh_cookie(response, refresh_token)

    # Notify admin about new farm registration
    if user.role == "farm":
        from ..services.notification_service import notify_admin_new_farm
        await notify_admin_new_farm(user)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        role=user.role,
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    data: LoginRequest,
    db: Session = Depends(get_db),
):
    """Вход по email и паролю."""
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not auth_service.verify_password(data.password, user.hashed_password):
        from ..exceptions import InvalidCredentialsError
        raise InvalidCredentialsError()

    if not user.is_active:
        raise HTTPException(403, "Аккаунт деактивирован")

    access_token, refresh_token, expires_in = auth_service.create_tokens(
        db, user, request.headers.get("User-Agent", "")
    )
    _set_refresh_cookie(response, refresh_token)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        role=user.role,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    body: RefreshTokenRequest = None,
):
    """Обновить access token через refresh token (из cookie или body)."""
    token = None
    if body and body.refresh_token:
        token = body.refresh_token
    else:
        token = request.cookies.get(REFRESH_COOKIE)

    if not token:
        raise HTTPException(401, "Refresh token не предоставлен")

    result = auth_service.rotate_refresh_token(db, token)
    if not result:
        _clear_refresh_cookie(response)
        raise HTTPException(401, "Невалидный или истёкший refresh token")

    new_refresh, _ = result
    db_token = db.query(RefreshToken).filter(RefreshToken.token == new_refresh).first()
    user = db.query(User).filter(User.id == db_token.user_id).first()

    access_token = auth_service.create_access_token(user.email, user.role)
    _set_refresh_cookie(response, new_refresh)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        role=user.role,
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    body: RefreshTokenRequest = None,
):
    """Выход — отзыв текущего refresh token."""
    token = None
    if body and body.refresh_token:
        token = body.refresh_token
    else:
        token = request.cookies.get(REFRESH_COOKIE)

    if token:
        db_token = db.query(RefreshToken).filter(RefreshToken.token == token).first()
        if db_token:
            db_token.is_revoked = True
            db.commit()

    _clear_refresh_cookie(response)
    return {"message": "Вы вышли из системы"}


@router.post("/logout-all")
async def logout_all(
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Выход со всех устройств — отзыв всех refresh tokens."""
    count = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id, RefreshToken.is_revoked == False)
        .update({"is_revoked": True})
    )
    db.commit()
    _clear_refresh_cookie(response)
    return {"message": f"Отозвано сессий: {count}"}


@router.get("/sessions")
async def get_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Получить список активных сессий."""
    tokens = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.user_id == user.id,
            RefreshToken.is_revoked == False,
            RefreshToken.expires_at > datetime.utcnow(),
        )
        .all()
    )
    return {
        "sessions": [
            {"device_info": t.device_info, "created_at": t.created_at.isoformat()}
            for t in tokens
        ]
    }


@router.get("/telegram-link-code", response_model=TelegramLinkCode)
async def get_telegram_link_code(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Получить временный код для привязки Telegram-аккаунта (действует 10 минут)."""
    code = auth_service.generate_telegram_link_code()
    user.telegram_link_code = code
    user.telegram_link_code_expires = datetime.utcnow() + timedelta(minutes=10)
    db.commit()
    return TelegramLinkCode(code=code, expires_in=600)


@router.delete("/account")
async def delete_account(
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Удаление аккаунта и всех ПД (152-ФЗ).
    Денормализованные данные в заказах сохраняются (они обезличены).
    """
    # Revoke all tokens
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).delete()

    # Delete profile
    if user.florist_profile:
        db.delete(user.florist_profile)
    if user.farm_profile:
        db.delete(user.farm_profile)

    # Soft delete user — wipe personal data
    user.is_active = False
    user.email = f"deleted_{user.id}@florafill.local"
    user.hashed_password = ""
    user.telegram_chat_id = None
    user.telegram_link_code = None

    db.commit()
    _clear_refresh_cookie(response)
    return {"message": "Аккаунт удалён"}


@router.get("/my-data")
async def export_my_data(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Выгрузка всех персональных данных пользователя (152-ФЗ: право на доступ к данным)."""
    data = {
        "user": {
            "email": user.email,
            "role": user.role,
            "created_at": str(user.created_at),
        },
    }
    if user.florist_profile:
        p = user.florist_profile
        data["profile"] = {
            "business_name": p.business_name,
            "contact_name": p.contact_name,
            "phone": p.phone,
            "address": p.address,
            "city": p.city,
        }
    if user.farm_profile:
        p = user.farm_profile
        data["profile"] = {
            "farm_name": p.farm_name,
            "contact_name": p.contact_name,
            "phone": p.phone,
            "address": p.address,
        }
    return data
```

### 8.3 Florist Router (`backend/app/routers/florist.py`)

```python
from fastapi import APIRouter, Depends, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..dependencies import require_florist
from ..models import User, FlowerBatch, FarmProfile, AccessRequest, Order
from ..schemas.profile import FloristProfileResponse, FloristProfileUpdate, FarmPublicInfo
from ..schemas.flower import FlowerBatchResponse
from ..schemas.access import AccessRequestCreate, AccessRequestResponse
from ..schemas.order import OrderCreate, OrderResponse
from ..schemas.common import PaginatedResponse
from ..services import order_service, access_service, storage_service
from ..exceptions import NotFoundError

router = APIRouter(prefix="/api/florist", tags=["florist"])


# --- Profile ---

@router.get("/profile", response_model=FloristProfileResponse)
async def get_my_profile(user: User = Depends(require_florist)):
    """Получить профиль текущего флориста."""
    return user.florist_profile


@router.patch("/profile", response_model=FloristProfileResponse)
async def update_my_profile(
    data: FloristProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_florist),
):
    """Обновить профиль флориста (business_name, contact_name, phone, address, city, region_id, password)."""
    profile = user.florist_profile
    update_data = data.model_dump(exclude_unset=True)

    if "password" in update_data and update_data["password"]:
        from ..services.auth_service import hash_password
        user.hashed_password = hash_password(update_data.pop("password"))

    for key, value in update_data.items():
        if key != "password":
            setattr(profile, key, value)

    db.commit()
    db.refresh(profile)
    return profile


@router.patch("/profile/photo", response_model=FloristProfileResponse)
async def update_profile_photo(
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_florist),
):
    """Загрузить/обновить фото профиля."""
    url = storage_service.upload_image(photo, folder="profiles")
    user.florist_profile.photo_url = url
    db.commit()
    return user.florist_profile


# --- Catalog ---

@router.get("/catalog", response_model=PaginatedResponse[FlowerBatchResponse])
async def browse_catalog(
    db: Session = Depends(get_db),
    user: User = Depends(require_florist),
    region_id: Optional[int] = Query(None, description="Фильтр по региону фермы"),
    farm_id: Optional[int] = Query(None, description="Фильтр по конкретной ферме"),
    search: Optional[str] = Query(None, description="Поиск по названию цветка"),
    price_min: Optional[float] = Query(None),
    price_max: Optional[float] = Query(None),
    cut_date_from: Optional[str] = Query(None, description="ISO 8601"),
    cut_date_to: Optional[str] = Query(None, description="ISO 8601"),
    sort_by: Optional[str] = Query(
        "cut_date_desc",
        description="price_asc, price_desc, cut_date_asc, cut_date_desc, name_asc",
    ),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """
    Каталог цветов от подключённых ферм.

    КЛЮЧЕВОЕ ПРАВИЛО: флорист видит ТОЛЬКО цветы от ферм,
    к которым у него есть одобренный доступ (AccessRequest.status == approved).
    """
    florist_id = user.florist_profile.id

    # IDs of farms with approved access
    approved_farm_ids = [
        ar.farm_id
        for ar in db.query(AccessRequest)
        .filter(
            AccessRequest.florist_id == florist_id,
            AccessRequest.status == "approved",
        )
        .all()
    ]

    if not approved_farm_ids:
        return PaginatedResponse(items=[], total=0, page=page, per_page=per_page, pages=0)

    query = (
        db.query(FlowerBatch)
        .join(FarmProfile)
        .filter(
            FlowerBatch.farm_id.in_(approved_farm_ids),
            FlowerBatch.status == "available",
            FlowerBatch.quantity > 0,
        )
    )

    # Filters
    if region_id:
        query = query.filter(FarmProfile.region_id == region_id)
    if farm_id:
        query = query.filter(FlowerBatch.farm_id == farm_id)
    if search:
        query = query.filter(FlowerBatch.name.ilike(f"%{search}%"))
    if price_min is not None:
        query = query.filter(FlowerBatch.price >= price_min)
    if price_max is not None:
        query = query.filter(FlowerBatch.price <= price_max)
    if cut_date_from:
        query = query.filter(FlowerBatch.cut_date >= cut_date_from)
    if cut_date_to:
        query = query.filter(FlowerBatch.cut_date <= cut_date_to)

    # Sort
    sort_map = {
        "price_asc": FlowerBatch.price.asc(),
        "price_desc": FlowerBatch.price.desc(),
        "cut_date_asc": FlowerBatch.cut_date.asc(),
        "cut_date_desc": FlowerBatch.cut_date.desc(),
        "name_asc": FlowerBatch.name.asc(),
    }
    query = query.order_by(sort_map.get(sort_by, FlowerBatch.cut_date.desc()))

    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page

    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page, pages=pages)


# --- Farms ---

@router.get("/farms", response_model=list[FarmPublicInfo])
async def list_available_farms(
    db: Session = Depends(get_db),
    user: User = Depends(require_florist),
    region_id: Optional[int] = Query(None),
):
    """Список всех одобренных ферм (для подачи заявок на доступ)."""
    query = db.query(FarmProfile).filter(FarmProfile.is_approved == True)
    if region_id:
        query = query.filter(FarmProfile.region_id == region_id)
    return query.all()


# --- Access Requests ---

@router.post("/access-requests", response_model=AccessRequestResponse, status_code=201)
async def create_access_request(
    data: AccessRequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_florist),
):
    """Подать заявку на доступ к ферме."""
    return await access_service.create_request(db, user.florist_profile.id, data)


@router.get("/access-requests", response_model=list[AccessRequestResponse])
async def list_my_access_requests(
    db: Session = Depends(get_db),
    user: User = Depends(require_florist),
):
    """Мои заявки на доступ к фермам."""
    return (
        db.query(AccessRequest)
        .filter(AccessRequest.florist_id == user.florist_profile.id)
        .order_by(AccessRequest.created_at.desc())
        .all()
    )


# --- Orders ---

@router.get("/orders", response_model=PaginatedResponse[OrderResponse])
async def list_my_orders(
    db: Session = Depends(get_db),
    user: User = Depends(require_florist),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """Мои заказы с пагинацией."""
    florist_id = user.florist_profile.id
    query = db.query(Order).filter(Order.florist_id == florist_id).order_by(Order.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page, pages=pages)


@router.post("/orders", response_model=OrderResponse, status_code=201)
async def create_order(
    data: OrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_florist),
):
    """
    Создать заказ.
    Автоматические проверки:
    1. Есть ли approved access к указанной ферме
    2. Все flower_batch_id принадлежат этой ферме
    3. Достаточно ли товара на складе
    4. Сумма заказа >= min_order_amount фермы
    """
    return order_service.create_order(db, user.florist_profile, data)


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_florist),
):
    """Детали заказа."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or order.florist_id != user.florist_profile.id:
        raise NotFoundError("Заказ")
    return order


@router.patch("/orders/{order_id}/cancel", response_model=OrderResponse)
async def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_florist),
):
    """Отменить заказ (только если статус 'new' или 'confirmed')."""
    return order_service.cancel_order_by_florist(db, user.florist_profile.id, order_id)
```

### 8.4 Farm Router (`backend/app/routers/farm.py`)

```python
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..dependencies import require_farm
from ..models import User, FlowerBatch, AccessRequest, Order
from ..schemas.profile import FarmProfileResponse, FarmProfileUpdate
from ..schemas.flower import FlowerBatchResponse, FlowerBatchUpdate
from ..schemas.access import AccessRequestResolve, AccessRequestResponse
from ..schemas.order import OrderResponse, OrderStatusUpdate
from ..schemas.common import PaginatedResponse
from ..services import storage_service, notification_service, access_service, order_service
from ..exceptions import NotFoundError, ValidationError

router = APIRouter(prefix="/api/farm", tags=["farm"])


# --- Profile ---

@router.get("/profile", response_model=FarmProfileResponse)
async def get_my_profile(user: User = Depends(require_farm)):
    return user.farm_profile


@router.patch("/profile", response_model=FarmProfileResponse)
async def update_my_profile(
    data: FarmProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
):
    """Обновить профиль фермы. Включая min_order_amount, delivery_info, working_hours."""
    profile = user.farm_profile
    update_data = data.model_dump(exclude_unset=True)

    if "password" in update_data and update_data["password"]:
        from ..services.auth_service import hash_password
        user.hashed_password = hash_password(update_data.pop("password"))

    if "min_order_amount" in update_data and update_data["min_order_amount"] < 0:
        raise ValidationError("Минимальная сумма не может быть отрицательной")

    for key, value in update_data.items():
        if key != "password":
            setattr(profile, key, value)

    db.commit()
    db.refresh(profile)
    return profile


@router.patch("/profile/photo", response_model=FarmProfileResponse)
async def update_profile_photo(
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
):
    url = storage_service.upload_image(photo, folder="farms")
    user.farm_profile.photo_url = url
    db.commit()
    return user.farm_profile


# --- Flowers ---

@router.get("/flowers", response_model=PaginatedResponse[FlowerBatchResponse])
async def list_my_flowers(
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
    status: Optional[str] = Query(None, description="available, sold, archived"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """Мои партии цветов с пагинацией."""
    farm_id = user.farm_profile.id
    query = db.query(FlowerBatch).filter(FlowerBatch.farm_id == farm_id)
    if status:
        query = query.filter(FlowerBatch.status == status)
    query = query.order_by(FlowerBatch.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page, pages=pages)


@router.post("/flowers", response_model=FlowerBatchResponse, status_code=201)
async def create_flower_batch(
    name: str = Form(...),
    description: str = Form(""),
    price: float = Form(..., gt=0),
    quantity: int = Form(..., gt=0),
    cut_date: str = Form(..., description="ISO 8601 datetime, e.g. 2025-01-15T08:00:00"),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
):
    """Добавить новую партию цветов. Изображение обязательно."""
    image_url = storage_service.upload_image(image, folder="flowers")
    batch = FlowerBatch(
        farm_id=user.farm_profile.id,
        name=name,
        description=description,
        price=price,
        quantity=quantity,
        cut_date=cut_date,
        image_url=image_url,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


@router.put("/flowers/{flower_id}", response_model=FlowerBatchResponse)
async def update_flower_batch(
    flower_id: int,
    data: FlowerBatchUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
):
    """Обновить партию (только свою). Если quantity=0, статус меняется на sold."""
    batch = db.query(FlowerBatch).filter(
        FlowerBatch.id == flower_id, FlowerBatch.farm_id == user.farm_profile.id
    ).first()
    if not batch:
        raise NotFoundError("Партия цветов")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(batch, key, value)
    if batch.quantity == 0:
        batch.status = "sold"
        batch.sold_at = datetime.utcnow()
    db.commit()
    db.refresh(batch)
    return batch


@router.delete("/flowers/{flower_id}")
async def delete_flower_batch(
    flower_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
):
    """Удалить партию цветов (только свою)."""
    batch = db.query(FlowerBatch).filter(
        FlowerBatch.id == flower_id, FlowerBatch.farm_id == user.farm_profile.id
    ).first()
    if not batch:
        raise NotFoundError("Партия цветов")
    if batch.image_url:
        storage_service.delete_file(batch.image_url)
    db.delete(batch)
    db.commit()
    return {"message": "Партия удалена"}


@router.post("/flowers/notify")
async def notify_subscribers(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
):
    """
    Оповестить подписанных флористов о новых цветах.
    Рассылает уведомление всем флористам с approved доступом к этой ферме.
    Отправляются только партии, добавленные за последние 6 часов.
    """
    farm = user.farm_profile
    recent = (
        db.query(FlowerBatch)
        .filter(
            FlowerBatch.farm_id == farm.id,
            FlowerBatch.status == "available",
            FlowerBatch.created_at >= datetime.utcnow() - timedelta(hours=6),
        )
        .all()
    )
    if not recent:
        return {"message": "Нет новых цветов для рассылки"}
    background_tasks.add_task(notification_service.notify_new_flowers, db, farm, recent)
    return {"message": f"Рассылка о {len(recent)} партиях запущена"}


# --- Access Requests ---

@router.get("/access-requests", response_model=list[AccessRequestResponse])
async def list_access_requests(
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
    status: Optional[str] = Query(None, description="pending, approved, rejected"),
):
    """Входящие заявки от флористов."""
    query = db.query(AccessRequest).filter(AccessRequest.farm_id == user.farm_profile.id)
    if status:
        query = query.filter(AccessRequest.status == status)
    return query.order_by(AccessRequest.created_at.desc()).all()


@router.patch("/access-requests/{request_id}", response_model=AccessRequestResponse)
async def resolve_access_request(
    request_id: int,
    data: AccessRequestResolve,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
):
    """Принять или отклонить заявку флориста. status: approved / rejected"""
    return await access_service.resolve_request(
        db, user.farm_profile.id, request_id, data, background_tasks
    )


@router.get("/clients")
async def list_my_clients(
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
):
    """Список одобренных клиентов (флористов с approved доступом)."""
    approved = (
        db.query(AccessRequest)
        .filter(AccessRequest.farm_id == user.farm_profile.id, AccessRequest.status == "approved")
        .all()
    )
    return [
        {
            "florist_id": ar.florist.id,
            "business_name": ar.florist.business_name,
            "contact_name": ar.florist.contact_name,
            "phone": ar.florist.phone,
            "approved_at": ar.resolved_at,
        }
        for ar in approved
    ]


# --- Orders ---

@router.get("/orders", response_model=PaginatedResponse[OrderResponse])
async def list_incoming_orders(
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """Входящие заказы от флористов."""
    query = db.query(Order).filter(Order.farm_id == user.farm_profile.id)
    if status:
        query = query.filter(Order.status == status)
    query = query.order_by(Order.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page, pages=pages)


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
):
    order = db.query(Order).filter(Order.id == order_id, Order.farm_id == user.farm_profile.id).first()
    if not order:
        raise NotFoundError("Заказ")
    return order


@router.patch("/orders/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: int,
    data: OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_farm),
):
    """
    Изменить статус заказа. Допустимые переходы:
    new -> confirmed / rejected
    confirmed -> ready
    ready -> delivering
    delivering -> delivered
    delivered -> completed
    При rejected/cancelled — товар возвращается на склад.
    """
    return await order_service.update_status_by_farm(
        db, user.farm_profile.id, order_id, data, background_tasks
    )
```

### 8.5 Admin Router (`backend/app/routers/admin.py`)

```python
from datetime import datetime
from fastapi import APIRouter, Depends, Query, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..dependencies import require_admin
from ..models import User, FarmProfile, FloristProfile, Order
from ..services import notification_service
from ..exceptions import NotFoundError

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/dashboard")
async def get_dashboard(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Сводная статистика платформы."""
    return {
        "total_farms": db.query(FarmProfile).count(),
        "approved_farms": db.query(FarmProfile).filter(FarmProfile.is_approved == True).count(),
        "pending_farms": db.query(FarmProfile).filter(FarmProfile.is_approved == False).count(),
        "total_florists": db.query(FloristProfile).count(),
        "total_orders": db.query(Order).count(),
    }


@router.get("/farms")
async def list_farms(
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
    is_approved: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """Все фермы с фильтром по статусу одобрения."""
    query = db.query(FarmProfile)
    if is_approved is not None:
        query = query.filter(FarmProfile.is_approved == is_approved)
    query = query.order_by(FarmProfile.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page
    return {"items": items, "total": total, "page": page, "per_page": per_page, "pages": pages}


@router.patch("/farms/{farm_id}/approve")
async def approve_farm(
    farm_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Одобрить регистрацию фермы."""
    farm = db.query(FarmProfile).filter(FarmProfile.id == farm_id).first()
    if not farm:
        raise NotFoundError("Ферма")
    farm.is_approved = True
    farm.approved_at = datetime.utcnow()
    db.commit()
    background_tasks.add_task(notification_service.notify_farm_approved, farm)
    return {"message": f"Ферма '{farm.farm_name}' одобрена"}


@router.patch("/farms/{farm_id}/reject")
async def reject_farm(
    farm_id: int,
    reason: str = Query(..., description="Причина отклонения"),
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Отклонить регистрацию фермы с указанием причины."""
    farm = db.query(FarmProfile).filter(FarmProfile.id == farm_id).first()
    if not farm:
        raise NotFoundError("Ферма")
    farm.rejection_reason = reason
    db.commit()
    return {"message": f"Ферма '{farm.farm_name}' отклонена"}


@router.get("/users")
async def list_users(
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
    role: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
):
    """Список всех пользователей с фильтром по роли."""
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    pages = (total + per_page - 1) // per_page
    return {"items": items, "total": total, "page": page, "per_page": per_page, "pages": pages}
```

### 8.6 Regions & Health Routers

```python
# backend/app/routers/regions.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import Region, FarmProfile
from ..schemas.region import RegionResponse

router = APIRouter(prefix="/api/regions", tags=["regions"])

@router.get("/", response_model=list[RegionResponse])
async def list_regions(
    db: Session = Depends(get_db),
    only_with_farms: bool = Query(True, description="Показать только регионы с одобренными фермами"),
):
    """
    Список регионов РФ.
    По умолчанию: только регионы, где есть хотя бы одна одобренная ферма.
    """
    if only_with_farms:
        results = (
            db.query(Region, func.count(FarmProfile.id).label("farm_count"))
            .join(FarmProfile, FarmProfile.region_id == Region.id)
            .filter(FarmProfile.is_approved == True)
            .group_by(Region.id)
            .all()
        )
        return [
            RegionResponse(id=r.id, name=r.name, code=r.code,
                           federal_district=r.federal_district, farm_count=count)
            for r, count in results
        ]
    else:
        return db.query(Region).order_by(Region.name).all()
```

```python
# backend/app/routers/health.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from ..database import get_db

router = APIRouter(prefix="/api", tags=["health"])

@router.get("/health")
async def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception:
        return {"status": "degraded", "database": "error"}
```

---

## 9. Service Layer

### 9.1 Order Service (`backend/app/services/order_service.py`)

```python
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import BackgroundTasks

from ..models import Order, OrderItem, FlowerBatch, AccessRequest, FloristProfile, FarmProfile
from ..schemas.order import OrderCreate, OrderStatusUpdate
from ..exceptions import (
    NoAccessToFarmError, NotFoundError, InsufficientStockError,
    MinOrderAmountError, ValidationError,
)

# Valid status transitions for farm
FARM_STATUS_TRANSITIONS = {
    "new": ["confirmed", "rejected"],
    "confirmed": ["ready"],
    "ready": ["delivering"],
    "delivering": ["delivered"],
    "delivered": ["completed"],
}
# Florist can cancel when status is one of these
FLORIST_CANCEL_ALLOWED = ["new", "confirmed"]


def create_order(db: Session, florist: FloristProfile, data: OrderCreate) -> Order:
    """
    Create order with full validation chain:
    1. Florist has approved access to farm
    2. All flower_batch_ids belong to this farm and are available
    3. Sufficient stock for each item
    4. Total >= farm.min_order_amount
    5. Deduct stock, snapshot names/contacts
    """
    # 1. Access check
    access = db.query(AccessRequest).filter(
        AccessRequest.florist_id == florist.id,
        AccessRequest.farm_id == data.farm_id,
        AccessRequest.status == "approved",
    ).first()
    if not access:
        raise NoAccessToFarmError()

    farm = db.query(FarmProfile).filter(FarmProfile.id == data.farm_id).first()
    if not farm:
        raise NotFoundError("Ферма")

    # 2-3. Validate items
    total_amount = 0.0
    validated_items = []
    for item_data in data.items:
        batch = db.query(FlowerBatch).filter(
            FlowerBatch.id == item_data.flower_batch_id,
            FlowerBatch.farm_id == data.farm_id,
            FlowerBatch.status == "available",
        ).first()
        if not batch:
            raise NotFoundError(f"Партия цветов ID {item_data.flower_batch_id}")
        if batch.quantity < item_data.quantity:
            raise InsufficientStockError(batch.name, batch.quantity, item_data.quantity)
        total_amount += batch.price * item_data.quantity
        validated_items.append((batch, item_data.quantity))

    # 4. Min order check
    if total_amount < farm.min_order_amount:
        raise MinOrderAmountError(farm.min_order_amount, total_amount)

    # 5. Create order + deduct stock
    order = Order(
        florist_id=florist.id,
        farm_id=data.farm_id,
        status="new",
        customer_comment=data.customer_comment,
        total_amount=total_amount,
        florist_name=florist.contact_name,
        florist_phone=florist.phone,
        florist_address=florist.address,
        farm_name=farm.farm_name,
    )
    db.add(order)

    for batch, qty in validated_items:
        db.add(OrderItem(
            order=order,
            flower_batch_id=batch.id,
            quantity=qty,
            price_at_order=batch.price,
            flower_name=batch.name,
        ))
        batch.quantity -= qty
        if batch.quantity == 0:
            batch.status = "sold"
            batch.sold_at = datetime.utcnow()

    db.commit()
    db.refresh(order)

    # Background: notify farm
    from .notification_service import notify_new_order
    import asyncio
    asyncio.create_task(notify_new_order(order))

    return order


async def update_status_by_farm(
    db: Session, farm_id: int, order_id: int,
    data: OrderStatusUpdate, background_tasks: BackgroundTasks,
) -> Order:
    """Update order status. Validates allowed transitions."""
    order = db.query(Order).filter(Order.id == order_id, Order.farm_id == farm_id).first()
    if not order:
        raise NotFoundError("Заказ")

    allowed = FARM_STATUS_TRANSITIONS.get(order.status, [])
    if data.status not in allowed:
        raise ValidationError(
            f"Нельзя перевести из '{order.status}' в '{data.status}'. Допустимые: {allowed}"
        )

    old_status = order.status
    order.status = data.status
    if data.farm_comment:
        order.farm_comment = data.farm_comment
    order.updated_at = datetime.utcnow()

    if data.status == "rejected":
        _return_stock(db, order)

    db.commit()
    db.refresh(order)

    from .notification_service import notify_order_status_change
    background_tasks.add_task(notify_order_status_change, order, old_status)
    return order


def cancel_order_by_florist(db: Session, florist_id: int, order_id: int) -> Order:
    """Florist cancels their own order."""
    order = db.query(Order).filter(Order.id == order_id, Order.florist_id == florist_id).first()
    if not order:
        raise NotFoundError("Заказ")
    if order.status not in FLORIST_CANCEL_ALLOWED:
        raise ValidationError(f"Нельзя отменить заказ в статусе '{order.status}'")
    order.status = "cancelled"
    order.updated_at = datetime.utcnow()
    _return_stock(db, order)
    db.commit()
    db.refresh(order)
    return order


def _return_stock(db: Session, order: Order):
    """Return quantities to FlowerBatch when order is rejected/cancelled."""
    for item in order.items:
        if item.flower_batch:
            item.flower_batch.quantity += item.quantity
            if item.flower_batch.status == "sold":
                item.flower_batch.status = "available"
                item.flower_batch.sold_at = None
```

### 9.2 Access Service (`backend/app/services/access_service.py`)

```python
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import BackgroundTasks

from ..models import AccessRequest, FarmProfile
from ..schemas.access import AccessRequestCreate, AccessRequestResolve
from ..exceptions import NotFoundError, ValidationError


async def create_request(db: Session, florist_id: int, data: AccessRequestCreate) -> AccessRequest:
    """Create or re-submit access request."""
    farm = db.query(FarmProfile).filter(
        FarmProfile.id == data.farm_id, FarmProfile.is_approved == True
    ).first()
    if not farm:
        raise NotFoundError("Ферма")

    existing = db.query(AccessRequest).filter(
        AccessRequest.florist_id == florist_id,
        AccessRequest.farm_id == data.farm_id,
    ).first()

    if existing:
        if existing.status == "approved":
            raise ValidationError("У вас уже есть доступ к этой ферме")
        if existing.status == "pending":
            raise ValidationError("Заявка уже подана и ожидает рассмотрения")
        if existing.status == "rejected":
            # Re-apply
            existing.status = "pending"
            existing.message = data.message
            existing.rejection_reason = None
            existing.created_at = datetime.utcnow()
            existing.resolved_at = None
            db.commit()
            db.refresh(existing)
            from .notification_service import notify_access_request
            await notify_access_request(existing)
            return existing

    ar = AccessRequest(
        florist_id=florist_id, farm_id=data.farm_id,
        status="pending", message=data.message,
    )
    db.add(ar)
    db.commit()
    db.refresh(ar)

    from .notification_service import notify_access_request
    await notify_access_request(ar)
    return ar


async def resolve_request(
    db: Session, farm_id: int, request_id: int,
    data: AccessRequestResolve, background_tasks: BackgroundTasks,
) -> AccessRequest:
    """Approve or reject."""
    ar = db.query(AccessRequest).filter(
        AccessRequest.id == request_id,
        AccessRequest.farm_id == farm_id,
        AccessRequest.status == "pending",
    ).first()
    if not ar:
        raise NotFoundError("Заявка")
    if data.status not in ("approved", "rejected"):
        raise ValidationError("Статус: 'approved' или 'rejected'")

    ar.status = data.status
    ar.resolved_at = datetime.utcnow()
    if data.status == "rejected":
        ar.rejection_reason = data.rejection_reason
    db.commit()
    db.refresh(ar)

    from .notification_service import notify_access_resolved
    background_tasks.add_task(notify_access_resolved, ar)
    return ar
```

### 9.3 Storage Service (`backend/app/services/storage_service.py`)

```python
"""
File storage abstraction.
Pilot: local filesystem.
Scale: replace with S3Storage (Yandex Object Storage).
"""
import uuid
from pathlib import Path
from fastapi import UploadFile, HTTPException
from PIL import Image
import io

from ..config import settings

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_SIZE_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


def upload_image(file: UploadFile, folder: str = "general") -> str:
    """Upload, validate, compress. Returns URL like /uploads/flowers/abc123.jpg"""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Допустимые форматы: {', '.join(ALLOWED_EXTENSIONS)}")

    content = file.file.read()
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(400, f"Макс. размер: {settings.MAX_UPLOAD_SIZE_MB}MB")

    safe_name = f"{uuid.uuid4().hex}{ext}"
    upload_dir = Path(settings.UPLOAD_DIR) / folder
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Compress
    image = Image.open(io.BytesIO(content))
    if image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    max_side = 1920
    if max(image.size) > max_side:
        image.thumbnail((max_side, max_side), Image.LANCZOS)

    if ext == ".webp":
        output_path = upload_dir / safe_name
        image.save(output_path, "WEBP", quality=85)
    else:
        output_name = safe_name.rsplit(".", 1)[0] + ".jpg"
        output_path = upload_dir / output_name
        image.save(output_path, "JPEG", quality=85, optimize=True)
        safe_name = output_name

    return f"/uploads/{folder}/{safe_name}"


def delete_file(url_path: str) -> bool:
    if not url_path:
        return False
    relative = url_path.lstrip("/")
    if relative.startswith("uploads/"):
        relative = relative[len("uploads/"):]
    file_path = Path(settings.UPLOAD_DIR) / relative
    if file_path.exists():
        file_path.unlink()
        return True
    return False
```

### 9.4 Notification Service (`backend/app/services/notification_service.py`)

```python
"""
Telegram notification dispatch. All functions are async-safe for background tasks.
Uses a fresh DB session for each call (background tasks run after response).
"""
import logging
from telegram import Bot
from ..config import settings
from ..database import SessionLocal
from ..models import User, Order, AccessRequest, FarmProfile, FloristProfile

logger = logging.getLogger(__name__)


def _get_bot():
    if not settings.TELEGRAM_BOT_TOKEN:
        return None
    return Bot(token=settings.TELEGRAM_BOT_TOKEN)


async def _send(chat_id, text):
    bot = _get_bot()
    if not bot or not chat_id:
        return
    try:
        await bot.send_message(chat_id=chat_id, text=text, parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Telegram send failed to {chat_id}: {e}")


# --- For FLORISTS ---

async def notify_order_status_change(order: Order, old_status: str):
    emoji = {"confirmed": "✅", "rejected": "❌", "ready": "📦",
             "delivering": "🚚", "delivered": "📬", "completed": "🎉"}.get(order.status, "ℹ️")
    db = SessionLocal()
    try:
        u = db.query(User).join(FloristProfile).filter(FloristProfile.id == order.florist_id).first()
        if not u or not u.telegram_chat_id:
            return
        text = (f"{emoji} *Статус заказа #{order.id}*\n\n"
                f"Ферма: {order.farm_name}\n"
                f"`{old_status}` → `{order.status}`\n"
                f"Сумма: {int(order.total_amount)} руб.")
        if order.farm_comment:
            text += f"\n\nКомментарий: _{order.farm_comment}_"
        await _send(u.telegram_chat_id, text)
    finally:
        db.close()


async def notify_access_resolved(ar: AccessRequest):
    db = SessionLocal()
    try:
        u = db.query(User).join(FloristProfile).filter(FloristProfile.id == ar.florist_id).first()
        farm = db.query(FarmProfile).filter(FarmProfile.id == ar.farm_id).first()
        if not u or not u.telegram_chat_id:
            return
        fname = farm.farm_name if farm else "?"
        if ar.status == "approved":
            text = f"✅ Заявка к ферме *{fname}* одобрена! Каталог доступен."
        else:
            text = f"❌ Заявка к ферме *{fname}* отклонена."
            if ar.rejection_reason:
                text += f"\nПричина: _{ar.rejection_reason}_"
        await _send(u.telegram_chat_id, text)
    finally:
        db.close()


# --- For FARMS ---

async def notify_new_order(order: Order):
    db = SessionLocal()
    try:
        u = db.query(User).join(FarmProfile).filter(FarmProfile.id == order.farm_id).first()
        if not u or not u.telegram_chat_id:
            return
        items_text = "".join(
            f"  • {i.flower_name} x{i.quantity} ({int(i.price_at_order)} руб.)\n"
            for i in order.items
        )
        text = (f"🎉 *Новый заказ #{order.id}*\n\n"
                f"Клиент: {order.florist_name}\n"
                f"Тел: `{order.florist_phone}`\n"
                f"Адрес: {order.florist_address or 'не указан'}\n\n"
                f"*Состав:*\n{items_text}\n*Итого: {int(order.total_amount)} руб.*")
        if order.customer_comment:
            text += f"\n\nКомментарий: _{order.customer_comment}_"
        await _send(u.telegram_chat_id, text)
    finally:
        db.close()


async def notify_access_request(ar: AccessRequest):
    db = SessionLocal()
    try:
        u = db.query(User).join(FarmProfile).filter(FarmProfile.id == ar.farm_id).first()
        fl = db.query(FloristProfile).filter(FloristProfile.id == ar.florist_id).first()
        if not u or not u.telegram_chat_id or not fl:
            return
        text = (f"📩 *Новая заявка на доступ*\n\n"
                f"Магазин: *{fl.business_name}*\n"
                f"Контакт: {fl.contact_name}\nТел: `{fl.phone}`")
        if ar.message:
            text += f"\n\nСообщение: _{ar.message}_"
        await _send(u.telegram_chat_id, text)
    finally:
        db.close()


async def notify_new_flowers(db_session, farm: FarmProfile, batches: list):
    db = SessionLocal()
    try:
        approved = db.query(AccessRequest).filter(
            AccessRequest.farm_id == farm.id, AccessRequest.status == "approved"
        ).all()
        caption = f"🌸 *Поставка от {farm.farm_name}!*\n\n"
        for b in batches[:10]:
            caption += f"• *{b.name}* — {int(b.price)} руб. ({b.quantity} шт.)\n"
        for ar in approved:
            u = db.query(User).join(FloristProfile).filter(FloristProfile.id == ar.florist_id).first()
            if u and u.telegram_chat_id:
                await _send(u.telegram_chat_id, caption)
    finally:
        db.close()


# --- For PLATFORM ADMIN ---

async def notify_admin_new_farm(user: User):
    if not settings.ADMIN_TELEGRAM_CHAT_ID:
        return
    farm = user.farm_profile
    text = (f"🏡 *Новая ферма ожидает одобрения*\n\n"
            f"Название: *{farm.farm_name}*\nКонтакт: {farm.contact_name}\n"
            f"Тел: `{farm.phone}`\nEmail: {user.email}")
    await _send(int(settings.ADMIN_TELEGRAM_CHAT_ID), text)


async def notify_farm_approved(farm: FarmProfile):
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == farm.user_id).first()
        if u and u.telegram_chat_id:
            await _send(u.telegram_chat_id,
                        f"🎉 Ваша ферма *{farm.farm_name}* одобрена! Теперь флористы могут подавать заявки.")
    finally:
        db.close()
```

### 9.5 Payment Service Stub (`backend/app/services/payment_service.py`)

```python
"""
Payment processing stub.
Pilot: all payments are offline (cash on delivery / pickup).
Future: integrate with YooKassa (ЮKassa) or CloudPayments.
"""
from dataclasses import dataclass


@dataclass
class PaymentResult:
    method: str       # 'offline', 'yookassa', etc.
    status: str       # 'pending', 'completed', 'failed'
    payment_id: str = None


async def create_payment(order_id: int, amount: float) -> PaymentResult:
    """Stub: always returns offline payment."""
    return PaymentResult(method="offline", status="pending")


async def process_webhook(data: dict) -> bool:
    """Stub for payment system webhook."""
    raise NotImplementedError("Payment webhooks not yet implemented")
```
