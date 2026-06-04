import asyncio
import html
import json
import urllib.error
import urllib.request
from dataclasses import dataclass

import asyncpg


@dataclass(frozen=True)
class AccessRequestNotification:
    requester_telegram_id: int
    requester_name: str
    minecraft_username: str | None
    web_app_url: str


async def notify_access_request(
    pool: asyncpg.Pool,
    bot_token: str,
    notification: AccessRequestNotification,
) -> None:
    recipients = await load_access_request_recipients(pool, notification.requester_telegram_id)
    if not recipients:
        return

    text = build_access_request_text(notification)
    reply_markup = {
        "inline_keyboard": [
            [
                {
                    "text": "Открыть панель",
                    "web_app": {"url": notification.web_app_url},
                }
            ]
        ]
    }

    await asyncio.gather(
        *[
            send_message(bot_token, telegram_user_id, text, reply_markup)
            for telegram_user_id in recipients
        ],
        return_exceptions=True,
    )


async def load_access_request_recipients(pool: asyncpg.Pool, requester_telegram_id: int) -> list[int]:
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT DISTINCT u.telegram_user_id
            FROM mc_panel.users u
            JOIN mc_panel.user_roles ur ON ur.user_id = u.id
            JOIN mc_panel.roles r ON r.id = ur.role_id
            WHERE u.status = 'active'
              AND u.telegram_user_id <> $1
              AND r.key IN ('owner', 'admin')
            """,
            requester_telegram_id,
        )
    return [int(row["telegram_user_id"]) for row in rows]


async def send_message(
    bot_token: str,
    chat_id: int,
    text: str,
    reply_markup: dict[str, object],
) -> None:
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": reply_markup,
    }
    await asyncio.to_thread(post_json, bot_token, "sendMessage", payload)


def post_json(bot_token: str, method: str, payload: dict[str, object]) -> None:
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{bot_token}/{method}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            response.read()
    except (urllib.error.URLError, TimeoutError):
        # Notification delivery must never break access request creation.
        return


def build_access_request_text(notification: AccessRequestNotification) -> str:
    lines = [
        "Новая заявка в Minecraft Panel",
        "",
        f"Telegram: {html.escape(notification.requester_name)}",
        f"Telegram ID: <code>{notification.requester_telegram_id}</code>",
    ]
    if notification.minecraft_username:
        lines.append(f"Minecraft ник: <code>{html.escape(notification.minecraft_username)}</code>")
    return "\n".join(lines)
