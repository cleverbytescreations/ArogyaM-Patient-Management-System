"""Repository for discharge summaries (BE-T8.1)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.clinical.discharge.models import DischargeSummary


def create_summary(db: Session, summary: DischargeSummary) -> DischargeSummary:
    db.add(summary)
    db.flush()
    return summary


def save_summary(db: Session, summary: DischargeSummary) -> DischargeSummary:
    db.flush()
    return summary


def get_summary_by_id(db: Session, summary_id: uuid.UUID) -> DischargeSummary | None:
    return db.execute(
        select(DischargeSummary).where(DischargeSummary.id == summary_id)
    ).scalar_one_or_none()


def list_summaries_for_visit(db: Session, visit_id: uuid.UUID) -> list[DischargeSummary]:
    return list(
        db.execute(
            select(DischargeSummary)
            .where(DischargeSummary.visit_id == visit_id)
            .order_by(DischargeSummary.created_at, DischargeSummary.id)
        ).scalars()
    )


def get_amendment_for_summary(db: Session, summary_id: uuid.UUID) -> DischargeSummary | None:
    return db.execute(
        select(DischargeSummary).where(DischargeSummary.amends_id == summary_id)
    ).scalar_one_or_none()
