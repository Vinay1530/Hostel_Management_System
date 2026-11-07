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

    # in-process automation (fallback when Celery beat is not deployed)
    automation_interval_seconds: int = 3600
    late_fee_charge_paise: int = 5000  # Rs 50 per overdue invoice
    complaint_escalation_hours: int = 24

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
