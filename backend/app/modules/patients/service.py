"""Patient registration, profile, aliases, and search services."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.concurrency import bump_version, ensure_current_version
from app.core.errors import (
    DuplicatePatientError,
    MinIdentityError,
    NotFoundError,
    ValidationAppError,
)
from app.core.permissions import PERM_VIEW_MEDICAL_HISTORY
from app.modules.masterdata import repository as master_repo
from app.modules.patients import repository as repo
from app.modules.patients.models import Patient
from app.modules.patients.op_number import generate_op_number
from app.modules.patients.schemas import (
    PatientAliasOut,
    PatientCreateRequest,
    PatientOut,
    PatientUpdateRequest,
)
from app.modules.patients.utils import to_search_result

LOOKUP_FIELDS: dict[str, str] = {
    "op_category_code": "consultation_category",
    "gender": "gender",
    "marital_status": "marital_status",
    "dietary_preference": "dietary_preference",
    "blood_group": "blood_group",
}

MEDICAL_PROFILE_FIELDS = {"dietary_preference", "blood_group", "height_cm", "weight_kg", "remarks"}


def _actor_id(actor_payload: dict) -> uuid.UUID:
    return uuid.UUID(actor_payload["sub"])


def _role_snapshot(actor_payload: dict) -> str:
    return ",".join(actor_payload.get("roles", []))


def _validate_lookup_codes(db: Session, body: PatientCreateRequest | PatientUpdateRequest) -> None:
    details = []
    values = body.model_dump(exclude_unset=True)
    for field, data_type in LOOKUP_FIELDS.items():
        code = values.get(field)
        if code and master_repo.get_by_type_and_code(db, data_type, code) is None:
            details.append(
                {
                    "field": field,
                    "code": "invalid_lookup",
                    "message": f"Unknown {data_type} code '{code}'",
                }
            )
    if details:
        raise ValidationAppError("Invalid lookup code", details=details)


def _patient_snapshot(patient: Patient) -> dict[str, Any]:
    return PatientOut.model_validate(patient).model_dump(mode="json")


def _filtered_out(patient: Patient, actor_payload: dict) -> PatientOut:
    out = PatientOut.model_validate(patient)
    if PERM_VIEW_MEDICAL_HISTORY not in actor_payload.get("permissions", []):
        data = out.model_dump()
        for field in MEDICAL_PROFILE_FIELDS:
            data[field] = None
        return PatientOut.model_validate(data)
    return out


def _check_min_identity(body: PatientCreateRequest) -> None:
    if not any([body.mobile, body.email, body.date_of_birth, body.age_years is not None]):
        raise MinIdentityError(
            "At least one of mobile, email, date_of_birth, or age_years is required"
        )


def register_patient(
    db: Session,
    body: PatientCreateRequest,
    actor_payload: dict,
    *,
    confirm_create: bool = False,
    request=None,
) -> PatientOut:
    _check_min_identity(body)
    _validate_lookup_codes(db, body)
    duplicates = repo.find_duplicate_candidates(
        db,
        mobile=body.mobile,
        full_name=body.full_name,
        date_of_birth=body.date_of_birth,
        gender=body.gender,
    )
    if duplicates and not confirm_create:
        raise DuplicatePatientError(
            "Potential duplicate patient found",
            details=[to_search_result(p).model_dump(mode="json") for p in duplicates],
        )

    ip, ua, rid = extract_request_meta(request)
    actor_id = _actor_id(actor_payload)
    op_number = generate_op_number(db, body.op_category_code)
    patient = Patient(
        op_number=op_number,
        op_category_code=body.op_category_code,
        full_name=body.full_name,
        date_of_birth=body.date_of_birth,
        age_years=body.age_years,
        gender=body.gender,
        mobile=body.mobile,
        email=body.email,
        address_line=body.address_line,
        city=body.city,
        state=body.state,
        pincode=body.pincode,
        marital_status=body.marital_status,
        profession=body.profession,
        dietary_preference=body.dietary_preference,
        blood_group=body.blood_group,
        height_cm=body.height_cm,
        weight_kg=body.weight_kg,
        is_historical=body.is_historical,
        registration_date=body.registration_date or date.today(),
        remarks=body.remarks,
        version=1,
        created_by=actor_id,
        updated_by=actor_id,
    )
    repo.create_patient(db, patient)
    write_audit(
        db,
        action="CREATE",
        user_id=actor_id,
        user_role=_role_snapshot(actor_payload),
        entity_type="patient",
        entity_id=str(patient.id),
        patient_id=patient.id,
        new_value=_patient_snapshot(patient),
        description="Created patient profile",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return PatientOut.model_validate(patient)


def get_patient_profile(
    db: Session,
    patient_id: uuid.UUID,
    actor_payload: dict,
    request=None,
) -> PatientOut:
    patient = repo.get_patient_by_id(db, patient_id)
    if patient is None:
        raise NotFoundError(f"Patient {patient_id} not found")
    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="VIEW",
        user_id=_actor_id(actor_payload),
        user_role=_role_snapshot(actor_payload),
        entity_type="patient",
        entity_id=str(patient.id),
        patient_id=patient.id,
        description="Viewed patient profile",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return _filtered_out(patient, actor_payload)


def update_patient(
    db: Session,
    patient_id: uuid.UUID,
    body: PatientUpdateRequest,
    actor_payload: dict,
    request=None,
) -> PatientOut:
    _validate_lookup_codes(db, body)
    patient = repo.get_patient_by_id(db, patient_id)
    if patient is None:
        raise NotFoundError(f"Patient {patient_id} not found")
    ensure_current_version(patient, body.version)

    ip, ua, rid = extract_request_meta(request)
    actor_id = _actor_id(actor_payload)
    old_snap = _patient_snapshot(patient)
    changes = body.model_dump(exclude={"version"}, exclude_unset=True)
    for field, value in changes.items():
        setattr(patient, field, value)
    patient.updated_by = actor_id
    bump_version(patient)
    repo.save_patient(db, patient)

    write_audit(
        db,
        action="UPDATE",
        user_id=actor_id,
        user_role=_role_snapshot(actor_payload),
        entity_type="patient",
        entity_id=str(patient.id),
        patient_id=patient.id,
        old_value=old_snap,
        new_value=_patient_snapshot(patient),
        description="Updated patient profile",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return _filtered_out(patient, actor_payload)


def list_patient_aliases(db: Session, patient_id: uuid.UUID) -> list[PatientAliasOut]:
    if repo.get_patient_by_id(db, patient_id) is None:
        raise NotFoundError(f"Patient {patient_id} not found")
    return [PatientAliasOut.model_validate(alias) for alias in repo.list_aliases(db, patient_id)]
