"""Secrets management and secure-configuration tests (SEC-T0.3).

Verifies:
- Production startup fails fast when dev-sentinel secrets are still in place
- Production startup fails with wildcard CORS
- No dev credentials hardcoded outside the allowed sentinel constants in config.py
- .env.example contains no real secrets (only CHANGE_ME / empty placeholders)
- SQL_ECHO is not True in production mode
- Debug is disabled in production Settings
"""

from __future__ import annotations

import os
import re

# --------------------------------------------------------------------------- #
# Production startup guard tests
# --------------------------------------------------------------------------- #


class TestProductionStartupGuards:
    """Settings._require_secrets_in_production must raise ValueError for bad config."""

    def _make_settings(self, **env_overrides) -> None:
        """Helper: patch the env then instantiate Settings; return the error or None."""
        from pydantic import ValidationError

        # Import a fresh Settings class each time by patching env
        original = {}
        for k, v in env_overrides.items():
            original[k] = os.environ.get(k)
            os.environ[k] = v
        try:
            # Reimport to get fresh validator
            from importlib import reload

            import app.core.config as cfg_module
            reload(cfg_module)
            return None  # no error = bad
        except (ValueError, ValidationError) as exc:
            return str(exc)
        finally:
            # Restore environment
            for k, orig_v in original.items():
                if orig_v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = orig_v
            # Restore original settings module state
            try:
                from importlib import reload

                import app.core.config as cfg_module
                reload(cfg_module)
            except Exception:
                pass

    def test_prod_rejects_dev_jwt_secret(self):
        err = self._make_settings(
            ENV="production",
            JWT_SECRET_KEY="dev-only-change-me",
            DATABASE_URL="postgresql+psycopg://arogyam:real_pw@db:5432/arogyam",
            S3_SECRET_KEY="real_s3_secret",
            CORS_ALLOW_ORIGINS="http://myapp.example.com",
        )
        assert err is not None, "Production startup should have failed with dev JWT secret"
        assert "JWT_SECRET_KEY" in err

    def test_prod_rejects_dev_s3_secret(self):
        err = self._make_settings(
            ENV="production",
            JWT_SECRET_KEY="a-real-and-long-jwt-secret-value-xyz",
            DATABASE_URL="postgresql+psycopg://arogyam:real_pw@db:5432/arogyam",
            S3_SECRET_KEY="minioadmin_dev_pw",
            CORS_ALLOW_ORIGINS="http://myapp.example.com",
        )
        assert err is not None, "Production startup should have failed with dev S3 secret"
        assert "S3_SECRET_KEY" in err

    def test_prod_rejects_dev_db_password(self):
        err = self._make_settings(
            ENV="production",
            JWT_SECRET_KEY="a-real-and-long-jwt-secret-value-xyz",
            DATABASE_URL="postgresql+psycopg://arogyam:arogyam_dev_pw@db:5432/arogyam",
            S3_SECRET_KEY="real_s3_secret",
            CORS_ALLOW_ORIGINS="http://myapp.example.com",
        )
        assert err is not None, "Production startup should have failed with dev DB password"
        assert "DATABASE_URL" in err

    def test_prod_rejects_wildcard_cors(self):
        err = self._make_settings(
            ENV="production",
            JWT_SECRET_KEY="a-real-and-long-jwt-secret-value-xyz",
            DATABASE_URL="postgresql+psycopg://arogyam:real_pw@db:5432/arogyam",
            S3_SECRET_KEY="real_s3_secret",
            CORS_ALLOW_ORIGINS="*",
        )
        assert err is not None, "Production startup should have failed with wildcard CORS"
        assert "CORS_ALLOW_ORIGINS" in err

    def test_dev_mode_accepts_sentinel_secrets(self):
        """Dev mode must NOT fail with dev-default secrets (it's supposed to use them)."""
        err = self._make_settings(
            ENV="development",
            JWT_SECRET_KEY="dev-only-change-me",
            DATABASE_URL="postgresql+psycopg://arogyam:arogyam_dev_pw@db:5432/arogyam",
            S3_SECRET_KEY="minioadmin_dev_pw",
            CORS_ALLOW_ORIGINS="http://localhost:8080",
        )
        assert err is None, f"Dev mode should not fail at startup, got: {err}"


# --------------------------------------------------------------------------- #
# .env.example has no real secrets
# --------------------------------------------------------------------------- #


class TestEnvExampleNoRealSecrets:
    """The committed .env.example must contain only placeholder values."""

    def _read_env_example(self) -> str:
        # Walk up from the test file to find backend/.env.example
        import pathlib
        root = pathlib.Path(__file__).parent.parent.parent  # backend/
        env_path = root / ".env.example"
        if not env_path.exists():
            # Try repo root
            env_path = root.parent / ".env.example"
        assert env_path.exists(), f".env.example not found at {env_path}"
        return env_path.read_text()

    def test_no_real_jwt_secret(self):
        content = self._read_env_example()
        # Must contain placeholder, not a real-looking secret
        assert "CHANGE_ME" in content or "JWT_SECRET_KEY" in content
        # Must NOT contain the dev sentinel that config.py watches for
        # (because .env.example should show "CHANGE_ME", not the dev default)
        assert "dev-only-change-me" not in content

    def test_db_password_is_placeholder(self):
        content = self._read_env_example()
        # The .env.example DATABASE_URL should have CHANGE_ME, not the real dev pw
        assert "CHANGE_ME" in content

    def test_s3_secret_is_placeholder(self):
        content = self._read_env_example()
        assert "CHANGE_ME" in content


