"""Patient repository — all SQLAlchemy query construction for patient core."""

from __future__ import annotations

import uuid

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.modules.patients.models import Patient, PatientAlias


def create_patient(db: Session, patient: Patient) -> Patient:
    db.add(patient)
    db.flush()
    return patient


def save_patient(db: Session, patient: Patient) -> Patient:
    db.flush()
    return patient


def get_patient_by_id(db: Session, patient_id: uuid.UUID) -> Patient | None:
    return db.execute(select(Patient).where(Patient.id == patient_id)).scalar_one_or_none()


def list_aliases(db: Session, patient_id: uuid.UUID) -> list[PatientAlias]:
    return list(
        db.execute(
            select(PatientAlias)
            .where(PatientAlias.patient_id == patient_id)
            .order_by(PatientAlias.created_at.desc())
        ).scalars()
    )


def find_duplicate_candidates(
    db: Session,
    *,
    mobile: str | None,
    full_name: str,
    date_of_birth,
    gender: str | None,
    limit: int = 5,
) -> list[Patient]:
    conditions = []
    if mobile:
        conditions.append(Patient.mobile == mobile)
    demographic_match = [func.lower(Patient.full_name) == full_name.lower()]
    if date_of_birth is not None:
        demographic_match.append(Patient.date_of_birth == date_of_birth)
    if gender:
        demographic_match.append(Patient.gender == gender)
    if len(demographic_match) > 1:
        conditions.append(and_(*demographic_match))
    if not conditions:
        return []

    return list(
        db.execute(
            select(Patient)
            .where(Patient.status == "ACTIVE", or_(*conditions))
            .order_by(Patient.created_at.desc())
            .limit(limit)
        ).scalars()
    )
