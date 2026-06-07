"""Document storage/access and patient timeline tests."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import date, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.modules.documents import service as document_service
from app.modules.documents.storage import DownloadStream, StoredObject


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}
        self.stream_calls = 0

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> StoredObject:
        self.objects[key] = (data, content_type)
        return StoredObject(key=key, bucket="fake")

    def stream(self, key: str) -> DownloadStream:
        self.stream_calls += 1
        data, content_type = self.objects[key]

        def _chunks() -> Iterator[bytes]:
            yield data

        return DownloadStream(body=_chunks(), content_type=content_type, content_length=len(data))

    def presigned_url(self, key: str, expires_in_seconds: int) -> str:
        return f"https://storage.invalid/{key}?expires={expires_in_seconds}&signature=fake"


@pytest.fixture
def fake_storage(monkeypatch) -> FakeStorage:
    storage = FakeStorage()
    monkeypatch.setattr(document_service, "storage", storage)
    return storage


def _make_patient(client, db: Session, token: str) -> dict:
    category = db.execute(
        text("SELECT category_code FROM op_sequence WHERE is_active = TRUE ORDER BY id LIMIT 1")
    ).scalar_one()
    response = client.post(
        "/api/v1/patients",
        json={
            "op_category_code": category,
            "full_name": f"Document Patient {uuid.uuid4().hex[:8]}",
            "mobile": f"98{uuid.uuid4().int % 10**8:08d}",
            "age_years": 37,
        },
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _visit_type(db: Session) -> str:
    return db.execute(
        text("SELECT code FROM master_data WHERE type = 'visit_type' AND is_active = TRUE LIMIT 1")
    ).scalar_one()


def _doc_type(db: Session) -> str:
    return db.execute(
        text(
            "SELECT code FROM master_data WHERE type = 'document_type' AND is_active = TRUE LIMIT 1"
        )
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


def _upload_pdf(
    client,
    db: Session,
    patient_id: str,
    token: str,
    title: str = "Lab report",
) -> dict:
    response = client.post(
        f"/api/v1/patients/{patient_id}/documents",
        data={"document_type_code": _doc_type(db), "title": title},
        files={"file": ("report.pdf", b"%PDF-1.7\nsample", "application/pdf")},
        headers=_auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


class TestDocuments:
    def test_upload_lists_metadata_and_audits(
        self, client, db: Session, reception_token: str, fake_storage: FakeStorage
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        created = _upload_pdf(client, db, patient["id"], reception_token)

        assert created["patient_id"] == patient["id"]
        assert created["content_type"] == "application/pdf"
        assert created["file_size_bytes"] == len(b"%PDF-1.7\nsample")
        assert created["checksum_sha256"]
        assert created["status"] == "ACTIVE"
        assert len(fake_storage.objects) == 1

        listed = client.get(
            f"/api/v1/patients/{patient['id']}/documents", headers=_auth(reception_token)
        )
        assert listed.status_code == 200, listed.text
        assert listed.json()[0]["id"] == created["id"]

        audit_count = db.execute(
            text(
                "SELECT count(*) FROM audit_log "
                "WHERE action = 'UPLOAD' AND entity_type = 'document' AND patient_id = :pid"
            ),
            {"pid": patient["id"]},
        ).scalar_one()
        assert audit_count == 1

    def test_upload_rejects_sniffed_bad_type(
        self, client, db: Session, reception_token: str, fake_storage: FakeStorage
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        response = client.post(
            f"/api/v1/patients/{patient['id']}/documents",
            data={"document_type_code": _doc_type(db)},
            files={"file": ("note.txt", b"plain text", "text/plain")},
            headers=_auth(reception_token),
        )
        assert response.status_code == 415
        assert response.json()["error"]["code"] == "INVALID_FILE_TYPE"
        assert fake_storage.objects == {}

    def test_upload_rejects_oversized_file(
        self, client, db: Session, reception_token: str, fake_storage: FakeStorage, monkeypatch
    ) -> None:
        monkeypatch.setattr(document_service.settings, "upload_max_mb", 0)
        patient = _make_patient(client, db, reception_token)
        response = client.post(
            f"/api/v1/patients/{patient['id']}/documents",
            data={"document_type_code": _doc_type(db)},
            files={"file": ("report.pdf", b"%PDF-1.7\nsample", "application/pdf")},
            headers=_auth(reception_token),
        )
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "FILE_TOO_LARGE"
        assert fake_storage.objects == {}

    def test_enabled_av_hook_rejects_failed_scan(
        self, client, db: Session, reception_token: str, fake_storage: FakeStorage, monkeypatch
    ) -> None:
        monkeypatch.setattr(document_service.settings, "av_scan_enabled", True)
        monkeypatch.setattr(document_service.settings, "av_scan_command", "false")
        patient = _make_patient(client, db, reception_token)
        response = client.post(
            f"/api/v1/patients/{patient['id']}/documents",
            data={"document_type_code": _doc_type(db)},
            files={"file": ("report.pdf", b"%PDF-1.7\nsample", "application/pdf")},
            headers=_auth(reception_token),
        )
        assert response.status_code == 415
        assert response.json()["error"]["code"] == "INVALID_FILE_TYPE"
        assert fake_storage.objects == {}

    def test_secure_stream_and_presigned_url_are_medical_permission_gated_and_audited(
        self,
        client,
        db: Session,
        doctor_token: str,
        reception_token: str,
        fake_storage: FakeStorage,
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        created = _upload_pdf(client, db, patient["id"], reception_token)

        denied = client.get(
            f"/api/v1/documents/{created['id']}/content", headers=_auth(reception_token)
        )
        assert denied.status_code == 403
        assert fake_storage.stream_calls == 0

        streamed = client.get(
            f"/api/v1/documents/{created['id']}/content", headers=_auth(doctor_token)
        )
        assert streamed.status_code == 200, streamed.text
        assert streamed.content == b"%PDF-1.7\nsample"
        assert streamed.headers["content-type"].startswith("application/pdf")
        assert "storage.invalid" not in streamed.text

        presigned = client.get(
            f"/api/v1/documents/{created['id']}/download-url", headers=_auth(doctor_token)
        )
        assert presigned.status_code == 200, presigned.text
        assert presigned.json()["expires_in_seconds"] == 300
        assert "expires=300" in presigned.json()["url"]

        actions = sorted(
            db.execute(
                text(
                    "SELECT action FROM audit_log "
                    "WHERE entity_type = 'document' AND entity_id = :doc_id"
                ),
                {"doc_id": created["id"]},
            )
            .scalars()
            .all()
        )
        assert actions == ["DOWNLOAD", "PRESIGN", "UPLOAD"]

    def test_upload_rejects_disguised_file_type(
        self, client, db: Session, reception_token: str, fake_storage: FakeStorage
    ) -> None:
        """SEC-T9.1: file with .pdf extension but non-PDF magic bytes must be rejected."""
        patient = _make_patient(client, db, reception_token)
        response = client.post(
            f"/api/v1/patients/{patient['id']}/documents",
            data={"document_type_code": _doc_type(db)},
            files={"file": ("malicious.pdf", b"MZ\x90\x00evil_executable", "application/pdf")},
            headers=_auth(reception_token),
        )
        assert response.status_code == 415
        assert response.json()["error"]["code"] == "INVALID_FILE_TYPE"
        assert fake_storage.objects == {}

    def test_denied_content_access_does_not_create_audit_entry(
        self,
        client,
        db: Session,
        reception_token: str,
        doctor_token: str,
        fake_storage: FakeStorage,
    ) -> None:
        """SEC-T9.2: an unauthorized /content request must not write a DOWNLOAD audit row."""
        patient = _make_patient(client, db, reception_token)
        doc = _upload_pdf(client, db, patient["id"], reception_token)

        denied = client.get(
            f"/api/v1/documents/{doc['id']}/content", headers=_auth(reception_token)
        )
        assert denied.status_code == 403

        download_count = db.execute(
            text(
                "SELECT count(*) FROM audit_log "
                "WHERE action = 'DOWNLOAD' AND entity_id = :doc_id"
            ),
            {"doc_id": doc["id"]},
        ).scalar_one()
        assert download_count == 0

    def test_metadata_update_and_soft_delete(
        self, client, db: Session, reception_token: str, fake_storage: FakeStorage
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        created = _upload_pdf(client, db, patient["id"], reception_token)
        response = client.put(
            f"/api/v1/documents/{created['id']}",
            json={"title": "Archived report", "status": "DELETED"},
            headers=_auth(reception_token),
        )
        assert response.status_code == 200, response.text
        assert response.json()["title"] == "Archived report"
        assert response.json()["status"] == "DELETED"


class TestTimeline:
    def test_timeline_merges_sources_and_filters_limited_medical_summary(
        self,
        client,
        db: Session,
        doctor_token: str,
        reception_token: str,
        fake_storage: FakeStorage,
    ) -> None:
        patient = _make_patient(client, db, reception_token)
        visit = _make_visit(client, db, patient["id"], reception_token)

        case_sheet = client.put(
            f"/api/v1/visits/{visit['id']}/case-sheet",
            json={"present_complaints": "Private complaint"},
            headers=_auth(doctor_token),
        )
        assert case_sheet.status_code == 201, case_sheet.text

        note = client.post(
            f"/api/v1/visits/{visit['id']}/consultation-notes",
            json={"diagnosis": "Sensitive diagnosis", "review_date": str(date.today())},
            headers=_auth(doctor_token),
        )
        assert note.status_code == 201, note.text

        prescription = client.post(
            f"/api/v1/visits/{visit['id']}/prescriptions",
            json={"items": [{"medicine_name": "Timeline medicine"}]},
            headers=_auth(doctor_token),
        )
        assert prescription.status_code == 201, prescription.text

        discharge = client.post(
            f"/api/v1/visits/{visit['id']}/discharge-summary",
            json={
                "admission_date": str(date.today() - timedelta(days=1)),
                "discharge_date": str(date.today()),
                "diagnosis": "Discharge diagnosis",
                "condition_at_discharge": _condition_code(db),
            },
            headers=_auth(doctor_token),
        )
        assert discharge.status_code == 201, discharge.text

        document = _upload_pdf(client, db, patient["id"], reception_token, title="Timeline report")

        follow_up_id = uuid.uuid4()
        db.execute(
            text(
                """
                INSERT INTO follow_ups (
                    id, patient_id, visit_id, follow_up_date, reason, status_code, created_by
                ) VALUES (
                    :id, :patient_id, :visit_id, CURRENT_DATE, 'Review call', 'PENDING', :created_by
                )
                """
            ),
            {
                "id": str(follow_up_id),
                "patient_id": patient["id"],
                "visit_id": visit["id"],
                "created_by": patient["created_by"] if "created_by" in patient else None,
            },
        )

        doctor_view = client.get(
            f"/api/v1/patients/{patient['id']}/timeline", headers=_auth(doctor_token)
        )
        assert doctor_view.status_code == 200, doctor_view.text
        events = doctor_view.json()
        event_types = {event["type"] for event in events}
        assert {
            "visit",
            "case_sheet",
            "consultation_note",
            "prescription",
            "discharge_summary",
            "document",
            "follow_up",
        }.issubset(event_types)
        assert events == sorted(events, key=lambda item: item["occurred_on"], reverse=True)
        assert any("Sensitive diagnosis" in event["summary"] for event in events)
        assert any(event["ref_id"] == document["id"] for event in events)

        reception_view = client.get(
            f"/api/v1/patients/{patient['id']}/timeline", headers=_auth(reception_token)
        )
        assert reception_view.status_code == 200, reception_view.text
        reception_summaries = " ".join(event["summary"] for event in reception_view.json())
        assert "Sensitive diagnosis" not in reception_summaries
        assert "Discharge diagnosis" not in reception_summaries
