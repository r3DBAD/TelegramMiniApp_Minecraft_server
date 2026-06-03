import json

import asyncpg
from fastapi import Depends, Header, HTTPException, Request, status

from app.config import Settings, get_settings
from app.db import get_pool
from app.security.permissions import CurrentUser, load_effective_permissions, load_roles
from app.security.telegram import validate_init_data


async def get_current_user(
    request: Request,
    authorization: str = Header(default=""),
    pool: asyncpg.Pool = Depends(get_pool),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    scheme, _, raw_init_data = authorization.partition(" ")
    if scheme.lower() != "tma" or not raw_init_data:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Expected Authorization: tma <initData>")

    init_data = validate_init_data(
        raw_init_data,
        settings.bot_token,
        settings.init_data_max_age_seconds,
    )
    telegram_user = init_data.user

    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            INSERT INTO mc_panel.users (
                telegram_user_id, telegram_username, first_name, last_name,
                language_code, photo_url, status, last_seen_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'pending', now())
            ON CONFLICT (telegram_user_id) DO UPDATE SET
                telegram_username = EXCLUDED.telegram_username,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                language_code = EXCLUDED.language_code,
                photo_url = EXCLUDED.photo_url,
                last_seen_at = now()
            RETURNING id, telegram_user_id, telegram_username, first_name, status
            """,
            telegram_user["id"],
            telegram_user.get("username"),
            telegram_user.get("first_name"),
            telegram_user.get("last_name"),
            telegram_user.get("language_code"),
            telegram_user.get("photo_url"),
        )

        if row["status"] == "blocked":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Access blocked")

        roles = await load_roles(connection, row["id"])
        permissions = await load_effective_permissions(connection, row["id"])
        profile = await connection.fetchrow(
            """
            SELECT username
            FROM mc_panel.minecraft_profiles
            WHERE user_id = $1 AND is_primary = true
            ORDER BY id
            LIMIT 1
            """,
            row["id"],
        )

    request.state.telegram_init_data = init_data
    request.state.telegram_user_payload = json.dumps(telegram_user, ensure_ascii=False)
    return CurrentUser(
        id=row["id"],
        telegram_user_id=row["telegram_user_id"],
        status=row["status"],
        telegram_username=row["telegram_username"],
        first_name=row["first_name"],
        permissions=permissions,
        roles=roles,
        minecraft_username=profile["username"] if profile else None,
    )


def require_permission(permission: str):
    async def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.status != "active":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Access is pending approval")
        if permission not in current_user.permissions:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing permission: {permission}")
        return current_user

    return dependency
