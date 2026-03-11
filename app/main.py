"""
Главный модуль FastAPI приложения
"""
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import models
from .database import engine
from .routers import auth_router, flowers, users, orders, notifications, pages

# Создание таблиц в БД
models.Base.metadata.create_all(bind=engine)

# Создание приложения FastAPI
app = FastAPI(
    title="Romantic Flower Farm",
    description="API для интернет-магазина оптовой продажи цветов",
    version="1.0.0"
)

# --- Path Configuration ---
BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "static" / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Подключение статических файлов
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# --- Подключение роутеров ---
app.include_router(auth_router.router)
app.include_router(flowers.router)
app.include_router(users.router)
app.include_router(orders.router)
app.include_router(notifications.router)
app.include_router(pages.router)
