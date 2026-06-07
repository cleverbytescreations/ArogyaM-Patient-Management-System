"""Repository for prescriptions and prescription items (BE-T7.1)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.clinical.prescriptions.models import Prescription, PrescriptionItem
from app.modules.clinical.prescriptions.schemas import PrescriptionItemCreateRequest


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


def replace_prescription_items(
    db: Session,
    prescription: Prescription,
    items: list[PrescriptionItemCreateRequest],
) -> None:
    for item in list(prescription.items):
        db.delete(item)
    db.flush()
    prescription.items.clear()
    for idx, item_data in enumerate(items, start=1):
        prescription.items.append(
            PrescriptionItem(
                line_no=item_data.line_no or idx,
                medicine_name=item_data.medicine_name,
                dosage=item_data.dosage,
                dosage_unit=item_data.dosage_unit,
                timing=item_data.timing,
                duration=item_data.duration,
                duration_unit=item_data.duration_unit,
                usage_instruction=item_data.usage_instruction,
                application_route=item_data.application_route,
            )
        )
    db.flush()


def list_prescriptions_for_visit(db: Session, visit_id: uuid.UUID) -> list[Prescription]:
    return list(
        db.execute(
            select(Prescription)
            .options(selectinload(Prescription.items))
            .where(Prescription.visit_id == visit_id)
            .order_by(Prescription.prescription_date.desc(), Prescription.created_at.desc())
        ).scalars()
    )
