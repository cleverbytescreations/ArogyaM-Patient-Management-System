"""Config fail-fast tests (BE-TF.2).

Production startup must refuse insecure/missing secrets; development tolerates
the dev defaults so local boot stays frictionless.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings


class TestProductionSecretGuard:
    def test_production_rejects_dev_jwt_secret(self):
        with pytest.raises(ValueError) as exc:
            Settings(
                env="production",
                jwt_secret_key="dev-only-change-me",
                s3_secret_key="real-s3-secret",
                database_url="postgresql+psycopg://arogyam:real_pw@db:5432/arogyam",
            )
        assert "JWT_SECRET_KEY" in str(exc.value)

    def test_production_rejects_dev_db_password(self):
        with pytest.raises(ValueError) as exc:
            Settings(
                env="production",
                jwt_secret_key="a-real-secret",
                s3_secret_key="real-s3-secret",
                database_url="postgresql+psycopg://arogyam:arogyam_dev_pw@db:5432/arogyam",
            )
        assert "DATABASE_URL" in str(exc.value)

    def test_production_rejects_wildcard_cors(self):
        with pytest.raises(ValueError) as exc:
            Settings(
                env="production",
                jwt_secret_key="a-real-secret",
                s3_secret_key="real-s3-secret",
                database_url="postgresql+psycopg://arogyam:real_pw@db:5432/arogyam",
                cors_allow_origins="*",
            )
        assert "CORS" in str(exc.value)

    def test_production_accepts_real_secrets(self):
        settings = Settings(
            env="production",
            jwt_secret_key="a-properly-generated-secret-value",
            s3_secret_key="real-s3-secret",
            database_url="postgresql+psycopg://arogyam:real_pw@db:5432/arogyam",
            cors_allow_origins="https://pms.example.org",
        )
        assert settings.is_production

    def test_development_tolerates_dev_defaults(self):
        # Default construction is development and must not raise.
        settings = Settings()
        assert not settings.is_production
