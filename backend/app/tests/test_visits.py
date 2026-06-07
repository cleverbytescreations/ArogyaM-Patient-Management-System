"""Clinical workflow tests: visits, case sheets, consultation notes (TST-T6.1).

Covers:
  BE-T6.1  visit create/update/list with future-date rule
  BE-T6.2  case-sheet idempotent PUT upsert + version conflict
  BE-T6.3  consultation-note append-only
  BE-T3.x  patient profile shell in visit responses
  Field-level visibility: limited roles (Receptionist) see reduced clinical view
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_patient(client, db: Session, token: str) -> dict:
    category = db.execute(
        text("SELECT category_code FROM op_sequence WHERE is_active = TRUE ORDER BY id LIMIT 1")
    ).scalar_one()
    payload = {
        "op_category_code": category,
        "full_name": f"Visit Patient {uuid.uuid4().hex[:8]}",
        "mobile": f"90{uuid.uuid4().int % 10**8:08d}",
        "age_years": 30,
    }
    r = client.post("/api/v1/patients", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


def _visit_type(db: Session) -> str:
    return db.execute(
        text("SELECT code FROM master_data WHERE type = 'visit_type' AND is_active = TRUE LIMIT 1")
    ).scalar_one()


def _make_visit(client, db: Session, patient_id: str, token: str, **overrides) -> dict:
    payload = {
        "visit_date": str(date.today()),
        "visit_type_code": _visit_type(db),
        "is_scheduled": False,
        **overrides,
    }
    r = client.post(
        f"/api/v1/patients/{patient_id}/visits", json=payload, headers=_auth(token)
    )
    assert r.status_code == 201, r.text
    return r.json()


# ── Visit creation (BE-T6.1) ───────────────────────────────────────────────────


class TestVisitCreate:
    def test_create_visit_returns_201_with_patient_shell(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        assert visit["patient_id"] == patient["id"]
        assert visit["status"] == "OPEN"
        assert visit["version"] == 1
        # patient shell should be embedded
        assert visit["patient_shell"] is not None
        assert visit["patient_shell"]["op_number"] == patient["op_number"]
        assert visit["patient_shell"]["full_name"] == patient["full_name"]

    def test_create_visit_audited(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        count = db.execute(
            text(
                "SELECT count(*) FROM audit_log "
                "WHERE action = 'CREATE' AND entity_type = 'visit' AND patient_id = :pid"
            ),
            {"pid": patient["id"]},
        ).scalar_one()
        assert count == 1

    def test_future_non_scheduled_visit_rejected_422(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        future_date = str(date.today() + timedelta(days=5))
        payload = {
            "visit_date": future_date,
            "visit_type_code": _visit_type(db),
            "is_scheduled": False,
        }
        r = client.post(
            f"/api/v1/patients/{patient['id']}/visits",
            json=payload,
            headers=_auth(reception_token),
        )
        assert r.status_code == 422
        assert r.json()["error"]["details"][0]["code"] == "future_visit_date"

    def test_scheduled_visit_allows_future_date(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        future_date = str(date.today() + timedelta(days=7))
        payload = {
            "visit_date": future_date,
            "visit_type_code": _visit_type(db),
            "is_scheduled": True,
        }
        r = client.post(
            f"/api/v1/patients/{patient['id']}/visits",
            json=payload,
            headers=_auth(reception_token),
        )
        assert r.status_code == 201, r.text
        assert r.json()["is_scheduled"] is True

    def test_invalid_visit_type_code_rejected_422(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        payload = {
            "visit_date": str(date.today()),
            "visit_type_code": "NOT_VALID_TYPE",
            "is_scheduled": False,
        }
        r = client.post(
            f"/api/v1/patients/{patient['id']}/visits",
            json=payload,
            headers=_auth(reception_token),
        )
        assert r.status_code == 422
        assert any(d["field"] == "visit_type_code" for d in r.json()["error"]["details"])

    def test_invalid_doctor_id_rejected_422(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        payload = {
            "visit_date": str(date.today()),
            "visit_type_code": _visit_type(db),
            "doctor_id": str(uuid.uuid4()),  # non-existent
        }
        r = client.post(
            f"/api/v1/patients/{patient['id']}/visits",
            json=payload,
            headers=_auth(reception_token),
        )
        assert r.status_code == 422
        assert any(d["field"] == "doctor_id" for d in r.json()["error"]["details"])

    def test_patient_not_found_returns_404(
        self, client, db: Session, reception_token: str
    ) -> None:
        r = client.post(
            f"/api/v1/patients/{uuid.uuid4()}/visits",
            json={"visit_date": str(date.today()), "visit_type_code": _visit_type(db)},
            headers=_auth(reception_token),
        )
        assert r.status_code == 404

    def test_unauthenticated_returns_401(self, client, db: Session) -> None:
        r = client.post(
            f"/api/v1/patients/{uuid.uuid4()}/visits",
            json={"visit_date": str(date.today()), "visit_type_code": "NEW"},
        )
        assert r.status_code == 401


class TestVisitListAndGet:
    def test_list_visits_for_patient(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        _make_visit(client, db, patient["id"], reception_token)
        _make_visit(client, db, patient["id"], reception_token)

        r = client.get(
            f"/api/v1/patients/{patient['id']}/visits", headers=_auth(reception_token)
        )
        assert r.status_code == 200, r.text
        assert len(r.json()) == 2

    def test_get_visit_by_id(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        r = client.get(f"/api/v1/visits/{visit['id']}", headers=_auth(reception_token))
        assert r.status_code == 200, r.text
        assert r.json()["id"] == visit["id"]
        assert r.json()["patient_shell"]["id"] == patient["id"]

    def test_get_unknown_visit_returns_404(
        self, client, db: Session, reception_token: str
    ) -> None:
        r = client.get(f"/api/v1/visits/{uuid.uuid4()}", headers=_auth(reception_token))
        assert r.status_code == 404


class TestVisitUpdate:
    def test_update_visit_version_checked(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        r = client.put(
            f"/api/v1/visits/{visit['id']}",
            json={"status": "COMPLETED", "version": visit["version"]},
            headers=_auth(reception_token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "COMPLETED"
        assert r.json()["version"] == visit["version"] + 1

    def test_stale_version_returns_409(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        # First update succeeds
        client.put(
            f"/api/v1/visits/{visit['id']}",
            json={"reason": "First update", "version": visit["version"]},
            headers=_auth(reception_token),
        )
        # Second with stale version → 409
        r = client.put(
            f"/api/v1/visits/{visit['id']}",
            json={"reason": "Stale update", "version": visit["version"]},
            headers=_auth(reception_token),
        )
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "VERSION_CONFLICT"

    def test_update_non_scheduled_to_future_date_rejected(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        r = client.put(
            f"/api/v1/visits/{visit['id']}",
            json={
                "visit_date": str(date.today() + timedelta(days=10)),
                "is_scheduled": False,
                "version": visit["version"],
            },
            headers=_auth(reception_token),
        )
        assert r.status_code == 422
        assert r.json()["error"]["details"][0]["code"] == "future_visit_date"


# ── Case sheet upsert (BE-T6.2) ────────────────────────────────────────────────


class TestCaseSheetUpsert:
    def test_first_put_creates_case_sheet_returns_201(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        r = client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={"present_complaints": "Headache", "appetite": "Normal"},
            headers=_auth(doctor_token),
        )
        assert r.status_code == 201, r.text
        cs = r.json()
        assert cs["visit_id"] == visit["id"]
        assert cs["version"] == 1

        # Audit row created
        count = db.execute(
            text(
                "SELECT count(*) FROM audit_log "
                "WHERE action = 'CREATE' AND entity_type = 'case_sheet'"
            )
        ).scalar_one()
        assert count >= 1

    def test_second_put_updates_case_sheet_returns_200(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        r1 = client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={"present_complaints": "Initial"},
            headers=_auth(doctor_token),
        )
        assert r1.status_code == 201, r1.text

        r2 = client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={"present_complaints": "Updated", "version": r1.json()["version"]},
            headers=_auth(doctor_token),
        )
        assert r2.status_code == 200, r2.text

    def test_second_put_updates_without_spurious_409(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        r1 = client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={"present_complaints": "Initial"},
            headers=_auth(doctor_token),
        )
        assert r1.status_code == 201, r1.text
        v1 = r1.json()["version"]

        # Second PUT with version — should update, not 409
        r2 = client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={"present_complaints": "Updated complaint", "version": v1},
            headers=_auth(doctor_token),
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["version"] == v1 + 1
        assert r2.json()["present_complaints"] == "Updated complaint"

    def test_concurrent_update_returns_409_version_conflict(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        r1 = client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={"present_complaints": "First"},
            headers=_auth(doctor_token),
        )
        v1 = r1.json()["version"]

        # Advance version
        client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={"present_complaints": "Second", "version": v1},
            headers=_auth(doctor_token),
        )

        # Stale version → 409
        r_stale = client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={"present_complaints": "Conflict", "version": v1},
            headers=_auth(doctor_token),
        )
        assert r_stale.status_code == 409
        assert r_stale.json()["error"]["code"] == "VERSION_CONFLICT"

    def test_update_without_version_raises_conflict(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        # Create
        client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={"present_complaints": "First"},
            headers=_auth(doctor_token),
        )
        # Update without version
        r = client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={"present_complaints": "No version"},
            headers=_auth(doctor_token),
        )
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "VERSION_CONFLICT"

    def test_requires_add_consultation_permission(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        r = client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={"present_complaints": "Unauthorized"},
            headers=_auth(reception_token),  # Receptionist lacks add_consultation
        )
        assert r.status_code == 403

    def test_get_case_sheet_not_found_returns_404(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        r = client.get(
            f"/api/v1/visits/{visit['id']}/case-sheet", headers=_auth(reception_token)
        )
        assert r.status_code == 404


# ── Field-level visibility (BE-T3.x, end-to-end) ──────────────────────────────


class TestClinicalFieldVisibility:
    def test_doctor_sees_full_case_sheet(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={
                "present_complaints": "Back pain",
                "hereditary_diseases": "Diabetes",
                "past_ailments": "Malaria 2019",
                "surgeries": "Appendectomy 2020",
            },
            headers=_auth(doctor_token),
        )

        r = client.get(
            f"/api/v1/visits/{visit['id']}/case-sheet", headers=_auth(doctor_token)
        )
        assert r.status_code == 200, r.text
        cs = r.json()
        assert cs["present_complaints"] == "Back pain"
        assert cs["hereditary_diseases"] == "Diabetes"
        assert cs["past_ailments"] == "Malaria 2019"
        assert cs["surgeries"] == "Appendectomy 2020"

    def test_limited_role_sees_nulled_clinical_case_sheet_fields(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={
                "present_complaints": "Chest pain",
                "hereditary_diseases": "Heart disease",
                "past_ailments": "Hypertension",
            },
            headers=_auth(doctor_token),
        )

        r = client.get(
            f"/api/v1/visits/{visit['id']}/case-sheet", headers=_auth(reception_token)
        )
        assert r.status_code == 200, r.text
        cs = r.json()
        # Clinical content hidden from Receptionist (no view_medical_history)
        assert cs["present_complaints"] is None
        assert cs["hereditary_diseases"] is None
        assert cs["past_ailments"] is None

    def test_doctor_sees_full_consultation_note(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        r = client.post(
            f"/api/v1/visits/{visit['id']}/consultation-notes",
            json={
                "presenting_complaints": "Fever for 3 days",
                "diagnosis": "Viral fever",
                "treatment_advice": "Rest and hydration",
                "diet_advice": "Light diet",
                "yoga_advice": "No yoga",
                "review_date": str(date.today() + timedelta(days=7)),
            },
            headers=_auth(doctor_token),
        )
        assert r.status_code == 201, r.text
        note = r.json()
        assert note["diagnosis"] == "Viral fever"
        assert note["treatment_advice"] == "Rest and hydration"

    def test_limited_role_sees_nulled_clinical_note_fields(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        client.post(
            f"/api/v1/visits/{visit['id']}/consultation-notes",
            json={
                "presenting_complaints": "Knee pain",
                "diagnosis": "Osteoarthritis",
                "observations": "Crepitus on movement",
                "treatment_advice": "Physiotherapy",
                "review_date": str(date.today() + timedelta(days=14)),
            },
            headers=_auth(doctor_token),
        )

        r = client.get(
            f"/api/v1/visits/{visit['id']}/consultation-notes",
            headers=_auth(reception_token),
        )
        assert r.status_code == 200, r.text
        notes = r.json()
        assert len(notes) == 1
        # Clinical interpretation fields hidden from Receptionist
        assert notes[0]["diagnosis"] is None
        assert notes[0]["observations"] is None
        assert notes[0]["treatment_advice"] is None
        assert notes[0]["diet_advice"] is None
        assert notes[0]["yoga_advice"] is None
        # Non-clinical fields remain visible
        assert notes[0]["presenting_complaints"] == "Knee pain"
        assert notes[0]["review_date"] is not None


# ── Consultation notes append-only (BE-T6.3) ──────────────────────────────────


class TestConsultationNotes:
    def test_notes_are_append_only_history_preserved(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        client.post(
            f"/api/v1/visits/{visit['id']}/consultation-notes",
            json={"presenting_complaints": "First note", "diagnosis": "Initial dx"},
            headers=_auth(doctor_token),
        )
        client.post(
            f"/api/v1/visits/{visit['id']}/consultation-notes",
            json={"presenting_complaints": "Amendment note", "diagnosis": "Revised dx"},
            headers=_auth(doctor_token),
        )

        r = client.get(
            f"/api/v1/visits/{visit['id']}/consultation-notes",
            headers=_auth(doctor_token),
        )
        assert r.status_code == 200, r.text
        notes = r.json()
        assert len(notes) == 2
        # Both notes preserved (append-only history)
        assert notes[0]["diagnosis"] == "Initial dx"
        assert notes[1]["diagnosis"] == "Revised dx"

    def test_notes_returned_in_chronological_order(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        for i in range(3):
            client.post(
                f"/api/v1/visits/{visit['id']}/consultation-notes",
                json={"presenting_complaints": f"Note {i + 1}"},
                headers=_auth(doctor_token),
            )

        r = client.get(
            f"/api/v1/visits/{visit['id']}/consultation-notes",
            headers=_auth(doctor_token),
        )
        notes = r.json()
        assert len(notes) == 3
        # Verify chronological order (timestamps are ascending). Note: `id` is
        # a randomly-generated UUID (no insertion-order meaning), so it can't
        # serve as a tiebreaker — instead we assert directly on the submitted
        # content order, which is the thing the "chronological order" contract
        # actually promises to callers and is robust to timestamp-resolution
        # ties (PostgreSQL `now()` is transaction-scoped and could coincide).
        created_ats = [n["created_at"] for n in notes]
        assert created_ats == sorted(created_ats)
        assert [n["presenting_complaints"] for n in notes] == [
            "Note 1",
            "Note 2",
            "Note 3",
        ]

    def test_add_note_requires_add_consultation(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        r = client.post(
            f"/api/v1/visits/{visit['id']}/consultation-notes",
            json={"presenting_complaints": "Unauthorized note"},
            headers=_auth(reception_token),
        )
        assert r.status_code == 403

    def test_add_note_is_audited(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        client.post(
            f"/api/v1/visits/{visit['id']}/consultation-notes",
            json={"diagnosis": "Test audit"},
            headers=_auth(doctor_token),
        )

        count = db.execute(
            text(
                "SELECT count(*) FROM audit_log "
                "WHERE action = 'CREATE' AND entity_type = 'consultation_note'"
            )
        ).scalar_one()
        assert count >= 1


# ── RBAC for visits ────────────────────────────────────────────────────────────


class TestVisitRBAC:
    def test_unauthenticated_list_visits_returns_401(
        self, client, db: Session
    ) -> None:
        r = client.get(f"/api/v1/patients/{uuid.uuid4()}/visits")
        assert r.status_code == 401

    def test_unauthenticated_get_visit_returns_401(self, client) -> None:
        r = client.get(f"/api/v1/visits/{uuid.uuid4()}")
        assert r.status_code == 401

    def test_unauthenticated_get_case_sheet_returns_401(self, client) -> None:
        r = client.get(f"/api/v1/visits/{uuid.uuid4()}/case-sheet")
        assert r.status_code == 401

    def test_unauthenticated_list_consultation_notes_returns_401(self, client) -> None:
        r = client.get(f"/api/v1/visits/{uuid.uuid4()}/consultation-notes")
        assert r.status_code == 401

    def test_unauthenticated_post_consultation_note_returns_401(self, client) -> None:
        r = client.post(
            f"/api/v1/visits/{uuid.uuid4()}/consultation-notes",
            json={"presenting_complaints": "test"},
        )
        assert r.status_code == 401
