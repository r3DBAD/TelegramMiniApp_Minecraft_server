import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.db import get_pool
from app.security.dependencies import require_permission
from app.security.permissions import CurrentUser
from app.services.commands import validate_minecraft_username
from app.services.user_admin import approve_user, audit, grant_role as grant_role_for_user, reject_user, set_minecraft_profile as set_profile_for_user, whitelist_add

router = APIRouter()


class UserStatusBody(BaseModel):
    status: str = Field(pattern="^(pending|active|blocked)$")


class RoleBody(BaseModel):
    roleKey: str = Field(pattern="^admin$")


class PermissionOverrideBody(BaseModel):
    permissionKey: str
    effect: str = Field(pattern="^(allow|deny)$")
    reason: str | None = None


class MinecraftProfileBody(BaseModel):
    username: str = Field(min_length=3, max_length=16)


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


@router.get("/access-requests")
async def list_access_requests(
    pool: asyncpg.Pool = Depends(get_pool),
    _: CurrentUser = Depends(require_permission("users.manage")),
) -> dict:
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT ar.id, ar.telegram_user_id, ar.requested_minecraft_username,
                   ar.status, ar.created_at,
                   u.id AS user_id, u.telegram_username, u.first_name, u.status AS user_status
            FROM mc_panel.access_requests ar
            LEFT JOIN mc_panel.users u ON u.telegram_user_id = ar.telegram_user_id
            WHERE ar.status = 'pending'
            ORDER BY ar.created_at DESC
            """
        )
    return {"requests": [dict(row) for row in rows]}


@router.get("/audit-log")
async def audit_log(
    pool: asyncpg.Pool = Depends(get_pool),
    _: CurrentUser = Depends(require_permission("audit.read")),
) -> dict:
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT al.id, al.action, al.entity_type, al.entity_id, al.metadata,
                   al.created_at, u.telegram_username, u.first_name
            FROM mc_panel.audit_log al
            LEFT JOIN mc_panel.users u ON u.id = al.actor_user_id
            ORDER BY al.created_at DESC
            LIMIT 50
            """
        )
    return {"events": [dict(row) for row in rows]}


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


@router.get("/{user_id}/permissions/effective")
async def effective_permissions(
    user_id: int,
    pool: asyncpg.Pool = Depends(get_pool),
    _: CurrentUser = Depends(require_permission("roles.manage")),
) -> dict:
    async with pool.acquire() as connection:
        target_exists = await connection.fetchval("SELECT EXISTS (SELECT 1 FROM mc_panel.users WHERE id = $1)", user_id)
        if not target_exists:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

        rows = await connection.fetch(
            """
            WITH role_based AS (
                SELECT p.id AS permission_id, array_agg(DISTINCT r.key ORDER BY r.key) AS role_keys
                FROM mc_panel.user_roles ur
                JOIN mc_panel.roles r ON r.id = ur.role_id
                JOIN mc_panel.role_permissions rp ON rp.role_id = r.id
                JOIN mc_panel.permissions p ON p.id = rp.permission_id
                WHERE ur.user_id = $1
                GROUP BY p.id
            )
            SELECT p.key, p.category, p.description, p.risk_level,
                   COALESCE(rb.role_keys, '{}') AS role_keys,
                   upo.effect AS override_effect,
                   upo.reason AS override_reason,
                   (
                       (rb.permission_id IS NOT NULL OR upo.effect = 'allow')
                       AND COALESCE(upo.effect, 'allow') <> 'deny'
                   ) AS effective
            FROM mc_panel.permissions p
            LEFT JOIN role_based rb ON rb.permission_id = p.id
            LEFT JOIN mc_panel.user_permission_overrides upo
              ON upo.permission_id = p.id
             AND upo.user_id = $1
             AND (upo.expires_at IS NULL OR upo.expires_at > now())
            ORDER BY p.category, p.key
            """,
            user_id,
        )
    return {"permissions": [dict(row) for row in rows]}


