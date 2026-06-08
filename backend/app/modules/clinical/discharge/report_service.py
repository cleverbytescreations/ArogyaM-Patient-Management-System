"""Discharge summary PDF report — context assembly, permission checks, and audit.

Builds the discharge summary report context from the summary, the patient, and
the consulting doctor, then hands off to report_pdf for HTML->PDF rendering.
Mirrors app.modules.clinical.prescriptions.report_service (prescription report).
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

import markdown as _md

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.errors import NotFoundError
from app.modules.auth.models import User
from app.modules.clinical.discharge import repository as repo
from app.modules.clinical.discharge.models import DischargeSummary
from app.modules.clinical.discharge.report_pdf import render_discharge_summary_pdf
from app.modules.masterdata import repository as masterdata_repo
from app.modules.patients import repository as patient_repo
from app.modules.patients.models import Patient

REPORT_TITLE = "DISCHARGE SUMMARY"
MANTRA_LINES = ("SARVE BHAVANTU SUKHINA,", "SARVE SANTU NIRAMAYA")
FOOTER_URL = "https://arogyam.life/"


def _ordinal(n: int) -> str:
    if 11 <= (n % 100) <= 13:
        return f"{n}th"
    return f"{n}{('st', 'nd', 'rd')[n % 10 - 1] if n % 10 in (1, 2, 3) else 'th'}"


def _format_date(value: date | None) -> str:
    if not value:
        return ""
    return f"{_ordinal(value.day)} {value.strftime('%B %Y')}"


def _md_to_html(value: str | None) -> str:
    if not value or not value.strip():
        return ""
    return _md.markdown(value, extensions=["nl2br"])


def _split_lines(value: str | None) -> list[str]:
    if not value:
        return []
    return [line.strip() for line in value.splitlines() if line.strip()]


def _signature_lines(doctor: User | None) -> list[str]:
    if doctor is None:
        return []
    lines = [
        ", ".join(part for part in (doctor.full_name, doctor.qualification) if part)
    ]
    if doctor.registration_number:
        lines.append(f"Reg. No: {doctor.registration_number}")
    return lines


def _condition_narrative(db: Session, summary: DischargeSummary) -> str:
    if summary.condition_notes:
        return summary.condition_notes
    if summary.condition_at_discharge:
        item = masterdata_repo.get_by_type_and_code(
            db, "condition_at_discharge", summary.condition_at_discharge
        )
        if item is not None:
            return item.label
        return summary.condition_at_discharge
    return ""


def _build_context(
    db: Session, summary: DischargeSummary, patient: Patient, doctor: User | None
) -> dict[str, Any]:
    return {
        "report_title": REPORT_TITLE,
        "op_number": patient.op_number,
        "full_name": patient.full_name,
        "age_years": patient.age_years,
        "gender": patient.gender,
        "admission_date": _format_date(summary.admission_date),
        "discharge_date": _format_date(summary.discharge_date),
        "doctor_name": doctor.full_name if doctor is not None else "",
        "diagnosis": summary.diagnosis,
        "presenting_complaints": summary.presenting_complaints,
        "investigations_admission": _md_to_html(summary.investigations_admission),
        "treatments": _md_to_html(summary.treatments),
        "condition_narrative": _condition_narrative(db, summary),
        "follow_up_period": summary.follow_up_period,
        "discharge_advice": summary.discharge_advice,
        "medications": _split_lines(summary.medications),
        "yoga_guidance": summary.yoga_guidance,
        "signature_lines": _signature_lines(doctor),
        "mantra_lines": MANTRA_LINES,
        "footer_url": FOOTER_URL,
    }


def generate_discharge_summary_report_pdf(
    db: Session,
    summary_id: uuid.UUID,
    actor_payload: dict,
    request: Any = None,
) -> tuple[bytes, str]:
    """Render the discharge summary PDF; returns (pdf_bytes, suggested_filename).

    Raises NotFoundError if the summary or its patient does not exist.
    """
    summary = repo.get_summary_by_id(db, summary_id)
    if summary is None:
        raise NotFoundError(f"Discharge summary {summary_id} not found")

    patient = patient_repo.get_patient_by_id(db, summary.patient_id)
    if patient is None:
        raise NotFoundError(f"Patient {summary.patient_id} not found")

    doctor: User | None = None
    if summary.doctor_id is not None:
        doctor = db.execute(select(User).where(User.id == summary.doctor_id)).scalar_one_or_none()

    context = _build_context(db, summary, patient, doctor)
    pdf_bytes = render_discharge_summary_pdf(context)
    discharge_date = summary.discharge_date.isoformat() if summary.discharge_date else "draft"
    filename = f"discharge-summary-{patient.op_number}-{discharge_date}.pdf"

    actor_id = uuid.UUID(actor_payload["sub"])
    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="EXPORT",
        user_id=actor_id,
        user_role=",".join(actor_payload.get("roles", [])),
        entity_type="discharge_summary",
        entity_id=str(summary.id),
        patient_id=patient.id,
        description="Exported discharge summary report (PDF)",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()

    return pdf_bytes, filename
