from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = Field(alias="DATABASE_URL")
    bot_token: str = Field(alias="BOT_TOKEN")
    web_app_url: AnyHttpUrl = Field(alias="WEB_APP_URL")

    rcon_host: str = Field(default="minecraft", alias="RCON_HOST")
    rcon_port: int = Field(default=25575, alias="RCON_PORT")
    rcon_password: str = Field(alias="RCON_PASSWORD")
    minecraft_data_path: str = Field(default="/minecraft-data", alias="MINECRAFT_DATA_PATH")

    init_data_max_age_seconds: int = Field(default=900, alias="INIT_DATA_MAX_AGE_SECONDS")
    cors_origins: str = Field(default="", alias="CORS_ORIGINS")
    api_rate_limit_requests: int = Field(default=120, alias="API_RATE_LIMIT_REQUESTS")
    api_rate_limit_window_seconds: int = Field(default=60, alias="API_RATE_LIMIT_WINDOW_SECONDS")
    auth_rate_limit_requests: int = Field(default=20, alias="AUTH_RATE_LIMIT_REQUESTS")
    auth_rate_limit_window_seconds: int = Field(default=60, alias="AUTH_RATE_LIMIT_WINDOW_SECONDS")

    model_config = SettingsConfigDict(
        env_file=(".env.panel", ".env"),
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def cors_origin_list(self) -> list[str]:
        raw_origins = self.cors_origins.strip()
        if raw_origins == "*":
            return ["*"]
        if raw_origins:
            return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

        parsed = urlsplit(str(self.web_app_url))
        return [f"{parsed.scheme}://{parsed.netloc}"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
