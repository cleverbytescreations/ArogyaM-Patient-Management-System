"""Clinical Stage 4 part 2 tests: prescriptions and discharge summaries.

Covers:
  BE/API-T7.1 prescriptions with structured items, RBAC, audit
  BE/API-T8.1 discharge draft/update/finalize/amend chain
  TST-T6.1 remaining clinical workflow acceptance criteria
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _make_patient(client, db: Session, token: str) -> dict:
    category = db.execute(
        text("SELECT category_code FROM op_sequence WHERE is_active = TRUE ORDER BY id LIMIT 1")
    ).scalar_one()
    payload = {
        "op_category_code": category,
        "full_name": f"Clinical Patient {uuid.uuid4().hex[:8]}",
        "mobile": f"91{uuid.uuid4().int % 10**8:08d}",
        "age_years": 41,
    }
    response = client.post("/api/v1/patients", json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    return response.json()


def _visit_type(db: Session) -> str:
    return db.execute(
        text("SELECT code FROM master_data WHERE type = 'visit_type' AND is_active = TRUE LIMIT 1")
    ).scalar_one()


def _condition_code(db: Session) -> str:
    return db.execute(
        text(
            "SELECT code FROM master_data "
            "WHERE type = 'condition_at_discharge' AND is_active = TRUE LIMIT 1"
        )
    ).scalar_one()


def _make_visit(client, db: Session, patient_id: str, token: str) -> dict:
    response = client.post(
        f"/api/v1/patients/{patient_id}/visits",
        json={
            "visit_date": str(date.today()),
            "visit_type_code": _visit_type(db),
            "is_scheduled": False,
        },
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


class TestPrescriptions:
    def test_create_list_get_prescription_with_items(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        response = client.post(
            f"/api/v1/visits/{visit['id']}/prescriptions",
            json={
                "prescription_date": str(date.today()),
                "instructions": "Take after food",
                "review_advice": "Review after 10 days",
                "medicine_details": "Fallback note",
                "items": [
                    {
                        "medicine_name": "Triphala",
                        "dosage": "1 tsp",
                        "timing": "Night",
                        "duration": "7 days",
                        "usage_instruction": "With warm water",
                        "application_route": "INTERNAL",
                    },
                    {
                        "line_no": 5,
                        "medicine_name": "Herbal oil",
                        "usage_instruction": "Apply locally",
                        "application_route": "EXTERNAL",
                    },
                ],
            },
            headers=_auth(doctor_token),
        )
        assert response.status_code == 201, response.text
        created = response.json()
        assert created["visit_id"] == visit["id"]
        assert created["patient_id"] == patient["id"]
        assert [item["line_no"] for item in created["items"]] == [1, 5]
        assert created["items"][0]["medicine_name"] == "Triphala"

        listed = client.get(
            f"/api/v1/visits/{visit['id']}/prescriptions", headers=_auth(doctor_token)
        )
        assert listed.status_code == 200, listed.text
        assert len(listed.json()) == 1
        assert listed.json()[0]["items"][1]["application_route"] == "EXTERNAL"

        fetched = client.get(f"/api/v1/prescriptions/{created['id']}", headers=_auth(doctor_token))
        assert fetched.status_code == 200, fetched.text
        assert fetched.json()["items"][0]["medicine_name"] == "Triphala"

    def test_prescription_create_requires_add_prescription(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        response = client.post(
            f"/api/v1/visits/{visit['id']}/prescriptions",
            json={"items": [{"medicine_name": "Unauthorized"}]},
            headers=_auth(reception_token),
        )
        assert response.status_code == 403

    def test_prescription_read_requires_medical_history(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)
        created = client.post(
            f"/api/v1/visits/{visit['id']}/prescriptions",
            json={"items": [{"medicine_name": "Restricted"}]},
            headers=_auth(doctor_token),
        ).json()

        response = client.get(
            f"/api/v1/prescriptions/{created['id']}", headers=_auth(reception_token)
        )
        assert response.status_code == 403

    def test_prescription_create_is_audited(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)
        client.post(
            f"/api/v1/visits/{visit['id']}/prescriptions",
            json={"items": [{"medicine_name": "Audited medicine"}]},
            headers=_auth(doctor_token),
        )

        count = db.execute(
            text(
                "SELECT count(*) FROM audit_log "
                "WHERE action = 'CREATE' AND entity_type = 'prescription' AND patient_id = :pid"
            ),
            {"pid": patient["id"]},
        ).scalar_one()
        assert count == 1


class TestDischargeSummaries:
    def test_draft_update_finalize_blocks_edit_and_amend_chain(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        created = client.post(
            f"/api/v1/visits/{visit['id']}/discharge-summary",
            json={
                "admission_date": str(date.today() - timedelta(days=4)),
                "discharge_date": str(date.today()),
                "diagnosis": "Initial diagnosis",
                "condition_at_discharge": _condition_code(db),
                "discharge_advice": "Rest",
            },
            headers=_auth(doctor_token),
        )
        assert created.status_code == 201, created.text
        draft = created.json()
        assert draft["is_finalized"] is False
        assert draft["is_superseded"] is False

        updated = client.put(
            f"/api/v1/discharge-summaries/{draft['id']}",
            json={"diagnosis": "Updated diagnosis", "version": draft["version"]},
            headers=_auth(doctor_token),
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["diagnosis"] == "Updated diagnosis"

        finalized = client.put(
            f"/api/v1/discharge-summaries/{draft['id']}/finalize",
            json={"version": updated.json()["version"]},
            headers=_auth(doctor_token),
        )
        assert finalized.status_code == 200, finalized.text
        assert finalized.json()["is_finalized"] is True
        assert finalized.json()["finalized_at"] is not None
        assert finalized.json()["version"] == updated.json()["version"] + 1

        blocked = client.put(
            f"/api/v1/discharge-summaries/{draft['id']}",
            json={"diagnosis": "Should fail", "version": finalized.json()["version"]},
            headers=_auth(doctor_token),
        )
        assert blocked.status_code == 409
        assert blocked.json()["error"]["code"] == "DISCHARGE_ALREADY_FINALIZED"

        amended = client.post(
            f"/api/v1/discharge-summaries/{draft['id']}/amend",
            json={"diagnosis": "Amended diagnosis", "discharge_advice": "Updated advice"},
            headers=_auth(doctor_token),
        )
        assert amended.status_code == 201, amended.text
        amendment = amended.json()
        assert amendment["amends_id"] == draft["id"]
        assert amendment["diagnosis"] == "Amended diagnosis"
        assert amendment["is_finalized"] is False

        current = client.get(
            f"/api/v1/visits/{visit['id']}/discharge-summary", headers=_auth(doctor_token)
        )
        assert current.status_code == 200, current.text
        assert current.json()["id"] == amendment["id"]

        history = client.get(
            f"/api/v1/visits/{visit['id']}/discharge-summary/history",
            headers=_auth(doctor_token),
        )
        assert history.status_code == 200, history.text
        summaries = history.json()
        assert [item["id"] for item in summaries] == [draft["id"], amendment["id"]]
        assert summaries[0]["is_superseded"] is True
        assert summaries[0]["superseded_by"] == amendment["id"]
        assert summaries[1]["is_superseded"] is False

    def test_discharge_date_before_admission_rejected(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        response = client.post(
            f"/api/v1/visits/{visit['id']}/discharge-summary",
            json={
                "admission_date": str(date.today()),
                "discharge_date": str(date.today() - timedelta(days=1)),
                "diagnosis": "Invalid dates",
            },
            headers=_auth(doctor_token),
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_current_summary_404_only_when_visit_has_none(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        response = client.get(
            f"/api/v1/visits/{visit['id']}/discharge-summary", headers=_auth(doctor_token)
        )
        assert response.status_code == 404

    def test_second_discharge_summary_root_is_rejected(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)
        first = client.post(
            f"/api/v1/visits/{visit['id']}/discharge-summary",
            json={"diagnosis": "First root"},
            headers=_auth(doctor_token),
        )
        assert first.status_code == 201, first.text

        second = client.post(
            f"/api/v1/visits/{visit['id']}/discharge-summary",
            json={"diagnosis": "Second root"},
            headers=_auth(doctor_token),
        )
        assert second.status_code == 409
        assert second.json()["error"]["code"] == "RESOURCE_CONFLICT"

        history = client.get(
            f"/api/v1/visits/{visit['id']}/discharge-summary/history",
            headers=_auth(doctor_token),
        )
        assert len(history.json()) == 1

    def test_amending_superseded_summary_is_rejected(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)
        root = client.post(
            f"/api/v1/visits/{visit['id']}/discharge-summary",
            json={"diagnosis": "Root summary"},
            headers=_auth(doctor_token),
        ).json()
        finalized = client.put(
            f"/api/v1/discharge-summaries/{root['id']}/finalize",
            json={"version": root["version"]},
            headers=_auth(doctor_token),
        ).json()
        first_amendment = client.post(
            f"/api/v1/discharge-summaries/{finalized['id']}/amend",
            json={"diagnosis": "First amendment"},
            headers=_auth(doctor_token),
        )
        assert first_amendment.status_code == 201, first_amendment.text

        branched = client.post(
            f"/api/v1/discharge-summaries/{finalized['id']}/amend",
            json={"diagnosis": "Branch amendment"},
            headers=_auth(doctor_token),
        )
        assert branched.status_code == 409
        assert branched.json()["error"]["code"] == "INVALID_STATE_TRANSITION"

        history = client.get(
            f"/api/v1/visits/{visit['id']}/discharge-summary/history",
            headers=_auth(doctor_token),
        ).json()
        current = [summary for summary in history if not summary["is_superseded"]]
        assert len(history) == 2
        assert len(current) == 1
        assert current[0]["id"] == first_amendment.json()["id"]

    def test_unfinalized_discharge_summary_cannot_be_amended(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)
        draft = client.post(
            f"/api/v1/visits/{visit['id']}/discharge-summary",
            json={"diagnosis": "Draft"},
            headers=_auth(doctor_token),
        ).json()

        response = client.post(
            f"/api/v1/discharge-summaries/{draft['id']}/amend",
            json={"diagnosis": "Amended draft"},
            headers=_auth(doctor_token),
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "INVALID_STATE_TRANSITION"

    def test_discharge_read_requires_medical_history(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)
        client.post(
            f"/api/v1/visits/{visit['id']}/discharge-summary",
            json={"diagnosis": "Restricted"},
            headers=_auth(doctor_token),
        )

        response = client.get(
            f"/api/v1/visits/{visit['id']}/discharge-summary",
            headers=_auth(reception_token),
        )
        assert response.status_code == 403

    def test_discharge_actions_are_audited(
        self, client, db: Session, doctor_token: str, reception_token: str
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)
        created = client.post(
            f"/api/v1/visits/{visit['id']}/discharge-summary",
            json={"diagnosis": "Audit draft"},
            headers=_auth(doctor_token),
        ).json()
        finalized = client.put(
            f"/api/v1/discharge-summaries/{created['id']}/finalize",
            json={"version": created["version"]},
            headers=_auth(doctor_token),
        ).json()
        client.post(
            f"/api/v1/discharge-summaries/{finalized['id']}/amend",
            json={"diagnosis": "Audit amendment"},
            headers=_auth(doctor_token),
        )

        actions = sorted(
            db.execute(
                text(
                    "SELECT action FROM audit_log "
                    "WHERE entity_type = 'discharge_summary' AND patient_id = :pid"
                ),
                {"pid": patient["id"]},
            )
            .scalars()
            .all()
        )
        assert actions == ["AMEND", "CREATE", "FINALIZE"]
