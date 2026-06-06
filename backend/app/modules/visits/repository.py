"""Repository for visits, case sheets, and consultation notes (BE-T6.1–BE-T6.3)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.visits.models import CaseSheet, ConsultationNote, Visit


# ── Visits ─────────────────────────────────────────────────────────────────────


def create_visit(db: Session, visit: Visit) -> Visit:
    db.add(visit)
    db.flush()
    return visit


def get_visit_by_id(db: Session, visit_id: uuid.UUID) -> Visit | None:
    return db.execute(select(Visit).where(Visit.id == visit_id)).scalar_one_or_none()


def list_visits_for_patient(db: Session, patient_id: uuid.UUID) -> list[Visit]:
    return list(
        db.execute(
            select(Visit)
            .where(Visit.patient_id == patient_id)
            .order_by(Visit.visit_date.desc(), Visit.created_at.desc())
        ).scalars()
    )


def save_visit(db: Session, visit: Visit) -> Visit:
    db.flush()
    return visit


# ── Case sheets ────────────────────────────────────────────────────────────────


def get_case_sheet_for_visit(db: Session, visit_id: uuid.UUID) -> CaseSheet | None:
    return db.execute(
        select(CaseSheet).where(CaseSheet.visit_id == visit_id)
    ).scalar_one_or_none()


def save_case_sheet(db: Session, case_sheet: CaseSheet) -> CaseSheet:
    db.add(case_sheet)
    db.flush()
    return case_sheet


# ── Consultation notes ─────────────────────────────────────────────────────────


def create_consultation_note(db: Session, note: ConsultationNote) -> ConsultationNote:
    db.add(note)
    db.flush()
    return note


def list_consultation_notes(db: Session, visit_id: uuid.UUID) -> list[ConsultationNote]:
    return list(
        db.execute(
            select(ConsultationNote)
            .where(ConsultationNote.visit_id == visit_id)
            .order_by(ConsultationNote.created_at)
        ).scalars()
    )
