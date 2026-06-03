from functools import lru_cache

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

    init_data_max_age_seconds: int = Field(default=86400, alias="INIT_DATA_MAX_AGE_SECONDS")
    cors_origins: str = Field(default="*", alias="CORS_ORIGINS")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
