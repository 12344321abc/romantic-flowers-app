import asyncio
from app.telegram import run_bot_polling
from app.database import engine, Base
from app import models

def main():
    print("Creating database tables for bot...")
    Base.metadata.create_all(bind=engine)
    print("Starting Telegram bot polling...")
    asyncio.run(run_bot_polling())

if __name__ == "__main__":
    main()