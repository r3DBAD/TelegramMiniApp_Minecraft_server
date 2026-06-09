import json

import asyncpg

from app.services.commands import validate_minecraft_username
from app.services.rcon import RconError


async def approve_user(
    connection: asyncpg.Connection,
    actor_user_id: int,
    user_id: int,
) -> str | None:
    requested_username = await latest_requested_username(connection, user_id)

    await connection.execute("UPDATE mc_panel.users SET status = 'active' WHERE id = $1", user_id)
    await review_pending_requests(connection, actor_user_id, user_id, "approved")
    await grant_role(connection, actor_user_id, user_id, "player")

    if requested_username:
        username = validate_minecraft_username(requested_username)
        await set_minecraft_profile(connection, actor_user_id, user_id, username)

    await audit(connection, actor_user_id, "users.status.update", "user", str(user_id), {"status": "active"})
    return requested_username


async def reject_user(
    connection: asyncpg.Connection,
    actor_user_id: int,
    user_id: int,
) -> None:
    await connection.execute("UPDATE mc_panel.users SET status = 'blocked' WHERE id = $1", user_id)
    await review_pending_requests(connection, actor_user_id, user_id, "rejected")
    await audit(connection, actor_user_id, "users.status.update", "user", str(user_id), {"status": "blocked"})


async def review_pending_requests(
    connection: asyncpg.Connection,
    actor_user_id: int,
    user_id: int,
    request_status: str,
) -> None:
    await connection.execute(
        """
        UPDATE mc_panel.access_requests ar
        SET status = $2,
            reviewed_by = $3,
            reviewed_at = now()
        FROM mc_panel.users u
        WHERE u.id = $1
          AND ar.telegram_user_id = u.telegram_user_id
          AND ar.status = 'pending'
        """,
        user_id,
        request_status,
        actor_user_id,
    )


async def latest_requested_username(connection: asyncpg.Connection, user_id: int) -> str | None:
    row = await connection.fetchrow(
        """
        SELECT ar.requested_minecraft_username
        FROM mc_panel.users u
        JOIN mc_panel.access_requests ar ON ar.telegram_user_id = u.telegram_user_id
        WHERE u.id = $1
          AND ar.requested_minecraft_username IS NOT NULL
        ORDER BY ar.created_at DESC
        LIMIT 1
        """,
        user_id,
    )
    return row["requested_minecraft_username"] if row else None


async def grant_role(
    connection: asyncpg.Connection,
    actor_user_id: int,
    user_id: int,
    role_key: str,
) -> str:
    result = await connection.execute(
        """
        INSERT INTO mc_panel.user_roles (user_id, role_id, granted_by)
        SELECT $1, r.id, $3
        FROM mc_panel.roles r
        WHERE r.key = $2
        ON CONFLICT DO NOTHING
        """,
        user_id,
        role_key,
        actor_user_id,
    )
    if not result.endswith("0"):
        await audit(connection, actor_user_id, "users.role.grant", "user", str(user_id), {"roleKey": role_key})
    return result


async def set_minecraft_profile(
    connection: asyncpg.Connection,
    actor_user_id: int,
    user_id: int,
    username: str,
) -> None:
    await connection.execute(
        "UPDATE mc_panel.minecraft_profiles SET is_primary = false WHERE user_id = $1",
        user_id,
    )
    await connection.execute(
        """
        INSERT INTO mc_panel.minecraft_profiles (user_id, username, is_primary)
        VALUES ($1, $2, true)
        ON CONFLICT ((lower(username)))
        DO UPDATE SET user_id = EXCLUDED.user_id, is_primary = true
        """,
        user_id,
        username,
    )
    await audit(connection, actor_user_id, "users.minecraft_profile.set", "user", str(user_id), {"username": username})


async def audit(
    connection: asyncpg.Connection,
    actor_id: int,
    action: str,
    entity_type: str,
    entity_id: str,
    metadata: dict,
) -> None:
    await connection.execute(
        """
        INSERT INTO mc_panel.audit_log (actor_user_id, action, entity_type, entity_id, metadata)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        """,
        actor_id,
        action,
        entity_type,
        entity_id,
        json.dumps(metadata),
    )


async def whitelist_add(rcon, username: str) -> str:
    try:
        return await rcon.command(f"whitelist add {validate_minecraft_username(username)}")
    except (RconError, OSError, TimeoutError) as exc:
        return f"RCON unavailable: {exc}"


async def whitelist_remove(rcon, username: str) -> str:
    try:
        return await rcon.command(f"whitelist remove {validate_minecraft_username(username)}")
    except (RconError, OSError, TimeoutError) as exc:
        return f"RCON unavailable: {exc}"
