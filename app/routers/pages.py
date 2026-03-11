"""
Роутер для статических страниц
"""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, FileResponse

router = APIRouter(tags=["pages"])


@router.get("/", response_class=FileResponse)
async def read_root():
    """
    Главная страница (каталог)
    """
    return "app/static/index.html"


@router.get("/admin", response_class=HTMLResponse)
async def admin_page():
    """
    Страница администратора
    """
    return FileResponse('app/static/admin.html')
