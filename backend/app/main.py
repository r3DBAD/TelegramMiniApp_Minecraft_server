from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import create_pool
from app.routers import auth, commands, server, users
from app.services.rcon import RconClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.db_pool = await create_pool(settings.database_url)
    app.state.rcon = RconClient(settings.rcon_host, settings.rcon_port, settings.rcon_password)
    try:
        yield
    finally:
        await app.state.db_pool.close()


app = FastAPI(title="Minecraft Telegram Mini App API", version="0.1.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(server.router, prefix="/api/server", tags=["server"])
app.include_router(commands.router, prefix="/api/commands", tags=["commands"])
app.include_router(users.router, prefix="/api/users", tags=["users"])


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
