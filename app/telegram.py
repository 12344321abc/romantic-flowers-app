import asyncio
import logging
from telegram import Bot, Update
from telegram.ext import Application, CommandHandler, ContextTypes
from pathlib import Path
import httpx


from .config import settings
from . import crud, models
from .database import SessionLocal

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# =================================================================
# NOTIFICATION LOGIC (for admin orders)
# =================================================================

async def send_new_order_notification(order_details: dict):
    token = settings.TOKEN
    chat_id = settings.CHAT_ID

    if not token or not chat_id:
        logger.warning("Telegram token or chat_id for admin not configured. Skipping order notification.")
        return

    bot = Bot(token=token)
    message = f"🎉 *Новый заказ!* 🎉\n\n"
    message += f"*ID Заказа:* `{order_details['order_id']}`\n"
    message += f"*Клиент:* {order_details['customer_name']} (`{order_details['customer_username']}`)\n"
    if order_details['customer_address']:
        message += f"*Адрес (нажмите для копирования):*\n`{order_details['customer_address']}`\n\n"
    else:
        message += "\n"
        
    message += "*Состав заказа:*\n"
    for item in order_details['items']:
        message += f"  - *{item['name']}*\n"
        if item['description']:
            message += f"    _{item['description']}_\n"
        message += f"    Кол-во: `{item['quantity']}` шт.\n"
    
    if order_details['comment']:
        message += f"\n*Комментарий клиента:*\n_{order_details['comment']}_"
    
    try:
        await bot.send_message(chat_id=chat_id, text=message, parse_mode='Markdown')
    except Exception as e:
        logger.error(f"Failed to send Telegram order notification: {e}")

# =================================================================
# SUBSCRIBER BOT LOGIC
# =================================================================

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.message.chat_id
    db = SessionLocal()
    try:
        crud.create_or_update_subscriber(db, chat_id=chat_id, is_active=True)
        await update.message.reply_text(
            "Добро пожаловать в бот Romantic Flower Farm! 🌸\n\n"
            "Вы успешно подписались на уведомления о новых поставках.\n"
            "Как только у нас появятся свежие цветы, я пришлю вам сообщение.\n\n"
            "Чтобы отписаться в любой момент, просто отправьте команду /stop."
        )
    finally:
        db.close()

async def stop_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.message.chat_id
    db = SessionLocal()
    try:
        crud.create_or_update_subscriber(db, chat_id=chat_id, is_active=False)
        await update.message.reply_text("Вы отписались от уведомлений.")
    finally:
        db.close()
        
async def broadcast_new_flowers(flower_batches_details: list):
    """
    Sends a grouped message and a media group photo album to all active subscribers.
    """
    token = settings.TOKEN
    if not token:
        logger.warning("Telegram token not configured. Skipping broadcast.")
        return

    bot = Bot(token=token)
    db = SessionLocal()
    try:
        subscribers = crud.get_active_subscribers(db)
        if not subscribers:
            logger.info("No active subscribers to notify.")
            return

        logger.info(f"Starting broadcast to {len(subscribers)} subscribers for {len(flower_batches_details)} flower batches.")

        # 1. Prepare the text message
        text_message = "*Свежая поставка в Romantic Flower Farm!* 🌸\n\n"
        for batch in flower_batches_details:
            text_message += f"• *{batch['name']}* - {batch['price']} руб.\n"

        # 2. Send to all subscribers
        for sub in subscribers:
            media_group = []
            try:
                # Send the text message first
                await bot.send_message(
                    chat_id=sub.chat_id,
                    text=text_message,
                    parse_mode='Markdown'
                )

                # Prepare and send the media group for this specific subscriber
                for batch in flower_batches_details[:10]:
                    media_group.append({
                        'type': 'photo',
                        'media': open(batch['file_path'], 'rb')
                    })
                
                if media_group:
                    await bot.send_media_group(
                        chat_id=sub.chat_id,
                        media=media_group
                    )
                
                await asyncio.sleep(0.1)  # Avoid hitting rate limits

            except Exception as e:
                logger.error(f"Failed to send broadcast to {sub.chat_id}: {e}")
            finally:
                # Ensure all file handlers in the media group are closed
                for item in media_group:
                    if 'media' in item and hasattr(item['media'], 'close'):
                        item['media'].close()
    finally:
        db.close()

# =================================================================
# BOT LIFECYCLE MANAGEMENT
# =================================================================

def initialize_bot() -> Application:
    token = settings.TOKEN
    if not token:
        logger.error("Telegram token not configured. Bot cannot be initialized.")
        raise ValueError("Telegram token not set in .env file")

    application = Application.builder().token(token).build()
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("stop", stop_command))
    logger.info("Telegram bot application initialized.")
    return application

async def start_bot(application: Application):
    await application.initialize()
    await application.start()
    await application.updater.start_polling()
    logger.info("Telegram bot polling started.")

async def stop_bot(application: Application):
    logger.info("Stopping Telegram bot...")
    await application.updater.stop()
    await application.stop()
    await application.shutdown()
    logger.info("Telegram bot stopped.")