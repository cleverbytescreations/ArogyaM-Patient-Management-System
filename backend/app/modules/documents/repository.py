"""Repository for document metadata queries."""

from __future__ import annotations

import uuid

from sqlalchemy import select
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


def list_documents_for_patient(db: Session, patient_id: uuid.UUID) -> list[Document]:
    return list(
        db.execute(
            select(Document)
            .where(Document.patient_id == patient_id)
            .order_by(Document.document_date.desc().nullslast(), Document.uploaded_at.desc())
        ).scalars()
    )