@router.patch("/{user_id}/status")
async def update_user_status(
    user_id: int,
    body: UserStatusBody,
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(require_permission("users.manage")),
) -> dict[str, str | None]:
    if user_id == current_user.id and body.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot block or deactivate your own account")

    whitelist_output = None
    async with pool.acquire() as connection:
        exists = await connection.fetchval("SELECT EXISTS (SELECT 1 FROM mc_panel.users WHERE id = $1)", user_id)
        if not exists:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        if body.status == "blocked" and await _is_last_active_admin(connection, user_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot block the last active admin")

        if body.status == "active":
            username = await approve_user(connection, current_user.id, user_id)
        elif body.status == "blocked":
            await reject_user(connection, current_user.id, user_id)
            username = None
        else:
            await connection.execute("UPDATE mc_panel.users SET status = 'pending' WHERE id = $1", user_id)
            await connection.execute("DELETE FROM mc_panel.user_roles WHERE user_id = $1", user_id)
            await audit(connection, current_user.id, "users.status.update", "user", str(user_id), body.model_dump())
            username = None

    if body.status == "active" and username:
        whitelist_output = await whitelist_add(request.app.state.rcon, username)

    return {"status": "updated", "whitelistOutput": whitelist_output}


@router.post("/{user_id}/roles")
async def grant_role(
    user_id: int,
    body: RoleBody,
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(require_permission("roles.manage")),
) -> dict[str, str]:
    if user_id == current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot change your own roles")
    async with pool.acquire() as connection:
        target_exists = await connection.fetchval(
            """
            SELECT EXISTS (
                SELECT 1
                FROM mc_panel.users u
                CROSS JOIN mc_panel.roles r
                WHERE u.id = $1 AND r.key = $2
            )
            """,
            user_id,
            body.roleKey,
        )
        if not target_exists:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Role or user not found")
        result = await grant_role_for_user(connection, current_user.id, user_id, body.roleKey)
    return {"status": "unchanged" if result.endswith("0") else "granted"}


@router.delete("/{user_id}/roles/{role_key}")
async def revoke_role(
    user_id: int,
    role_key: str,
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(require_permission("roles.manage")),
) -> dict[str, str]:
    if user_id == current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot change your own roles")
    if role_key != "admin":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")

    async with pool.acquire() as connection:
        if await _is_last_active_admin(connection, user_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot revoke the last active admin")
        await connection.execute(
            """
            DELETE FROM mc_panel.user_roles ur
            USING mc_panel.roles r
            WHERE ur.role_id = r.id AND ur.user_id = $1 AND r.key = $2
            """,
            user_id,
            role_key,
        )
        await audit(connection, current_user.id, "users.role.revoke", "user", str(user_id), {"roleKey": role_key})
    return {"status": "revoked"}


@router.put("/{user_id}/permissions")
async def set_permission_override(
    user_id: int,
    body: PermissionOverrideBody,
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(require_permission("roles.manage")),
) -> dict[str, str]:
    if user_id == current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot change your own permissions")
    raise HTTPException(status.HTTP_410_GONE, "Individual permission overrides are disabled; use status active/blocked")



@router.delete("/{user_id}/permissions/{permission_key}")
async def clear_permission_override(
    user_id: int,
    permission_key: str,
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(require_permission("roles.manage")),
) -> dict[str, str]:
    if user_id == current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot change your own permissions")
    raise HTTPException(status.HTTP_410_GONE, "Individual permission overrides are disabled; use status active/blocked")



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
            await set_profile_for_user(connection, current_user.id, user_id, username)
    return {"status": "updated"}


async def _is_last_active_admin(connection: asyncpg.Connection, user_id: int) -> bool:
    row = await connection.fetchrow(
        """
        SELECT EXISTS (
            SELECT 1
            FROM mc_panel.user_roles ur
            JOIN mc_panel.roles r ON r.id = ur.role_id
            JOIN mc_panel.users u ON u.id = ur.user_id
            WHERE ur.user_id = $1
              AND r.key = 'admin'
              AND u.status = 'active'
        ) AS is_admin,
        (
            SELECT count(*)
            FROM mc_panel.user_roles ur
            JOIN mc_panel.roles r ON r.id = ur.role_id
            JOIN mc_panel.users u ON u.id = ur.user_id
            WHERE r.key = 'admin'
              AND u.status = 'active'
        ) AS active_admin_count
        """,
        user_id,
    )
    return bool(row and row["is_admin"] and row["active_admin_count"] <= 1)
