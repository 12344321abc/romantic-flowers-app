import asyncio
from telegram import Bot, Update
from telegram.ext import Application, CommandHandler, ContextTypes
from pathlib import Path
import httpx


from .config import settings
from . import crud, models
from .database import SessionLocal

# =================================================================
# NOTIFICATION LOGIC (for admin orders)
# =================================================================

async def send_new_order_notification(order_details: dict):
    token = settings.TOKEN
    chat_id = settings.CHAT_ID

    if not token or not chat_id:
        print("Telegram token or chat_id for admin not configured. Skipping order notification.")
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
        print(f"Failed to send Telegram order notification: {e}")

# =================================================================
# SUBSCRIBER BOT LOGIC
# =================================================================

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.message.chat_id
    db = SessionLocal()
    try:
        crud.create_or_update_subscriber(db, chat_id=chat_id, is_active=True)
        await update.message.reply_text(
            "Добро пожаловать в бот Romantic Flower Farm!  фермы романтических цветов 🌸\n\n"
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
        
async def broadcast_new_flowers(flower_batches: list):
    """
    Sends a message to all active subscribers about new flower batches.
    """
    token = settings.TOKEN
    if not token:
        print("Telegram token not configured. Skipping broadcast.")
        return

    bot = Bot(token=token)
    db = SessionLocal()
    try:
        subscribers = crud.get_active_subscribers(db)
        if not subscribers:
            print("No active subscribers to notify.")
            return
            
        for batch in flower_batches:
            # We need to construct the full URL for the image
            base_url = "http://84.252.132.132" # This should ideally be in settings
            image_url = f"{base_url}{batch.image_url}"
            caption = f"*Новая поставка!*\n\n🌸 *{batch.name}*\n\n"
            if batch.description:
                caption += f"_{batch.description}_\n\n"
            caption += f"Цена: *{batch.price}* руб.\n"
            caption += f"Количество: *{batch.quantity}* шт."

            for sub in subscribers:
                try:
                    await bot.send_photo(
                        chat_id=sub.chat_id,
                        photo=image_url,
                        caption=caption,
                        parse_mode='Markdown'
                    )
                    await asyncio.sleep(0.1) # Avoid hitting rate limits
                except Exception as e:
                    print(f"Failed to send broadcast to {sub.chat_id}: {e}")

    finally:
        db.close()

# Polling function to be run in the background
async def run_bot_polling():
    token = settings.TOKEN
    if not token:
        print("Telegram token not configured. Bot polling not started.")
        return

    application = Application.builder().token(token).build()

    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("stop", stop_command))

    print("Telegram bot is running...")
    await application.run_polling()