import asyncio

import asyncpg
from aiogram import Bot, Dispatcher
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

from app.config import get_settings
from app.db import create_pool
from app.services.minecraft import parse_list_response
from app.services.rcon import RconClient, RconError


async def main() -> None:
    settings = get_settings()
    pool = await create_pool(settings.database_url)
    bot = Bot(settings.bot_token)
    dispatcher = Dispatcher()
    rcon = RconClient(settings.rcon_host, settings.rcon_port, settings.rcon_password)

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

        await send_panel_button(bot, message)

    @dispatcher.message(Command("id"))
    async def telegram_id(message: Message) -> None:
        if message.from_user:
            await message.answer(f"Твой Telegram ID: `{message.from_user.id}`", parse_mode="Markdown")

    @dispatcher.message(Command("help"))
    async def help_command(message: Message) -> None:
        await message.answer(
            "Команды:\n"
            "/start - открыть Mini App\n"
            "/panel - кнопка панели\n"
            "/status - статус Minecraft\n"
            "/players - игроки онлайн\n"
            "/id - твой Telegram ID"
        )

    @dispatcher.message(Command("panel"))
    async def panel_command(message: Message) -> None:
        if not message.from_user:
            return
        user = await upsert_user(pool, message)
        if user["status"] != "active":
            await message.answer("Доступ к панели еще не активирован.")
            return
        await send_panel_button(bot, message)

    @dispatcher.message(Command("status"))
    async def status_command(message: Message) -> None:
        if not message.from_user:
            return
        user = await upsert_user(pool, message)
        if user["status"] != "active":
            await message.answer("Доступ к статусу еще не активирован.")
            return
        if not await has_permission(pool, user["id"], "minecraft.status.view"):
            await message.answer("Нет права `minecraft.status.view`.", parse_mode="Markdown")
            return

        try:
            response = await rcon.command("list")
        except (RconError, OSError, TimeoutError) as exc:
            await message.answer(f"RCON недоступен: `{exc}`", parse_mode="Markdown")
            return

        parsed = parse_list_response(response)
        await message.answer(
            "Minecraft online\n"
            f"Игроки: {parsed['online']}/{parsed['max']}\n"
            f"{', '.join(parsed['players']) if parsed['players'] else 'Сейчас пусто'}"
        )

    @dispatcher.message(Command("players"))
    async def players_command(message: Message) -> None:
        await status_command(message)

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


async def has_permission(pool: asyncpg.Pool, user_id: int, permission: str) -> bool:
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            WITH role_based AS (
                SELECT p.key, 'allow'::text AS effect
                FROM mc_panel.user_roles ur
                JOIN mc_panel.role_permissions rp ON rp.role_id = ur.role_id
                JOIN mc_panel.permissions p ON p.id = rp.permission_id
                WHERE ur.user_id = $1
            ),
            overrides AS (
                SELECT p.key, upo.effect
                FROM mc_panel.user_permission_overrides upo
                JOIN mc_panel.permissions p ON p.id = upo.permission_id
                WHERE upo.user_id = $1
                  AND (upo.expires_at IS NULL OR upo.expires_at > now())
            )
            SELECT EXISTS (
                SELECT 1
                FROM (
                    SELECT key, effect FROM role_based
                    UNION ALL
                    SELECT key, effect FROM overrides
                ) permissions
                WHERE key = $2 AND effect = 'allow'
            ) AND NOT EXISTS (
                SELECT 1 FROM overrides WHERE key = $2 AND effect = 'deny'
            ) AS allowed
            """,
            user_id,
            permission,
        )
    return bool(row and row["allowed"])


async def send_panel_button(bot: Bot, message: Message) -> None:
    settings = get_settings()
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


if __name__ == "__main__":
    asyncio.run(main())
