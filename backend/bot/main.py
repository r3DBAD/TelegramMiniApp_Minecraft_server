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
from app.services.user_admin import approve_user, reject_user, whitelist_add


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
                "Заявка на доступ создана. Отправь администратору свой Telegram ID:\n"
                f"`{message.from_user.id}`",
                parse_mode="Markdown",
            )
            return
        if not await has_permission(pool, user["id"], "system.view"):
            await message.answer("Доступ к админ-панели не выдан.")
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
            "/requests - новые заявки\n"
            "/approve <telegram_id> - выдать admin-доступ\n"
            "/reject <telegram_id> - отклонить заявку\n"
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
        if not await has_permission(pool, user["id"], "system.view"):
            await message.answer("Доступ к админ-панели не выдан.")
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

    @dispatcher.message(Command("requests"))
    async def requests_command(message: Message) -> None:
        user = await require_bot_permission(pool, message, "users.manage")
        if not user:
            return

        rows = await list_pending_requests(pool)
        if not rows:
            await message.answer("Новых заявок нет.")
            return

        lines = ["Новые заявки:"]
        for row in rows[:10]:
            label = row["telegram_username"] or row["first_name"] or str(row["telegram_user_id"])
            minecraft = row["requested_minecraft_username"] or "ник не указан"
            lines.append(f"`{row['telegram_user_id']}` - {label} - `{minecraft}`")
        await message.answer("\n".join(lines), parse_mode="Markdown")

    @dispatcher.message(Command("approve"))
    async def approve_command(message: Message) -> None:
        actor = await require_bot_permission(pool, message, "users.manage")
        if not actor:
            return

        telegram_user_id = parse_telegram_id_arg(message)
        if telegram_user_id is None:
            await message.answer("Использование: `/approve <telegram_id>`", parse_mode="Markdown")
            return

        target = await find_user_by_telegram_id(pool, telegram_user_id)
        if not target:
            await message.answer("Пользователь не найден. Он должен сначала открыть бота или Mini App.")
            return

        async with pool.acquire() as connection:
            username = await approve_user(connection, actor["id"], target["id"])

        whitelist_output = await whitelist_add(rcon, username) if username else "Minecraft ник не указан"
        await message.answer(f"Выдан admin-доступ: `{telegram_user_id}`\nWhitelist: `{whitelist_output}`", parse_mode="Markdown")

    @dispatcher.message(Command("reject"))
    async def reject_command(message: Message) -> None:
        actor = await require_bot_permission(pool, message, "users.manage")
        if not actor:
            return

        telegram_user_id = parse_telegram_id_arg(message)
        if telegram_user_id is None:
            await message.answer("Использование: `/reject <telegram_id>`", parse_mode="Markdown")
            return

        target = await find_user_by_telegram_id(pool, telegram_user_id)
        if not target:
            await message.answer("Пользователь не найден.")
            return

        async with pool.acquire() as connection:
            await reject_user(connection, actor["id"], target["id"])
        await message.answer(f"Отклонено: `{telegram_user_id}`", parse_mode="Markdown")

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
            SELECT EXISTS (
                SELECT 1
                FROM mc_panel.user_roles ur
                JOIN mc_panel.roles r ON r.id = ur.role_id
                WHERE ur.user_id = $1 AND r.key = 'admin'
            ) AND EXISTS (
                SELECT 1
                FROM mc_panel.permissions
                WHERE key = $2
            ) AS allowed
            """,
            user_id,
            permission,
        )
    return bool(row and row["allowed"])


async def require_bot_permission(pool: asyncpg.Pool, message: Message, permission: str) -> asyncpg.Record | None:
    if not message.from_user:
        return None

    user = await upsert_user(pool, message)
    if user["status"] != "active":
        await message.answer("Доступ еще не активирован.")
        return None
    if not await has_permission(pool, user["id"], permission):
        await message.answer(f"Нет права `{permission}`.", parse_mode="Markdown")
        return None
    return user


async def list_pending_requests(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    async with pool.acquire() as connection:
        return await connection.fetch(
            """
            SELECT ar.telegram_user_id, ar.requested_minecraft_username,
                   u.telegram_username, u.first_name
            FROM mc_panel.access_requests ar
            LEFT JOIN mc_panel.users u ON u.telegram_user_id = ar.telegram_user_id
            WHERE ar.status = 'pending'
            ORDER BY ar.created_at DESC
            LIMIT 20
            """
        )


async def find_user_by_telegram_id(pool: asyncpg.Pool, telegram_user_id: int) -> asyncpg.Record | None:
    async with pool.acquire() as connection:
        return await connection.fetchrow(
            """
            SELECT id, status
            FROM mc_panel.users
            WHERE telegram_user_id = $1
            """,
            telegram_user_id,
        )


def parse_telegram_id_arg(message: Message) -> int | None:
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) != 2:
        return None
    try:
        return int(parts[1].strip())
    except ValueError:
        return None


async def send_panel_button(bot: Bot, message: Message) -> None:
    settings = get_settings()
    web_app = WebAppInfo(url=str(settings.web_app_url))
    await bot.set_chat_menu_button(
        chat_id=message.chat.id,
        menu_button=MenuButtonWebApp(text="Minecraft Ops", web_app=web_app),
    )
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Открыть админ-панель", web_app=web_app)],
        ]
    )
    await message.answer("Админ-панель готова.", reply_markup=keyboard)


if __name__ == "__main__":
    asyncio.run(main())
