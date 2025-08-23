import asyncio
from telegram import Bot
from .config import settings
from . import models

async def send_new_order_notification(order_details: dict):
    token = settings.TOKEN
    chat_id = settings.CHAT_ID

    if not token or not chat_id:
        print("Telegram token or chat_id not configured. Skipping notification.")
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
        await bot.send_message(
            chat_id=chat_id,
            text=message,
            parse_mode='Markdown'
        )
    except Exception as e:
        print(f"Failed to send Telegram notification: {e}")

# No wrapper needed when using BackgroundTasks