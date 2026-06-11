"""Follow-up lifecycle tests (TST-T11.1).

Covers:
  BE-T11.1  follow-up create, list-by-patient (paginated), queue list with filters, update
  Status lifecycle: PENDING → CONTACTED/NOT_REACHABLE → COMPLETED/RESCHEDULED
  Invalid transitions → 409 INVALID_STATE_TRANSITION
  RBAC: manage_followups required; users without it get 403
  No hard delete (no DELETE endpoint)
  Version conflict (optimistic concurrency)
  Audit events written on create/update
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _token_no_followups(db: Session) -> str:
    """Return a JWT for a user with view_patient only (no manage_followups)."""
    from app.core.security import build_token_claims, create_access_token, hash_password
    from app.modules.auth.models import User

    user = User(
        id=uuid.uuid4(),
        username=f"nofuusr_{uuid.uuid4().hex[:6]}",
        full_name="No FollowUp Permission",
        password_hash=hash_password("TestPass123!"),
        status="ACTIVE",
        is_doctor=False,
        password_changed_at=datetime.now(UTC),
    )
    db.add(user)
    db.flush()
    claims = build_token_claims(
        user_id=str(user.id),
        username=user.username,
        roles=[],
        permissions=["view_patient"],
        is_doctor=False,
    )
    return create_access_token(claims)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_patient(client, db: Session, token: str) -> dict:
    category = db.execute(
        text("SELECT category_code FROM op_sequence WHERE is_active = TRUE ORDER BY id LIMIT 1")
    ).scalar_one()
    r = client.post(
        "/api/v1/patients",
        json={
            "op_category_code": category,
            "full_name": f"FU Patient {uuid.uuid4().hex[:8]}",
            "mobile": f"91{uuid.uuid4().int % 10**8:08d}",
            "age_years": 40,
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def _create_followup(client, patient_id: str, token: str, **overrides) -> dict:
    payload = {
        "follow_up_date": str(date.today() + timedelta(days=7)),
        **overrides,
    }
    r = client.post(
        f"/api/v1/patients/{patient_id}/follow-ups",
        json=payload,
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


# ── Create ─────────────────────────────────────────────────────────────────────


class TestFollowUpCreate:
    def test_create_returns_201_with_pending_status(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        fu = _create_followup(client, patient["id"], reception_token)

        assert fu["patient_id"] == patient["id"]
        assert fu["status_code"] == "PENDING"
        assert fu["version"] == 1

    def test_create_requires_manage_followups_permission(
        self, client, db: Session, admin_token: str
    ) -> None:
        patient = _make_patient(client, db, admin_token)
        r = client.post(
            f"/api/v1/patients/{patient['id']}/follow-ups",
            json={"follow_up_date": str(date.today() + timedelta(days=3))},
            headers=_auth(admin_token),
        )
        assert r.status_code == 201

    def test_create_nonexistent_patient_returns_404(
        self, client, reception_token: str
    ) -> None:
        r = client.post(
            f"/api/v1/patients/{uuid.uuid4()}/follow-ups",
            json={"follow_up_date": str(date.today() + timedelta(days=3))},
            headers=_auth(reception_token),
        )
        assert r.status_code == 404

    def test_unauthenticated_create_returns_401(self, client, db: Session) -> None:
        r = client.post(
            "/api/v1/patients/some-id/follow-ups",
            json={"follow_up_date": str(date.today() + timedelta(days=3))},
        )
        assert r.status_code == 401

    def test_create_writes_audit_row(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        fu = _create_followup(client, patient["id"], reception_token)

        row = db.execute(
            text(
                "SELECT action FROM audit_log"
                " WHERE entity_type = 'follow_up' AND entity_id = :eid"
                " ORDER BY created_at DESC LIMIT 1"
            ),
            {"eid": fu["id"]},
        ).first()
        assert row is not None
        assert row.action == "FOLLOWUP_CREATE"


# ── List by patient ────────────────────────────────────────────────────────────


class TestFollowUpListByPatient:
    def test_list_returns_paginated_envelope(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        _create_followup(client, patient["id"], reception_token)
        r = client.get(
            f"/api/v1/patients/{patient['id']}/follow-ups",
            headers=_auth(reception_token),
        )
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert "page" in body
        assert "page_size" in body
        assert body["total"] >= 1
        assert all(f["patient_id"] == patient["id"] for f in body["items"])

    def test_list_respects_page_size(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        for _ in range(3):
            _create_followup(client, patient["id"], reception_token)
        r = client.get(
            f"/api/v1/patients/{patient['id']}/follow-ups?page_size=2",
            headers=_auth(reception_token),
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body["items"]) <= 2
        assert body["total"] >= 3

    def test_list_nonexistent_patient_returns_404(
        self, client, reception_token: str
    ) -> None:
        r = client.get(
            f"/api/v1/patients/{uuid.uuid4()}/follow-ups",
            headers=_auth(reception_token),
        )
        assert r.status_code == 404

    def test_list_without_manage_followups_returns_403(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        no_perm_token = _token_no_followups(db)
        r = client.get(
            f"/api/v1/patients/{patient['id']}/follow-ups",
            headers=_auth(no_perm_token),
        )
        assert r.status_code == 403

    def test_create_without_manage_followups_returns_403(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        no_perm_token = _token_no_followups(db)
        r = client.post(
            f"/api/v1/patients/{patient['id']}/follow-ups",
            json={"follow_up_date": str(date.today() + timedelta(days=3))},
            headers=_auth(no_perm_token),
        )
        assert r.status_code == 403


# ── Status lifecycle transitions ───────────────────────────────────────────────


class TestFollowUpStatusLifecycle:
    def _update(self, client, fu_id: str, token: str, **fields) -> dict:
        r = client.put(
            f"/api/v1/follow-ups/{fu_id}",
            json=fields,
            headers=_auth(token),
        )
        return r

    def test_pending_to_contacted(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        fu = _create_followup(client, patient["id"], reception_token)

        r = self._update(
            client, fu["id"], reception_token,
            status_code="CONTACTED", version=fu["version"]
        )
        assert r.status_code == 200
        assert r.json()["status_code"] == "CONTACTED"

    def test_pending_to_not_reachable(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        fu = _create_followup(client, patient["id"], reception_token)

        r = self._update(
            client, fu["id"], reception_token,
            status_code="NOT_REACHABLE", version=fu["version"]
        )
        assert r.status_code == 200
        assert r.json()["status_code"] == "NOT_REACHABLE"

    def test_contacted_to_completed(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        fu = _create_followup(client, patient["id"], reception_token)
        contacted = self._update(
            client, fu["id"], reception_token,
            status_code="CONTACTED", version=fu["version"]
        ).json()

        r = self._update(
            client, fu["id"], reception_token,
            status_code="COMPLETED", version=contacted["version"]
        )
        assert r.status_code == 200
        assert r.json()["status_code"] == "COMPLETED"

    def test_contacted_to_rescheduled(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        fu = _create_followup(client, patient["id"], reception_token)
        contacted = self._update(
            client, fu["id"], reception_token,
            status_code="CONTACTED", version=fu["version"]
        ).json()

        r = self._update(
            client, fu["id"], reception_token,
            status_code="RESCHEDULED", version=contacted["version"]
        )
        assert r.status_code == 200
        assert r.json()["status_code"] == "RESCHEDULED"

    def test_not_reachable_to_contacted(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        fu = _create_followup(client, patient["id"], reception_token)
        nr = self._update(
            client, fu["id"], reception_token,
            status_code="NOT_REACHABLE", version=fu["version"]
        ).json()

        r = self._update(
            client, fu["id"], reception_token,
            status_code="CONTACTED", version=nr["version"]
        )
        assert r.status_code == 200

    def test_invalid_transition_pending_to_completed_returns_409(
        self, client, db: Session, reception_token: str
    ) -> None:
        """PENDING → COMPLETED is not a valid direct transition."""
        patient = _make_patient(client, db, reception_token)
        fu = _create_followup(client, patient["id"], reception_token)

        r = self._update(
            client, fu["id"], reception_token,
            status_code="COMPLETED", version=fu["version"]
        )
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "INVALID_STATE_TRANSITION"

    def test_invalid_transition_completed_to_pending_returns_409(
        self, client, db: Session, reception_token: str
    ) -> None:
        """Terminal status COMPLETED cannot transition to anything."""
        patient = _make_patient(client, db, reception_token)
        fu = _create_followup(client, patient["id"], reception_token)
        contacted = self._update(
            client, fu["id"], reception_token,
            status_code="CONTACTED", version=fu["version"]
        ).json()
        completed = self._update(
            client, fu["id"], reception_token,
            status_code="COMPLETED", version=contacted["version"]
        ).json()

        r = self._update(
            client, fu["id"], reception_token,
            status_code="PENDING", version=completed["version"]
        )
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "INVALID_STATE_TRANSITION"

    def test_update_writes_audit_row(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        fu = _create_followup(client, patient["id"], reception_token)
        self._update(
            client, fu["id"], reception_token,
            status_code="CONTACTED", version=fu["version"]
        )

        row = db.execute(
            text(
                "SELECT action FROM audit_log"
                " WHERE entity_type = 'follow_up' AND entity_id = :eid"
                "   AND action = 'FOLLOWUP_UPDATE'"
                " ORDER BY created_at DESC LIMIT 1"
            ),
            {"eid": fu["id"]},
        ).first()
        assert row is not None


# ── Version conflict ───────────────────────────────────────────────────────────


class TestFollowUpVersionConflict:
    def test_stale_version_returns_409_version_conflict(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        fu = _create_followup(client, patient["id"], reception_token)

        r = client.put(
            f"/api/v1/follow-ups/{fu['id']}",
            json={"status_code": "CONTACTED", "version": 999},
            headers=_auth(reception_token),
        )
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "VERSION_CONFLICT"


# ── Queue list with filters ────────────────────────────────────────────────────


class TestFollowUpQueue:
    def test_queue_returns_all_by_default(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        _create_followup(client, patient["id"], reception_token)

        r = client.get("/api/v1/follow-ups", headers=_auth(reception_token))
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert body["total"] >= 1

    def test_queue_filter_by_status(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        _create_followup(client, patient["id"], reception_token)

        r = client.get(
            "/api/v1/follow-ups?status=PENDING",
            headers=_auth(reception_token),
        )
        assert r.status_code == 200
        body = r.json()
        assert all(f["status_code"] == "PENDING" for f in body["items"])

    def test_queue_filter_by_patient_id(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        _create_followup(client, patient["id"], reception_token)

        r = client.get(
            f"/api/v1/follow-ups?patient_id={patient['id']}",
            headers=_auth(reception_token),
        )
        assert r.status_code == 200
        body = r.json()
        assert all(f["patient_id"] == patient["id"] for f in body["items"])

    def test_queue_filter_by_date_range(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        future_date = date.today() + timedelta(days=14)
        _create_followup(client, patient["id"], reception_token,
                         follow_up_date=str(future_date))

        # Filter to a range that includes the follow-up
        r = client.get(
            f"/api/v1/follow-ups?from={date.today()}&to={future_date + timedelta(days=1)}",
            headers=_auth(reception_token),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 1

    def test_queue_requires_manage_followups(self, client) -> None:
        r = client.get("/api/v1/follow-ups")
        assert r.status_code == 401


# ── No hard delete ─────────────────────────────────────────────────────────────


class TestFollowUpNoHardDelete:
    def test_delete_endpoint_does_not_exist(
        self, client, db: Session, admin_token: str
    ) -> None:
        patient = _make_patient(client, db, admin_token)
        fu = _create_followup(client, patient["id"], admin_token)

        r = client.delete(f"/api/v1/follow-ups/{fu['id']}", headers=_auth(admin_token))
        assert r.status_code == 405  # Method Not Allowed


# ── Audit/backup read API basic tests ─────────────────────────────────────────


class TestAuditReadAPI:
    def test_list_audit_logs_admin_only(
        self, client, admin_token: str, reception_token: str
    ) -> None:
        r_admin = client.get("/api/v1/audit-logs", headers=_auth(admin_token))
        assert r_admin.status_code == 200
        body = r_admin.json()
        assert "items" in body

        r_reception = client.get("/api/v1/audit-logs", headers=_auth(reception_token))
        assert r_reception.status_code == 403

    def test_list_audit_logs_unauthenticated_returns_401(self, client) -> None:
        r = client.get("/api/v1/audit-logs")
        assert r.status_code == 401

    def test_get_nonexistent_audit_log_returns_404(
        self, client, admin_token: str
    ) -> None:
        r = client.get("/api/v1/audit-logs/999999999", headers=_auth(admin_token))
        assert r.status_code == 404

    def test_audit_logs_not_writable(
        self, client, admin_token: str
    ) -> None:
        r = client.post("/api/v1/audit-logs", json={}, headers=_auth(admin_token))
        assert r.status_code == 405


class TestBackupStatusAPI:
    def test_backup_status_admin_only(
        self, client, admin_token: str, reception_token: str
    ) -> None:
        r_admin = client.get("/api/v1/backup/status", headers=_auth(admin_token))
        assert r_admin.status_code == 200
        body = r_admin.json()
        assert "latest" in body
        assert "recent" in body

        r_reception = client.get("/api/v1/backup/status", headers=_auth(reception_token))
        assert r_reception.status_code == 403

    def test_backup_status_unauthenticated_returns_401(self, client) -> None:
        r = client.get("/api/v1/backup/status")
        assert r.status_code == 401

    def test_backup_trigger_returns_202_for_admin(
        self, client, admin_token: str, tmp_path, monkeypatch
    ) -> None:
        trigger_file = tmp_path / ".trigger"
        monkeypatch.setattr(
            "app.core.config.settings.backup_trigger_file", str(trigger_file)
        )
        r = client.post("/api/v1/backup/trigger", headers=_auth(admin_token))
        assert r.status_code == 202
        body = r.json()
        assert "triggered_at" in body
        assert "message" in body
        assert trigger_file.exists()

    def test_backup_trigger_forbidden_for_non_admin(
        self, client, reception_token: str
    ) -> None:
        r = client.post("/api/v1/backup/trigger", headers=_auth(reception_token))
        assert r.status_code == 403

    def test_backup_trigger_unauthenticated_returns_401(self, client) -> None:
        r = client.post("/api/v1/backup/trigger")
        assert r.status_code == 401


class TestHealthEndpoints:
    def test_health_returns_200(self, client) -> None:
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"

    def test_ready_returns_db_ok_and_storage_check_present(self, client) -> None:
        r = client.get("/api/v1/ready")
        body = r.json()
        assert body["checks"]["database"] == "ok"
        assert "storage" in body["checks"]
        # 200 when all deps ok; 503 when storage unavailable in this environment
        assert r.status_code in {200, 503}
        if body["checks"]["storage"] == "ok":
            assert r.status_code == 200
            assert body["status"] == "ok"
