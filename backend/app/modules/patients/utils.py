"""Shared patient utilities — mobile masking and search result construction."""

from __future__ import annotations

from app.modules.patients.models import Patient
from app.modules.patients.schemas import PatientSearchResult


def mask_mobile(mobile: str | None) -> str | None:
    if not mobile:
        return None
    visible = mobile[-4:]
    return f"{'*' * max(len(mobile) - 4, 0)}{visible}"


def to_search_result(patient: Patient) -> PatientSearchResult:
    return PatientSearchResult(
        id=patient.id,
        op_number=patient.op_number,
        op_category_code=patient.op_category_code,
        full_name=patient.full_name,
        age_years=patient.age_years,
        gender=patient.gender,
        mobile_masked=mask_mobile(patient.mobile),
        status=patient.status,
        registration_date=patient.registration_date,
    )
