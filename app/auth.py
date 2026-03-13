from datetime import datetime, timedelta
from typing import Optional, Tuple
import secrets
from jose import JWTError, jwt
from passlib.context import CryptContext
from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15  # Short-lived access token
REFRESH_TOKEN_EXPIRE_DAYS = 30   # Long-lived refresh token


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a short-lived access token (JWT)."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def generate_refresh_token() -> str:
    """Generate a secure random refresh token."""
    return secrets.token_urlsafe(64)


def get_refresh_token_expires() -> datetime:
    """Get expiration datetime for refresh token."""
    return datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)


def verify_access_token(token: str) -> Optional[str]:
    """
    Verify access token and return username if valid.
    Returns None if token is invalid or expired.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        return username
    except JWTError:
        return None


def create_tokens(username: str) -> Tuple[str, str, int]:
    """
    Create both access and refresh tokens.
    Returns: (access_token, refresh_token, expires_in_seconds)
    """
    access_token = create_access_token(data={"sub": username})
    refresh_token = generate_refresh_token()
    expires_in = ACCESS_TOKEN_EXPIRE_MINUTES * 60  # Convert to seconds
    return access_token, refresh_token, expires_in