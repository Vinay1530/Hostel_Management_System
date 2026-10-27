from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://pgms:pgms_dev@localhost:5432/pgms"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_ttl_minutes: int = 60 * 24 * 14
    otp_dev_mode: bool = True
    otp_ttl_minutes: int = 10
    upload_dir: Path = Path("uploads")
    # list parsed from JSON env var, e.g. CORS_ORIGINS='["http://a.com","http://b.com"]'
    cors_origins: list[str] = ["*"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
