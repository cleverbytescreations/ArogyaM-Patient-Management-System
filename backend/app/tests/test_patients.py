"""Patient core API tests (Stage 3: BE-T3.2/T3.3, BE-T5.1, BE-T14.1, TST-T3.1)."""

from __future__ import annotations

import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _category(db: Session) -> str:
    return db.execute(
        text("SELECT category_code FROM op_sequence WHERE is_active = TRUE ORDER BY id LIMIT 1")
    ).scalar_one()


def _patient_payload(db: Session, **overrides) -> dict:
    payload = {
        "op_category_code": _category(db),
        "full_name": f"Patient {uuid.uuid4().hex[:8]}",
        "mobile": f"98{uuid.uuid4().int % 10**8:08d}",
        "gender": "MALE",
        "age_years": 36,
        "blood_group": "O_POS",
        "height_cm": 170,
        "weight_kg": 70,
        "remarks": "clinical note for audit only",
    }
    payload.update(overrides)
    return payload


def _create_patient(client, db: Session, token: str, **overrides) -> dict:
    response = client.post(
        "/api/v1/patients", json=_patient_payload(db, **overrides), headers=_auth(token)
    )
    assert response.status_code == 201, response.text
    return response.json()


class TestPatientRegistration:
    def test_registration_generates_op_number_and_audits_create(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _create_patient(client, db, reception_token)

        assert patient["op_number"]
        assert patient["version"] == 1
        assert patient["status"] == "ACTIVE"

        audit_count = db.execute(
            text(
                "SELECT count(*) FROM audit_log "
                "WHERE action = 'CREATE' AND entity_type = 'patient' AND patient_id = :pid"
            ),
            {"pid": patient["id"]},
        ).scalar_one()
        assert audit_count == 1

    def test_duplicate_advisory_can_be_overridden(
        self, client, db: Session, reception_token: str
    ) -> None:
        mobile = f"97{uuid.uuid4().int % 10**8:08d}"
        first = _create_patient(
            client, db, reception_token, full_name="Duplicate Test", mobile=mobile
        )

        duplicate_payload = _patient_payload(db, full_name="Different Name", mobile=mobile)
        response = client.post(
            "/api/v1/patients",
            json=duplicate_payload,
            headers=_auth(reception_token),
        )
        assert response.status_code == 409
        body = response.json()
        assert body["error"]["code"] == "DUPLICATE_PATIENT_SUSPECTED"
        assert body["error"]["details"][0]["id"] == first["id"]
        assert "mobile" not in body["error"]["details"][0]
        assert body["error"]["details"][0]["mobile_masked"].endswith(mobile[-4:])

        override = client.post(
            "/api/v1/patients?confirm_create=true",
            json=duplicate_payload,
            headers=_auth(reception_token),
        )
        assert override.status_code == 201, override.text
        assert override.json()["id"] != first["id"]

    def test_invalid_lookup_returns_422_invalid_lookup_code(
        self, client, db: Session, reception_token: str
    ) -> None:
        payload = _patient_payload(db, gender="NOT_A_GENDER")
        response = client.post("/api/v1/patients", json=payload, headers=_auth(reception_token))
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
        assert response.json()["error"]["details"][0]["code"] == "invalid_lookup"


class TestPatientProfile:
    def test_profile_read_is_role_filtered_and_audited(
        self, client, db: Session, admin_token: str, reception_token: str
    ) -> None:
        patient = _create_patient(client, db, reception_token)

        limited = client.get(f"/api/v1/patients/{patient['id']}", headers=_auth(reception_token))
        assert limited.status_code == 200, limited.text
        assert limited.json()["blood_group"] is None
        assert limited.json()["height_cm"] is None
        assert limited.json()["remarks"] is None

        full = client.get(f"/api/v1/patients/{patient['id']}", headers=_auth(admin_token))
        assert full.status_code == 200, full.text
        assert full.json()["blood_group"] == "O_POS"
        assert full.json()["height_cm"] == 170.0

        views = db.execute(
            text("SELECT count(*) FROM audit_log WHERE action = 'VIEW' AND patient_id = :pid"),
            {"pid": patient["id"]},
        ).scalar_one()
        assert views == 2

    def test_update_is_version_checked_and_audited(
        self, client, db: Session, reception_token: str
    ) -> None:
        patient = _create_patient(client, db, reception_token)
        update = {
            "full_name": "Updated Patient Name",
            "city": "Bengaluru",
            "version": patient["version"],
        }
        response = client.put(
            f"/api/v1/patients/{patient['id']}",
            json=update,
            headers=_auth(reception_token),
        )
        assert response.status_code == 200, response.text
        assert response.json()["full_name"] == "Updated Patient Name"
        assert response.json()["version"] == patient["version"] + 1

        stale = client.put(
            f"/api/v1/patients/{patient['id']}",
            json={"city": "Mysuru", "version": patient["version"]},
            headers=_auth(reception_token),
        )
        assert stale.status_code == 409
        assert stale.json()["error"]["code"] == "VERSION_CONFLICT"

        update_count = db.execute(
            text("SELECT count(*) FROM audit_log WHERE action = 'UPDATE' AND patient_id = :pid"),
            {"pid": patient["id"]},
        ).scalar_one()
        assert update_count == 1

    def test_aliases_endpoint_returns_old_op_numbers(
        self, client, db: Session, reception_token: str, admin_user
    ) -> None:
        patient = _create_patient(client, db, reception_token)
        db.execute(
            text(
                "INSERT INTO patient_aliases "
                "(patient_id, old_op_number, source, remarks, created_by) "
                "VALUES (:pid, :old_op, 'HISTORICAL', 'legacy import', :uid)"
            ),
            {
                "pid": patient["id"],
                "old_op": f"OLD{uuid.uuid4().hex[:8]}",
                "uid": str(admin_user.id),
            },
        )
        db.flush()

        response = client.get(
            f"/api/v1/patients/{patient['id']}/aliases", headers=_auth(reception_token)
        )
        assert response.status_code == 200, response.text
        assert response.json()[0]["source"] == "HISTORICAL"


class TestPatientValidation:
    def test_min_identity_required_returns_422(
        self, client, db: Session, reception_token: str
    ) -> None:
        payload = {
            "op_category_code": _category(db),
            "full_name": "No Contact Patient",
            # intentionally omitting mobile, email, date_of_birth, age_years
        }
        response = client.post("/api/v1/patients", json=payload, headers=_auth(reception_token))
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "MIN_IDENTITY_REQUIRED"


class TestPatientRBAC:
    def test_unauthenticated_create_returns_401(self, client, db: Session) -> None:
        response = client.post("/api/v1/patients", json=_patient_payload(db))
        assert response.status_code == 401

    def test_doctor_cannot_create_patient_returns_403(
        self, client, db: Session, doctor_token: str
    ) -> None:
        response = client.post(
            "/api/v1/patients",
            json=_patient_payload(db),
            headers=_auth(doctor_token),
        )
        assert response.status_code == 403

    def test_doctor_cannot_edit_patient_returns_403(
        self, client, db: Session, reception_token: str, doctor_token: str
    ) -> None:
        patient = _create_patient(client, db, reception_token)
        update = {"full_name": "Hacked Name", "version": patient["version"]}
        response = client.put(
            f"/api/v1/patients/{patient['id']}",
            json=update,
            headers=_auth(doctor_token),
        )
        assert response.status_code == 403


class TestPatientSearch:
    def test_search_returns_minimal_ranked_masked_results(
        self, client, db: Session, reception_token: str
    ) -> None:
        exact = _create_patient(
            client,
            db,
            reception_token,
            full_name="Arjun Exact",
            mobile="9990012345",
        )
        _create_patient(
            client,
            db,
            reception_token,
            full_name="Arjun Name",
            mobile="9990099999",
        )

        response = client.get(
            "/api/v1/patients/search?q=9990012345",
            headers=_auth(reception_token),
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["items"][0]["id"] == exact["id"]
        assert body["items"][0]["mobile_masked"] == "******2345"
        assert "remarks" not in body["items"][0]
        assert "blood_group" not in body["items"][0]

    def test_search_matches_alias_op_number(
        self, client, db: Session, reception_token: str, admin_user
    ) -> None:
        patient = _create_patient(client, db, reception_token, full_name="Alias Search")
        old_op = f"LEGACY{uuid.uuid4().hex[:6]}"
        db.execute(
            text(
                "INSERT INTO patient_aliases (patient_id, old_op_number, source, created_by) "
                "VALUES (:pid, :old_op, 'HISTORICAL', :uid)"
            ),
            {"pid": patient["id"], "old_op": old_op, "uid": str(admin_user.id)},
        )
        db.flush()

        response = client.get(
            f"/api/v1/patients/search?op_number={old_op}",
            headers=_auth(reception_token),
        )
        assert response.status_code == 200, response.text
        assert response.json()["items"][0]["id"] == patient["id"]


# ── Full lifecycle chain (TST-T3.1) ──────────────────────────────────────────


class TestPatientLifecycle:
    """TST-T3.1: register → OP → search vertical slice in a single test chain.

    This class is the canonical acceptance test for TST-T3.1.  It exercises the
    full lifecycle in one ordered sequence to confirm each stage feeds the next
    correctly.  Individual edge-cases (min-identity, duplicates, RBAC) are already
    covered by the focused test classes above; this class focuses on the happy path.
    """

    def test_register_op_search_lifecycle(
        self, client, db: Session, reception_token: str
    ) -> None:
        """
        Stage 1: Register a patient → OP number is returned, version=1.
        Stage 2: Search by exact OP number → patient ranked first.
        Stage 3: Search by mobile (q param) → masked result, no clinical fields.
        Stage 4: Search by partial name → patient found.
        """
        unique_mobile = f"91{uuid.uuid4().int % 10 ** 8:08d}"

        # — Stage 1: register ------------------------------------------------
        patient = _create_patient(
            client,
            db,
            reception_token,
            full_name="Lifecycle Full Test",
            mobile=unique_mobile,
        )
        assert patient["op_number"], "Registration must produce a non-empty OP number"
        assert patient["version"] == 1
        assert patient["status"] == "ACTIVE"
        op_number = patient["op_number"]

        # — Stage 2: search by exact OP number --------------------------------
        r_op = client.get(
            f"/api/v1/patients/search?op_number={op_number}",
            headers=_auth(reception_token),
        )
        assert r_op.status_code == 200
        items = r_op.json()["items"]
        assert items, "Search by OP number must return at least one result"
        assert items[0]["id"] == patient["id"], "Exact OP match must rank first"

        # — Stage 3: search by mobile, verify minimal-identifier contract -----
        r_mobile = client.get(
            f"/api/v1/patients/search?q={unique_mobile}",
            headers=_auth(reception_token),
        )
        assert r_mobile.status_code == 200
        mobile_result = next(
            (item for item in r_mobile.json()["items"] if item["id"] == patient["id"]),
            None,
        )
        assert mobile_result is not None, "Search by mobile must find the registered patient"
        assert "mobile_masked" in mobile_result
        assert mobile_result["mobile_masked"].endswith(unique_mobile[-4:])
        # Minimal-identifier contract: clinical/profile fields must be absent
        assert "blood_group" not in mobile_result
        assert "remarks" not in mobile_result
        assert "height_cm" not in mobile_result

        # — Stage 4: search by partial name -----------------------------------
        r_name = client.get(
            "/api/v1/patients/search?name=Lifecycle+Full",
            headers=_auth(reception_token),
        )
        assert r_name.status_code == 200
        name_ids = [item["id"] for item in r_name.json()["items"]]
        assert patient["id"] in name_ids, "Name search must find the registered patient"

    def test_role_field_filtering_in_lifecycle(
        self, client, db: Session, reception_token: str, admin_token: str
    ) -> None:
        """TST-T3.1: limited-role (Receptionist) sees filtered profile; Admin sees full profile."""
        patient = _create_patient(
            client,
            db,
            reception_token,
            full_name="RoleFilter Lifecycle",
            blood_group="A_POS",
            height_cm=175,
            weight_kg=68,
            remarks="sensitive clinical note",
        )

        # Receptionist — medical fields must be null
        limited = client.get(
            f"/api/v1/patients/{patient['id']}", headers=_auth(reception_token)
        )
        assert limited.status_code == 200
        assert limited.json()["blood_group"] is None
        assert limited.json()["height_cm"] is None
        assert limited.json()["remarks"] is None

        # Admin — full medical fields visible
        full = client.get(f"/api/v1/patients/{patient['id']}", headers=_auth(admin_token))
        assert full.status_code == 200
        assert full.json()["blood_group"] == "A_POS"
        assert full.json()["height_cm"] == 175.0
        assert full.json()["remarks"] == "sensitive clinical note"

    def test_duplicate_advisory_lifecycle(
        self, client, db: Session, reception_token: str
    ) -> None:
        """TST-T3.1: duplicate advisory fires on same mobile; confirm_create=true overrides it."""
        mobile = f"72{uuid.uuid4().int % 10 ** 8:08d}"
        first = _create_patient(
            client, db, reception_token, full_name="Duplicate Base", mobile=mobile
        )

        # Second registration with same mobile → advisory 409
        payload = _patient_payload(db, full_name="Another Name", mobile=mobile)
        resp = client.post(
            "/api/v1/patients", json=payload, headers=_auth(reception_token)
        )
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "DUPLICATE_PATIENT_SUSPECTED"
        suggestions = resp.json()["error"]["details"]
        assert any(s["id"] == first["id"] for s in suggestions)
        # Suggestion must not leak raw mobile
        assert all("mobile" not in s for s in suggestions)

        # Override with confirm_create=true → succeeds
        override = client.post(
            "/api/v1/patients?confirm_create=true",
            json=payload,
            headers=_auth(reception_token),
        )
        assert override.status_code == 201
        assert override.json()["id"] != first["id"]
