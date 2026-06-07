"""Discharge summary service with finalize/amend chain (BE-T8.1)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.concurrency import bump_version, ensure_current_version
from app.core.errors import (
    ConflictError,
    DischargeAlreadyFinalizedError,
    InvalidStateTransitionError,
    NotFoundError,
    ValidationAppError,
)
from app.modules.auth import repository as auth_repo
from app.modules.clinical.discharge import repository as repo
from app.modules.clinical.discharge.models import DischargeSummary
from app.modules.clinical.discharge.schemas import (
    DischargeSummaryAmendRequest,
    DischargeSummaryCreateRequest,
    DischargeSummaryFinalizeRequest,
    DischargeSummaryOut,
    DischargeSummaryUpdateRequest,
)
from app.modules.masterdata import repository as master_repo
from app.modules.visits import repository as visit_repo

_FIELD_NAMES = {
    "doctor_id",
    "admission_date",
    "discharge_date",
    "diagnosis",
    "presenting_complaints",
    "investigations_admission",
    "treatments",
    "condition_at_discharge",
    "follow_up_period",
    "discharge_advice",
    "medications",
    "yoga_guidance",
}


def _actor_id(actor_payload: dict) -> uuid.UUID:
    return uuid.UUID(actor_payload["sub"])


def _role_snapshot(actor_payload: dict) -> str:
    return ",".join(actor_payload.get("roles", []))


def _validate_dates(admission_date, discharge_date) -> None:
    if (
        admission_date is not None
        and discharge_date is not None
        and discharge_date < admission_date
    ):
        raise ValidationAppError(
            "Discharge date cannot be before admission date",
            details=[
                {
                    "field": "discharge_date",
                    "code": "invalid_discharge_date",
                    "message": "discharge_date must be on or after admission_date",
                }
            ],
        )


def _validate_condition(db: Session, condition_at_discharge: str | None) -> None:
    if condition_at_discharge is None:
        return
    if (
        master_repo.get_by_type_and_code(db, "condition_at_discharge", condition_at_discharge)
        is None
    ):
        raise ValidationAppError(
            "Invalid discharge summary fields",
            details=[
                {
                    "field": "condition_at_discharge",
                    "code": "invalid_lookup",
                    "message": f"Unknown condition_at_discharge code '{condition_at_discharge}'",
                }
            ],
        )


def _validate_doctor(db: Session, doctor_id: uuid.UUID | None) -> None:
    if doctor_id is None:
        return
    doctor = auth_repo.get_user_by_id(db, doctor_id)
    if doctor is None or not doctor.is_doctor:
        raise ValidationAppError(
            "Invalid discharge summary fields",
            details=[
                {
                    "field": "doctor_id",
                    "code": "invalid_doctor",
                    "message": f"User '{doctor_id}' is not a doctor or does not exist",
                }
            ],
        )


def _chain_status(
    summaries: list[DischargeSummary],
) -> dict[uuid.UUID, tuple[bool, uuid.UUID | None]]:
    amended_by = {
        summary.amends_id: summary.id for summary in summaries if summary.amends_id is not None
    }
    return {
        summary.id: (summary.id in amended_by, amended_by.get(summary.id)) for summary in summaries
    }


def _out(
    summary: DischargeSummary,
    superseded: bool = False,
    superseded_by: uuid.UUID | None = None,
) -> DischargeSummaryOut:
    data = DischargeSummaryOut.model_validate(summary)
    raw = data.model_dump()
    raw["is_superseded"] = superseded
    raw["superseded_by"] = superseded_by
    return DischargeSummaryOut.model_validate(raw)


def _snapshot(db: Session, summary: DischargeSummary) -> dict:
    replacement = repo.get_amendment_for_summary(db, summary.id)
    return _out(
        summary, replacement is not None, replacement.id if replacement else None
    ).model_dump(mode="json")


def _current_effective(summaries: list[DischargeSummary]) -> DischargeSummary | None:
    if not summaries:
        return None
    amended_ids = {summary.amends_id for summary in summaries if summary.amends_id is not None}
    current = [summary for summary in summaries if summary.id not in amended_ids]
    return max(current or summaries, key=lambda item: (item.created_at, str(item.id)))


def _ordered_history(summaries: list[DischargeSummary]) -> list[DischargeSummary]:
    by_parent = {
        summary.amends_id: summary for summary in summaries if summary.amends_id is not None
    }
    roots = sorted(
        [summary for summary in summaries if summary.amends_id is None],
        key=lambda item: (item.created_at, str(item.id)),
    )

    ordered: list[DischargeSummary] = []
    for root in roots:
        current: DischargeSummary | None = root
        while current is not None:
            ordered.append(current)
            current = by_parent.get(current.id)
    if len(ordered) != len(summaries):
        ordered_ids = {summary.id for summary in ordered}
        ordered.extend(summary for summary in summaries if summary.id not in ordered_ids)
    return ordered


def _apply_fields(summary: DischargeSummary, body: Any) -> None:
    values = body.model_dump(exclude={"version"}, exclude_unset=True)
    for field, value in values.items():
        if field in _FIELD_NAMES:
            setattr(summary, field, value)


def create_summary(
    db: Session,
    visit_id: uuid.UUID,
    body: DischargeSummaryCreateRequest,
    actor_payload: dict,
    request: Any = None,
) -> DischargeSummaryOut:
    visit = visit_repo.get_visit_by_id(db, visit_id)
    if visit is None:
        raise NotFoundError(f"Visit {visit_id} not found")
    if repo.list_summaries_for_visit(db, visit_id):
        raise ConflictError(
            "Discharge summary already exists for this visit; "
            "update the draft or amend the current summary"
        )
    _validate_dates(body.admission_date, body.discharge_date)
    _validate_condition(db, body.condition_at_discharge)
    _validate_doctor(db, body.doctor_id)

    actor_id = _actor_id(actor_payload)
    summary = DischargeSummary(
        visit_id=visit_id,
        patient_id=visit.patient_id,
        doctor_id=body.doctor_id,
        admission_date=body.admission_date,
        discharge_date=body.discharge_date,
        diagnosis=body.diagnosis,
        presenting_complaints=body.presenting_complaints,
        investigations_admission=body.investigations_admission,
        treatments=body.treatments,
        condition_at_discharge=body.condition_at_discharge,
        follow_up_period=body.follow_up_period,
        discharge_advice=body.discharge_advice,
        medications=body.medications,
        yoga_guidance=body.yoga_guidance,
        is_finalized=False,
        version=1,
        created_by=actor_id,
        updated_by=actor_id,
    )
    repo.create_summary(db, summary)
    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="CREATE",
        user_id=actor_id,
        user_role=_role_snapshot(actor_payload),
        entity_type="discharge_summary",
        entity_id=str(summary.id),
        patient_id=visit.patient_id,
        new_value=_snapshot(db, summary),
        description="Created discharge summary draft",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return _out(summary)


def get_current_for_visit(
    db: Session, visit_id: uuid.UUID, actor_payload: dict
) -> DischargeSummaryOut:
    visit = visit_repo.get_visit_by_id(db, visit_id)
    if visit is None:
        raise NotFoundError(f"Visit {visit_id} not found")
    summaries = repo.list_summaries_for_visit(db, visit_id)
    current = _current_effective(summaries)
    if current is None:
        raise NotFoundError(f"No discharge summary for visit {visit_id}")
    statuses = _chain_status(summaries)
    superseded, superseded_by = statuses[current.id]
    return _out(current, superseded, superseded_by)


def history_for_visit(
    db: Session, visit_id: uuid.UUID, actor_payload: dict
) -> list[DischargeSummaryOut]:
    visit = visit_repo.get_visit_by_id(db, visit_id)
    if visit is None:
        raise NotFoundError(f"Visit {visit_id} not found")
    summaries = repo.list_summaries_for_visit(db, visit_id)
    statuses = _chain_status(summaries)
    return [_out(summary, *statuses[summary.id]) for summary in _ordered_history(summaries)]


def update_summary(
    db: Session,
    summary_id: uuid.UUID,
    body: DischargeSummaryUpdateRequest,
    actor_payload: dict,
    request: Any = None,
) -> DischargeSummaryOut:
    summary = repo.get_summary_by_id(db, summary_id)
    if summary is None:
        raise NotFoundError(f"Discharge summary {summary_id} not found")
    if summary.is_finalized:
        raise DischargeAlreadyFinalizedError("Finalized discharge summaries cannot be edited")
    ensure_current_version(summary, body.version)

    next_admission = (
        body.admission_date if "admission_date" in body.model_fields_set else summary.admission_date
    )
    next_discharge = (
        body.discharge_date if "discharge_date" in body.model_fields_set else summary.discharge_date
    )
    _validate_dates(next_admission, next_discharge)
    _validate_condition(db, body.condition_at_discharge)
    _validate_doctor(db, body.doctor_id)

    actor_id = _actor_id(actor_payload)
    old_snap = _snapshot(db, summary)
    _apply_fields(summary, body)
    summary.updated_by = actor_id
    bump_version(summary)
    repo.save_summary(db, summary)
    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="UPDATE",
        user_id=actor_id,
        user_role=_role_snapshot(actor_payload),
        entity_type="discharge_summary",
        entity_id=str(summary.id),
        patient_id=summary.patient_id,
        old_value=old_snap,
        new_value=_snapshot(db, summary),
        description="Updated discharge summary draft",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return _out(summary)


def finalize_summary(
    db: Session,
    summary_id: uuid.UUID,
    body: DischargeSummaryFinalizeRequest,
    actor_payload: dict,
    request: Any = None,
) -> DischargeSummaryOut:
    summary = repo.get_summary_by_id(db, summary_id)
    if summary is None:
        raise NotFoundError(f"Discharge summary {summary_id} not found")
    if summary.is_finalized:
        raise DischargeAlreadyFinalizedError("Discharge summary is already finalized")
    ensure_current_version(summary, body.version)

    actor_id = _actor_id(actor_payload)
    old_snap = _snapshot(db, summary)
    summary.is_finalized = True
    summary.finalized_at = datetime.now(UTC)
    summary.finalized_by = actor_id
    summary.updated_by = actor_id
    bump_version(summary)
    repo.save_summary(db, summary)
    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="FINALIZE",
        user_id=actor_id,
        user_role=_role_snapshot(actor_payload),
        entity_type="discharge_summary",
        entity_id=str(summary.id),
        patient_id=summary.patient_id,
        old_value=old_snap,
        new_value=_snapshot(db, summary),
        description="Finalized discharge summary",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return _out(summary)


def amend_summary(
    db: Session,
    summary_id: uuid.UUID,
    body: DischargeSummaryAmendRequest,
    actor_payload: dict,
    request: Any = None,
) -> DischargeSummaryOut:
    original = repo.get_summary_by_id(db, summary_id)
    if original is None:
        raise NotFoundError(f"Discharge summary {summary_id} not found")
    summaries = repo.list_summaries_for_visit(db, original.visit_id)
    statuses = _chain_status(summaries)
    is_superseded, _ = statuses.get(original.id, (False, None))
    if is_superseded:
        raise InvalidStateTransitionError(
            "Discharge summary has already been superseded; amend the current summary"
        )
    if not original.is_finalized:
        raise InvalidStateTransitionError(
            "Only finalized discharge summaries can be amended; update the draft instead"
        )
    next_admission = (
        body.admission_date
        if "admission_date" in body.model_fields_set
        else original.admission_date
    )
    next_discharge = (
        body.discharge_date
        if "discharge_date" in body.model_fields_set
        else original.discharge_date
    )
    _validate_dates(next_admission, next_discharge)
    _validate_condition(db, body.condition_at_discharge)
    if "doctor_id" in body.model_fields_set:
        _validate_doctor(db, body.doctor_id)

    actor_id = _actor_id(actor_payload)
    amended = DischargeSummary(
        visit_id=original.visit_id,
        patient_id=original.patient_id,
        doctor_id=body.doctor_id if "doctor_id" in body.model_fields_set else original.doctor_id,
        admission_date=next_admission,
        discharge_date=next_discharge,
        diagnosis=body.diagnosis if "diagnosis" in body.model_fields_set else original.diagnosis,
        presenting_complaints=body.presenting_complaints
        if "presenting_complaints" in body.model_fields_set
        else original.presenting_complaints,
        investigations_admission=body.investigations_admission
        if "investigations_admission" in body.model_fields_set
        else original.investigations_admission,
        treatments=body.treatments
        if "treatments" in body.model_fields_set
        else original.treatments,
        condition_at_discharge=body.condition_at_discharge
        if "condition_at_discharge" in body.model_fields_set
        else original.condition_at_discharge,
        follow_up_period=body.follow_up_period
        if "follow_up_period" in body.model_fields_set
        else original.follow_up_period,
        discharge_advice=body.discharge_advice
        if "discharge_advice" in body.model_fields_set
        else original.discharge_advice,
        medications=body.medications
        if "medications" in body.model_fields_set
        else original.medications,
        yoga_guidance=body.yoga_guidance
        if "yoga_guidance" in body.model_fields_set
        else original.yoga_guidance,
        is_finalized=False,
        amends_id=original.id,
        version=1,
        created_by=actor_id,
        updated_by=actor_id,
    )
    repo.create_summary(db, amended)
    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="AMEND",
        user_id=actor_id,
        user_role=_role_snapshot(actor_payload),
        entity_type="discharge_summary",
        entity_id=str(amended.id),
        patient_id=original.patient_id,
        old_value=_snapshot(db, original),
        new_value=_snapshot(db, amended),
        description="Amended discharge summary",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return _out(amended)
