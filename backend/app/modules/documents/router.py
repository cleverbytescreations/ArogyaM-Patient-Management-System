"""Document routes (API-T9.1)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_permission
from app.core.pagination import PagedResponse, PaginationParams
from app.core.permissions import (
    PERM_ADD_CONSULTATION,
    PERM_EDIT_PATIENT,
    PERM_VIEW_MEDICAL_HISTORY,
    PERM_VIEW_PATIENT,
)
from app.modules.documents import service as svc
from app.modules.documents.schemas import DocumentDownloadUrlOut, DocumentOut, DocumentUpdateRequest

patients_router = APIRouter(prefix="/patients", tags=["documents"])
router = APIRouter(prefix="/documents", tags=["documents"])

UploadDocument = Annotated[
    dict, Depends(require_permission(PERM_EDIT_PATIENT, PERM_ADD_CONSULTATION))
]
ViewDocumentMetadata = Annotated[dict, Depends(require_permission(PERM_VIEW_PATIENT))]
ViewDocumentContent = Annotated[dict, Depends(require_permission(PERM_VIEW_MEDICAL_HISTORY))]
EditDocument = Annotated[dict, Depends(require_permission(PERM_EDIT_PATIENT))]


@patients_router.post(
    "/{patient_id}/documents",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a patient document",
)
def upload_document(
    patient_id: uuid.UUID,
    payload: UploadDocument,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
    file: Annotated[UploadFile, File(...)],
    document_type_code: Annotated[str, Form(min_length=1, max_length=40)],
    visit_id: Annotated[uuid.UUID | None, Form()] = None,
    title: Annotated[str | None, Form(max_length=200)] = None,
    document_date: Annotated[date | None, Form()] = None,
    is_historical: Annotated[bool, Form()] = False,
    remarks: Annotated[str | None, Form()] = None,
) -> DocumentOut:
    return svc.upload_document(
        db,
        patient_id,
        file=file,
        document_type_code=document_type_code,
        visit_id=visit_id,
        title=title,
        document_date=document_date,
        is_historical=is_historical,
        remarks=remarks,
        actor_payload=payload,
        request=request,
    )


@patients_router.get(
    "/{patient_id}/documents",
    response_model=PagedResponse[DocumentOut],
    summary="List patient document metadata",
)
def list_patient_documents(
    patient_id: uuid.UUID,
    _: ViewDocumentMetadata,
    db: Annotated[Session, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
    status: Annotated[str | None, Query()] = None,
    document_type: Annotated[str | None, Query()] = None,
    visit_id: Annotated[uuid.UUID | None, Query()] = None,
) -> PagedResponse[DocumentOut]:
    items, total = svc.list_patient_documents(
        db,
        patient_id,
        status=status,
        document_type=document_type,
        visit_id=visit_id,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    return PagedResponse[DocumentOut](
        items=items, total=total, page=pagination.page, page_size=pagination.page_size
    )


@router.get("/{document_id}", response_model=DocumentOut, summary="Get document metadata")
def get_document(
    document_id: uuid.UUID,
    _: ViewDocumentMetadata,
    db: Annotated[Session, Depends(get_db)],
) -> DocumentOut:
    return svc.get_document(db, document_id)


@router.get("/{document_id}/content", summary="Securely stream document content")
def get_document_content(
    document_id: uuid.UUID,
    payload: ViewDocumentContent,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> StreamingResponse:
    document, download = svc.get_document_stream(db, document_id, payload, request)
    headers = {
        "Content-Disposition": f'attachment; filename="{document.file_name}"',
        "X-Content-Type-Options": "nosniff",
    }
    if download.content_length is not None:
        headers["Content-Length"] = str(download.content_length)
    return StreamingResponse(
        download.body,
        media_type=download.content_type or document.content_type or "application/octet-stream",
        headers=headers,
    )


@router.get(
    "/{document_id}/download-url",
    response_model=DocumentDownloadUrlOut,
    summary="Create a short-lived pre-signed download URL",
)
def get_download_url(
    document_id: uuid.UUID,
    payload: ViewDocumentContent,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> DocumentDownloadUrlOut:
    url, ttl = svc.create_download_url(db, document_id, payload, request)
    return DocumentDownloadUrlOut(url=url, expires_in_seconds=ttl)


@router.put("/{document_id}", response_model=DocumentOut, summary="Update document metadata")
def update_document(
    document_id: uuid.UUID,
    body: DocumentUpdateRequest,
    payload: EditDocument,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> DocumentOut:
    return svc.update_document(db, document_id, body, payload, request)
