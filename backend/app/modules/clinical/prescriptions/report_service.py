"""Prescription PDF report — context assembly, permission checks, and audit.

Builds the prescription report context from the prescription, its items,
the patient, and the prescribing doctor, then hands off to report_pdf for
HTML->PDF rendering. Mirrors app.modules.visits.report_service (case sheet
report) per the consultation-case-sheet implementation plan.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.errors import NotFoundError
from app.modules.auth.models import User
from app.modules.clinical.prescriptions import repository as repo
from app.modules.clinical.prescriptions.models import Prescription, PrescriptionItem
from app.modules.clinical.prescriptions.report_pdf import render_prescription_pdf
from app.modules.masterdata import repository as masterdata_repo
from app.modules.patients import repository as patient_repo
from app.modules.patients.models import Patient

REPORT_TITLE = "PRESCRIPTION"

# Master-data lists whose codes need a human-readable label in the report,
# mirroring the `labelOf` lookup in PrescriptionsTab.tsx.
_LABEL_LIST_TYPES = ("medicine_route", "dosage_unit", "medicine_frequency", "duration_unit")


def _ordinal(n: int) -> str:
    if 11 <= (n % 100) <= 13:
        return f"{n}th"
    return f"{n}{('st', 'nd', 'rd')[n % 10 - 1] if n % 10 in (1, 2, 3) else 'th'}"


def _format_date(value: date | None) -> str:
    if not value:
        return ""
    return f"{_ordinal(value.day)} {value.strftime('%B %Y')}"


def _signature_line(doctor: User | None) -> str:
    return doctor.full_name if doctor is not None else ""


def _load_labels(db: Session) -> dict[str, dict[str, str]]:
    return {
        list_type: {item.code: item.label for item in masterdata_repo.list_by_type(db, list_type)}
        for list_type in _LABEL_LIST_TYPES
    }


def _label_of(labels: dict[str, dict[str, str]], list_type: str, code: str | None) -> str:
    if not code:
        return ""
    return labels.get(list_type, {}).get(code, code)


def _item_context(item: PrescriptionItem, labels: dict[str, dict[str, str]]) -> dict[str, Any]:
    duration = (
        "Ongoing"
        if item.duration_unit == "ONGOING"
        else " ".join(
            part
            for part in (item.duration, _label_of(labels, "duration_unit", item.duration_unit))
            if part
        )
    )
    return {
        "line_no": item.line_no,
        "medicine_name": item.medicine_name,
        "dosage": " ".join(
            part
            for part in (item.dosage, _label_of(labels, "dosage_unit", item.dosage_unit))
            if part
        ),
        "timing": _label_of(labels, "medicine_frequency", item.timing),
        "duration": duration,
        "application_route": _label_of(labels, "medicine_route", item.application_route),
        "usage_instruction": item.usage_instruction,
    }


def _build_context(
    db: Session, prescription: Prescription, patient: Patient, doctor: User | None
) -> dict[str, Any]:
    labels = _load_labels(db)
    return {
        "report_title": REPORT_TITLE,
        "op_number": patient.op_number,
        "prescription_date": _format_date(prescription.prescription_date),
        "full_name": patient.full_name,
        "age_years": patient.age_years,
        "gender": patient.gender,
        "items": [_item_context(item, labels) for item in prescription.items],
        "medicine_details": prescription.medicine_details,
        "instructions": prescription.instructions,
        "review_advice": prescription.review_advice,
        "signature_name": _signature_line(doctor),
    }


def generate_prescription_report_pdf(
    db: Session,
    prescription_id: uuid.UUID,
    actor_payload: dict,
    request: Any = None,
) -> tuple[bytes, str]:
    """Render the prescription PDF; returns (pdf_bytes, suggested_filename).

    Raises NotFoundError if the prescription or its patient does not exist.
    """
    prescription = repo.get_prescription_by_id(db, prescription_id)
    if prescription is None:
        raise NotFoundError(f"Prescription {prescription_id} not found")

    patient = patient_repo.get_patient_by_id(db, prescription.patient_id)
    if patient is None:
        raise NotFoundError(f"Patient {prescription.patient_id} not found")

    doctor: User | None = None
    if prescription.doctor_id is not None:
        doctor = db.execute(
            select(User).where(User.id == prescription.doctor_id)
        ).scalar_one_or_none()

    context = _build_context(db, prescription, patient, doctor)
    pdf_bytes = render_prescription_pdf(context)
    filename = f"prescription-{patient.op_number}-{prescription.prescription_date.isoformat()}.pdf"

    actor_id = uuid.UUID(actor_payload["sub"])
    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="EXPORT",
        user_id=actor_id,
        user_role=",".join(actor_payload.get("roles", [])),
        entity_type="prescription",
        entity_id=str(prescription.id),
        patient_id=patient.id,
        description="Exported prescription report (PDF)",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()

    return pdf_bytes, filename
