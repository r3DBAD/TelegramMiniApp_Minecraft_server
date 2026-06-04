import re
from string import Formatter
from typing import Any

from fastapi import HTTPException, status

from app.security.permissions import CurrentUser

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,16}$")


def validate_minecraft_username(value: str) -> str:
    if not USERNAME_RE.fullmatch(value):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid Minecraft username")
    return value


def render_command(
    template: str,
    params_schema: dict[str, Any],
    params: dict[str, Any],
    current_user: CurrentUser,
) -> str:
    safe_values: dict[str, str] = {}
    template_fields = _template_fields(template)
    unexpected_params = set(params) - template_fields
    if unexpected_params:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Unexpected parameter: {sorted(unexpected_params)[0]}",
        )

    for name in template_fields:
        definition = params_schema.get(name, {"type": "string"})
        field_type = definition.get("type", "string")

        if field_type == "own_minecraft_username":
            if not current_user.minecraft_username:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "Your Telegram account has no linked Minecraft username",
                )
            safe_values[name] = validate_minecraft_username(current_user.minecraft_username)
            continue

        value = params.get(name, definition.get("default"))
        if value is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Missing parameter: {name}")

        if field_type == "minecraft_username":
            safe_values[name] = validate_minecraft_username(str(value))
        elif field_type == "enum":
            text = str(value)
            if text not in definition.get("values", []):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Invalid value for {name}")
            safe_values[name] = text
        else:
            text = str(value).replace("\n", " ").strip()
            min_length = int(definition.get("minLength", 0))
            max_length = int(definition.get("maxLength", 200))
            if len(text) < min_length or len(text) > max_length:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Invalid length for {name}")
            safe_values[name] = text

    return template.format(**safe_values)


def _template_fields(template: str) -> set[str]:
    return {
        field_name
        for _, field_name, _, _ in Formatter().parse(template)
        if field_name
    }
