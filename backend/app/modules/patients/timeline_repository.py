"""Repository queries for patient timeline aggregation."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.clinical.discharge.models import DischargeSummary
from app.modules.clinical.prescriptions.models import Prescription
from app.modules.documents.models import Document
from app.modules.visits.models import CaseSheet, ConsultationNote, Visit


class FollowUpRow(NamedTuple):
    id: uuid.UUID
    follow_up_date: date
    reason: str | None
    status_code: str
    remarks: str | None


def list_visits(db: Session, patient_id: uuid.UUID) -> list[Visit]:
    return list(db.execute(select(Visit).where(Visit.patient_id == patient_id)).scalars())


def list_case_sheets(db: Session, patient_id: uuid.UUID) -> list[CaseSheet]:
    return list(db.execute(select(CaseSheet).where(CaseSheet.patient_id == patient_id)).scalars())


def list_consultation_notes(db: Session, patient_id: uuid.UUID) -> list[ConsultationNote]:
    return list(
        db.execute(
            select(ConsultationNote).where(ConsultationNote.patient_id == patient_id)
        ).scalars()
    )


def list_prescriptions(db: Session, patient_id: uuid.UUID) -> list[Prescription]:
    return list(
        db.execute(select(Prescription).where(Prescription.patient_id == patient_id)).scalars()
    )


def list_discharge_summaries(db: Session, patient_id: uuid.UUID) -> list[DischargeSummary]:
    return list(
        db.execute(
            select(DischargeSummary).where(DischargeSummary.patient_id == patient_id)
        ).scalars()
    )


def list_documents(db: Session, patient_id: uuid.UUID) -> list[Document]:
    return list(
        db.execute(
            select(Document).where(Document.patient_id == patient_id, Document.status != "DELETED")
        ).scalars()
    )


def list_follow_ups(db: Session, patient_id: uuid.UUID) -> list[FollowUpRow]:
    from sqlalchemy import text

    rows = db.execute(
        text(
            """
            SELECT id, follow_up_date, reason, status_code, remarks
            FROM follow_ups
            WHERE patient_id = :patient_id
            """
        ),
        {"patient_id": str(patient_id)},
    ).all()
    return [
        FollowUpRow(
            id=row.id,
            follow_up_date=row.follow_up_date,
            reason=row.reason,
            status_code=row.status_code,
            remarks=row.remarks,
        )
        for row in rows
    ]


def as_datetime(value: date | datetime) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value
    return datetime.combine(value, datetime.min.time(), tzinfo=UTC)
