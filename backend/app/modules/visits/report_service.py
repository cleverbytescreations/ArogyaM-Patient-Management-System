"""Case sheet PDF report — context assembly, permission checks, and audit (BE-T6.4).

Builds the "Online Consultations – Case Sheet" report context from the visit,
patient, case sheet, and consulting doctor, then hands off to report_pdf for
HTML->PDF rendering. Mirrors the print layout in Docs/online consulation casesheet.png.
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
from app.modules.patients import repository as patient_repo
from app.modules.patients.models import Patient
from app.modules.visits import repository as repo
from app.modules.visits.models import CaseSheet, Visit
from app.modules.visits.report_pdf import render_case_sheet_pdf

REPORT_TITLE = "CONSULTATIONS – CASE SHEET"


def _format_date(value: date | None) -> str:
    return value.strftime("%d/%m/%Y") if value else ""


def _signature_line(doctor: User | None) -> str:
    return doctor.full_name if doctor is not None else ""


def _format_measurement(value: float | None, unit: str) -> str:
    if value is None:
        return ""
    return f"{value:g} {unit}"


def _build_context(
    visit: Visit, patient: Patient, case_sheet: CaseSheet, doctor: User | None
) -> dict[str, Any]:
    return {
        "report_title": REPORT_TITLE,
        "op_number": patient.op_number,
        "visit_date": _format_date(visit.visit_date),
        "full_name": patient.full_name,
        "age_years": patient.age_years,
        "gender": patient.gender,
        "date_of_birth": _format_date(patient.date_of_birth),
        "marital_status": patient.marital_status,
        "dietary_preference": patient.dietary_preference,
        "height_display": _format_measurement(patient.height_cm, "cm"),
        "weight_display": _format_measurement(patient.weight_kg, "kg"),
        "blood_group": patient.blood_group,
        "address_line": patient.address_line,
        "profession": patient.profession,
        "mobile": patient.mobile,
        "email": patient.email,
        "appetite": case_sheet.appetite,
        "sleep": case_sheet.sleep,
        "motion": case_sheet.motion,
        "energy_level": case_sheet.energy_level,
        "hereditary_diseases_mother": case_sheet.hereditary_diseases_mother,
        "hereditary_diseases_father": case_sheet.hereditary_diseases_father,
        "show_deliveries": (patient.gender or "").upper() == "FEMALE",
        "normal_deliveries": case_sheet.normal_deliveries,
        "caesarian_deliveries": case_sheet.caesarian_deliveries,
        "surgeries": case_sheet.surgeries,
        "exercise_routine": case_sheet.exercise_routine,
        "past_ailments": case_sheet.past_ailments,
        "present_complaints": case_sheet.present_complaints,
        "other_observations": case_sheet.other_observations,
        "remarks": case_sheet.remarks,
        "signature_name": _signature_line(doctor),
    }


def generate_case_sheet_report_pdf(
    db: Session,
    visit_id: uuid.UUID,
    actor_payload: dict,
    request: Any = None,
) -> tuple[bytes, str]:
    """Render the case sheet PDF for a visit; returns (pdf_bytes, suggested_filename).

    Raises NotFoundError if the visit or its case sheet does not exist.
    """
    visit = repo.get_visit_by_id(db, visit_id)
    if visit is None:
        raise NotFoundError(f"Visit {visit_id} not found")

    patient = patient_repo.get_patient_by_id(db, visit.patient_id)
    if patient is None:
        raise NotFoundError(f"Patient {visit.patient_id} not found")

    case_sheet = repo.get_case_sheet_for_visit(db, visit_id)
    if case_sheet is None:
        raise NotFoundError(f"No case sheet for visit {visit_id}")

    doctor: User | None = None
    if visit.doctor_id is not None:
        doctor = db.execute(select(User).where(User.id == visit.doctor_id)).scalar_one_or_none()

    context = _build_context(visit, patient, case_sheet, doctor)
    pdf_bytes = render_case_sheet_pdf(context)
    filename = f"case-sheet-{patient.op_number}.pdf"

    actor_id = uuid.UUID(actor_payload["sub"])
    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="EXPORT",
        user_id=actor_id,
        user_role=",".join(actor_payload.get("roles", [])),
        entity_type="case_sheet",
        entity_id=str(case_sheet.id),
        patient_id=patient.id,
        description="Exported case sheet report (PDF)",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()

    return pdf_bytes, filename
