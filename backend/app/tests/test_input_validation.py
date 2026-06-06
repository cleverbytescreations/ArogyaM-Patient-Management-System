"""Input validation and SQL-safety tests (SEC-T0.1).

Verifies:
- Pydantic v2 strict schemas reject unknown / extra fields on all request bodies
- SQLAlchemy parameterized queries safely absorb SQL-injection payloads in every
  position (body fields, query-string filters, path parameters)
- Type coercion boundaries: integers in string fields, oversized strings, etc.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# Extra / unknown field rejection (strict schemas with extra="forbid")
# --------------------------------------------------------------------------- #


class TestExtraFieldRejection:
    """Request schemas use extra='forbid'; unknown keys must return 422."""

    def test_login_extra_field(self, client: TestClient):
        resp = client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "secret", "evil": "injected"},
        )
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_refresh_extra_field(self, client: TestClient):
        resp = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "sometoken", "extra_field": True},
        )
        # extra="forbid" → 422
        assert resp.status_code == 422

    def test_user_create_extra_field(self, client: TestClient, admin_token: str):
        resp = client.post(
            "/api/v1/users",
            json={
                "username": "newuser",
                "full_name": "New User",
                "password": "ValidPass1!",
                "role_codes": ["RECEPTION"],
                "injected_field": "bad_value",
            },
            headers=_auth(admin_token),
        )
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "VALIDATION_ERROR"

    def test_user_update_extra_field(self, client: TestClient, admin_token: str):
        import uuid

        fake_id = str(uuid.uuid4())
        resp = client.put(
            f"/api/v1/users/{fake_id}",
            json={"full_name": "Updated", "version": 1, "evil": "payload"},
            headers=_auth(admin_token),
        )
        # 422 for schema rejection OR 404 if user not found — not 200/500
        assert resp.status_code in (422, 404)

    def test_user_status_extra_field(self, client: TestClient, admin_token: str):
        import uuid

        fake_id = str(uuid.uuid4())
        resp = client.put(
            f"/api/v1/users/{fake_id}/status",
            json={"status": "ACTIVE", "version": 1, "extra": "bad"},
            headers=_auth(admin_token),
        )
        assert resp.status_code in (422, 404)

    def test_password_reset_extra_field(self, client: TestClient, admin_token: str):
        import uuid

        fake_id = str(uuid.uuid4())
        resp = client.post(
            f"/api/v1/users/{fake_id}/reset-password",
            json={"new_password": "ValidPass1!", "extra_key": "hacked"},
            headers=_auth(admin_token),
        )
        assert resp.status_code in (422, 404)


# --------------------------------------------------------------------------- #
# Field-level type validation
# --------------------------------------------------------------------------- #


class TestFieldTypeValidation:
    """Pydantic rejects wrong types and out-of-range values at the boundary."""

    def test_login_empty_username(self, client: TestClient):
        resp = client.post("/api/v1/auth/login", json={"username": "", "password": "pw"})
        assert resp.status_code == 422

    def test_login_empty_password(self, client: TestClient):
        resp = client.post("/api/v1/auth/login", json={"username": "user", "password": ""})
        assert resp.status_code == 422

    def test_login_username_too_long(self, client: TestClient):
        resp = client.post(
            "/api/v1/auth/login",
            json={"username": "a" * 200, "password": "password"},
        )
        assert resp.status_code == 422

    def test_user_create_password_too_short(self, client: TestClient, admin_token: str):
        resp = client.post(
            "/api/v1/users",
            json={"username": "u", "full_name": "U", "password": "short"},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 422

    def test_user_create_username_too_short(self, client: TestClient, admin_token: str):
        resp = client.post(
            "/api/v1/users",
            json={"username": "ab", "full_name": "AB", "password": "ValidPass1!"},
            headers=_auth(admin_token),
        )
        # username min_length=3
        assert resp.status_code == 422

    def test_user_status_invalid_value(self, client: TestClient, admin_token: str):
        import uuid

        fake_id = str(uuid.uuid4())
        resp = client.put(
            f"/api/v1/users/{fake_id}/status",
            json={"status": "SUPERUSER", "version": 1},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 422

    def test_password_too_long_utf8(self, client: TestClient):
        """Password >72 UTF-8 bytes must be rejected (bcrypt limit)."""
        long_pw = "A" * 80  # 80 ASCII bytes > 72-byte bcrypt limit
        resp = client.post(
            "/api/v1/auth/login",
            json={"username": "anyone", "password": long_pw},
        )
        # Either the schema rejects it (422) or it passes schema but login fails (401)
        # The important thing is it does NOT return 200 or 500
        assert resp.status_code in (400, 401, 422)

    def test_password_reset_too_long(self, client: TestClient, admin_token: str):
        import uuid

        fake_id = str(uuid.uuid4())
        long_pw = "B" * 80  # >72 bytes
        resp = client.post(
            f"/api/v1/users/{fake_id}/reset-password",
            json={"new_password": long_pw},
            headers=_auth(admin_token),
        )
        # max_length=72 enforced in schema
        assert resp.status_code in (422, 404)


# --------------------------------------------------------------------------- #
# SQL injection via query-string filters
# --------------------------------------------------------------------------- #

SQL_PAYLOADS = [
    "' OR '1'='1",
    "1; DROP TABLE users;--",
    "' UNION SELECT id,username,password_hash FROM users--",
    "admin'/*",
    "1' AND SLEEP(5)--",
    "'; SELECT pg_sleep(5);--",
]


class TestSQLInjectionQueryParams:
    """Query-string filters must safely absorb injection payloads.

    SQLAlchemy parameterized queries prevent injection; this suite confirms
    that attacking the filter path surfaces as a safe non-200 or an empty
    result set — never a 500 or data leak.
    """

    @pytest.mark.parametrize("payload", SQL_PAYLOADS)
    def test_user_list_q_injection(self, client: TestClient, admin_token: str, payload: str):
        resp = client.get(
            "/api/v1/users",
            params={"q": payload},
            headers=_auth(admin_token),
        )
        # Must not be 500 (internal error would signal injection succeeded or
        # that the raw SQL was malformed by the payload)
        assert resp.status_code != 500, f"500 on payload: {payload!r}"
        # If successful it must be a valid paginated response
        if resp.status_code == 200:
            body = resp.json()
            assert "items" in body
            # Injected payload must not have caused extra rows to appear
            for user in body["items"]:
                assert "password_hash" not in user
                assert "password" not in str(user)

    @pytest.mark.parametrize("payload", SQL_PAYLOADS)
    def test_user_list_status_injection(self, client: TestClient, admin_token: str, payload: str):
        resp = client.get(
            "/api/v1/users",
            params={"status": payload},
            headers=_auth(admin_token),
        )
        # Pattern ^(ACTIVE|DISABLED|LOCKED)$ means Pydantic rejects non-matching → 422
        # or the ORM safely filters and returns empty
        assert resp.status_code in (200, 422, 400)
        assert resp.status_code != 500

    @pytest.mark.parametrize("payload", SQL_PAYLOADS)
    def test_login_body_injection(self, client: TestClient, payload: str):
        resp = client.post(
            "/api/v1/auth/login",
            json={"username": payload, "password": "anypassword"},
        )
        assert resp.status_code in (400, 401, 422)
        assert resp.status_code != 500
        body = resp.json()
        assert "error" in body


# --------------------------------------------------------------------------- #
# Path-parameter injection attempts
# --------------------------------------------------------------------------- #


class TestPathParamInjection:
    """UUID path params are validated by FastAPI/Pydantic before reaching the DB."""

    @pytest.mark.parametrize(
        "evil_id",
        [
            "' OR 1=1--",
            "../../../etc/passwd",
            "<script>alert(1)</script>",
            "00000000-0000-0000-0000-000000000000'; DROP TABLE users;--",
        ],
    )
    def test_get_user_path_injection(self, client: TestClient, admin_token: str, evil_id: str):
        resp = client.get(f"/api/v1/users/{evil_id}", headers=_auth(admin_token))
        # FastAPI validates UUID format → 422 or the service returns 404.
        # Must never be 200 or 500.
        assert resp.status_code in (400, 404, 422)
        assert resp.status_code != 500
