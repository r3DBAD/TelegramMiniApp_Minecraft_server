import json
from pathlib import Path

from fastapi import APIRouter, Depends, Request

from app.security.dependencies import require_permission
from app.security.permissions import CurrentUser
from app.services.minecraft import parse_list_response
from app.config import get_settings

router = APIRouter()


@router.get("/status")
async def status(
    request: Request,
    _: CurrentUser = Depends(require_permission("minecraft.status.view")),
) -> dict:
    response = await request.app.state.rcon.command("list")
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
    response = await request.app.state.rcon.command("list")
    parsed = parse_list_response(response)
    return {"players": parsed["players"], "online": parsed["online"], "max": parsed["max"]}


@router.get("/whitelist")
async def whitelist(
    request: Request,
    _: CurrentUser = Depends(require_permission("minecraft.whitelist.read")),
) -> dict:
    response = await request.app.state.rcon.command("whitelist list")
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
