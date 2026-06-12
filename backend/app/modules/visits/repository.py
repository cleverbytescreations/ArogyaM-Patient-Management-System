"""Repository for visits, case sheets, and consultation notes (BE-T6.1–BE-T6.3)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
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


def list_visits_for_queue(
    db: Session,
    *,
    doctor_id: uuid.UUID | None = None,
    visit_date: date | None = None,
    status: str | None = None,
) -> list[tuple[Visit, str, str, str | None]]:
    """Return (Visit, patient_full_name, patient_op_number, doctor_full_name) tuples."""
    from sqlalchemy import and_
    from sqlalchemy.orm import aliased

    from app.modules.auth.models import User
    from app.modules.patients.models import Patient

    DoctorUser = aliased(User)

    conditions = []
    if doctor_id is not None:
        conditions.append(Visit.doctor_id == doctor_id)
    if visit_date is not None:
        conditions.append(Visit.visit_date == visit_date)
    if status is not None:
        conditions.append(Visit.status == status)

    q = (
        select(Visit, Patient.full_name, Patient.op_number, DoctorUser.full_name)
        .join(Patient, Patient.id == Visit.patient_id)
        .outerjoin(DoctorUser, DoctorUser.id == Visit.doctor_id)
    )
    if conditions:
        q = q.where(and_(*conditions))
    q = q.order_by(Visit.created_at.asc())

    rows = db.execute(q).all()
    return [(row[0], row[1], row[2], row[3]) for row in rows]


def list_visits_for_register(
    db: Session,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    doctor_id: uuid.UUID | None = None,
    status: str | None = None,
    offset: int = 0,
    limit: int = 20,
) -> tuple[list[tuple[Visit, str, str, str | None, uuid.UUID | None]], int]:
    """Return (Visit, patient_name, op_number, doctor_name, doctor_id) tuples with total count."""
    from sqlalchemy import and_, func
    from sqlalchemy.orm import aliased

    from app.modules.auth.models import User
    from app.modules.patients.models import Patient

    DoctorUser = aliased(User)

    conditions = []
    if from_date is not None:
        conditions.append(Visit.visit_date >= from_date)
    if to_date is not None:
        conditions.append(Visit.visit_date <= to_date)
    if doctor_id is not None:
        conditions.append(Visit.doctor_id == doctor_id)
    if status is not None:
        conditions.append(Visit.status == status)

    base = (
        select(Visit, Patient.full_name, Patient.op_number, DoctorUser.full_name, DoctorUser.id)
        .join(Patient, Patient.id == Visit.patient_id)
        .outerjoin(DoctorUser, DoctorUser.id == Visit.doctor_id)
    )
    if conditions:
        base = base.where(and_(*conditions))

    total: int = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()

    rows = db.execute(
        base.order_by(Visit.visit_date.asc(), Visit.created_at.asc())
        .offset(offset)
        .limit(limit)
    ).all()
    return [(row[0], row[1], row[2], row[3], row[4]) for row in rows], total


def doctor_has_visit_for_patient(
    db: Session, doctor_id: uuid.UUID, patient_id: uuid.UUID
) -> bool:
    """Return True if the doctor has at least one visit recorded for the patient."""
    return db.execute(
        select(func.count()).where(
            Visit.doctor_id == doctor_id,
            Visit.patient_id == patient_id,
        )
    ).scalar_one() > 0


# ── Case sheets ────────────────────────────────────────────────────────────────


def get_case_sheet_for_visit(db: Session, visit_id: uuid.UUID) -> CaseSheet | None:
    return db.execute(
        select(CaseSheet).where(CaseSheet.visit_id == visit_id)
    ).scalar_one_or_none()


def save_case_sheet(db: Session, case_sheet: CaseSheet) -> CaseSheet:
    db.add(case_sheet)
    db.flush()
    return case_sheet


def get_visit_ids_with_case_sheet(db: Session, visit_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """Visit IDs (from the given set) that already have a case sheet recorded."""
    if not visit_ids:
        return set()
    return set(
        db.execute(
            select(CaseSheet.visit_id).where(CaseSheet.visit_id.in_(visit_ids))
        ).scalars()
    )


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


def count_consultation_notes_by_visit(
    db: Session, visit_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """Map of visit_id → consultation note count, for the given visit IDs."""
    if not visit_ids:
        return {}
    rows = db.execute(
        select(ConsultationNote.visit_id, func.count(ConsultationNote.id))
        .where(ConsultationNote.visit_id.in_(visit_ids))
        .group_by(ConsultationNote.visit_id)
    ).all()
    return {visit_id: count for visit_id, count in rows}
