"""Repository for document metadata queries."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.documents.models import Document


def create_document(db: Session, document: Document) -> Document:
    db.add(document)
    db.flush()
    return document


def save_document(db: Session, document: Document) -> Document:
    db.flush()
    return document


def get_document_by_id(db: Session, document_id: uuid.UUID) -> Document | None:
    return db.execute(select(Document).where(Document.id == document_id)).scalar_one_or_none()


def list_documents_for_patient(
    db: Session,
    patient_id: uuid.UUID,
    *,
    status: str | None = None,
    document_type: str | None = None,
    visit_id: uuid.UUID | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Document], int]:
    base = (
        select(Document)
        .where(Document.patient_id == patient_id)
    )
    if status:
        base = base.where(Document.status == status)
    if document_type:
        base = base.where(Document.document_type_code == document_type)
    if visit_id:
        base = base.where(Document.visit_id == visit_id)

    total: int = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    rows = list(
        db.execute(
            base
            .order_by(Document.document_date.desc().nullslast(), Document.uploaded_at.desc())
            .limit(limit)
            .offset(offset)
        ).scalars()
    )
    return rows, total
