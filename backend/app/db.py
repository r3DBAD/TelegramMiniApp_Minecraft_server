from collections.abc import AsyncIterator

import asyncpg
from fastapi import Request


async def create_pool(database_url: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        database_url,
        min_size=1,
        max_size=10,
        command_timeout=30,
    )


async def get_pool(request: Request) -> asyncpg.Pool:
    return request.app.state.db_pool


async def transaction(pool: asyncpg.Pool) -> AsyncIterator[asyncpg.Connection]:
    async with pool.acquire() as connection:
        async with connection.transaction():
            yield connection
