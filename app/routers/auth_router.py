"""
Роутер для авторизации с поддержкой refresh токенов
"""
from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .. import crud, schemas, auth
from ..database import get_db
from .dependencies import get_current_user

router = APIRouter(tags=["auth"])

# Cookie settings for refresh token
REFRESH_TOKEN_COOKIE_NAME = "refresh_token"
REFRESH_TOKEN_COOKIE_MAX_AGE = auth.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60  # seconds


def set_refresh_token_cookie(response: Response, refresh_token: str):
    """Set HttpOnly cookie with refresh token."""
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        max_age=REFRESH_TOKEN_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",  # Protects against CSRF
        secure=False,  # Set to True in production with HTTPS
        path="/token"  # Only send cookie to token endpoints
    )


def clear_refresh_token_cookie(response: Response):
    """Clear refresh token cookie."""
    response.delete_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        path="/token"
    )


@router.post("/token", response_model=schemas.TokenWithRefresh)
async def login_for_access_token(
    response: Response,
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Получить токен доступа и refresh токен.
    Refresh токен также устанавливается в HttpOnly cookie.
    """
    user = crud.get_user_by_username(db, username=form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access and refresh tokens
    access_token, refresh_token, expires_in = auth.create_tokens(user.username)
    
    # Get device info from User-Agent
    device_info = request.headers.get("User-Agent", "Unknown")[:200]  # Limit length
    
    # Store refresh token in database
    crud.create_refresh_token(
        db=db,
        token=refresh_token,
        user_id=user.id,
        expires_at=auth.get_refresh_token_expires(),
        device_info=device_info
    )
    
    # Set refresh token in HttpOnly cookie
    set_refresh_token_cookie(response, refresh_token)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "refresh_token": refresh_token  # Also in response body for clients that need it
    }


@router.post("/token/refresh", response_model=schemas.TokenWithRefresh)
async def refresh_access_token(
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    body: Optional[schemas.RefreshTokenRequest] = None
):
    """
    Обновить access токен используя refresh токен.
    Refresh токен может быть передан в теле запроса или в cookie.
    Реализует ротацию токенов для безопасности.
    """
    # Get refresh token from body or cookie
    refresh_token = None
    if body and body.refresh_token:
        refresh_token = body.refresh_token
    else:
        refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
    
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not provided"
        )
    
    # Validate refresh token
    db_token = crud.get_valid_refresh_token(db, refresh_token)
    if not db_token:
        clear_refresh_token_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    # Get user
    user = crud.get_user(db, db_token.user_id)
    if not user:
        crud.revoke_refresh_token(db, refresh_token)
        clear_refresh_token_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Create new tokens (rotate refresh token)
    access_token, new_refresh_token, expires_in = auth.create_tokens(user.username)
    
    # Rotate refresh token in database
    crud.rotate_refresh_token(
        db=db,
        old_token=refresh_token,
        new_token=new_refresh_token,
        expires_at=auth.get_refresh_token_expires()
    )
    
    # Set new refresh token in cookie
    set_refresh_token_cookie(response, new_refresh_token)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "refresh_token": new_refresh_token
    }


@router.post("/token/logout")
async def logout(
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    body: Optional[schemas.RefreshTokenRequest] = None
):
    """
    Выход из системы - отзыв текущего refresh токена.
    """
    # Get refresh token from body or cookie
    refresh_token = None
    if body and body.refresh_token:
        refresh_token = body.refresh_token
    else:
        refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
    
    if refresh_token:
        crud.revoke_refresh_token(db, refresh_token)
    
    clear_refresh_token_cookie(response)
    
    return {"message": "Successfully logged out"}


@router.post("/token/logout-all")
async def logout_all_devices(
    response: Response,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Выход со всех устройств - отзыв всех refresh токенов пользователя.
    Требует авторизации.
    """
    revoked_count = crud.revoke_all_user_tokens(db, current_user.id)
    clear_refresh_token_cookie(response)
    
    return {
        "message": f"Successfully logged out from all devices",
        "revoked_tokens": revoked_count
    }


@router.get("/token/sessions")
async def get_active_sessions(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Получить список активных сессий (refresh токенов) пользователя.
    """
    tokens = crud.get_user_refresh_tokens(db, current_user.id)
    return {
        "sessions": [
            {
                "device_info": t.device_info,
                "created_at": t.created_at.isoformat(),
                "expires_at": t.expires_at.isoformat()
            }
            for t in tokens
        ]
    }
