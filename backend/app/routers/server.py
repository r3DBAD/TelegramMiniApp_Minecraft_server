import json
from pathlib import Path

from fastapi import APIRouter, Depends, Request

from app.config import get_settings
from app.security.dependencies import require_permission
from app.security.permissions import CurrentUser
from app.services.minecraft import parse_list_response
from app.services.rcon import RconError

router = APIRouter()


@router.get("/status")
async def status(
    request: Request,
    _: CurrentUser = Depends(require_permission("minecraft.status.view")),
) -> dict:
    try:
        response = await request.app.state.rcon.command("list")
    except (RconError, OSError, TimeoutError) as exc:
        return _offline_status(str(exc))

    parsed = parse_list_response(response)
    return {
        "online": True,
        "playersOnline": parsed["online"],
        "maxPlayers": parsed["max"],
        "players": parsed["players"],
        "raw": parsed["raw"],
    }


@router.get("/players")
async def players(
    request: Request,
    _: CurrentUser = Depends(require_permission("minecraft.players.view")),
) -> dict:
    try:
        response = await request.app.state.rcon.command("list")
    except (RconError, OSError, TimeoutError) as exc:
        return {"players": [], "online": 0, "max": None, "error": str(exc)}

    parsed = parse_list_response(response)
    return {"players": parsed["players"], "online": parsed["online"], "max": parsed["max"]}


@router.get("/whitelist")
async def whitelist(
    request: Request,
    _: CurrentUser = Depends(require_permission("minecraft.whitelist.read")),
) -> dict:
    try:
        response = await request.app.state.rcon.command("whitelist list")
    except (RconError, OSError, TimeoutError) as exc:
        response = f"RCON unavailable: {exc}"
    return {"raw": response, "file": _read_json_file("whitelist.json")}


@router.get("/ops")
async def ops(
    _: CurrentUser = Depends(require_permission("minecraft.ops.read")),
) -> dict:
    return {"ops": _read_json_file("ops.json")}


def _read_json_file(name: str):
    path = Path(get_settings().minecraft_data_path) / name
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except json.JSONDecodeError:
        return []


def _offline_status(error: str) -> dict:
    return {
        "online": False,
        "playersOnline": 0,
        "maxPlayers": None,
        "players": [],
        "raw": "",
        "error": error,
    }
