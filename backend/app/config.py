from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Environment-backed configuration.

    ``DATABASE_URL`` and ``JWT_SECRET_KEY`` intentionally have no safe
    production default. Local values live in ``backend/.env`` (copy from
    ``.env.example``). Production configuration is validated below.
    """

    APP_NAME: str = "E2M Insights"
    APP_ENV: Literal["development", "test", "production"] = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "sqlite:///./local_dev.db"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800
    DB_POOL_PRE_PING: bool = True

    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CACHE_TTL_SECONDS: int = 60
    REDIS_SOCKET_TIMEOUT_SECONDS: float = 1.5

    JWT_SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    CORS_ORIGINS: str = "http://localhost:3000"

    LLM_PROVIDER: str = "openai"
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str | None = None
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_TIMEOUT_SECONDS: float = Field(default=30.0, gt=0)
    LLM_JSON_MODE: bool = False
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    AI_MAX_RETRIES: int = 2

    BOOTSTRAP_ADMIN_EMAIL: str = ""
    BOOTSTRAP_ADMIN_PASSWORD: str = ""
    BOOTSTRAP_ADMIN_NAME: str = "Platform Admin"
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters long")
        return value

    @field_validator("LLM_BASE_URL", mode="before")
    @classmethod
    def empty_to_none(cls, value: str | None) -> str | None:
        if value is None or not str(value).strip():
            return None
        return str(value).strip()

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        if self.APP_ENV != "production":
            return self
        secret = self.JWT_SECRET_KEY.lower()
        if any(
            marker in secret
            for marker in ("change-me", "replace-with", "replace-this", "local-dev")
        ):
            raise ValueError("Set a strong, unique JWT_SECRET_KEY in production")
        if "*" in self.cors_origins_list:
            raise ValueError("Wildcard CORS origins are not allowed in production")
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def llm_configured(self) -> bool:
        provider = self.LLM_PROVIDER.strip().lower()
        if provider == "gemini":
            return bool(self.GEMINI_API_KEY.strip())
        if provider in {"openai", "openrouter"}:
            return bool(self.LLM_API_KEY.strip())
        return False

    @property
    def bootstrap_admin_configured(self) -> bool:
        return bool(self.BOOTSTRAP_ADMIN_EMAIL.strip() and self.BOOTSTRAP_ADMIN_PASSWORD)

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
