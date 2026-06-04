import json

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from app.db import get_pool
from app.security.dependencies import get_current_user, require_permission
from app.security.permissions import CurrentUser
from app.services.commands import render_command
from app.services.rcon import RconError

router = APIRouter()


class ExecuteCommandBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    params: dict[str, str | int | float | bool] = Field(default_factory=dict)
    confirmed: bool = False


@router.get("")
async def command_catalog(
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(require_permission("system.view")),
) -> dict:
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            """
            SELECT key, title, description, permission_key, params_schema,
                   risk_level, confirmation_required, sort_order
            FROM mc_panel.minecraft_commands
            WHERE enabled = true
            ORDER BY sort_order, title
            """
        )

    commands = []
    for row in rows:
        params_schema = _jsonb(row["params_schema"])
        allowed = row["permission_key"] in current_user.permissions
        commands.append(
            {
                "key": row["key"],
                "title": row["title"],
                "description": row["description"],
                "permissionKey": row["permission_key"],
                "paramsSchema": params_schema,
                "riskLevel": row["risk_level"],
                "confirmationRequired": row["confirmation_required"],
                "allowed": allowed,
            }
        )
    return {"commands": commands}


@router.post("/{command_key}/execute")
async def execute_command(
    command_key: str,
    body: ExecuteCommandBody,
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    if current_user.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access is pending approval")

    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            SELECT id, key, title, permission_key, rcon_template, params_schema,
                   risk_level, confirmation_required
            FROM mc_panel.minecraft_commands
            WHERE key = $1 AND enabled = true
            """,
            command_key,
        )
        if not row:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Command not found")

        permission_key = row["permission_key"]
        if permission_key not in current_user.permissions:
            execution_id = await _record_execution(
                connection,
                current_user,
                row,
                body.params,
                None,
                "denied",
                None,
                "Missing permission",
                request,
            )
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Missing permission: {permission_key}; audit id={execution_id}",
            )

        if row["confirmation_required"] and not body.confirmed:
            raise HTTPException(status.HTTP_409_CONFLICT, "Confirmation required")

        rendered = render_command(
            row["rcon_template"],
            _jsonb(row["params_schema"]),
            body.params,
            current_user,
        )
        execution_id = await _record_execution(
            connection,
            current_user,
            row,
            body.params,
            rendered,
            "running",
            None,
            None,
            request,
        )

    try:
        output = await request.app.state.rcon.command(rendered)
    except (RconError, OSError, TimeoutError) as exc:
        async with pool.acquire() as connection:
            await connection.execute(
                """
                UPDATE mc_panel.command_executions
                SET status = 'failed', error = $2, finished_at = now()
                WHERE id = $1
                """,
                execution_id,
                str(exc),
            )
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"RCON unavailable: {exc}",
        ) from exc

    async with pool.acquire() as connection:
        await connection.execute(
            """
            UPDATE mc_panel.command_executions
            SET status = 'success', output = $2, finished_at = now()
            WHERE id = $1
            """,
            execution_id,
            output,
        )
        await connection.execute(
            """
            INSERT INTO mc_panel.audit_log (actor_user_id, action, entity_type, entity_id, metadata)
            VALUES ($1, 'minecraft.command.execute', 'command_execution', $2, $3::jsonb)
            """,
            current_user.id,
            str(execution_id),
            json.dumps({
                "commandKey": command_key,
                "permissionKey": row["permission_key"],
            }),
        )

    return {"id": execution_id, "command": rendered, "output": output}


async def _record_execution(
    connection: asyncpg.Connection,
    current_user: CurrentUser,
    command_row,
    params: dict,
    rendered_command: str | None,
    status_value: str,
    output: str | None,
    error: str | None,
    request: Request,
) -> int:
    row = await connection.fetchrow(
        """
        INSERT INTO mc_panel.command_executions (
            actor_user_id, command_key, permission_key, params, rendered_command,
            status, output, error, request_ip, user_agent
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)
        RETURNING id
        """,
        current_user.id,
        command_row["key"],
        command_row["permission_key"],
        json.dumps(params),
        rendered_command,
        status_value,
        output,
        error,
        request.client.host if request.client else None,
        request.headers.get("user-agent"),
    )
    return row["id"]


def _jsonb(value):
    if isinstance(value, str):
        return json.loads(value)
    return value
