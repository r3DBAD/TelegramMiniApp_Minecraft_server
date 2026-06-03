import asyncio

import asyncpg
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

from app.config import get_settings
from app.db import create_pool


async def main() -> None:
    settings = get_settings()
    pool = await create_pool(settings.database_url)
    bot = Bot(settings.bot_token)
    dispatcher = Dispatcher()

    @dispatcher.message(CommandStart())
    async def start(message: Message) -> None:
        if not message.from_user:
            return

        user = await upsert_user(pool, message)
        if user["status"] == "blocked":
            await message.answer("Доступ к панели заблокирован.")
            return

        if user["status"] != "active":
            await message.answer(
                "Заявка на доступ создана. Отправь владельцу свой Telegram ID:\n"
                f"`{message.from_user.id}`",
                parse_mode="Markdown",
            )
            return

        web_app = WebAppInfo(url=str(settings.web_app_url))
        await bot.set_chat_menu_button(
            chat_id=message.chat.id,
            menu_button=MenuButtonWebApp(text="Minecraft Panel", web_app=web_app),
        )
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="Открыть панель", web_app=web_app)],
            ]
        )
        await message.answer("Панель готова.", reply_markup=keyboard)

    @dispatcher.message(F.text == "/id")
    async def telegram_id(message: Message) -> None:
        if message.from_user:
            await message.answer(f"Твой Telegram ID: `{message.from_user.id}`", parse_mode="Markdown")

    try:
        await dispatcher.start_polling(bot)
    finally:
        await pool.close()
        await bot.session.close()


async def upsert_user(pool: asyncpg.Pool, message: Message) -> asyncpg.Record:
    assert message.from_user is not None
    tg = message.from_user
    async with pool.acquire() as connection:
        return await connection.fetchrow(
            """
            INSERT INTO mc_panel.users (
                telegram_user_id, telegram_username, first_name, last_name,
                language_code, status, last_seen_at
            )
            VALUES ($1, $2, $3, $4, $5, 'pending', now())
            ON CONFLICT (telegram_user_id) DO UPDATE SET
                telegram_username = EXCLUDED.telegram_username,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                language_code = EXCLUDED.language_code,
                last_seen_at = now()
            RETURNING id, status
            """,
            tg.id,
            tg.username,
            tg.first_name,
            tg.last_name,
            tg.language_code,
        )


if __name__ == "__main__":
    asyncio.run(main())
