"""Environment-driven application settings (SAD §; Implementation Plan §4.1).

All configuration comes from the environment — no secrets in code. In the dev
stack these are supplied by docker-compose.dev.yml / .env.dev.
"""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, case_sensitive=False, extra="ignore")

    # --- General -------------------------------------------------------------
    env: str = Field(default="development")
    log_level: str = Field(default="INFO")

    # --- Database ------------------------------------------------------------
    database_url: str = Field(
        default="postgresql+psycopg://arogyam:arogyam_dev_pw@db:5432/arogyam"
    )
    sql_echo: bool = Field(default=False)

    # --- Object storage (MinIO / S3) -----------------------------------------
    s3_endpoint_url: str = Field(default="http://minio:9000")
    s3_access_key: str = Field(default="minioadmin")
    s3_secret_key: str = Field(default="minioadmin_dev_pw")
    s3_bucket: str = Field(default="arogyam-documents")
    s3_use_ssl: bool = Field(default=False)

    # --- Cache / limiter (optional) ------------------------------------------
    redis_url: str = Field(default="")

    # --- API ------------------------------------------------------------------
    cors_allow_origins: str = Field(default="http://localhost:8080")
    upload_max_mb: int = Field(default=10)

    # --- Auth (placeholders wired in the auth stage) -------------------------
    jwt_secret_key: str = Field(default="dev-only-change-me")
    jwt_access_ttl_min: int = Field(default=15)
    jwt_refresh_ttl_min: int = Field(default=1440)

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]


settings = Settings()
