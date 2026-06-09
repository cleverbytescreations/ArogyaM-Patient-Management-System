"""Repository for follow-ups (BE-T11.1)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.modules.followups.models import FollowUp


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
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[FollowUp], int]:
    """Return (items, total) for the follow-up queue with optional filters."""
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

    base_q = select(FollowUp)
    if conditions:
        base_q = base_q.where(and_(*conditions))

    from sqlalchemy import func as sqlfunc
    count_q = select(sqlfunc.count()).select_from(base_q.subquery())
    total: int = db.execute(count_q).scalar_one()

    items = list(
        db.execute(
            base_q.order_by(FollowUp.follow_up_date.asc(), FollowUp.created_at.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).scalars()
    )
    return items, total


def save_followup(db: Session, followup: FollowUp) -> FollowUp:
    db.flush()
    return followup