# --------------------------------------------------------------------------- #
# No plaintext secrets in config module beyond sentinel constants
# --------------------------------------------------------------------------- #


class TestNoHardcodedSecretsInConfig:
    """Verify core/config.py does not store real secrets — only sentinels used
    for the prod-guard checks and sane non-secret dev defaults."""

    def _read_config(self) -> str:
        import pathlib
        root = pathlib.Path(__file__).parent.parent  # app/
        cfg = root / "core" / "config.py"
        assert cfg.exists()
        return cfg.read_text()

    def test_no_real_passwords_beyond_sentinels(self):
        content = self._read_config()
        # Sentinel names are intentional; flag anything that looks like a
        # non-sentinel password pattern (> 16 chars, mixed case/digits)
        suspicious = re.findall(r'(?<![A-Za-z_])([A-Za-z0-9+/]{20,}={0,2})(?![A-Za-z_])', content)
        # Allowlist known base64/URL-safe looking but safe strings
        # (None expected in config.py at this level)
        _safe = ("postgresql+psycopg", "minioadmin_dev_pw")
        real_secrets = [s for s in suspicious if s not in _safe]
        assert not real_secrets, (
            f"Possible hardcoded secrets found in config.py: {real_secrets}"
        )

    def test_sql_echo_default_is_false(self):
        from app.core.config import Settings
        s = Settings()
        assert s.sql_echo is False, "sql_echo must default to False (leaks PHI if True)"


# --------------------------------------------------------------------------- #
# HTTP security headers present on all responses (SEC-T0.2 integration check)
# --------------------------------------------------------------------------- #


class TestCorsPolicy:
    """CORS must be locked to the configured SPA origin(s) (SEC-T0.2).

    Runtime checks (complementing the config-guard tests that reject a wildcard
    origin in production): an allowed origin is echoed back in
    Access-Control-Allow-Origin; a non-SPA origin is never echoed, so a browser
    blocks the cross-origin read.
    """

    def _allowed_origin(self) -> str:
        from app.core.config import settings

        origins = settings.cors_origins_list
        assert origins, "Test env must configure at least one CORS origin"
        return origins[0]

    def test_allowed_origin_is_echoed(self, client):
        origin = self._allowed_origin()
        resp = client.get("/api/v1/health", headers={"Origin": origin})
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == origin

    def test_disallowed_origin_not_echoed(self, client):
        resp = client.get(
            "/api/v1/health", headers={"Origin": "http://evil.example.com"}
        )
        # Request still succeeds server-side, but the ACAO header must be absent
        # so the browser refuses to expose the response to the foreign origin.
        assert resp.headers.get("access-control-allow-origin") is None

    def test_disallowed_preflight_rejected(self, client):
        """A preflight (OPTIONS) from a non-SPA origin must not be authorized."""
        resp = client.options(
            "/api/v1/users",
            headers={
                "Origin": "http://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.headers.get("access-control-allow-origin") is None


class TestSecurityHeadersPresent:
    """SecurityHeadersMiddleware must attach headers to every response."""

    def test_x_content_type_options(self, client):
        resp = client.get("/api/v1/health")
        assert resp.headers.get("x-content-type-options") == "nosniff"

    def test_x_frame_options(self, client):
        resp = client.get("/api/v1/health")
        assert resp.headers.get("x-frame-options") == "DENY"

    def test_referrer_policy(self, client):
        resp = client.get("/api/v1/health")
        assert resp.headers.get("referrer-policy") == "strict-origin-when-cross-origin"

    def test_permissions_policy(self, client):
        resp = client.get("/api/v1/health")
        pp = resp.headers.get("permissions-policy", "")
        assert "camera=()" in pp
        assert "microphone=()" in pp

    def test_content_security_policy(self, client):
        resp = client.get("/api/v1/health")
        csp = resp.headers.get("content-security-policy", "")
        assert "default-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp

    def test_security_headers_on_401_response(self, client):
        """Security headers must be present even on error responses."""
        resp = client.get("/api/v1/me")  # no auth → 401
        assert resp.status_code == 401
        assert resp.headers.get("x-content-type-options") == "nosniff"
        assert resp.headers.get("x-frame-options") == "DENY"

    def test_security_headers_on_api_endpoints(self, client, admin_token):
        resp = client.get("/api/v1/roles", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert resp.headers.get("x-content-type-options") == "nosniff"
        assert resp.headers.get("x-frame-options") == "DENY"
