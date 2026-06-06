"""User management tests (TST-T1.1, TST-T1.2 partial).

Covers:
- Create user (admin only)
- Duplicate username → 409
- List users with filters
- Get user by ID
- Update user (version-checked)
- Enable/disable user
- Reset password
- Non-admin blocked from user management (403)
- GET /roles returns all roles
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.auth.models import User


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


BASE = "/api/v1/users"


class TestUserCRUD:
    def test_create_user_as_admin(self, client: TestClient, admin_token: str):
        payload = {
            "username": f"newuser_{uuid.uuid4().hex[:6]}",
            "full_name": "New User",
            "password": "SecurePass1!",
            "email": f"newuser_{uuid.uuid4().hex[:6]}@example.com",
            "role_codes": ["RECEPTION"],
        }
        resp = client.post(BASE, json=payload, headers=_auth(admin_token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == payload["username"]
        assert "RECEPTION" in data["roles"]
        assert "password" not in data
        assert "password_hash" not in data

    def test_create_user_duplicate_username(
        self, client: TestClient, admin_token: str, admin_user: User
    ):
        payload = {
            "username": admin_user.username,
            "full_name": "Duplicate",
            "password": "SecurePass1!",
        }
        resp = client.post(BASE, json=payload, headers=_auth(admin_token))
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "RESOURCE_CONFLICT"

    def test_create_user_non_admin_forbidden(self, client: TestClient, reception_token: str):
        payload = {
            "username": f"shouldfail_{uuid.uuid4().hex[:6]}",
            "full_name": "Should Fail",
            "password": "SecurePass1!",
        }
        resp = client.post(BASE, json=payload, headers=_auth(reception_token))
        assert resp.status_code == 403

    def test_create_user_no_auth(self, client: TestClient):
        resp = client.post(
            BASE, json={"username": "x", "full_name": "x", "password": "xxxxxxxxxxx"}
        )
        assert resp.status_code == 401

    def test_list_users(self, client: TestClient, admin_token: str, admin_user: User):
        resp = client.get(BASE, headers=_auth(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 1

    def test_list_users_doctor_filter(
        self, client: TestClient, admin_token: str, doctor_user: User
    ):
        resp = client.get(f"{BASE}?is_doctor=true", headers=_auth(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        usernames = [u["username"] for u in data["items"]]
        assert doctor_user.username in usernames
        assert all(u["is_doctor"] for u in data["items"])

    def test_list_users_sorted_by_username_desc(
        self, client: TestClient, admin_token: str, admin_user: User
    ):
        resp = client.get(f"{BASE}?sort=username&order=desc", headers=_auth(admin_token))
        assert resp.status_code == 200
        usernames = [u["username"] for u in resp.json()["items"]]
        assert usernames == sorted(usernames, reverse=True)

    def test_list_users_invalid_sort_rejected(
        self, client: TestClient, admin_token: str, admin_user: User
    ):
        resp = client.get(f"{BASE}?sort=password_hash", headers=_auth(admin_token))
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_get_user_by_id(self, client: TestClient, admin_token: str, admin_user: User):
        resp = client.get(f"{BASE}/{admin_user.id}", headers=_auth(admin_token))
        assert resp.status_code == 200
        assert resp.json()["id"] == str(admin_user.id)

    def test_get_user_not_found(self, client: TestClient, admin_token: str):
        resp = client.get(f"{BASE}/{uuid.uuid4()}", headers=_auth(admin_token))
        assert resp.status_code == 404

    def test_update_user(self, client: TestClient, admin_token: str, db: Session):
        # Create a user to update
        create_resp = client.post(
            BASE,
            json={
                "username": f"upd_{uuid.uuid4().hex[:6]}",
                "full_name": "Before Update",
                "password": "SecurePass1!",
                "role_codes": ["RECEPTION"],
            },
            headers=_auth(admin_token),
        )
        assert create_resp.status_code == 201
        user_data = create_resp.json()

        update_resp = client.put(
            f"{BASE}/{user_data['id']}",
            json={"full_name": "After Update", "version": user_data["version"]},
            headers=_auth(admin_token),
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["full_name"] == "After Update"
        assert update_resp.json()["version"] == user_data["version"] + 1

    def test_update_user_version_conflict(self, client: TestClient, admin_token: str):
        create_resp = client.post(
            BASE,
            json={
                "username": f"conflict_{uuid.uuid4().hex[:6]}",
                "full_name": "Conflict Test",
                "password": "SecurePass1!",
            },
            headers=_auth(admin_token),
        )
        user_id = create_resp.json()["id"]

        stale_version = 0
        resp = client.put(
            f"{BASE}/{user_id}",
            json={"full_name": "Stale Update", "version": stale_version},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "VERSION_CONFLICT"


class TestUserStatus:
    def test_disable_user(self, client: TestClient, admin_token: str):
        create_resp = client.post(
            BASE,
            json={
                "username": f"todisable_{uuid.uuid4().hex[:6]}",
                "full_name": "To Disable",
                "password": "SecurePass1!",
            },
            headers=_auth(admin_token),
        )
        user_id = create_resp.json()["id"]
        version = create_resp.json()["version"]

        resp = client.put(
            f"{BASE}/{user_id}/status",
            json={"status": "DISABLED", "version": version},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "DISABLED"
        assert resp.json()["version"] == version + 1

    def test_enable_user(self, client: TestClient, admin_token: str):
        create_resp = client.post(
            BASE,
            json={
                "username": f"toenable_{uuid.uuid4().hex[:6]}",
                "full_name": "To Enable",
                "password": "SecurePass1!",
            },
            headers=_auth(admin_token),
        )
        user_id = create_resp.json()["id"]
        version = create_resp.json()["version"]

        disable_resp = client.put(
            f"{BASE}/{user_id}/status",
            json={"status": "DISABLED", "version": version},
            headers=_auth(admin_token),
        )
        resp = client.put(
            f"{BASE}/{user_id}/status",
            json={"status": "ACTIVE", "version": disable_resp.json()["version"]},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ACTIVE"

    def test_status_version_conflict(self, client: TestClient, admin_token: str):
        create_resp = client.post(
            BASE,
            json={
                "username": f"verconf_{uuid.uuid4().hex[:6]}",
                "full_name": "Version Conflict",
                "password": "SecurePass1!",
            },
            headers=_auth(admin_token),
        )
        user_id = create_resp.json()["id"]

        # Stale version (real version is 1 for a freshly created user) → 409.
        resp = client.put(
            f"{BASE}/{user_id}/status",
            json={"status": "DISABLED", "version": 99},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 409

    def test_invalid_status_value(self, client: TestClient, admin_token: str, admin_user: User):
        resp = client.put(
            f"{BASE}/{admin_user.id}/status",
            json={"status": "INVALID_STATUS"},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 422


class TestPasswordReset:
    def test_reset_password(self, client: TestClient, admin_token: str):
        create_resp = client.post(
            BASE,
            json={
                "username": f"resetpw_{uuid.uuid4().hex[:6]}",
                "full_name": "Reset PW Test",
                "password": "OldPassword1!",
            },
            headers=_auth(admin_token),
        )
        user_id = create_resp.json()["id"]
        username = create_resp.json()["username"]

        resp = client.post(
            f"{BASE}/{user_id}/reset-password",
            json={"new_password": "NewPassword1!"},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 204

        # Can now login with new password
        login_resp = client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": "NewPassword1!"},
        )
        assert login_resp.status_code == 200

    def test_reset_password_too_short(self, client: TestClient, admin_token: str, admin_user: User):
        resp = client.post(
            f"{BASE}/{admin_user.id}/reset-password",
            json={"new_password": "short"},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 422

    def test_reset_password_exceeds_bcrypt_limit(
        self, client: TestClient, admin_token: str, admin_user: User
    ):
        resp = client.post(
            f"{BASE}/{admin_user.id}/reset-password",
            json={"new_password": "A" * 73},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 422


class TestRoles:
    def test_list_roles_authenticated(self, client: TestClient, reception_token: str):
        resp = client.get("/api/v1/roles", headers=_auth(reception_token))
        assert resp.status_code == 200
        roles = resp.json()
        codes = [r["code"] for r in roles]
        for expected in ["ADMIN", "DOCTOR", "RECEPTION", "DATA_ENTRY"]:
            assert expected in codes

    def test_list_roles_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/roles")
        assert resp.status_code == 401
