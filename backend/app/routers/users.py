import json

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.db import get_pool
from app.security.dependencies import require_permission
from app.security.permissions import CurrentUser
from app.services.commands import validate_minecraft_username

router = APIRouter()


class UserStatusBody(BaseModel):
    status: str = Field(pattern="^(pending|active|blocked)$")


class RoleBody(BaseModel):
    roleKey: str


class PermissionOverrideBody(BaseModel):
    permissionKey: str
    effect: str = Field(pattern="^(allow|deny)$")
    reason: str | None = None


class MinecraftProfileBody(BaseModel):
    username: str


@router.get("")
async def list_users(
    pool: asyncpg.Pool = Depends(get_pool),
    _: CurrentUser = Depends(require_permission("users.manage")),
) -> dict:
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT u.id, u.telegram_user_id, u.telegram_username, u.first_name, u.status,
                   u.last_seen_at, mp.username AS minecraft_username,
                   ar.requested_minecraft_username,
                   COALESCE(array_agg(DISTINCT r.key) FILTER (WHERE r.key IS NOT NULL), '{}') AS roles
            FROM mc_panel.users u
            LEFT JOIN mc_panel.minecraft_profiles mp ON mp.user_id = u.id AND mp.is_primary = true
            LEFT JOIN LATERAL (
                SELECT requested_minecraft_username
                FROM mc_panel.access_requests
                WHERE telegram_user_id = u.telegram_user_id
                  AND requested_minecraft_username IS NOT NULL
                ORDER BY created_at DESC
                LIMIT 1
            ) ar ON true
            LEFT JOIN mc_panel.user_roles ur ON ur.user_id = u.id
            LEFT JOIN mc_panel.roles r ON r.id = ur.role_id
            GROUP BY u.id, mp.username, ar.requested_minecraft_username
            ORDER BY u.created_at DESC
            """
        )
    return {"users": [dict(row) for row in rows]}


@router.get("/permissions/catalog")
async def permission_catalog(
    pool: asyncpg.Pool = Depends(get_pool),
    _: CurrentUser = Depends(require_permission("roles.manage")),
) -> dict:
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT key, category, description, risk_level
            FROM mc_panel.permissions
            ORDER BY category, key
            """
        )
    return {"permissions": [dict(row) for row in rows]}


@router.patch("/{user_id}/status")
async def update_user_status(
    user_id: int,
    body: UserStatusBody,
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(require_permission("users.manage")),
) -> dict[str, str]:
    async with pool.acquire() as connection:
        result = await connection.execute(
            "UPDATE mc_panel.users SET status = $2 WHERE id = $1",
            user_id,
            body.status,
        )
        await _audit(connection, current_user.id, "users.status.update", "user", str(user_id), body.model_dump())
    if result.endswith("0"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return {"status": "updated"}


@router.post("/{user_id}/roles")
async def grant_role(
    user_id: int,
    body: RoleBody,
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(require_permission("roles.manage")),
) -> dict[str, str]:
    async with pool.acquire() as connection:
        result = await connection.execute(
            """
            INSERT INTO mc_panel.user_roles (user_id, role_id, granted_by)
            SELECT $1, r.id, $3
            FROM mc_panel.roles r
            WHERE r.key = $2
            ON CONFLICT DO NOTHING
            """,
            user_id,
            body.roleKey,
            current_user.id,
        )
        await _audit(connection, current_user.id, "users.role.grant", "user", str(user_id), body.model_dump())
    if result.endswith("0"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role or user not found")
    return {"status": "granted"}


@router.delete("/{user_id}/roles/{role_key}")
async def revoke_role(
    user_id: int,
    role_key: str,
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(require_permission("roles.manage")),
) -> dict[str, str]:
    async with pool.acquire() as connection:
        await connection.execute(
            """
            DELETE FROM mc_panel.user_roles ur
            USING mc_panel.roles r
            WHERE ur.role_id = r.id AND ur.user_id = $1 AND r.key = $2
            """,
            user_id,
            role_key,
        )
        await _audit(connection, current_user.id, "users.role.revoke", "user", str(user_id), {"roleKey": role_key})
    return {"status": "revoked"}


@router.put("/{user_id}/permissions")
async def set_permission_override(
    user_id: int,
    body: PermissionOverrideBody,
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(require_permission("roles.manage")),
) -> dict[str, str]:
    async with pool.acquire() as connection:
        result = await connection.execute(
            """
            INSERT INTO mc_panel.user_permission_overrides (
                user_id, permission_id, effect, reason, created_by
            )
            SELECT $1, p.id, $3, $4, $5
            FROM mc_panel.permissions p
            WHERE p.key = $2
            ON CONFLICT (user_id, permission_id)
            DO UPDATE SET effect = EXCLUDED.effect,
                          reason = EXCLUDED.reason,
                          created_by = EXCLUDED.created_by,
                          created_at = now()
            """,
            user_id,
            body.permissionKey,
            body.effect,
            body.reason,
            current_user.id,
        )
        await _audit(connection, current_user.id, "users.permission.override", "user", str(user_id), body.model_dump())
    if result.endswith("0"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Permission or user not found")
    return {"status": "updated"}


@router.put("/{user_id}/minecraft-profile")
async def set_minecraft_profile(
    user_id: int,
    body: MinecraftProfileBody,
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(require_permission("users.manage")),
) -> dict[str, str]:
    username = validate_minecraft_username(body.username)
    async with pool.acquire() as connection:
        async with connection.transaction():
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
            await _audit(connection, current_user.id, "users.minecraft_profile.set", "user", str(user_id), {"username": username})
    return {"status": "updated"}


async def _audit(connection: asyncpg.Connection, actor_id: int, action: str, entity_type: str, entity_id: str, metadata: dict) -> None:
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
