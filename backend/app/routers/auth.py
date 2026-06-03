import json

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.db import get_pool
from app.security.dependencies import get_current_user
from app.security.permissions import CurrentUser

router = APIRouter()


class AccessRequestBody(BaseModel):
    minecraft_username: str | None = Field(default=None, min_length=3, max_length=16)


@router.get("/me")
async def me(current_user: CurrentUser = Depends(get_current_user)) -> dict:
    return {
        "user": {
            "id": current_user.id,
            "telegramUserId": current_user.telegram_user_id,
            "username": current_user.telegram_username,
            "firstName": current_user.first_name,
            "status": current_user.status,
            "minecraftUsername": current_user.minecraft_username,
        },
        "roles": current_user.roles,
        "permissions": sorted(current_user.permissions),
    }


@router.post("/access-request")
async def create_access_request(
    body: AccessRequestBody,
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    payload = getattr(request.state, "telegram_user_payload", "{}")
    async with pool.acquire() as connection:
        await connection.execute(
            """
            INSERT INTO mc_panel.access_requests (
                telegram_user_id, telegram_payload, requested_minecraft_username
            )
            VALUES ($1, $2::jsonb, $3)
            """,
            current_user.telegram_user_id,
            payload,
            body.minecraft_username,
        )
    return {"status": "created"}


def ensure_active(current_user: CurrentUser) -> None:
    if current_user.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access is pending approval")
