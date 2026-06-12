"""Dashboard summary endpoint tests (BE-DASH.6).

Covers:
  Admin sees all sections (registrations, visits, followups, merge_requests,
    users, backup, audit_recent).
  Doctor sees registrations/visits/followups — no admin sections.
  Reception sees registrations/visits/followups — no admin sections,
    no merge_requests (lacks merge_records permission).
  Unauthenticated request → 401.
  Payload contains no patient-identifying data (counts/timestamps only).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


ENDPOINT = "/api/v1/dashboard/summary"


class TestDashboardAdmin:
    def test_returns_200(self, client: TestClient, admin_token: str) -> None:
        r = client.get(ENDPOINT, headers=_auth(admin_token))
        assert r.status_code == 200

    def test_all_sections_present(self, client: TestClient, admin_token: str) -> None:
        data = client.get(ENDPOINT, headers=_auth(admin_token)).json()
        assert data["registrations"] is not None
        assert data["visits"] is not None
        assert data["followups"] is not None
        assert data["merge_requests"] is not None
        assert data["users"] is not None
        assert data["backup"] is not None
        assert data["audit_recent"] is not None

    def test_registrations_shape(self, client: TestClient, admin_token: str) -> None:
        data = client.get(ENDPOINT, headers=_auth(admin_token)).json()
        reg = data["registrations"]
        assert "today" in reg and isinstance(reg["today"], int)
        assert "this_week" in reg and isinstance(reg["this_week"], int)

    def test_visits_shape(self, client: TestClient, admin_token: str) -> None:
        data = client.get(ENDPOINT, headers=_auth(admin_token)).json()
        v = data["visits"]
        assert "open_today" in v and isinstance(v["open_today"], int)
        assert "completed_today" in v and isinstance(v["completed_today"], int)

    def test_users_shape(self, client: TestClient, admin_token: str) -> None:
        data = client.get(ENDPOINT, headers=_auth(admin_token)).json()
        u = data["users"]
        assert "active" in u and isinstance(u["active"], int)
        assert "locked" in u and isinstance(u["locked"], int)

    def test_no_pii_in_audit_feed(self, client: TestClient, admin_token: str) -> None:
        data = client.get(ENDPOINT, headers=_auth(admin_token)).json()
        for entry in data["audit_recent"]:
            assert "patient_id" not in entry
            assert "mobile" not in entry
            assert "email" not in entry


class TestDashboardDoctor:
    def test_returns_200(self, client: TestClient, doctor_token: str) -> None:
        r = client.get(ENDPOINT, headers=_auth(doctor_token))
        assert r.status_code == 200

    def test_clinical_sections_present(self, client: TestClient, doctor_token: str) -> None:
        data = client.get(ENDPOINT, headers=_auth(doctor_token)).json()
        assert data["registrations"] is not None
        assert data["visits"] is not None
        assert data["followups"] is not None

    def test_admin_sections_absent(self, client: TestClient, doctor_token: str) -> None:
        data = client.get(ENDPOINT, headers=_auth(doctor_token)).json()
        assert data["users"] is None
        assert data["backup"] is None
        assert data["audit_recent"] is None
        assert data["merge_requests"] is None


class TestDashboardReception:
    def test_returns_200(self, client: TestClient, reception_token: str) -> None:
        r = client.get(ENDPOINT, headers=_auth(reception_token))
        assert r.status_code == 200

    def test_patient_sections_present(self, client: TestClient, reception_token: str) -> None:
        data = client.get(ENDPOINT, headers=_auth(reception_token)).json()
        assert data["registrations"] is not None
        assert data["visits"] is not None
        assert data["followups"] is not None

    def test_admin_sections_absent(self, client: TestClient, reception_token: str) -> None:
        data = client.get(ENDPOINT, headers=_auth(reception_token)).json()
        assert data["users"] is None
        assert data["backup"] is None
        assert data["audit_recent"] is None
        assert data["merge_requests"] is None


class TestDashboardAuth:
    def test_unauthenticated_returns_401(self, client: TestClient) -> None:
        r = client.get(ENDPOINT)
        assert r.status_code == 401

    def test_invalid_token_returns_401(self, client: TestClient) -> None:
        r = client.get(ENDPOINT, headers={"Authorization": "Bearer bad.token.here"})
        assert r.status_code == 401
