# 🌿 FloraFill — Полная архитектура B2B платформы для цветочного рынка

> **Версия документа:** 2.0 (Self-contained)  
> **Масштаб пилота:** 3 фермы, до 100 флористов  
> **Целевой масштаб:** 10 000 ферм, 100 000 флористов  
> **Домен:** florafill.ru  
> **Сервер:** VPS в Yandex Cloud (Ubuntu)

---

## Содержание

1. [Обзор системы](#1-обзор-системы)
2. [Технологический стек](#2-технологический-стек)
3. [Структура проекта](#3-структура-проекта)
4. [Backend: Конфигурация и Setup](#4-backend-конфигурация-и-setup)
5. [Модель данных (полные модели)](#5-модель-данных)
6. [Pydantic Schemas (полные)](#6-pydantic-schemas)
7. [Аутентификация и авторизация](#7-аутентификация-и-авторизация)
8. [API Endpoints (полная спецификация)](#8-api-endpoints)
9. [Service Layer (бизнес-логика)](#9-service-layer)
10. [Telegram Bot](#10-telegram-bot)
11. [Frontend: Next.js](#11-frontend-nextjs)
12. [CI/CD Pipeline](#12-cicd-pipeline)
13. [Deployment](#13-deployment)
14. [152-ФЗ Compliance](#14-152-фз-compliance)
15. [Тестирование](#15-тестирование)
16. [Порядок реализации](#16-порядок-реализации)

---

## 1. Обзор системы

FloraFill — B2B платформа, соединяющая цветочные фермы (поставщиков) с флористами (покупателями). Платформа помогает формировать заказы, управлять каталогами свежесрезанных цветов и коммуницировать через Telegram-бот. Оплата происходит офлайн (в пилоте), архитектура подготовлена для будущей онлайн-оплаты.

### 1.1 Ключевые роли

| Роль | Описание | Регистрация |
|------|----------|-------------|
| **Флорист** (`florist`) | Покупатель цветов (цветочный магазин, ИП) | Самостоятельная, без верификации |
| **Ферма** (`farm`) | Поставщик цветов (садовник/ферма) | Самостоятельная + одобрение администратором FloraFill |
| **Администратор платформы** (`platform_admin`) | Команда FloraFill | Создаётся через CLI-скрипт |

### 1.2 Ключевые бизнес-правила

1. **Флорист** регистрируется свободно, затем подаёт **заявку на доступ** к конкретной ферме
2. **Ферма** одобряет или отклоняет заявку (может позвонить для верификации)
3. После одобрения флорист видит каталог этой фермы и может делать заказы
4. Каждая ферма самостоятельно устанавливает **минимальную сумму заказа** (default: 5000₽)
5. Заказ привязан к **одной ферме** (нельзя заказать из нескольких ферм в одном заказе)
6. Ферма управляет **статусами заказа** (подтвердить / отклонить / доставлен и т.д.)
7. Фермы находятся в разных **регионах РФ** — флорист может фильтровать по региону
8. **Уведомления** отправляются через единого Telegram-бота `@FloraFillBot`
9. Цветы продаются **партиями** (batch) — один сорт, одна поставка, дата срезки
10. Партии автоматически архивируются через 3 недели (цветы — скоропортящийся товар)

### 1.3 Высокоуровневая архитектура

```mermaid
graph TB
    subgraph Frontend
        WEB[Next.js Web App<br/>florafill.ru]
    end

    subgraph Backend
        API[FastAPI<br/>API Server]
        BOT[Telegram Bot<br/>python-telegram-bot]
        SCHEDULER[APScheduler<br/>Background Tasks]
    end

    subgraph Storage
        DB[(SQLite -> PostgreSQL)]
        FS[File System -> S3]
    end

    WEB -->|REST API| API
    BOT -->|DB queries| DB
    API --> DB
    API --> FS
    API -->|trigger| BOT
    SCHEDULER -->|cleanup tasks| DB

    FLORIST[Флорист] --> WEB
    FLORIST --> BOT
    FARM[Ферма] --> WEB
    FARM --> BOT
    ADMIN[Админ FloraFill] --> WEB
```

---

## 2. Технологический стек

### 2.1 Пилот (MVP)

| Компонент | Технология | Версия |
|-----------|------------|--------|
| Backend API | Python + FastAPI | Python 3.12, FastAPI 0.115+ |
| Frontend | Next.js (App Router) + TypeScript | Next.js 15, React 19 |
| CSS Framework | Tailwind CSS | 4.x |
| UI Components | shadcn/ui | latest |
| Database | SQLite (Alembic migrations) | — |
| ORM | SQLAlchemy | 2.0+ |
| Migrations | Alembic | 1.13+ |
| Auth | JWT (python-jose) + bcrypt (passlib) | — |
| Telegram | python-telegram-bot | 21+ |
| Linter | Ruff | latest |
| Tests | pytest + httpx + pytest-asyncio | — |
| Web Server | Nginx + Gunicorn + Uvicorn | — |
| CI/CD | GitHub Actions | — |

### 2.2 Python зависимости

**`backend/requirements.txt`**:
```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
gunicorn>=22.0.0
python-multipart>=0.0.9
SQLAlchemy>=2.0.0
alembic>=1.13.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
python-jose[cryptography]>=3.3.0
passlib[bcrypt]>=1.7.4
bcrypt==4.0.1
python-telegram-bot>=21.0
slowapi>=0.1.9
Pillow>=10.0.0
httpx>=0.27.0
```

**`backend/requirements-dev.txt`**:
```
pytest>=8.0.0
pytest-asyncio>=0.23.0
httpx>=0.27.0
ruff>=0.5.0
```

### 2.3 Путь масштабирования (после пилота)

| Компонент | Миграция |
|-----------|----------|
| SQLite → PostgreSQL | Через Alembic, изменение `DATABASE_URL` в `.env` |
| Filesystem → Yandex Object Storage (S3) | Подменить `LocalStorage` на `S3Storage` в DI |
| VPS → Docker Compose | Написать Dockerfile + docker-compose.yml |
| Оплата офлайн → ЮKassa/CloudPayments | Реализовать `PaymentService` |

---

## 3. Структура проекта

```
florafill/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Lint + Tests on every PR
│       └── deploy.yml          # Deploy on push to main
│
├── backend/
│   ├── alembic/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/           # Auto-generated migration files
│   ├── alembic.ini
│   │
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py             # FastAPI app entry point + lifespan
│   │   ├── config.py           # Pydantic Settings from .env
│   │   ├── database.py         # Engine, SessionLocal, Base, get_db
│   │   ├── exceptions.py       # Custom exception classes
│   │   ├── dependencies.py     # Auth dependencies (get_current_user, etc.)
│   │   │
│   │   ├── models/
│   │   │   ├── __init__.py     # Re-export all models
│   │   │   ├── user.py         # User
│   │   │   ├── profile.py      # FloristProfile, FarmProfile
│   │   │   ├── region.py       # Region
│   │   │   ├── flower.py       # FlowerBatch
│   │   │   ├── access.py       # AccessRequest
│   │   │   ├── order.py        # Order, OrderItem
│   │   │   ├── subscription.py # Plan, Subscription (stub)
│   │   │   └── token.py        # RefreshToken
│   │   │
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py         # Login, Register, Token schemas
│   │   │   ├── user.py         # User response schemas
│   │   │   ├── profile.py      # FloristProfile, FarmProfile schemas
│   │   │   ├── flower.py       # FlowerBatch schemas
│   │   │   ├── order.py        # Order, OrderItem schemas
│   │   │   ├── access.py       # AccessRequest schemas
│   │   │   ├── region.py       # Region schemas
│   │   │   └── common.py       # PaginatedResponse, enums
│   │   │
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py       # Registration, login, token management
│   │   │   ├── flower_service.py     # Flower CRUD + auto-cleanup
│   │   │   ├── order_service.py      # Order creation + validation
│   │   │   ├── access_service.py     # Access request management
│   │   │   ├── notification_service.py # Telegram notification dispatch
│   │   │   ├── storage_service.py    # File upload abstraction
│   │   │   └── payment_service.py    # Payment stub
│   │   │
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py         # /api/auth/*
│   │   │   ├── florist.py      # /api/florist/*
│   │   │   ├── farm.py         # /api/farm/*
│   │   │   ├── admin.py        # /api/admin/*
│   │   │   ├── regions.py      # /api/regions
│   │   │   └── health.py       # /api/health
│   │   │
│   │   └── telegram/
│   │       ├── __init__.py
│   │       ├── bot.py          # Bot init, start, stop lifecycle
│   │       ├── handlers.py     # /start, /stop, /orders, /status commands
│   │       └── notifications.py # Functions: notify_new_order, notify_status_change, etc.
│   │
│   ├── scripts/
│   │   ├── create_admin.py     # CLI: python scripts/create_admin.py email password
│   │   └── seed_regions.py     # Populate regions table with RF regions
│   │
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py         # Fixtures: test DB, test client, auth helpers
│   │   ├── test_auth.py        # Registration, login, refresh, roles
│   │   ├── test_flowers.py     # CRUD, permissions, auto-cleanup
│   │   ├── test_orders.py      # Create, status, min_order, access check
│   │   ├── test_access.py      # Request, approve, reject, catalog visibility
│   │   └── test_regions.py     # List regions
│   │
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   └── pyproject.toml          # Ruff config
│
├── frontend/
│   ├── package.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── postcss.config.mjs
│   ├── public/
│   │   ├── favicon.png
│   │   └── manifest.json       # PWA manifest
│   └── src/
│       ├── app/
│       │   ├── layout.tsx               # Root layout: providers, cookie banner
│       │   ├── page.tsx                 # Landing / marketing page
│       │   ├── privacy-policy/page.tsx  # 152-ФЗ privacy policy
│       │   ├── terms/page.tsx           # Terms of service
│       │   │
│       │   ├── (auth)/
│       │   │   ├── login/page.tsx
│       │   │   └── register/page.tsx    # Role selection: florist or farm
│       │   │
│       │   ├── (florist)/
│       │   │   ├── layout.tsx           # Florist sidebar/nav
│       │   │   ├── catalog/page.tsx     # Browse flowers (filters, search)
│       │   │   ├── cart/page.tsx        # Cart (localStorage-based)
│       │   │   ├── orders/page.tsx      # My orders list
│       │   │   ├── orders/[id]/page.tsx # Order details
│       │   │   ├── farms/page.tsx       # My connected farms + request access
│       │   │   └── profile/page.tsx     # Edit profile
│       │   │
│       │   ├── (farm)/
│       │   │   ├── layout.tsx           # Farm sidebar/nav
│       │   │   ├── dashboard/page.tsx   # Overview: orders, stats
│       │   │   ├── flowers/page.tsx     # Manage flower batches
│       │   │   ├── orders/page.tsx      # Incoming orders
│       │   │   ├── orders/[id]/page.tsx # Order details + status change
│       │   │   ├── clients/page.tsx     # Access requests + approved clients
│       │   │   └── profile/page.tsx     # Edit farm profile
│       │   │
│       │   └── (admin)/
│       │       ├── layout.tsx           # Admin sidebar/nav
│       │       ├── dashboard/page.tsx   # Platform stats
│       │       ├── farms/page.tsx       # Approve/reject farm registrations
│       │       └── users/page.tsx       # All users
│       │
│       ├── components/
│       │   ├── ui/                      # shadcn/ui components
│       │   ├── layout/
│       │   │   ├── Header.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── Footer.tsx
│       │   │   └── CookieBanner.tsx
│       │   ├── catalog/
│       │   │   ├── FlowerCard.tsx
│       │   │   ├── CatalogFilters.tsx
│       │   │   └── CatalogGrid.tsx
│       │   ├── orders/
│       │   │   ├── OrderCard.tsx
│       │   │   ├── OrderStatusBadge.tsx
│       │   │   └── OrderTimeline.tsx
│       │   └── forms/
│       │       ├── LoginForm.tsx
│       │       ├── RegisterForm.tsx
│       │       ├── FlowerForm.tsx
│       │       └── ProfileForm.tsx
│       │
│       ├── lib/
│       │   ├── api.ts           # Axios/fetch wrapper with auth interceptor
│       │   ├── auth.tsx         # AuthContext, useAuth hook, token management
│       │   ├── utils.ts         # formatPrice, formatDate, etc.
│       │   └── constants.ts     # ORDER_STATUSES, REGIONS, etc.
│       │
│       └── types/
│           └── index.ts         # TypeScript interfaces matching backend schemas
│
├── docs/
│   ├── api.md
│   └── deployment.md
│
├── plans/
│   └── florafill-architecture.md
│
├── .env.example
├── .gitignore
└── README.md
```

---

## 4. Backend: Конфигурация и Setup

### 4.1 Environment Variables (`.env.example`)

```env
# === Database ===
DATABASE_URL=sqlite:///./florafill.db
# For PostgreSQL (future): DATABASE_URL=postgresql://user:pass@localhost:5432/florafill

# === Security ===
SECRET_KEY=your-secret-key-generate-with-openssl-rand-hex-32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30

# === Telegram Bot ===
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
# Admin chat ID for platform admin notifications
ADMIN_TELEGRAM_CHAT_ID=123456789

# === App Settings ===
APP_NAME=FloraFill
APP_URL=https://florafill.ru
CORS_ORIGINS=["https://florafill.ru","http://localhost:3000"]

# === File Storage ===
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE_MB=10

# === Environment ===
ENVIRONMENT=development
# Options: development, production
```

### 4.2 Config (`backend/app/config.py`)

```python
from pydantic_settings import BaseSettings
from typing import Optional, List
import json

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite:///./florafill.db"
    
    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    # Telegram
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    ADMIN_TELEGRAM_CHAT_ID: Optional[str] = None
    
    # App
    APP_NAME: str = "FloraFill"
    APP_URL: str = "http://localhost:3000"
    CORS_ORIGINS: str = '["http://localhost:3000"]'
    
    # File Storage
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 10
    
    # Environment
    ENVIRONMENT: str = "development"
    
    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)
    
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
```

### 4.3 Database (`backend/app/database.py`)

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings

# SQLite needs check_same_thread=False
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### 4.4 Main Application (`backend/app/main.py`)

```python
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .config import settings
from .database import engine, Base
from .routers import auth, florist, farm, admin, regions, health

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables (dev only; production uses Alembic)
    if not settings.is_production:
        Base.metadata.create_all(bind=engine)
    
    # Start Telegram bot (if token configured)
    bot_app = None
    if settings.TELEGRAM_BOT_TOKEN:
        from .telegram.bot import initialize_bot, start_bot, stop_bot
        bot_app = initialize_bot()
        await start_bot(bot_app)
    
    yield
    
    # Shutdown
    if bot_app:
        await stop_bot(bot_app)

app = FastAPI(
    title="FloraFill API",
    description="B2B платформа для цветочного рынка",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (uploaded images)
uploads_dir = Path(settings.UPLOAD_DIR)
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# Routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(regions.router)
app.include_router(florist.router)
app.include_router(farm.router)
app.include_router(admin.router)
```

### 4.5 Alembic Setup

**`backend/alembic.ini`** (ключевая строка):
```ini
sqlalchemy.url = sqlite:///./florafill.db
```

**`backend/alembic/env.py`** должен:
1. Импортировать `Base` из `app.database`
2. Импортировать все модели из `app.models`
3. Использовать `target_metadata = Base.metadata`
4. Подставлять `DATABASE_URL` из `.env` (через `config.set_main_option`)

Инициализация:
```bash
cd backend
alembic init alembic
# Настроить env.py
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

### 4.6 pyproject.toml (Ruff config)

```toml
[tool.ruff]
target-version = "py312"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "W", "I", "N", "UP"]
ignore = ["E501"]  # line length handled by formatter

[tool.ruff.format]
quote-style = "double"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

---

## 5. Модель данных

### 5.1 ER-диаграмма

```mermaid
erDiagram
    User ||--o| FloristProfile : has
    User ||--o| FarmProfile : has
    User ||--o{ RefreshToken : has
    
    FarmProfile ||--o{ FlowerBatch : sells
    FarmProfile ||--o{ Order : receives
    FarmProfile }o--|| Region : located_in
    FarmProfile ||--o{ AccessRequest : receives
    FarmProfile ||--o| Subscription : has
    
    FloristProfile ||--o{ Order : places
    FloristProfile ||--o{ AccessRequest : sends
    FloristProfile }o--o| Region : located_in
    
    Order ||--|{ OrderItem : contains
    OrderItem }o--|| FlowerBatch : references
    
    Subscription }o--|| Plan : of_type
```

### 5.2 Полные SQLAlchemy модели

#### `backend/app/models/user.py`

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # 'florist', 'farm', 'platform_admin'
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Telegram integration
    telegram_chat_id = Column(Integer, nullable=True, unique=True)
    telegram_link_code = Column(String, nullable=True)  # Temporary code for linking
    telegram_link_code_expires = Column(DateTime, nullable=True)
    
    # 152-ФЗ Privacy consent
    privacy_accepted = Column(Boolean, default=False, nullable=False)
    privacy_accepted_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    florist_profile = relationship("FloristProfile", back_populates="user", uselist=False)
    farm_profile = relationship("FarmProfile", back_populates="user", uselist=False)
    refresh_tokens = relationship("RefreshToken", back_populates="user")
```

#### `backend/app/models/profile.py`

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class FloristProfile(Base):
    __tablename__ = "florist_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    business_name = Column(String, nullable=False)       # "Цветочный рай" / ИП Иванов
    contact_name = Column(String, nullable=False)         # ФИО контактного лица
    phone = Column(String, nullable=False)                # "+7 (999) 123-45-67"
    address = Column(String, nullable=True)               # Адрес доставки
    city = Column(String, nullable=True)
    region_id = Column(Integer, ForeignKey("regions.id"), nullable=True)
    photo_url = Column(String, nullable=True)             # Аватар/лого магазина
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="florist_profile")
    region = relationship("Region")
    access_requests = relationship("AccessRequest", back_populates="florist")
    orders = relationship("Order", back_populates="florist")


class FarmProfile(Base):
    __tablename__ = "farm_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    farm_name = Column(String, nullable=False)            # Название фермы
    contact_name = Column(String, nullable=False)         # ФИО контактного лица
    phone = Column(String, nullable=False)
    address = Column(String, nullable=True)               # Физический адрес фермы
    region_id = Column(Integer, ForeignKey("regions.id"), nullable=False)
    description = Column(String, nullable=True)           # Описание фермы
    photo_url = Column(String, nullable=True)             # Логотип/фото фермы
    
    # Business settings
    min_order_amount = Column(Float, default=5000.0, nullable=False)  # Мин. сумма заказа (₽)
    delivery_info = Column(String, nullable=True)         # Информация о доставке
    working_hours = Column(String, nullable=True)         # "Пн-Пт 8:00-17:00"
    
    # Moderation
    is_approved = Column(Boolean, default=False, nullable=False)
    approved_at = Column(DateTime, nullable=True)
    rejection_reason = Column(String, nullable=True)      # Причина отклонения (если отклонена)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="farm_profile")
    region = relationship("Region")
    flower_batches = relationship("FlowerBatch", back_populates="farm")
    access_requests = relationship("AccessRequest", back_populates="farm")
    orders = relationship("Order", back_populates="farm")
    subscription = relationship("Subscription", back_populates="farm", uselist=False)
```

#### `backend/app/models/region.py`

```python
from sqlalchemy import Column, Integer, String
from ..database import Base


class Region(Base):
    __tablename__ = "regions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)       # "Московская область"
    code = Column(String, unique=True, nullable=False)       # "MOW"
    federal_district = Column(String, nullable=False)        # "Центральный"
```

Заполняется скриптом `seed_regions.py` (85 регионов РФ). Вот фрагмент:

```python
# scripts/seed_regions.py
REGIONS = [
    {"name": "Москва", "code": "MOW", "federal_district": "Центральный"},
    {"name": "Московская область", "code": "MOS", "federal_district": "Центральный"},
    {"name": "Санкт-Петербург", "code": "SPE", "federal_district": "Северо-Западный"},
    {"name": "Краснодарский край", "code": "KDA", "federal_district": "Южный"},
    {"name": "Ростовская область", "code": "ROS", "federal_district": "Южный"},
    {"name": "Республика Крым", "code": "CR", "federal_district": "Южный"},
    {"name": "Свердловская область", "code": "SVE", "federal_district": "Уральский"},
    {"name": "Новосибирская область", "code": "NVS", "federal_district": "Сибирский"},
    {"name": "Нижегородская область", "code": "NIZ", "federal_district": "Приволжский"},
    {"name": "Республика Татарстан", "code": "TA", "federal_district": "Приволжский"},
    # ... все 85 субъектов РФ
]
```

#### `backend/app/models/flower.py`

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class FlowerBatch(Base):
    __tablename__ = "flower_batches"

    id = Column(Integer, primary_key=True, index=True)
    farm_id = Column(Integer, ForeignKey("farm_profiles.id"), nullable=False, index=True)
    
    name = Column(String, nullable=False, index=True)     # "Роза Red Naomi"
    description = Column(String, nullable=True)            # Доп. описание
    price = Column(Float, nullable=False)                  # Цена за единицу (₽)
    quantity = Column(Integer, nullable=False)             # Доступное количество
    image_url = Column(String, nullable=True)             # URL фото
    
    status = Column(String, default="available", nullable=False)  # 'available', 'sold', 'archived'
    cut_date = Column(DateTime, nullable=False)           # Дата срезки цветов
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sold_at = Column(DateTime, nullable=True)             # Когда полностью распродана
    
    # Relationships
    farm = relationship("FarmProfile", back_populates="flower_batches")
```

**Правила жизненного цикла партий (реализуются в `flower_service.py`):**
- Партии со статусом `available` автоматически меняют статус на `archived` через **3 недели** после `cut_date`
- Партии со статусом `sold` удаляются через **1 неделю** после `sold_at`
- Партии `archived` удаляются через **1 неделю** после архивации
- Когда `quantity` достигает 0 → `status = 'sold'`, `sold_at = now()`

#### `backend/app/models/access.py`

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from ..database import Base


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id = Column(Integer, primary_key=True, index=True)
    florist_id = Column(Integer, ForeignKey("florist_profiles.id"), nullable=False, index=True)
    farm_id = Column(Integer, ForeignKey("farm_profiles.id"), nullable=False, index=True)
    
    status = Column(String, default="pending", nullable=False)  # 'pending', 'approved', 'rejected'
    message = Column(String, nullable=True)       # Сообщение от флориста ("Здравствуйте, мы ...")
    rejection_reason = Column(String, nullable=True)  # Причина отклонения от фермы
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True) # Когда принято решение
    
    # Unique constraint: один флорист может подать только одну заявку к одной ферме
    __table_args__ = (
        UniqueConstraint("florist_id", "farm_id", name="uq_florist_farm"),
    )
    
    # Relationships
    florist = relationship("FloristProfile", back_populates="access_requests")
    farm = relationship("FarmProfile", back_populates="access_requests")
```

#### `backend/app/models/order.py`

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    florist_id = Column(Integer, ForeignKey("florist_profiles.id"), nullable=False, index=True)
    farm_id = Column(Integer, ForeignKey("farm_profiles.id"), nullable=False, index=True)
    
    status = Column(String, default="new", nullable=False)
    # Statuses: 'new', 'confirmed', 'ready', 'delivering', 'delivered', 'completed', 'rejected', 'cancelled'
    
    customer_comment = Column(String, nullable=True)      # Комментарий флориста при заказе
    farm_comment = Column(String, nullable=True)          # Комментарий фермы (причина отклонения и т.д.)
    total_amount = Column(Float, nullable=False)          # Общая сумма заказа (₽)
    
    # Denormalized data (snapshot at order time — не меняется при обновлении профилей)
    florist_name = Column(String, nullable=True)
    florist_phone = Column(String, nullable=True)
    florist_address = Column(String, nullable=True)
    farm_name = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    florist = relationship("FloristProfile", back_populates="orders")
    farm = relationship("FarmProfile", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    flower_batch_id = Column(Integer, ForeignKey("flower_batches.id"), nullable=True)
    
    quantity = Column(Integer, nullable=False)
    price_at_order = Column(Float, nullable=False)        # Цена за штуку на момент заказа
    flower_name = Column(String, nullable=True)           # Denormalized: название цветка
    
    # Relationships
    order = relationship("Order", back_populates="items")
    flower_batch = relationship("FlowerBatch")
```

#### `backend/app/models/subscription.py` (заглушка)

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class Plan(Base):
    """Тарифные планы для ферм. В пилоте: один план 'free' без ограничений."""
    __tablename__ = "plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)    # 'free', 'basic', 'pro'
    display_name = Column(String, nullable=False)         # "Бесплатный", "Базовый", "Профессиональный"
    max_flower_batches = Column(Integer, nullable=True)   # null = unlimited
    max_orders_per_month = Column(Integer, nullable=True)
    has_analytics = Column(Boolean, default=False)
    has_payment_processing = Column(Boolean, default=False)
    price_monthly = Column(Float, default=0.0)
    is_active = Column(Boolean, default=True)


class Subscription(Base):
    """Подписка фермы на тарифный план."""
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    farm_id = Column(Integer, ForeignKey("farm_profiles.id"), unique=True, nullable=False)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False)
    
    status = Column(String, default="active", nullable=False)  # 'active', 'cancelled', 'expired'
    started_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)  # null = never expires (free plan)
    
    # Relationships
    farm = relationship("FarmProfile", back_populates="subscription")
    plan = relationship("Plan")
```

#### `backend/app/models/token.py`

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    device_info = Column(String, nullable=True)           # User-Agent string
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    is_revoked = Column(Boolean, default=False)
    
    # Relationships
    user = relationship("User", back_populates="refresh_tokens")
```

#### `backend/app/models/__init__.py`

```python
from .user import User
from .profile import FloristProfile, FarmProfile
from .region import Region
from .flower import FlowerBatch
from .access import AccessRequest
from .order import Order, OrderItem
from .subscription import Plan, Subscription
from .token import RefreshToken

__all__ = [
    "User",
    "FloristProfile",
    "FarmProfile",
    "Region",
    "FlowerBatch",
    "AccessRequest",
    "Order",
    "OrderItem",
    "Plan",
    "Subscription",
    "RefreshToken",
]
```

---

## 6. Pydantic Schemas

### 6.1 Common (`backend/app/schemas/common.py`)

```python
from pydantic import BaseModel
from typing import TypeVar, Generic, List
from enum import Enum

T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    per_page: int
    pages: int  # Total number of pages


class OrderStatus(str, Enum):
    new = "new"
    confirmed = "confirmed"
    ready = "ready"
    delivering = "delivering"
    delivered = "delivered"
    completed = "completed"
    rejected = "rejected"
    cancelled = "cancelled"


class AccessRequestStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
```

### 6.2 Auth (`backend/app/schemas/auth.py`)

```python
from pydantic import BaseModel, EmailStr
from typing import Optional

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str  # min 8 chars, validated in service
    role: str  # 'florist' or 'farm'
    privacy_accepted: bool  # Must be True
    
    # Florist fields (required if role == 'florist')
    business_name: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    
    # Farm fields (required if role == 'farm')
    farm_name: Optional[str] = None
    farm_contact_name: Optional[str] = None
    farm_phone: Optional[str] = None
    region_id: Optional[int] = None
    
class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    refresh_token: str
    role: str  # User's role
    
class RefreshTokenRequest(BaseModel):
    refresh_token: str

class TelegramLinkCode(BaseModel):
    code: str
    expires_in: int  # seconds
```

### 6.3 User & Profile (`backend/app/schemas/user.py`, `backend/app/schemas/profile.py`)

```python
# schemas/user.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool
    telegram_chat_id: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

# schemas/profile.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class FloristProfileResponse(BaseModel):
    id: int
    user_id: int
    business_name: str
    contact_name: str
    phone: str
    address: Optional[str] = None
    city: Optional[str] = None
    region_id: Optional[int] = None
    region_name: Optional[str] = None  # Populated from join
    photo_url: Optional[str] = None
    
    class Config:
        from_attributes = True

class FloristProfileUpdate(BaseModel):
    business_name: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    region_id: Optional[int] = None
    password: Optional[str] = None  # For changing password

class FarmProfileResponse(BaseModel):
    id: int
    user_id: int
    farm_name: str
    contact_name: str
    phone: str
    address: Optional[str] = None
    region_id: int
    region_name: Optional[str] = None
    description: Optional[str] = None
    photo_url: Optional[str] = None
    min_order_amount: float
    delivery_info: Optional[str] = None
    working_hours: Optional[str] = None
    is_approved: bool
    
    class Config:
        from_attributes = True

class FarmProfileUpdate(BaseModel):
    farm_name: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    region_id: Optional[int] = None
    description: Optional[str] = None
    min_order_amount: Optional[float] = None  # Must be >= 0
    delivery_info: Optional[str] = None
    working_hours: Optional[str] = None
    password: Optional[str] = None

class FarmPublicInfo(BaseModel):
    """Info visible to florists when browsing farms."""
    id: int
    farm_name: str
    region_id: int
    region_name: Optional[str] = None
    description: Optional[str] = None
    photo_url: Optional[str] = None
    min_order_amount: float
    delivery_info: Optional[str] = None
    working_hours: Optional[str] = None
    
    class Config:
        from_attributes = True
```

### 6.4 Flower (`backend/app/schemas/flower.py`)

```python
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class FlowerBatchCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: float                    # Must be > 0
    quantity: int                   # Must be > 0
    cut_date: datetime              # Date when flowers were cut
    # image_url is set by the storage service, not by client

class FlowerBatchUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None   # Must be > 0
    quantity: Optional[int] = None  # Must be >= 0

class FlowerBatchResponse(BaseModel):
    id: int
    farm_id: int
    farm_name: Optional[str] = None    # Populated from join
    name: str
    description: Optional[str] = None
    price: float
    quantity: int
    image_url: Optional[str] = None
    status: str
    cut_date: datetime
    created_at: datetime
    
    class Config:
        from_attributes = True
```

### 6.5 Access Request (`backend/app/schemas/access.py`)

```python
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class AccessRequestCreate(BaseModel):
    farm_id: int
    message: Optional[str] = None      # "Здравствуйте, мы цветочный магазин..."

class AccessRequestResolve(BaseModel):
    status: str                        # 'approved' or 'rejected'
    rejection_reason: Optional[str] = None

class AccessRequestResponse(BaseModel):
    id: int
    florist_id: int
    farm_id: int
    status: str
    message: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    
    # Populated from joins
    florist_name: Optional[str] = None
    florist_business_name: Optional[str] = None
    florist_phone: Optional[str] = None
    farm_name: Optional[str] = None
    
    class Config:
        from_attributes = True
```

### 6.6 Order (`backend/app/schemas/order.py`)

```python
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class OrderItemCreate(BaseModel):
    flower_batch_id: int
    quantity: int                      # Must be > 0

class OrderCreate(BaseModel):
    farm_id: int                       # Заказ привязан к одной ферме
    items: List[OrderItemCreate]
    customer_comment: Optional[str] = None

class OrderStatusUpdate(BaseModel):
    status: str                        # See OrderStatus enum
    farm_comment: Optional[str] = None # Reason for rejection, etc.

class OrderItemResponse(BaseModel):
    id: int
    flower_batch_id: Optional[int] = None
    quantity: int
    price_at_order: float
    flower_name: Optional[str] = None
    
    class Config:
        from_attributes = True

class OrderResponse(BaseModel):
    id: int
    florist_id: int
    farm_id: int
    status: str
    customer_comment: Optional[str] = None
    farm_comment: Optional[str] = None
    total_amount: float
    florist_name: Optional[str] = None
    florist_phone: Optional[str] = None
    florist_address: Optional[str] = None
    farm_name: Optional[str] = None
    items: List[OrderItemResponse] = []
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
```

### 6.7 Region (`backend/app/schemas/region.py`)

```python
from pydantic import BaseModel

class RegionResponse(BaseModel):
    id: int
    name: str
    code: str
    federal_district: str
    farm_count: int = 0  # Number of approved farms in this region
    
    class Config:
        from_attributes = True
```

---

## 7. Аутентификация и авторизация

### 7.1 Схема токенов

| Токен | Тип | Время жизни | Хранение | Описание |
|-------|-----|-------------|----------|----------|
| Access Token | JWT (HS256) | 15 минут | `Authorization: Bearer <token>` | Содержит `sub` (email), `role`, `exp` |
| Refresh Token | Opaque (secrets.token_urlsafe) | 30 дней | HttpOnly cookie + DB | Используется для получения нового access token |

### 7.2 Auth Service (`backend/app/services/auth_service.py`)

```python
from datetime import datetime, timedelta
from typing import Optional, Tuple
import secrets
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from ..config import settings
from ..models import User, FloristProfile, FarmProfile, RefreshToken, Plan, Subscription
from ..schemas.auth import RegisterRequest
from ..exceptions import (
    InvalidCredentialsError,
    EmailAlreadyExistsError,
    PrivacyNotAcceptedError,
    ValidationError,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(email: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": email, "role": role, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None

def generate_refresh_token() -> str:
    return secrets.token_urlsafe(64)

def generate_telegram_link_code() -> str:
    return secrets.token_urlsafe(16)[:8].upper()  # Short 8-char code

def register_user(db: Session, data: RegisterRequest) -> User:
    # Validation
    if not data.privacy_accepted:
        raise PrivacyNotAcceptedError()
    
    if len(data.password) < 8:
        raise ValidationError("Пароль должен содержать минимум 8 символов")
    
    if data.role not in ("florist", "farm"):
        raise ValidationError("Роль должна быть 'florist' или 'farm'")
    
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise EmailAlreadyExistsError()
    
    # Create user
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        role=data.role,
        privacy_accepted=True,
        privacy_accepted_at=datetime.utcnow(),
    )
    db.add(user)
    db.flush()  # Get user.id
    
    # Create profile based on role
    if data.role == "florist":
        if not data.business_name or not data.contact_name or not data.phone:
            raise ValidationError("business_name, contact_name, phone обязательны для флориста")
        profile = FloristProfile(
            user_id=user.id,
            business_name=data.business_name,
            contact_name=data.contact_name,
            phone=data.phone,
        )
        db.add(profile)
    
    elif data.role == "farm":
        if not data.farm_name or not data.farm_contact_name or not data.farm_phone or not data.region_id:
            raise ValidationError("farm_name, farm_contact_name, farm_phone, region_id обязательны для фермы")
        profile = FarmProfile(
            user_id=user.id,
            farm_name=data.farm_name,
            contact_name=data.farm_contact_name,
            phone=data.farm_phone,
            region_id=data.region_id,
            is_approved=False,
        )
        db.add(profile)
        
        # Auto-assign free plan
        free_plan = db.query(Plan).filter(Plan.name == "free").first()
        if free_plan:
            subscription = Subscription(
                farm_id=profile.id,
                plan_id=free_plan.id,
                status="active",
            )
            db.add(subscription)
    
    db.commit()
    db.refresh(user)
    return user

def create_tokens(db: Session, user: User, device_info: str = "") -> Tuple[str, str, int]:
    access_token = create_access_token(user.email, user.role)
    refresh_token = generate_refresh_token()
    expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    
    # Store refresh token in DB
    db_token = RefreshToken(
        token=refresh_token,
        user_id=user.id,
        device_info=device_info[:200] if device_info else None,
        expires_at=datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(db_token)
    db.commit()
    
    return access_token, refresh_token, expires_in

def rotate_refresh_token(db: Session, old_token: str) -> Optional[Tuple[str, datetime]]:
    """Revoke old token, create new one. Returns (new_token, expires_at) or None."""
    db_token = db.query(RefreshToken).filter(
        RefreshToken.token == old_token,
        RefreshToken.is_revoked == False,
        RefreshToken.expires_at > datetime.utcnow(),
    ).first()
    
    if not db_token:
        return None
    
    # Revoke old
    db_token.is_revoked = True
    
    # Create new
    new_token = generate_refresh_token()
    new_expires = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    new_db_token = RefreshToken(
        token=new_token,
        user_id=db_token.user_id,
        device_info=db_token.device_info,
        expires_at=new_expires,
    )
    db.add(new_db_token)
    db.commit()
    
    return new_token, new_expires
```

### 7.3 Dependencies (`backend/app/dependencies.py`)

```python
from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import User
from .services.auth_service import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Get authenticated user from JWT token."""
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невалидный или истёкший токен",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Невалидный токен")
    
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Пользователь не найден или деактивирован")
    
    return user

async def require_florist(user: User = Depends(get_current_user)) -> User:
    """Require authenticated florist."""
    if user.role != "florist":
        raise HTTPException(status_code=403, detail="Доступ только для флористов")
    return user

async def require_farm(user: User = Depends(get_current_user)) -> User:
    """Require authenticated and approved farm."""
    if user.role != "farm":
        raise HTTPException(status_code=403, detail="Доступ только для ферм")
    if not user.farm_profile or not user.farm_profile.is_approved:
        raise HTTPException(status_code=403, detail="Ферма ещё не одобрена администратором")
    return user

async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Require platform admin."""
    if user.role != "platform_admin":
        raise HTTPException(status_code=403, detail="Доступ только для администратора платформы")
    return user
```

### 7.4 Custom Exceptions (`backend/app/exceptions.py`)

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
    def __init__(self, flower_name: str, available
