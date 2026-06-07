"""Prescription service layer (BE-T7.1)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.errors import NotFoundError, ValidationAppError
from app.modules.auth import repository as auth_repo
from app.modules.clinical.prescriptions import repository as repo
from app.modules.clinical.prescriptions.models import Prescription, PrescriptionItem
from app.modules.clinical.prescriptions.schemas import PrescriptionCreateRequest, PrescriptionOut
from app.modules.visits import repository as visit_repo


def _actor_id(actor_payload: dict) -> uuid.UUID:
    return uuid.UUID(actor_payload["sub"])


def _role_snapshot(actor_payload: dict) -> str:
    return ",".join(actor_payload.get("roles", []))


def _snapshot(prescription: Prescription) -> dict:
    return PrescriptionOut.model_validate(prescription).model_dump(mode="json")


def _validate_doctor(db: Session, doctor_id: uuid.UUID | None) -> None:
    if doctor_id is None:
        return
    doctor = auth_repo.get_user_by_id(db, doctor_id)
    if doctor is None or not doctor.is_doctor:
        raise ValidationAppError(
            "Invalid prescription fields",
            details=[
                {
                    "field": "doctor_id",
                    "code": "invalid_doctor",
                    "message": f"User '{doctor_id}' is not a doctor or does not exist",
                }
            ],
        )


def create_prescription(
    db: Session,
    visit_id: uuid.UUID,
    body: PrescriptionCreateRequest,
    actor_payload: dict,
    request: Any = None,
) -> PrescriptionOut:
    visit = visit_repo.get_visit_by_id(db, visit_id)
    if visit is None:
        raise NotFoundError(f"Visit {visit_id} not found")
    _validate_doctor(db, body.doctor_id)

    actor_id = _actor_id(actor_payload)
    prescription = Prescription(
        visit_id=visit_id,
        patient_id=visit.patient_id,
        doctor_id=body.doctor_id,
        prescription_date=body.prescription_date or date.today(),
        instructions=body.instructions,
        review_advice=body.review_advice,
        medicine_details=body.medicine_details,
        version=1,
        created_by=actor_id,
        updated_by=actor_id,
    )
    for idx, item in enumerate(body.items, start=1):
        prescription.items.append(
            PrescriptionItem(
                line_no=item.line_no or idx,
                medicine_name=item.medicine_name,
                dosage=item.dosage,
                timing=item.timing,
                duration=item.duration,
                usage_instruction=item.usage_instruction,
                application_route=item.application_route,
            )
        )

    line_numbers = [item.line_no for item in prescription.items]
    if len(line_numbers) != len(set(line_numbers)):
        raise ValidationAppError(
            "Duplicate prescription item line_no values are not allowed",
            details=[
                {
                    "field": "items.line_no",
                    "code": "duplicate_line_no",
                    "message": "Each prescription item line_no must be unique",
                }
            ],
        )

    repo.create_prescription(db, prescription)
    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="CREATE",
        user_id=actor_id,
        user_role=_role_snapshot(actor_payload),
        entity_type="prescription",
        entity_id=str(prescription.id),
        patient_id=visit.patient_id,
        new_value=_snapshot(prescription),
        description="Created prescription",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return PrescriptionOut.model_validate(prescription)


def list_prescriptions(
    db: Session, visit_id: uuid.UUID, actor_payload: dict
) -> list[PrescriptionOut]:
    visit = visit_repo.get_visit_by_id(db, visit_id)
    if visit is None:
        raise NotFoundError(f"Visit {visit_id} not found")
    return [
        PrescriptionOut.model_validate(rx) for rx in repo.list_prescriptions_for_visit(db, visit_id)
    ]


def get_prescription(
    db: Session, prescription_id: uuid.UUID, actor_payload: dict
) -> PrescriptionOut:
    prescription = repo.get_prescription_by_id(db, prescription_id)
    if prescription is None:
        raise NotFoundError(f"Prescription {prescription_id} not found")
    return PrescriptionOut.model_validate(prescription)
