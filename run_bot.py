import asyncio
import logging
import sys
from pathlib import Path

# Add project root to path to allow imports
sys.path.append(str(Path(__file__).resolve().parent))

from app.telegram import initialize_bot, start_bot, stop_bot
from app.database import engine, Base
from app import models

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

async def main():
    """Initializes and runs the bot, ensuring graceful shutdown."""
    logging.info("Starting bot script...")
    
    # 1. Create DB tables
    logging.info("Creating database tables if they don't exist...")
    Base.metadata.create_all(bind=engine)

    # 2. Initialize Bot
    try:
        application = initialize_bot()
    except ValueError as e:
        logging.error(f"Initialization failed: {e}")
        return

    # 3. Run bot with graceful shutdown
    try:
        await start_bot(application)
        # Keep the script running until interrupted
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, SystemExit):
        logging.info("Shutdown signal received.")
    finally:
        await stop_bot(application)
        logging.info("Script finished.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Main function interrupted. Exiting.")