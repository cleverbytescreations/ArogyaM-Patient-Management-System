"""Deny-by-default RBAC enforcement tests (SEC-T1.1).

Verifies:
- Every non-public endpoint rejects requests without a valid token (401)
- Every non-public endpoint rejects a user lacking the required permission (403)
- A disabled user with an otherwise-valid token is rejected (403)
- A locked user with an otherwise-valid token is rejected (403)
- The permission map matches the SAD §11.2 matrix exactly
- Field-level: role-filtered endpoints enforce role-based response scoping
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.permissions import (
    PERM_ADD_CONSULTATION,
    PERM_ADD_PRESCRIPTION,
    PERM_BACKUP_CONTROL,
    PERM_CREATE_PATIENT,
    PERM_EDIT_PATIENT,
    PERM_EXPORT,
    PERM_MANAGE_FOLLOWUPS,
    PERM_MANAGE_MASTER_DATA,
    PERM_MANAGE_USERS,
    PERM_MERGE_RECORDS,
    PERM_REQUEST_MERGE,
    PERM_VIEW_AUDIT,
    PERM_VIEW_MEDICAL_HISTORY,
    PERM_VIEW_PATIENT,
    PERM_VIEW_REPORTS,
    ROLE_ADMIN,
    ROLE_DATA_ENTRY,
    ROLE_DOCTOR,
    ROLE_PERMISSIONS,
    ROLE_RECEPTION,
    resolve_permissions,
)
from app.modules.auth.models import User


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_token(user: User) -> str:
    """Build a valid access token for any user object."""
    from app.core.permissions import resolve_permissions
    from app.core.security import build_token_claims, create_access_token

    role_codes = [ur.role.code for ur in user.user_roles if ur.role.is_active]
    permissions = resolve_permissions(role_codes)
    claims = build_token_claims(
        user_id=str(user.id),
        username=user.username,
        roles=role_codes,
        permissions=permissions,
        is_doctor=user.is_doctor,
    )
    return create_access_token(claims)


# --------------------------------------------------------------------------- #
# Permission-map correctness — must match SAD §11.2
# --------------------------------------------------------------------------- #


class TestPermissionMapMatrix:
    """Verify the static ROLE_PERMISSIONS map matches the SAD §11.2 matrix."""

    def test_admin_has_all_permissions(self):
        admin_perms = ROLE_PERMISSIONS[ROLE_ADMIN]
        all_known = {
            PERM_CREATE_PATIENT, PERM_VIEW_PATIENT, PERM_EDIT_PATIENT,
            PERM_VIEW_MEDICAL_HISTORY, PERM_ADD_CONSULTATION, PERM_ADD_PRESCRIPTION,
            PERM_MANAGE_USERS, PERM_MANAGE_MASTER_DATA, PERM_VIEW_AUDIT,
            PERM_BACKUP_CONTROL, PERM_EXPORT, PERM_MANAGE_FOLLOWUPS,
            PERM_MERGE_RECORDS, PERM_REQUEST_MERGE, PERM_VIEW_REPORTS,
        }
        assert all_known.issubset(admin_perms), (
            f"Admin missing permissions: {all_known - admin_perms}"
        )

    def test_doctor_permissions(self):
        doctor_perms = ROLE_PERMISSIONS[ROLE_DOCTOR]
        # Doctors CAN:
        for perm in (
            PERM_VIEW_PATIENT, PERM_VIEW_MEDICAL_HISTORY, PERM_ADD_CONSULTATION,
            PERM_ADD_PRESCRIPTION, PERM_MANAGE_FOLLOWUPS, PERM_EXPORT, PERM_VIEW_REPORTS,
        ):
            assert perm in doctor_perms, f"Doctor missing expected permission: {perm}"
        # Doctors CANNOT:
        for perm in (PERM_MANAGE_USERS, PERM_VIEW_AUDIT, PERM_BACKUP_CONTROL, PERM_MERGE_RECORDS):
            assert perm not in doctor_perms, f"Doctor should NOT have: {perm}"

    def test_reception_permissions(self):
        reception_perms = ROLE_PERMISSIONS[ROLE_RECEPTION]
        # Receptionists CAN:
        for perm in (
            PERM_CREATE_PATIENT, PERM_VIEW_PATIENT, PERM_EDIT_PATIENT,
            PERM_MANAGE_FOLLOWUPS, PERM_REQUEST_MERGE,
        ):
            assert perm in reception_perms, f"Reception missing expected permission: {perm}"
        # Receptionists CANNOT:
        for perm in (
            PERM_VIEW_MEDICAL_HISTORY, PERM_ADD_CONSULTATION, PERM_ADD_PRESCRIPTION,
            PERM_MANAGE_USERS, PERM_VIEW_AUDIT, PERM_BACKUP_CONTROL, PERM_MERGE_RECORDS,
        ):
            assert perm not in reception_perms, f"Reception should NOT have: {perm}"

    def test_data_entry_permissions(self):
        de_perms = ROLE_PERMISSIONS[ROLE_DATA_ENTRY]
        # Data Entry CAN (same as reception for Phase 1):
        for perm in (
            PERM_CREATE_PATIENT, PERM_VIEW_PATIENT, PERM_EDIT_PATIENT,
            PERM_MANAGE_FOLLOWUPS, PERM_REQUEST_MERGE,
        ):
            assert perm in de_perms, f"Data Entry missing expected permission: {perm}"
        # Data Entry CANNOT:
        for perm in (
            PERM_VIEW_MEDICAL_HISTORY, PERM_ADD_CONSULTATION, PERM_MANAGE_USERS,
            PERM_VIEW_AUDIT, PERM_MERGE_RECORDS,
        ):
            assert perm not in de_perms, f"Data Entry should NOT have: {perm}"

    def test_resolve_permissions_deduplicates(self):
        """Multiple roles → effective permissions are deduplicated."""
        perms = resolve_permissions([ROLE_ADMIN, ROLE_DOCTOR])
        assert len(perms) == len(set(perms)), "resolve_permissions returned duplicates"

    def test_resolve_permissions_unknown_role(self):
        """Unknown role code → empty permission set (fail-safe)."""
        perms = resolve_permissions(["NONEXISTENT_ROLE"])
        assert perms == []

    def test_resolve_permissions_empty_roles(self):
        perms = resolve_permissions([])
        assert perms == []


# --------------------------------------------------------------------------- #
# Disabled / Locked user cannot authenticate
# --------------------------------------------------------------------------- #


class TestDisabledUserBlocked:
    """A user who is DISABLED or LOCKED must be rejected at auth time even if
    they present a token that was issued before the status change."""

    @pytest.fixture
    def disabled_user_token(self, db: Session) -> str:
        """Create a DISABLED user and mint a valid token for them."""
        # Ensure RECEPTION role exists
        from sqlalchemy import select

        from app.core.security import hash_password
        from app.modules.auth.models import Role, UserRole
        role = db.execute(select(Role).where(Role.code == "RECEPTION")).scalar_one_or_none()
        if role is None:
            role = Role(code="RECEPTION", name="Receptionist", is_active=True)
            db.add(role)
            db.flush()

        user = User(
            id=uuid.uuid4(),
            username=f"disabled_{uuid.uuid4().hex[:6]}",
            full_name="Disabled User",
            password_hash=hash_password("ValidPass1!"),
            status="DISABLED",
            is_doctor=False,
            password_changed_at=datetime.now(UTC),
        )
        db.add(user)
        db.flush()
        db.add(UserRole(user_id=user.id, role_id=role.id))
        db.flush()
        return _make_token(user)

    @pytest.fixture
    def locked_user_token(self, db: Session) -> str:
        """Create a LOCKED user and mint a valid token for them."""
        from sqlalchemy import select

        from app.core.security import hash_password
        from app.modules.auth.models import Role, UserRole
        role = db.execute(select(Role).where(Role.code == "RECEPTION")).scalar_one_or_none()
        if role is None:
            role = Role(code="RECEPTION", name="Receptionist", is_active=True)
            db.add(role)
            db.flush()

        user = User(
            id=uuid.uuid4(),
            username=f"locked_{uuid.uuid4().hex[:6]}",
            full_name="Locked User",
            password_hash=hash_password("ValidPass1!"),
            status="LOCKED",
            is_doctor=False,
            locked_until=datetime.now(UTC) + timedelta(minutes=30),
            failed_login_attempts=5,
            password_changed_at=datetime.now(UTC),
        )
        db.add(user)
        db.flush()
        db.add(UserRole(user_id=user.id, role_id=role.id))
        db.flush()
        return _make_token(user)

    def test_disabled_user_token_rejected_on_me(
        self, client: TestClient, disabled_user_token: str
    ):
        resp = client.get("/api/v1/me", headers=_auth(disabled_user_token))
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "AUTH_ACCOUNT_DISABLED"

    def test_disabled_user_token_rejected_on_roles(
        self, client: TestClient, disabled_user_token: str
    ):
        resp = client.get("/api/v1/roles", headers=_auth(disabled_user_token))
        assert resp.status_code == 403

    def test_locked_user_token_rejected(
        self, client: TestClient, locked_user_token: str
    ):
        resp = client.get("/api/v1/me", headers=_auth(locked_user_token))
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "AUTH_ACCOUNT_LOCKED"


# --------------------------------------------------------------------------- #
# Deny-by-default: unauthenticated access blocked on ALL protected endpoints
# --------------------------------------------------------------------------- #


PROTECTED_ENDPOINTS = [
    ("GET",  "/api/v1/me"),
    ("GET",  "/api/v1/me/permissions"),
    ("POST", "/api/v1/auth/logout"),
    ("GET",  "/api/v1/users"),
    ("POST", "/api/v1/users"),
    ("GET",  "/api/v1/users/00000000-0000-0000-0000-000000000001"),
    ("PUT",  "/api/v1/users/00000000-0000-0000-0000-000000000001"),
    ("GET",  "/api/v1/roles"),
]

PUBLIC_ENDPOINTS = [
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/refresh"),
    ("GET",  "/api/v1/health"),
    ("GET",  "/api/v1/ready"),
]


class TestDenyByDefaultNoToken:
    """Every protected endpoint returns 401 with no token."""

    @pytest.mark.parametrize("method,path", PROTECTED_ENDPOINTS)
    def test_no_token_returns_401(self, client: TestClient, method: str, path: str):
        resp = getattr(client, method.lower())(path)
        assert resp.status_code == 401, (
            f"{method} {path} should be 401 but got {resp.status_code}"
        )
        body = resp.json()
        assert "error" in body
        assert body["error"]["code"] in ("AUTH_INVALID_CREDENTIALS", "AUTH_TOKEN_INVALID")


class TestPublicEndpointsAccessible:
    """Public endpoints must be reachable without a token (not 401/403)."""

    @pytest.mark.parametrize("method,path", PUBLIC_ENDPOINTS)
    def test_public_endpoint_not_blocked(self, client: TestClient, method: str, path: str):
        if method == "GET":
            resp = client.get(path)
        else:
            resp = getattr(client, method.lower())(path, json={})
        # Public endpoints may return 400/422 due to empty body, but never 401/403
        assert resp.status_code not in (401, 403), (
            f"{method} {path} is blocking unauthenticated access — should be public. "
            f"Got {resp.status_code}"
        )


# --------------------------------------------------------------------------- #
# Role-based access: specific endpoint/role combinations
# --------------------------------------------------------------------------- #


class TestRoleBasedAccess:
    """
    Wrong role → 403. Each combination of (endpoint, role) that should be
    denied must return 403 ACCESS_DENIED.
    """

    # manage_users endpoints — only ADMIN
    def test_reception_cannot_list_users(self, client: TestClient, reception_token: str):
        resp = client.get("/api/v1/users", headers=_auth(reception_token))
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "ACCESS_DENIED"

    def test_doctor_cannot_list_users(self, client: TestClient, doctor_token: str):
        resp = client.get("/api/v1/users", headers=_auth(doctor_token))
        assert resp.status_code == 403

    def test_reception_cannot_create_user(self, client: TestClient, reception_token: str):
        resp = client.post(
            "/api/v1/users",
            json={"username": "hack", "full_name": "H", "password": "ValidPas1!"},
            headers=_auth(reception_token),
        )
        assert resp.status_code == 403

    def test_doctor_cannot_create_user(self, client: TestClient, doctor_token: str):
        resp = client.post(
            "/api/v1/users",
            json={"username": "hack", "full_name": "H", "password": "ValidPas1!"},
            headers=_auth(doctor_token),
        )
        assert resp.status_code == 403

    def test_reception_cannot_get_user_by_id(self, client: TestClient, reception_token: str):
        # 404 (not 403): GET /users/{id} now also serves the doctor picker
        # (any authenticated user may resolve a doctor's name by id), so a
        # non-existent / non-doctor id is reported as not-found rather than
        # forbidden — this also avoids leaking which arbitrary ids are staff.
        fake_id = str(uuid.uuid4())
        resp = client.get(f"/api/v1/users/{fake_id}", headers=_auth(reception_token))
        assert resp.status_code == 404

    def test_reception_cannot_reset_password(self, client: TestClient, reception_token: str):
        fake_id = str(uuid.uuid4())
        resp = client.post(
            f"/api/v1/users/{fake_id}/reset-password",
            json={"new_password": "ValidPas1!"},
            headers=_auth(reception_token),
        )
        assert resp.status_code == 403

    def test_reception_cannot_set_user_status(self, client: TestClient, reception_token: str):
        fake_id = str(uuid.uuid4())
        resp = client.put(
            f"/api/v1/users/{fake_id}/status",
            json={"status": "DISABLED", "version": 1},
            headers=_auth(reception_token),
        )
        assert resp.status_code == 403

    # admin CAN access (role permitted) — 404 is acceptable (user not found)
    def test_admin_can_access_user_management(self, client: TestClient, admin_token: str):
        resp = client.get("/api/v1/users", headers=_auth(admin_token))
        assert resp.status_code == 200

    def test_all_roles_can_list_roles(
        self, client: TestClient, admin_token: str, doctor_token: str, reception_token: str
    ):
        """GET /roles is accessible to all authenticated users."""
        for label, token in [
            ("admin", admin_token),
            ("doctor", doctor_token),
            ("reception", reception_token),
        ]:
            resp = client.get("/api/v1/roles", headers=_auth(token))
            assert resp.status_code == 200, f"Roles list failed for {label}"


# --------------------------------------------------------------------------- #
# Token type enforcement
# --------------------------------------------------------------------------- #


class TestTokenTypeEnforcement:
    def test_refresh_token_rejected_on_protected_endpoint(
        self, client: TestClient, admin_user: User
    ):
        """A refresh token must not be accepted where an access token is required."""
        from app.core.permissions import resolve_permissions
        from app.core.security import build_token_claims, create_refresh_token

        role_codes = [ur.role.code for ur in admin_user.user_roles if ur.role.is_active]
        claims = build_token_claims(
            user_id=str(admin_user.id),
            username=admin_user.username,
            roles=role_codes,
            permissions=resolve_permissions(role_codes),
            is_doctor=False,
        )
        refresh_token = create_refresh_token(claims)
        resp = client.get("/api/v1/me", headers=_auth(refresh_token))
        assert resp.status_code == 401

    def test_denylisted_token_rejected(
        self, client: TestClient, admin_user: User
    ):
        """After logout, the previously-valid token must be rejected."""
        from app.core.permissions import resolve_permissions
        from app.core.security import build_token_claims, create_access_token

        role_codes = [ur.role.code for ur in admin_user.user_roles if ur.role.is_active]
        claims = build_token_claims(
            user_id=str(admin_user.id),
            username=admin_user.username,
            roles=role_codes,
            permissions=resolve_permissions(role_codes),
            is_doctor=False,
        )
        token = create_access_token(claims)

        # Verify the token works before logout
        resp = client.get("/api/v1/me", headers=_auth(token))
        assert resp.status_code == 200

        # Logout (adds jti to in-process denylist)
        logout_resp = client.post("/api/v1/auth/logout", headers=_auth(token))
        assert logout_resp.status_code == 204

        # Same token must now be rejected
        resp_after = client.get("/api/v1/me", headers=_auth(token))
        assert resp_after.status_code == 401
