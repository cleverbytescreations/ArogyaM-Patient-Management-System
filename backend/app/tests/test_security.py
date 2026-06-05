"""Security and log-privacy tests (TST-T1.2, TST-T0.2 partial).

Covers:
- No token → 401 on protected endpoints
- Expired token → 401
- Wrong role → 403
- SQL injection attempts on username field → safely rejected
- Request-ID header propagation
- Error envelope structure
- PII/PHI not present in error responses
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.modules.auth.models import User


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


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
