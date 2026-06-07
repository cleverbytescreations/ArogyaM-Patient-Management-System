"""Document upload, metadata, and secure access services."""

from __future__ import annotations

import hashlib
import re
import shlex
import subprocess
import uuid
from datetime import date
from typing import Any

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.config import settings
from app.core.errors import (
    FileTooLargeError,
    InvalidFileTypeError,
    NotFoundError,
    ServiceUnavailableError,
    ValidationAppError,
)
from app.modules.documents import repository as repo
from app.modules.documents.models import Document
from app.modules.documents.schemas import DocumentOut, DocumentUpdateRequest
from app.modules.documents.storage import DownloadStream, storage
from app.modules.masterdata import repository as master_repo
from app.modules.patients import repository as patient_repo
from app.modules.visits import repository as visit_repo

ALLOWED_CONTENT_TYPES = {"application/pdf", "image/jpeg", "image/png"}
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
SNIFF_BYTES = 16
PRESIGNED_URL_TTL_SECONDS = 300


def _actor_id(actor_payload: dict) -> uuid.UUID:
    return uuid.UUID(actor_payload["sub"])


def _role_snapshot(actor_payload: dict) -> str:
    return ",".join(actor_payload.get("roles", []))


def _safe_file_name(name: str | None) -> str:
    raw = name or "document"
    raw = raw.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    return re.sub(r"[^A-Za-z0-9._ -]", "_", raw)[:255] or "document"


def _sniff_content_type(data: bytes) -> str:
    header = data[:SNIFF_BYTES]
    if header.startswith(b"%PDF-"):
        return "application/pdf"
    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    raise InvalidFileTypeError("Uploaded file type is not allowed")


