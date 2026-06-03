from dataclasses import dataclass

import asyncpg


@dataclass(frozen=True)
class CurrentUser:
    id: int
    telegram_user_id: int
    status: str
    telegram_username: str | None
    first_name: str | None
    permissions: frozenset[str]
    roles: tuple[str, ...]
    minecraft_username: str | None

    def can(self, permission: str) -> bool:
        return permission in self.permissions


async def load_effective_permissions(connection: asyncpg.Connection, user_id: int) -> frozenset[str]:
    rows = await connection.fetch(
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
        SELECT key, effect FROM role_based
        UNION ALL
        SELECT key, effect FROM overrides
        """,
        user_id,
    )
    allowed = {row["key"] for row in rows if row["effect"] == "allow"}
    denied = {row["key"] for row in rows if row["effect"] == "deny"}
    return frozenset(allowed - denied)


async def load_roles(connection: asyncpg.Connection, user_id: int) -> tuple[str, ...]:
    rows = await connection.fetch(
        """
        SELECT r.key
        FROM mc_panel.user_roles ur
        JOIN mc_panel.roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1
        ORDER BY r.priority DESC, r.key
        """,
        user_id,
    )
    return tuple(row["key"] for row in rows)
