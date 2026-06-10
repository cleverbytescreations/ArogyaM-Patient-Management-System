"""Doctor signature upload, secure access, and report embedding tests."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.modules.auth.models import User
from app.modules.documents.storage import DownloadStream, StoredObject
from app.modules.users import service as user_service
from app.modules.users import signature_assets

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"fake-signature-image-data"
JPEG_BYTES = b"\xff\xd8\xff" + b"fake-jpeg-signature-data"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> StoredObject:
        self.objects[key] = (data, content_type)
        return StoredObject(key=key, bucket="fake")

    def stream(self, key: str) -> DownloadStream:
        data, content_type = self.objects[key]

        def _chunks() -> Iterator[bytes]:
            yield data

        return DownloadStream(body=_chunks(), content_type=content_type, content_length=len(data))


@pytest.fixture
def fake_storage(monkeypatch) -> FakeStorage:
    storage = FakeStorage()
    monkeypatch.setattr(user_service, "storage", storage)
    monkeypatch.setattr(signature_assets, "storage", storage)
    return storage


def _upload(
    client, user_id, token, *, data=PNG_BYTES, filename="sig.png", content_type="image/png"
):
    return client.put(
        f"/api/v1/users/{user_id}/signature",
        files={"file": (filename, data, content_type)},
        headers=_auth(token),
    )


def test_upload_signature_happy_path(client, fake_storage, doctor_user, admin_token, db: Session):
    response = _upload(client, doctor_user.id, admin_token)
    assert response.status_code == 200, response.text
    assert response.json()["has_signature"] is True

    key = f"doctors/{doctor_user.id}/signature"
    assert key in fake_storage.objects
    assert fake_storage.objects[key] == (PNG_BYTES, "image/png")

    audit = db.execute(
        text(
            "SELECT action, entity_type FROM audit_log "
            "WHERE entity_type = 'user_signature' AND entity_id = :eid"
        ),
        {"eid": str(doctor_user.id)},
    ).fetchone()
    assert audit is not None
    assert audit.action == "UPLOAD"


def test_upload_jpeg_signature(client, fake_storage, doctor_user, admin_token):
    response = _upload(
        client, doctor_user.id, admin_token,
        data=JPEG_BYTES, filename="sig.jpg", content_type="image/jpeg",
    )
    assert response.status_code == 200, response.text


def test_upload_rejected_for_non_doctor(client, fake_storage, admin_user, admin_token):
    response = _upload(client, admin_user.id, admin_token)
    assert response.status_code == 422


def test_upload_rejects_non_image(client, fake_storage, doctor_user, admin_token):
    response = _upload(
        client, doctor_user.id, admin_token,
        data=b"%PDF-1.7 not an image", filename="sig.pdf", content_type="application/pdf",
    )
    assert response.status_code == 415


def test_upload_requires_manage_users(client, fake_storage, doctor_user, reception_token):
    response = _upload(client, doctor_user.id, reception_token)
    assert response.status_code == 403


def test_get_signature_streams_bytes(client, fake_storage, doctor_user, admin_token):
    _upload(client, doctor_user.id, admin_token)
    response = client.get(
        f"/api/v1/users/{doctor_user.id}/signature", headers=_auth(admin_token)
    )
    assert response.status_code == 200
    assert response.content == PNG_BYTES
    assert response.headers["content-type"] == "image/png"


def test_get_signature_404_when_absent(client, fake_storage, doctor_user, admin_token):
    response = client.get(
        f"/api/v1/users/{doctor_user.id}/signature", headers=_auth(admin_token)
    )
    assert response.status_code == 404


def test_delete_signature_clears_columns(
    client, fake_storage, doctor_user, admin_token, db: Session
):
    _upload(client, doctor_user.id, admin_token)
    response = client.delete(
        f"/api/v1/users/{doctor_user.id}/signature", headers=_auth(admin_token)
    )
    assert response.status_code == 204

    db.expire_all()
    refreshed = db.get(User, doctor_user.id)
    assert refreshed.signature_object_key is None
    assert refreshed.signature_content_type is None

    follow_up = client.get(
        f"/api/v1/users/{doctor_user.id}/signature", headers=_auth(admin_token)
    )
    assert follow_up.status_code == 404


def test_signature_data_uri_present_and_absent(
    client, fake_storage, doctor_user, admin_token, db: Session
):
    # No signature yet -> None
    assert signature_assets.signature_data_uri(None) is None
    fresh = db.get(User, doctor_user.id)
    assert signature_assets.signature_data_uri(fresh) is None

    _upload(client, doctor_user.id, admin_token)
    db.expire_all()
    refreshed = db.get(User, doctor_user.id)
    uri = signature_assets.signature_data_uri(refreshed)
    assert uri is not None
    assert uri.startswith("data:image/png;base64,")
