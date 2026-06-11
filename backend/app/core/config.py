"""Environment-driven application settings (SAD §; Implementation Plan §4.1).

All configuration comes from the environment — no secrets in code. In the dev
stack these are supplied by docker-compose.dev.yml / .env.dev.
"""

from __future__ import annotations

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Sentinel dev defaults that must never be used in production. Startup fails fast
# if any of these is still in effect when env == "production" (BE-TF.2, SAD §10).
_DEV_JWT_SECRET = "dev-only-change-me"
_DEV_S3_SECRET = "minioadmin_dev_pw"
_DEV_DB_PASSWORD = "arogyam_dev_pw"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, case_sensitive=False, extra="ignore")

    # --- General -------------------------------------------------------------
    env: str = Field(default="development")
    log_level: str = Field(default="INFO")

    # --- Database ------------------------------------------------------------
    database_url: str = Field(default="postgresql+psycopg://arogyam:arogyam_dev_pw@db:5432/arogyam")
    sql_echo: bool = Field(default=False)

    # --- Object storage (MinIO / S3) -----------------------------------------
    s3_endpoint_url: str = Field(default="http://minio:9000")
    s3_access_key: str = Field(default="minioadmin")
    s3_secret_key: str = Field(default="minioadmin_dev_pw")
    s3_bucket: str = Field(default="arogyam-documents")
    s3_use_ssl: bool = Field(default=False)
    # TODO set True in production (AWS SSE-S3) to ensure data is encrypted at rest (BE-TF.2, SAD §10). Note that
    s3_sse: bool = Field(default=False)  # set True in production (AWS SSE-S3)

    # --- Cache / limiter (optional) ------------------------------------------
    redis_url: str = Field(default="")
    # TTL for quasi-static reference data (master data, OP sequences).
    # Entries are also invalidated explicitly on every admin write, so this is a
    # safety-net expiry only. Override via MASTER_DATA_CACHE_TTL_SEC env var.
    master_data_cache_ttl_sec: int = Field(default=1800)  # 30 minutes

    # --- API ------------------------------------------------------------------
    cors_allow_origins: str = Field(default="http://localhost:8080")
    upload_max_mb: int = Field(default=10)
    av_scan_enabled: bool = Field(default=False)
    av_scan_command: str = Field(default="")

    # --- Auth ----------------------------------------------------------------
    jwt_secret_key: str = Field(default="dev-only-change-me")
    jwt_algorithm: str = Field(default="HS256")
    jwt_access_ttl_min: int = Field(default=15)
    jwt_refresh_ttl_min: int = Field(default=480)  # 8 h

    # --- Login lockout -------------------------------------------------------
    login_max_attempts: int = Field(default=5)
    login_lockout_min: int = Field(default=30)

    # --- Clinical rules ------------------------------------------------------
    # Maximum hours after creation during which a prescription can be edited.
    prescription_edit_window_hours: int = Field(default=8)

    # --- Backup -----------------------------------------------------------------
    # Path where the API writes the manual-trigger sentinel file.
    # Must match the path mounted as /backups/.trigger in both api and backup
    # containers (same named volume: backup_data_dev in docker-compose.dev.yml).
    backup_trigger_file: str = Field(default="/backups/.trigger")

    # --- Audit log retention -------------------------------------------------
    # Hard-delete audit records older than this many days.
    # 2555 days = 7 years (recommended minimum for medical-record compliance).
    # Set to 0 to disable automatic purging entirely.
    # Trigger via: POST /api/v1/audit-logs/purge  OR  scripts/purge_audit_log.py
    audit_retention_days: int = Field(default=2555)

    # --- Login rate limiting (SEC-T1.2) --------------------------------------
    # Disabled when rate_limit_enabled=False (or RATE_LIMIT_ENABLED=false env).
    # When Redis is configured (REDIS_URL), uses Redis for multi-worker safety;
    # otherwise falls back to an in-process dict (single-process dev deployment).
    rate_limit_enabled: bool = Field(default=True)
    rate_limit_login_max: int = Field(default=10)  # max attempts per window
    rate_limit_login_window_sec: int = Field(default=60)  # window size in seconds

    # --- Bootstrap admin (auto-created on startup by migration 0003) ----------
    # The super-user gets the ADMIN role => all permissions (see core/permissions).
    # In production ADMIN_PASSWORD must be supplied; otherwise creation is skipped
    # (use scripts/create_admin.py). In dev a fallback password is used.
    admin_username: str = Field(default="admin")
    admin_password: str = Field(default="")
    admin_full_name: str = Field(default="System Administrator")
    admin_email: str = Field(default="")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"

    @model_validator(mode="after")
    def _require_secrets_in_production(self) -> Settings:
        """Fail fast at startup if a required secret is missing or still the dev
        default while running in production (BE-TF.2 acceptance criterion)."""
        if not self.is_production:
            return self

        missing: list[str] = []
        if not self.jwt_secret_key or self.jwt_secret_key == _DEV_JWT_SECRET:
            missing.append("JWT_SECRET_KEY")
        if not self.s3_secret_key or self.s3_secret_key == _DEV_S3_SECRET:
            missing.append("S3_SECRET_KEY")
        if not self.database_url or _DEV_DB_PASSWORD in self.database_url:
            missing.append("DATABASE_URL")
        if self.cors_allow_origins.strip() == "*":
            missing.append("CORS_ALLOW_ORIGINS (wildcard not allowed in production)")

        if missing:
            raise ValueError(
                "Refusing to start in production with insecure/missing secrets: "
                + ", ".join(missing)
                + ". Supply them via the environment (see backend/.env.example)."
            )
        return self


settings = Settings()
