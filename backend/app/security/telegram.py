import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from fastapi import HTTPException, status


@dataclass(frozen=True)
class TelegramInitData:
    raw: str
    user: dict
    auth_date: int
    query_id: str | None = None


def validate_init_data(raw_init_data: str, bot_token: str, max_age_seconds: int) -> TelegramInitData:
    pairs = parse_qsl(raw_init_data, keep_blank_values=True, strict_parsing=False)
    data = dict(pairs)
    received_hash = data.get("hash")
    if not received_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Telegram initData hash is missing")

    auth_date_raw = data.get("auth_date")
    if not auth_date_raw or not auth_date_raw.isdigit():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Telegram auth_date is missing")

    auth_date = int(auth_date_raw)
    if time.time() - auth_date > max_age_seconds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Telegram initData expired")

    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(pairs) if key != "hash"
    )
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Telegram initData signature is invalid")

    user_raw = data.get("user")
    if not user_raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Telegram user payload is missing")

    try:
        user = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Telegram user payload is invalid") from exc

    if not isinstance(user.get("id"), int):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Telegram user id is missing")

    return TelegramInitData(
        raw=raw_init_data,
        user=user,
        auth_date=auth_date,
        query_id=data.get("query_id"),
    )
