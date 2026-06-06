"""Security and log-privacy tests (TST-T1.2, TST-T0.2 partial, SEC-T1.2).

Covers:
- No token → 401 on protected endpoints
- Expired token → 401
- Wrong role → 403
- SQL injection attempts on username field → safely rejected
- Request-ID header propagation
- Error envelope structure
- PII/PHI not present in error responses
- Login rate limiting → 429 RATE_LIMITED + Retry-After header (SEC-T1.2)
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.modules.auth.models import User


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class _FakeRedis:
    """Minimal in-memory stand-in for the redis client methods the limiter uses.

    Supports incr / expire / ttl with the same semantics ``_check_redis`` relies
    on, so the Redis branch can be tested without a server or the redis package.
    """

    def __init__(self) -> None:
        self.store: dict[str, int] = {}
        self.ttls: dict[str, int] = {}

    def incr(self, key: str) -> int:
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]

    def expire(self, key: str, seconds: int) -> None:
        self.ttls[key] = seconds

    def ttl(self, key: str) -> int:
        return self.ttls.get(key, -1)


class TestAuthNegative:
    def test_no_token_protected_endpoint(self, client: TestClient):
        resp = client.get("/api/v1/me")
        assert resp.status_code == 401
        body = resp.json()
        assert "error" in body
        assert "code" in body["error"]

    def test_garbage_token(self, client: TestClient):
        resp = client.get("/api/v1/me", headers=_auth("garbage.token.value"))
        assert resp.status_code == 401

    def test_expired_token(self, client: TestClient, admin_user: User):
        from app.core.config import settings
        from app.core.permissions import resolve_permissions
        from app.core.security import build_token_claims

        claims = build_token_claims(
            user_id=str(admin_user.id),
            username=admin_user.username,
            roles=["ADMIN"],
            permissions=resolve_permissions(["ADMIN"]),
            is_doctor=False,
        )
        # Manually create an already-expired token by back-dating exp
        from datetime import UTC, datetime, timedelta

        from jose import jwt

        payload = {
            **claims,
            "type": "access",
            "jti": str(uuid.uuid4()),
            "iat": datetime.now(UTC) - timedelta(hours=2),
            "exp": datetime.now(UTC) - timedelta(hours=1),
        }
        expired_token = jwt.encode(
            payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
        )

        resp = client.get("/api/v1/me", headers=_auth(expired_token))
        assert resp.status_code == 401

    def test_refresh_token_used_as_access_token(self, client: TestClient, admin_user: User):
        from app.core.permissions import resolve_permissions
        from app.core.security import build_token_claims, create_refresh_token

        claims = build_token_claims(
            user_id=str(admin_user.id),
            username=admin_user.username,
            roles=["ADMIN"],
            permissions=resolve_permissions(["ADMIN"]),
            is_doctor=False,
        )
        refresh = create_refresh_token(claims)
        resp = client.get("/api/v1/me", headers=_auth(refresh))
        assert resp.status_code == 401


class TestRBACEnforcement:
    def test_wrong_role_cannot_manage_users(self, client: TestClient, reception_token: str):
        resp = client.get("/api/v1/users", headers=_auth(reception_token))
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "ACCESS_DENIED"

    def test_doctor_cannot_create_users(self, client: TestClient, doctor_token: str):
        resp = client.post(
            "/api/v1/users",
            json={"username": "hack", "full_name": "Hack", "password": "password12"},
            headers=_auth(doctor_token),
        )
        assert resp.status_code == 403

    def test_unauthenticated_cannot_create_users(self, client: TestClient):
        resp = client.post(
            "/api/v1/users",
            json={"username": "hack", "full_name": "Hack", "password": "password12"},
        )
        assert resp.status_code == 401


class TestSQLInjection:
    """SQL injection attempts must be safely handled (parameterized queries)."""

    def test_sql_injection_in_login_username(self, client: TestClient):
        payloads = [
            "' OR '1'='1",
            "admin'--",
            "'; DROP TABLE users;--",
            "' UNION SELECT 1,username,password_hash FROM users--",
        ]
        for payload in payloads:
            resp = client.post(
                "/api/v1/auth/login",
                json={"username": payload, "password": "anypassword"},
            )
            # Must not return 200 or 500; safe rejection (401) expected
            assert resp.status_code in (400, 401, 422), (
                f"Unexpected status for payload: {payload!r}"
            )
            body = resp.json()
            assert "error" in body


class TestErrorEnvelope:
    def test_envelope_structure_on_401(self, client: TestClient):
        resp = client.get("/api/v1/me")
        body = resp.json()
        assert "error" in body
        error = body["error"]
        assert "code" in error
        assert "message" in error
        assert "details" in error
        assert "request_id" in error

    def test_envelope_structure_on_422(self, client: TestClient):
        resp = client.post("/api/v1/auth/login", json={"username": "", "password": ""})
        assert resp.status_code == 422
        body = resp.json()
        assert "error" in body
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_request_id_in_response_headers(self, client: TestClient):
        resp = client.get("/api/v1/health")
        assert "x-request-id" in resp.headers

    def test_custom_request_id_echoed(self, client: TestClient):
        custom_id = str(uuid.uuid4())
        resp = client.get("/api/v1/health", headers={"X-Request-ID": custom_id})
        assert resp.headers.get("x-request-id") == custom_id


class TestPIINotLeaked:
    def test_error_response_contains_no_password_fields(self, client: TestClient):
        resp = client.post(
            "/api/v1/auth/login",
            json={"username": "nouser", "password": "nopass"},
        )
        body_str = resp.text
        assert "password_hash" not in body_str
        assert "password" not in body_str

    def test_user_response_has_no_password_hash(self, client: TestClient, admin_token: str):
        resp = client.get("/api/v1/me", headers=_auth(admin_token))
        assert "password" not in resp.json()
        assert "password_hash" not in resp.text


# --------------------------------------------------------------------------- #
# Login rate limiting (SEC-T1.2)
# --------------------------------------------------------------------------- #


class TestLoginRateLimit:
    """Login endpoint returns 429 RATE_LIMITED + Retry-After after threshold.

    HTTP tests exhaust the configured limit (rate_limit_login_max) via real
    requests from the "testclient" host.  The _reset_rate_limit autouse fixture
    ensures each test starts with a clean counter.

    Unit tests exercise the rate-limiter logic directly (no HTTP overhead)
    using a tiny synthetic limit injected via the in-process store.
    """

    # ── helpers ──────────────────────────────────────────────────────────────

    def _exhaust_limit(self, client: TestClient) -> None:
        """Fire exactly rate_limit_login_max requests to saturate the window."""
        from app.core.config import settings

        for _ in range(settings.rate_limit_login_max):
            client.post(
                "/api/v1/auth/login",
                json={"username": "nonexistent_rl_test", "password": "wrongpass"},
            )

    # ── HTTP integration tests ────────────────────────────────────────────────

    def test_rate_limit_triggers_429(self, client: TestClient):
        """After rate_limit_login_max+1 attempts the endpoint returns 429."""
        self._exhaust_limit(client)

        resp = client.post(
            "/api/v1/auth/login",
            json={"username": "nonexistent_rl_test", "password": "wrongpass"},
        )
        assert resp.status_code == 429
        body = resp.json()
        assert "error" in body
        assert body["error"]["code"] == "RATE_LIMITED"

    def test_rate_limit_returns_retry_after_header(self, client: TestClient):
        """429 response must include a Retry-After header with a positive integer."""
        self._exhaust_limit(client)

        resp = client.post(
            "/api/v1/auth/login",
            json={"username": "nonexistent_rl_test", "password": "wrongpass"},
        )
        assert resp.status_code == 429
        retry_after = resp.headers.get("retry-after")
        assert retry_after is not None, "Retry-After header missing on 429 response"
        assert int(retry_after) > 0

    def test_rate_limit_error_envelope_structure(self, client: TestClient):
        """The 429 error body must conform to the standard error envelope."""
        self._exhaust_limit(client)

        resp = client.post(
            "/api/v1/auth/login",
            json={"username": "nonexistent_rl_test", "password": "wrongpass"},
        )
        assert resp.status_code == 429
        body = resp.json()
        assert "error" in body
        error = body["error"]
        assert "code" in error
        assert "message" in error
        assert "details" in error
        assert "request_id" in error
        assert error["code"] == "RATE_LIMITED"

    def test_rate_limit_does_not_fire_within_limit(self, client: TestClient):
        """Attempts within the limit window must proceed normally (401, not 429)."""
        from app.core.config import settings

        # Fire (limit - 1) attempts — all should be credential-error, not throttled.
        for _ in range(settings.rate_limit_login_max - 1):
            resp = client.post(
                "/api/v1/auth/login",
                json={"username": "nonexistent_rl_test", "password": "wrongpass"},
            )
            assert resp.status_code == 401, (
                f"Expected 401 within limit, got {resp.status_code}"
            )

    def test_rate_limit_disabled_allows_many_attempts(self, client: TestClient, monkeypatch):
        """When rate limiting is bypassed (mock), attempts are not throttled."""
        # Monkeypatch the check function in the router module — no pydantic needed.
        monkeypatch.setattr(
            "app.modules.auth.router.check_login_rate_limit",
            lambda _identifier: None,
        )
        for _ in range(20):
            resp = client.post(
                "/api/v1/auth/login",
                json={"username": "nonexistent_rl_test", "password": "wrongpass"},
            )
            assert resp.status_code != 429, "Rate limiter fired despite being disabled"

    # ── Unit tests for rate-limiter logic ─────────────────────────────────────

    def test_rate_limiter_raises_after_threshold(self):
        """check_login_rate_limit raises RateLimitError once count > limit."""
        import pytest

        from app.core import ratelimit
        from app.core.errors import RateLimitError

        ratelimit.reset()
        limit = 3
        # Inject entries directly to simulate approaching the limit.
        import time

        window = 60
        now = time.time()
        window_start = (int(now) // window) * window
        window_end = window_start + window
        key = f"unit_test_ip:{window_start}"
        ratelimit._local_store[key] = (limit, window_end)  # exactly at limit

        # Next call pushes count to limit+1 → must raise.
        with pytest.raises(RateLimitError) as exc_info:
            ratelimit._check_local("unit_test_ip", limit, window)
        assert exc_info.value.retry_after > 0
        assert exc_info.value.error_code == "RATE_LIMITED"
        ratelimit.reset()

    def test_rate_limiter_retry_after_positive(self):
        """retry_after from RateLimitError is always >= 1 second."""
        import time

        import pytest

        from app.core import ratelimit
        from app.core.errors import RateLimitError

        ratelimit.reset()
        limit = 1
        window = 60
        now = time.time()
        window_start = (int(now) // window) * window
        window_end = window_start + window
        key = f"retry_test:{window_start}"
        ratelimit._local_store[key] = (limit, window_end)

        with pytest.raises(RateLimitError) as exc_info:
            ratelimit._check_local("retry_test", limit, window)
        assert exc_info.value.retry_after >= 1
        ratelimit.reset()

    def test_rate_limiter_no_raise_within_limit(self):
        """check_login_rate_limit does not raise when count is at or below limit."""
        from app.core import ratelimit

        ratelimit.reset()
        limit = 5
        window = 60
        # Fire limit times — none should raise.
        for _ in range(limit):
            ratelimit._check_local("within_limit_ip", limit, window)
        # Store now shows exactly limit hits — no exception raised above.
        ratelimit.reset()

    def test_rate_limit_disabled_check_is_noop(self, monkeypatch):
        """check_login_rate_limit is a no-op when rate_limit_enabled is False.

        Swaps the module-level ``settings`` reference in ratelimit so that
        we avoid mutating the pydantic Settings singleton (which ignores
        attribute writes in pydantic-v2).
        """
        from types import SimpleNamespace

        from app.core import ratelimit

        fake_settings = SimpleNamespace(
            rate_limit_enabled=False,
            rate_limit_login_max=10,
            rate_limit_login_window_sec=60,
            redis_url="",
        )
        monkeypatch.setattr(ratelimit, "settings", fake_settings)
        ratelimit.reset()

        # Even with many attempts, the disabled check must not raise.
        for _ in range(30):
            ratelimit.check_login_rate_limit("any_ip")

    # ── Redis-backend unit tests ──────────────────────────────────────────────
    # Exercise the Redis code path with an in-memory fake client (no server or
    # redis package needed) so the fixed-window + Retry-After logic is verified.

    def test_check_redis_raises_after_threshold(self):
        import pytest

        from app.core import ratelimit
        from app.core.errors import RateLimitError

        fake = _FakeRedis()
        limit, window = 3, 60
        # First `limit` hits are allowed.
        for _ in range(limit):
            ratelimit._check_redis(fake, "redis_ip", limit, window)
        # The next hit pushes count to limit+1 → must raise with a positive
        # Retry-After derived from the key's TTL.
        with pytest.raises(RateLimitError) as exc_info:
            ratelimit._check_redis(fake, "redis_ip", limit, window)
        assert exc_info.value.error_code == "RATE_LIMITED"
        assert exc_info.value.retry_after > 0

    def test_check_redis_sets_expire_on_first_hit(self):
        from app.core import ratelimit

        fake = _FakeRedis()
        ratelimit._check_redis(fake, "redis_ip", 10, 60)
        # Exactly one key, with a TTL set (window self-expiry).
        assert len(fake.store) == 1
        key = next(iter(fake.store))
        assert fake.ttl(key) > 0
