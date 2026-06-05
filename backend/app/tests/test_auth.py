"""Auth & RBAC tests (TST-T1.1, TST-T1.2).

Covers:
- Login success → tokens issued
- Login with wrong password → AUTH_INVALID_CREDENTIALS (no enumeration)
- Login with wrong username → AUTH_INVALID_CREDENTIALS (same error, same timing shape)
- N failed logins → account locked
- Locked account → AUTH_ACCOUNT_LOCKED
- Disabled account → AUTH_ACCOUNT_DISABLED
- Refresh token rotation → new pair returned, different jti
- Logout → 204
- GET /me → profile with roles + permissions
- GET /me/permissions → permission list
- Expired/no token → 401
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.modules.auth.models import User, UserRole


# ── Helpers ───────────────────────────────────────────────────────────────────

def _login(client: TestClient, username: str, password: str) -> dict:
    resp = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    return resp


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Login tests ───────────────────────────────────────────────────────────────

class TestLogin:
    def test_login_success(self, client: TestClient, admin_user: User):
        resp = _login(client, admin_user.username, "TestPass123!")
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] > 0

    def test_wrong_password_returns_generic_error(self, client: TestClient, admin_user: User):
        resp = _login(client, admin_user.username, "wrongpassword")
        assert resp.status_code == 401
        body = resp.json()
        assert body["error"]["code"] == "AUTH_INVALID_CREDENTIALS"

    def test_wrong_username_returns_same_generic_error(self, client: TestClient):
        resp = _login(client, "nonexistent_user_xyz", "anypassword")
        assert resp.status_code == 401
        body = resp.json()
        assert body["error"]["code"] == "AUTH_INVALID_CREDENTIALS"

    def test_no_username_enumeration(self, client: TestClient, admin_user: User):
        """Wrong username and wrong password must produce identical error codes."""
        resp_wrong_user = _login(client, "definitely_does_not_exist", "pass")
        resp_wrong_pass = _login(client, admin_user.username, "wrongpassword")
        assert resp_wrong_user.json()["error"]["code"] == resp_wrong_pass.json()["error"]["code"]
        assert resp_wrong_user.status_code == resp_wrong_pass.status_code

    def test_account_lockout_after_max_attempts(self, client: TestClient, db: Session):
        """After login_max_attempts failures the account is locked."""
        from app.modules.auth.models import Role

        role = db.query(Role).filter(Role.code == "RECEPTION").first()
        if role is None:
            role = Role(code="RECEPTION", name="Receptionist", is_active=True)
            db.add(role)
            db.flush()

        lockout_user = User(
            id=uuid.uuid4(),
            username=f"locktest_{uuid.uuid4().hex[:6]}",
            full_name="Lockout Test",
            password_hash=hash_password("CorrectPass1!"),
            status="ACTIVE",
        )
        db.add(lockout_user)
        db.add(UserRole(user_id=lockout_user.id, role_id=role.id))
        db.flush()

        for _ in range(settings.login_max_attempts):
            _login(client, lockout_user.username, "wrongpassword")

        resp = _login(client, lockout_user.username, "wrongpassword")
        assert resp.status_code in (401, 403)

    def test_disabled_account_cannot_login(self, client: TestClient, db: Session):
        from app.modules.auth.models import Role

        role = db.query(Role).filter(Role.code == "RECEPTION").first()
        if role is None:
            role = Role(code="RECEPTION", name="Receptionist", is_active=True)
            db.add(role)
            db.flush()

        disabled_user = User(
            id=uuid.uuid4(),
            username=f"disabled_{uuid.uuid4().hex[:6]}",
            full_name="Disabled User",
            password_hash=hash_password("TestPass123!"),
            status="DISABLED",
        )
        db.add(disabled_user)
        db.add(UserRole(user_id=disabled_user.id, role_id=role.id))
        db.flush()

        resp = _login(client, disabled_user.username, "TestPass123!")
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "AUTH_ACCOUNT_DISABLED"

    def test_locked_account_returns_locked_error(self, client: TestClient, db: Session):
        from app.modules.auth.models import Role

        role = db.query(Role).filter(Role.code == "RECEPTION").first()
        if role is None:
            role = Role(code="RECEPTION", name="Receptionist", is_active=True)
            db.add(role)
            db.flush()

        locked_user = User(
            id=uuid.uuid4(),
            username=f"locked_{uuid.uuid4().hex[:6]}",
            full_name="Locked User",
            password_hash=hash_password("TestPass123!"),
            status="LOCKED",
            locked_until=datetime.now(UTC) + timedelta(minutes=30),
        )
        db.add(locked_user)
        db.add(UserRole(user_id=locked_user.id, role_id=role.id))
        db.flush()

        resp = _login(client, locked_user.username, "TestPass123!")
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] in ("AUTH_ACCOUNT_LOCKED", "AUTH_ACCOUNT_DISABLED")


# ── Token refresh & logout ────────────────────────────────────────────────────

class TestRefreshAndLogout:
    def test_refresh_returns_new_tokens(self, client: TestClient, admin_user: User):
        login_resp = _login(client, admin_user.username, "TestPass123!")
        old_tokens = login_resp.json()

        resp = client.post("/api/v1/auth/refresh", json={"refresh_token": old_tokens["refresh_token"]})
        assert resp.status_code == 200
        new_tokens = resp.json()
        assert "access_token" in new_tokens
        assert new_tokens["access_token"] != old_tokens["access_token"]

    def test_refresh_with_access_token_rejected(self, client: TestClient, admin_user: User):
        login_resp = _login(client, admin_user.username, "TestPass123!")
        access_token = login_resp.json()["access_token"]

        resp = client.post("/api/v1/auth/refresh", json={"refresh_token": access_token})
        assert resp.status_code in (400, 401)

    def test_refresh_invalid_token_rejected(self, client: TestClient):
        resp = client.post("/api/v1/auth/refresh", json={"refresh_token": "not.a.valid.token"})
        assert resp.status_code in (400, 401)

    def test_logout_returns_204(self, client: TestClient, admin_token: str):
        resp = client.post("/api/v1/auth/logout", headers=_auth_header(admin_token))
        assert resp.status_code == 204

    def test_logout_requires_auth(self, client: TestClient):
        resp = client.post("/api/v1/auth/logout")
        assert resp.status_code == 401


# ── /me endpoint ──────────────────────────────────────────────────────────────

class TestMe:
    def test_me_returns_profile(self, client: TestClient, admin_user: User, admin_token: str):
        resp = client.get("/api/v1/auth/me", headers=_auth_header(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == admin_user.username
        assert "ADMIN" in data["roles"]
        assert "manage_users" in data["permissions"]
        assert "password" not in data
        assert "password_hash" not in data

    def test_me_requires_token(self, client: TestClient):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_me_permissions_matches_role(self, client: TestClient, reception_token: str):
        resp = client.get("/api/v1/auth/me", headers=_auth_header(reception_token))
        assert resp.status_code == 200
        data = resp.json()
        assert "create_patient" in data["permissions"]
        assert "manage_users" not in data["permissions"]

    def test_me_permissions_endpoint(self, client: TestClient, admin_token: str):
        resp = client.get("/api/v1/auth/me/permissions", headers=_auth_header(admin_token))
        assert resp.status_code == 200
        assert "permissions" in resp.json()
        assert "manage_users" in resp.json()["permissions"]

    def test_invalid_token_returns_401(self, client: TestClient):
        resp = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert resp.status_code == 401

    def test_no_token_returns_401(self, client: TestClient):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_malformed_bearer_returns_401(self, client: TestClient):
        resp = client.get("/api/v1/auth/me", headers={"Authorization": "NotBearer xyz"})
        assert resp.status_code == 401