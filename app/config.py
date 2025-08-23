from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./flowers.db"
    SECRET_KEY: str
    TOKEN: Optional[str] = None
    CHAT_ID: Optional[str] = None

    class Config:
        env_file = ".env"

settings = Settings()