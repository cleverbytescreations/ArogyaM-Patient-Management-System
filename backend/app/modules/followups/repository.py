"""Repository for follow-ups (BE-T11.1)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import and_, exists, select
from sqlalchemy.orm import Session

from app.modules.followups.models import FollowUp
from app.modules.patients.models import Patient
from app.modules.visits.models import Visit


def create_followup(db: Session, followup: FollowUp) -> FollowUp:
    db.add(followup)
    db.flush()
    return followup


def get_followup_by_id(db: Session, followup_id: uuid.UUID) -> FollowUp | None:
    return db.execute(
        select(FollowUp).where(FollowUp.id == followup_id)
    ).scalar_one_or_none()


def list_followups_for_patient(
    db: Session,
    patient_id: uuid.UUID,
    *,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[FollowUp], int]:
    from sqlalchemy import func as sqlfunc

    base_q = select(FollowUp).where(FollowUp.patient_id == patient_id)
    total: int = db.execute(select(sqlfunc.count()).select_from(base_q.subquery())).scalar_one()
    items = list(
        db.execute(
            base_q.order_by(FollowUp.follow_up_date.asc(), FollowUp.created_at.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).scalars()
    )
    return items, total


def list_followup_queue(
    db: Session,
    *,
    status: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    assigned_to: uuid.UUID | None = None,
    patient_id: uuid.UUID | None = None,
    doctor_id: uuid.UUID | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[tuple[FollowUp, str | None]], int]:
    """Return (items, total) for the follow-up queue with optional filters.

    Each item is a (FollowUp, patient_full_name) tuple.
    """
    conditions = []
    if status:
        conditions.append(FollowUp.status_code == status)
    if from_date:
        conditions.append(FollowUp.follow_up_date >= from_date)
    if to_date:
        conditions.append(FollowUp.follow_up_date <= to_date)
    if assigned_to:
        conditions.append(FollowUp.assigned_to == assigned_to)
    if patient_id:
        conditions.append(FollowUp.patient_id == patient_id)
    if doctor_id is not None:
        conditions.append(
            exists(
                select(Visit.id).where(
                    Visit.patient_id == FollowUp.patient_id,
                    Visit.doctor_id == doctor_id,
                )
            )
        )

    from sqlalchemy import func as sqlfunc

    count_base = select(FollowUp)
    if conditions:
        count_base = count_base.where(and_(*conditions))
    total: int = db.execute(select(sqlfunc.count()).select_from(count_base.subquery())).scalar_one()

    data_q = (
        select(FollowUp, Patient.full_name)
        .join(Patient, Patient.id == FollowUp.patient_id, isouter=True)
    )
    if conditions:
        data_q = data_q.where(and_(*conditions))
    data_q = (
        data_q.order_by(FollowUp.follow_up_date.asc(), FollowUp.created_at.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    rows = db.execute(data_q).all()
    items = [(row[0], row[1]) for row in rows]
    return items, total


def save_followup(db: Session, followup: FollowUp) -> FollowUp:
    db.flush()
    return followup
