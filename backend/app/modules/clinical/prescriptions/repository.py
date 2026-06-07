"""Repository for prescriptions and prescription items (BE-T7.1)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.clinical.prescriptions.models import Prescription


def create_prescription(db: Session, prescription: Prescription) -> Prescription:
    db.add(prescription)
    db.flush()
    return prescription


def get_prescription_by_id(db: Session, prescription_id: uuid.UUID) -> Prescription | None:
    return db.execute(
        select(Prescription)
        .options(selectinload(Prescription.items))
        .where(Prescription.id == prescription_id)
    ).scalar_one_or_none()


def list_prescriptions_for_visit(db: Session, visit_id: uuid.UUID) -> list[Prescription]:
    return list(
        db.execute(
            select(Prescription)
            .options(selectinload(Prescription.items))
            .where(Prescription.visit_id == visit_id)
            .order_by(Prescription.prescription_date.desc(), Prescription.created_at.desc())
        ).scalars()
    )