def _validate_extension(file_name: str | None) -> None:
    safe_name = _safe_file_name(file_name).lower()
    if not any(safe_name.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise InvalidFileTypeError("Uploaded file extension is not allowed")


def _validate_document_type(db: Session, document_type_code: str) -> None:
    item = master_repo.get_by_type_and_code(db, "document_type", document_type_code)
    if item is None or not item.is_active:
        raise ValidationAppError(
            "Invalid document fields",
            details=[
                {
                    "field": "document_type_code",
                    "code": "invalid_lookup",
                    "message": f"Unknown document_type code '{document_type_code}'",
                }
            ],
        )


def _read_and_validate_file(file: UploadFile) -> tuple[bytes, str]:
    _validate_extension(file.filename)
    data = file.file.read(settings.upload_max_mb * 1024 * 1024 + 1)
    if len(data) > settings.upload_max_mb * 1024 * 1024:
        raise FileTooLargeError(f"Uploaded file exceeds {settings.upload_max_mb} MB")
    if not data:
        raise ValidationAppError(
            "Uploaded file is empty",
            details=[{"field": "file", "code": "empty_file", "message": "File cannot be empty"}],
        )
    sniffed = _sniff_content_type(data)
    if file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES:
        raise InvalidFileTypeError("Uploaded file type is not allowed")
    if file.content_type and file.content_type != sniffed:
        raise InvalidFileTypeError("Uploaded file content does not match declared type")
    return data, sniffed


def _scan_file_if_enabled(data: bytes) -> None:
    if not settings.av_scan_enabled:
        return None
    if not settings.av_scan_command:
        raise ServiceUnavailableError("AV scan is enabled but no scanner command is configured")
    try:
        result = subprocess.run(
            shlex.split(settings.av_scan_command),
            input=data,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ServiceUnavailableError("Document malware scan is unavailable") from exc
    if result.returncode != 0:
        raise InvalidFileTypeError("Uploaded file failed malware scan")
    return None


def _snapshot(document: Document) -> dict:
    return DocumentOut.model_validate(document).model_dump(mode="json")


def upload_document(
    db: Session,
    patient_id: uuid.UUID,
    *,
    file: UploadFile,
    document_type_code: str,
    actor_payload: dict,
    visit_id: uuid.UUID | None = None,
    title: str | None = None,
    document_date: date | None = None,
    is_historical: bool = False,
    remarks: str | None = None,
    request: Any = None,
) -> DocumentOut:
    patient = patient_repo.get_patient_by_id(db, patient_id)
    if patient is None:
        raise NotFoundError(f"Patient {patient_id} not found")
    _validate_document_type(db, document_type_code)
    if visit_id is not None:
        visit = visit_repo.get_visit_by_id(db, visit_id)
        if visit is None or visit.patient_id != patient_id:
            raise ValidationAppError(
                "Invalid document fields",
                details=[
                    {
                        "field": "visit_id",
                        "code": "invalid_visit",
                        "message": "Visit does not exist for this patient",
                    }
                ],
            )

    data, content_type = _read_and_validate_file(file)
    _scan_file_if_enabled(data)
    checksum = hashlib.sha256(data).hexdigest()
    document_id = uuid.uuid4()
    object_key = f"patients/{patient_id}/documents/{document_id}"
    storage.upload_bytes(object_key, data, content_type)

    actor_id = _actor_id(actor_payload)
    document = Document(
        id=document_id,
        patient_id=patient_id,
        visit_id=visit_id,
        document_type_code=document_type_code,
        title=title,
        file_name=_safe_file_name(file.filename),
        storage_ref=object_key,
        content_type=content_type,
        file_size_bytes=len(data),
        checksum_sha256=checksum,
        document_date=document_date,
        is_historical=is_historical,
        status="ACTIVE",
        remarks=remarks,
        uploaded_by=actor_id,
        updated_by=actor_id,
    )
    repo.create_document(db, document)

    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="UPLOAD",
        user_id=actor_id,
        user_role=_role_snapshot(actor_payload),
        entity_type="document",
        entity_id=str(document.id),
        patient_id=patient_id,
        new_value={
            "id": str(document.id),
            "document_type_code": document.document_type_code,
            "content_type": document.content_type,
            "file_size_bytes": document.file_size_bytes,
            "checksum_sha256": document.checksum_sha256,
        },
        description="Uploaded document metadata",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return DocumentOut.model_validate(document)


def list_patient_documents(
    db: Session,
    patient_id: uuid.UUID,
    *,
    status: str | None = None,
    document_type: str | None = None,
    visit_id: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[DocumentOut], int]:
    if patient_repo.get_patient_by_id(db, patient_id) is None:
        raise NotFoundError(f"Patient {patient_id} not found")
    documents, total = repo.list_documents_for_patient(
        db,
        patient_id,
        status=status,
        document_type=document_type,
        visit_id=visit_id,
        limit=page_size,
        offset=(page - 1) * page_size,
    )
    return [DocumentOut.model_validate(doc) for doc in documents], total


def get_document(db: Session, document_id: uuid.UUID) -> DocumentOut:
    document = repo.get_document_by_id(db, document_id)
    if document is None:
        raise NotFoundError(f"Document {document_id} not found")
    return DocumentOut.model_validate(document)


def get_document_stream(
    db: Session, document_id: uuid.UUID, actor_payload: dict, request: Any = None
) -> tuple[Document, DownloadStream]:
    document = repo.get_document_by_id(db, document_id)
    if document is None or document.status == "DELETED":
        raise NotFoundError(f"Document {document_id} not found")
    stream = storage.stream(document.storage_ref)
    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="DOWNLOAD",
        user_id=_actor_id(actor_payload),
        user_role=_role_snapshot(actor_payload),
        entity_type="document",
        entity_id=str(document.id),
        patient_id=document.patient_id,
        new_value={"id": str(document.id), "content_type": document.content_type},
        description="Accessed document content",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return document, stream


def create_download_url(
    db: Session, document_id: uuid.UUID, actor_payload: dict, request: Any = None
) -> tuple[str, int]:
    document = repo.get_document_by_id(db, document_id)
    if document is None or document.status == "DELETED":
        raise NotFoundError(f"Document {document_id} not found")
    url = storage.presigned_url(document.storage_ref, PRESIGNED_URL_TTL_SECONDS)
    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="PRESIGN",
        user_id=_actor_id(actor_payload),
        user_role=_role_snapshot(actor_payload),
        entity_type="document",
        entity_id=str(document.id),
        patient_id=document.patient_id,
        new_value={"id": str(document.id), "expires_in_seconds": PRESIGNED_URL_TTL_SECONDS},
        description="Created short-lived document download URL",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return url, PRESIGNED_URL_TTL_SECONDS


def update_document(
    db: Session,
    document_id: uuid.UUID,
    body: DocumentUpdateRequest,
    actor_payload: dict,
    request: Any = None,
) -> DocumentOut:
    document = repo.get_document_by_id(db, document_id)
    if document is None:
        raise NotFoundError(f"Document {document_id} not found")
    if body.document_type_code is not None:
        _validate_document_type(db, body.document_type_code)

    old_snap = _snapshot(document)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(document, field, value)
    document.updated_by = _actor_id(actor_payload)
    repo.save_document(db, document)

    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="UPDATE",
        user_id=document.updated_by,
        user_role=_role_snapshot(actor_payload),
        entity_type="document",
        entity_id=str(document.id),
        patient_id=document.patient_id,
        old_value=old_snap,
        new_value=_snapshot(document),
        description="Updated document metadata",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return DocumentOut.model_validate(document)
