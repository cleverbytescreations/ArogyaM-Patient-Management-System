"""Visit, case-sheet, and consultation-note services (BE-T6.1–BE-T6.3)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.concurrency import bump_version, ensure_current_version
from app.core.errors import NotFoundError, ValidationAppError, VersionConflictError
from app.core.permissions import PERM_VIEW_MEDICAL_HISTORY, ROLE_ADMIN, ROLE_DOCTOR
from app.modules.auth.models import User
from app.modules.followups import repository as followup_repo
from app.modules.followups.models import FollowUp
from app.modules.masterdata import repository as master_repo
from app.modules.patients import repository as patient_repo
from app.modules.patients.models import Patient
from app.modules.visits import repository as repo
from app.modules.visits.models import CaseSheet, ConsultationNote, Visit
from app.modules.visits.schemas import (
    CaseSheetOut,
    CaseSheetUpsertRequest,
    ConsultationNoteCreateRequest,
    ConsultationNoteOut,
    PatientProfileShell,
    VisitCreateRequest,
    VisitListItemOut,
    VisitOut,
    VisitQueueItem,
    VisitRegisterItem,
    VisitUpdateRequest,
)

# Clinical fields hidden from roles lacking view_medical_history
_CASE_SHEET_CLINICAL_FIELDS: frozenset[str] = frozenset({
    "appetite", "sleep", "motion", "energy_level",
    "hereditary_diseases", "hereditary_diseases_mother", "hereditary_diseases_father",
    "past_ailments", "surgeries",
    "exercise_routine", "deliveries", "normal_deliveries", "caesarian_deliveries",
    "present_complaints", "other_observations", "remarks",
})

_CASE_SHEET_CONTENT_FIELDS: frozenset[str] = frozenset({
    "appetite", "sleep", "motion", "energy_level",
    "hereditary_diseases", "hereditary_diseases_mother", "hereditary_diseases_father",
    "past_ailments", "surgeries", "exercise_routine",
    "deliveries", "normal_deliveries", "caesarian_deliveries",
    "present_complaints", "other_observations", "remarks",
})

_CONSULT_NOTE_CLINICAL_FIELDS: frozenset[str] = frozenset({
    "diagnosis", "observations", "treatment_advice", "diet_advice", "yoga_advice",
})


# ── Helpers ────────────────────────────────────────────────────────────────────


def _actor_id(actor_payload: dict) -> uuid.UUID:
    return uuid.UUID(actor_payload["sub"])


def _role_snapshot(actor_payload: dict) -> str:
    return ",".join(actor_payload.get("roles", []))


def _has_medical_view(actor_payload: dict) -> bool:
    return PERM_VIEW_MEDICAL_HISTORY in actor_payload.get("permissions", [])


def _patient_shell(patient: Patient) -> PatientProfileShell:
    return PatientProfileShell.model_validate(patient)


def _visit_out(visit: Visit, patient: Patient | None = None) -> VisitOut:
    data = VisitOut.model_validate(visit)
    if patient is not None:
        data.patient_shell = _patient_shell(patient)
    return data


def _filtered_case_sheet(case_sheet: CaseSheet, actor_payload: dict) -> CaseSheetOut:
    out = CaseSheetOut.model_validate(case_sheet)
    if not _has_medical_view(actor_payload):
        raw = out.model_dump()
        for field in _CASE_SHEET_CLINICAL_FIELDS:
            raw[field] = None
        return CaseSheetOut.model_validate(raw)
    return out


def _filtered_note(note: ConsultationNote, actor_payload: dict) -> ConsultationNoteOut:
    out = ConsultationNoteOut.model_validate(note)
    if not _has_medical_view(actor_payload):
        raw = out.model_dump()
        for field in _CONSULT_NOTE_CLINICAL_FIELDS:
            raw[field] = None
        return ConsultationNoteOut.model_validate(raw)
    return out


def _validate_visit_lookups(db: Session, body: VisitCreateRequest | VisitUpdateRequest) -> None:
    """Validate visit_type_code, consultation_category, and doctor_id."""
    details = []

    visit_type_code = getattr(body, "visit_type_code", None)
    if visit_type_code is not None:
        if master_repo.get_by_type_and_code(db, "visit_type", visit_type_code) is None:
            details.append({
                "field": "visit_type_code",
                "code": "invalid_lookup",
                "message": f"Unknown visit_type code '{visit_type_code}'",
            })

    consultation_category = getattr(body, "consultation_category", None)
    if consultation_category is not None:
        if master_repo.get_by_type_and_code(db, "consultation_category", consultation_category) is None:
            details.append({
                "field": "consultation_category",
                "code": "invalid_lookup",
                "message": f"Unknown consultation_category code '{consultation_category}'",
            })

    doctor_id = getattr(body, "doctor_id", None)
    if doctor_id is not None:
        doctor = db.execute(
            select(User).where(User.id == doctor_id, User.is_doctor.is_(True))
        ).scalar_one_or_none()
        if doctor is None:
            details.append({
                "field": "doctor_id",
                "code": "invalid_doctor",
                "message": f"User '{doctor_id}' is not a doctor or does not exist",
            })

    if details:
        raise ValidationAppError("Invalid visit fields", details=details)


def _check_future_date(visit_date: date, is_scheduled: bool) -> None:
    """Non-scheduled visits cannot be future-dated (UC-08 BR4)."""
    if not is_scheduled and visit_date > date.today():
        raise ValidationAppError(
            "Non-scheduled visit date cannot be in the future",
            details=[{
                "field": "visit_date",
                "code": "future_visit_date",
                "message": "Set is_scheduled=true to allow a future visit date",
            }],
        )


def _snapshot(obj: Any, schema: type) -> dict:
    return schema.model_validate(obj).model_dump(mode="json")


def _validate_status_transition(visit: Visit, body: VisitUpdateRequest) -> None:
    """Visits can only be marked COMPLETED or CANCELLED from OPEN; CANCELLED requires a reason."""
    if body.status is None or body.status == visit.status:
        return

    if visit.status != "OPEN":
        raise ValidationAppError(
            "Visit status can only be changed from OPEN",
            details=[{
                "field": "status",
                "code": "invalid_status_transition",
                "message": f"Cannot change status from {visit.status} to {body.status}",
            }],
        )

    if body.status == "CANCELLED" and not (body.cancellation_reason or "").strip():
        raise ValidationAppError(
            "A reason is required to cancel a visit",
            details=[{
                "field": "cancellation_reason",
                "code": "required",
                "message": "Provide a reason for cancelling this visit",
            }],
        )


def get_visit_queue(
    db: Session,
    *,
    doctor_id: uuid.UUID | None,
    visit_date: date | None,
    status: str | None,
) -> list[VisitQueueItem]:
    """Return today's visit queue items for the given filters."""
    rows = repo.list_visits_for_queue(
        db,
        doctor_id=doctor_id,
        visit_date=visit_date,
        status=status,
    )
    return [
        VisitQueueItem(
            id=v.id,
            patient_id=v.patient_id,
            patient_name=patient_name,
            op_number=op_number,
            visit_date=v.visit_date,
            visit_type_code=v.visit_type_code,
            consultation_category=v.consultation_category,
            status=v.status,
            reason=v.reason,
            doctor_name=doctor_name,
        )
        for v, patient_name, op_number, doctor_name in rows
    ]


def get_visit_register(
    db: Session,
    *,
    from_date: date | None,
    to_date: date | None,
    doctor_id: uuid.UUID | None,
    status: str | None,
    offset: int,
    limit: int,
    actor_payload: dict,
) -> tuple[list[VisitRegisterItem], int]:
    _roles = actor_payload.get("roles", [])
    if (bool(actor_payload.get("is_doctor")) or ROLE_DOCTOR in _roles) and ROLE_ADMIN not in _roles:
        # Doctor role: scope to only their own visits regardless of any filter sent
        doctor_id = _actor_id(actor_payload)

    rows, total = repo.list_visits_for_register(
        db,
        from_date=from_date,
        to_date=to_date,
        doctor_id=doctor_id,
        status=status,
        offset=offset,
        limit=limit,
    )
    items = [
        VisitRegisterItem(
            id=v.id,
            patient_id=v.patient_id,
            patient_name=patient_name,
            op_number=op_number,
            visit_date=v.visit_date,
            visit_type_code=v.visit_type_code,
            consultation_category=v.consultation_category,
            is_scheduled=v.is_scheduled,
            status=v.status,
            reason=v.reason,
            cancellation_reason=v.cancellation_reason,
            version=v.version,
            doctor_id=doctor_user_id,
            doctor_name=doctor_name,
        )
        for v, patient_name, op_number, doctor_name, doctor_user_id in rows
    ]
    return items, total


# ── Visit service (BE-T6.1) ────────────────────────────────────────────────────


def create_visit(
    db: Session,
    patient_id: uuid.UUID,
    body: VisitCreateRequest,
    actor_payload: dict,
    request: Any = None,
) -> VisitOut:
    patient = patient_repo.get_patient_by_id(db, patient_id)
    if patient is None:
        raise NotFoundError(f"Patient {patient_id} not found")
    _validate_visit_lookups(db, body)
    _check_future_date(body.visit_date, body.is_scheduled)

    actor_id = _actor_id(actor_payload)
    visit = Visit(
        patient_id=patient_id,
        visit_date=body.visit_date,
        visit_type_code=body.visit_type_code,
        consultation_category=body.consultation_category,
        doctor_id=body.doctor_id,
        is_scheduled=body.is_scheduled,
        reason=body.reason,
        status="OPEN",
        version=1,
        created_by=actor_id,
        updated_by=actor_id,
    )
    repo.create_visit(db, visit)

    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="CREATE",
        user_id=actor_id,
        user_role=_role_snapshot(actor_payload),
        entity_type="visit",
        entity_id=str(visit.id),
        patient_id=patient_id,
        new_value=_snapshot(visit, VisitOut),
        description="Created visit",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return _visit_out(visit, patient)


def list_visits(
    db: Session,
    patient_id: uuid.UUID,
    actor_payload: dict,
) -> list[VisitListItemOut]:
    patient = patient_repo.get_patient_by_id(db, patient_id)
    if patient is None:
        raise NotFoundError(f"Patient {patient_id} not found")
    visits = repo.list_visits_for_patient(db, patient_id)

    visit_ids = [v.id for v in visits]
    case_sheet_visit_ids = repo.get_visit_ids_with_case_sheet(db, visit_ids)
    notes_count_by_visit = repo.count_consultation_notes_by_visit(db, visit_ids)

    return [
        VisitListItemOut(
            **_visit_out(v, patient).model_dump(),
            has_case_sheet=v.id in case_sheet_visit_ids,
            consultation_notes_count=notes_count_by_visit.get(v.id, 0),
        )
        for v in visits
    ]


def get_visit(
    db: Session,
    visit_id: uuid.UUID,
    actor_payload: dict,
) -> VisitOut:
    visit = repo.get_visit_by_id(db, visit_id)
    if visit is None:
        raise NotFoundError(f"Visit {visit_id} not found")
    patient = patient_repo.get_patient_by_id(db, visit.patient_id)
    return _visit_out(visit, patient)


def update_visit(
    db: Session,
    visit_id: uuid.UUID,
    body: VisitUpdateRequest,
    actor_payload: dict,
    request: Any = None,
) -> VisitOut:
    visit = repo.get_visit_by_id(db, visit_id)
    if visit is None:
        raise NotFoundError(f"Visit {visit_id} not found")
    ensure_current_version(visit, body.version)
    _validate_status_transition(visit, body)

    _validate_visit_lookups(db, body)

    if body.visit_date is not None and body.visit_date < date.today():
        raise ValidationAppError(
            "Visit date cannot be in the past",
            details=[{
                "field": "visit_date",
                "code": "past_visit_date",
                "message": "Visit date must be today or a future date",
            }],
        )

    # Resolve effective is_scheduled and visit_date for date validation
    effective_scheduled = body.is_scheduled if body.is_scheduled is not None else visit.is_scheduled
    effective_date = body.visit_date if body.visit_date is not None else visit.visit_date
    _check_future_date(effective_date, effective_scheduled)

    actor_id = _actor_id(actor_payload)
    old_snap = _snapshot(visit, VisitOut)

    changes = body.model_dump(exclude={"version", "change_reason"}, exclude_unset=True)
    for field, value in changes.items():
        setattr(visit, field, value)
    visit.updated_by = actor_id
    bump_version(visit)
    repo.save_visit(db, visit)

    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="UPDATE",
        user_id=actor_id,
        user_role=_role_snapshot(actor_payload),
        entity_type="visit",
        entity_id=str(visit.id),
        patient_id=visit.patient_id,
        old_value=old_snap,
        new_value=_snapshot(visit, VisitOut),
        description=f"Updated visit: {body.change_reason}" if body.change_reason else "Updated visit",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    patient = patient_repo.get_patient_by_id(db, visit.patient_id)
    return _visit_out(visit, patient)


# ── Case sheet service (BE-T6.2) ───────────────────────────────────────────────


def upsert_case_sheet(
    db: Session,
    visit_id: uuid.UUID,
    body: CaseSheetUpsertRequest,
    actor_payload: dict,
    request: Any = None,
) -> tuple[CaseSheetOut, bool]:
    """Upsert case sheet; returns (result, created) where created=True on first save."""
    visit = repo.get_visit_by_id(db, visit_id)
    if visit is None:
        raise NotFoundError(f"Visit {visit_id} not found")

    actor_id = _actor_id(actor_payload)
    existing = repo.get_case_sheet_for_visit(db, visit_id)

    if existing is None:
        case_sheet = CaseSheet(
            visit_id=visit_id,
            patient_id=visit.patient_id,
            appetite=body.appetite,
            sleep=body.sleep,
            motion=body.motion,
            energy_level=body.energy_level,
            hereditary_diseases=body.hereditary_diseases,
            hereditary_diseases_mother=body.hereditary_diseases_mother,
            hereditary_diseases_father=body.hereditary_diseases_father,
            past_ailments=body.past_ailments,
            surgeries=body.surgeries,
            exercise_routine=body.exercise_routine,
            deliveries=body.deliveries,
            normal_deliveries=body.normal_deliveries,
            caesarian_deliveries=body.caesarian_deliveries,
            present_complaints=body.present_complaints,
            other_observations=body.other_observations,
            remarks=body.remarks,
            version=1,
            created_by=actor_id,
            updated_by=actor_id,
        )
        repo.save_case_sheet(db, case_sheet)
        ip, ua, rid = extract_request_meta(request)
        write_audit(
            db,
            action="CREATE",
            user_id=actor_id,
            user_role=_role_snapshot(actor_payload),
            entity_type="case_sheet",
            entity_id=str(case_sheet.id),
            patient_id=visit.patient_id,
            new_value=_snapshot(case_sheet, CaseSheetOut),
            description="Created case sheet",
            ip_address=ip,
            user_agent=ua,
            request_id=rid,
        )
        db.commit()
        return _filtered_case_sheet(case_sheet, actor_payload), True
    else:
        # Update path — version required and must match
        if body.version is None:
            raise VersionConflictError("version is required when updating an existing case sheet")
        ensure_current_version(existing, body.version)

        old_snap = _snapshot(existing, CaseSheetOut)
        for field in _CASE_SHEET_CONTENT_FIELDS:
            val = getattr(body, field, None)
            if val is not None or field in (body.model_fields_set - {"version"}):
                setattr(existing, field, getattr(body, field))

        existing.updated_by = actor_id
        bump_version(existing)
        repo.save_case_sheet(db, existing)

        ip, ua, rid = extract_request_meta(request)
        write_audit(
            db,
            action="UPDATE",
            user_id=actor_id,
            user_role=_role_snapshot(actor_payload),
            entity_type="case_sheet",
            entity_id=str(existing.id),
            patient_id=visit.patient_id,
            old_value=old_snap,
            new_value=_snapshot(existing, CaseSheetOut),
            description="Updated case sheet",
            ip_address=ip,
            user_agent=ua,
            request_id=rid,
        )
        db.commit()
        return _filtered_case_sheet(existing, actor_payload), False


def get_case_sheet(
    db: Session,
    visit_id: uuid.UUID,
    actor_payload: dict,
) -> CaseSheetOut:
    visit = repo.get_visit_by_id(db, visit_id)
    if visit is None:
        raise NotFoundError(f"Visit {visit_id} not found")
    case_sheet = repo.get_case_sheet_for_visit(db, visit_id)
    if case_sheet is None:
        raise NotFoundError(f"No case sheet for visit {visit_id}")
    return _filtered_case_sheet(case_sheet, actor_payload)


# ── Consultation notes service (BE-T6.3) ───────────────────────────────────────


def add_consultation_note(
    db: Session,
    visit_id: uuid.UUID,
    body: ConsultationNoteCreateRequest,
    actor_payload: dict,
    request: Any = None,
) -> ConsultationNoteOut:
    visit = repo.get_visit_by_id(db, visit_id)
    if visit is None:
        raise NotFoundError(f"Visit {visit_id} not found")

    actor_id = _actor_id(actor_payload)
    note = ConsultationNote(
        visit_id=visit_id,
        patient_id=visit.patient_id,
        doctor_id=body.doctor_id,
        presenting_complaints=body.presenting_complaints,
        diagnosis=body.diagnosis,
        observations=body.observations,
        treatment_advice=body.treatment_advice,
        diet_advice=body.diet_advice,
        yoga_advice=body.yoga_advice,
        review_date=body.review_date,
        version=1,
        created_by=actor_id,
        updated_by=actor_id,
    )
    repo.create_consultation_note(db, note)

    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="CREATE",
        user_id=actor_id,
        user_role=_role_snapshot(actor_payload),
        entity_type="consultation_note",
        entity_id=str(note.id),
        patient_id=visit.patient_id,
        new_value=_snapshot(note, ConsultationNoteOut),
        description="Added consultation note",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )

    if body.review_date is not None:
        followup = FollowUp(
            patient_id=visit.patient_id,
            follow_up_date=body.review_date,
            reason=visit.reason,
            assigned_to=body.doctor_id,
            status_code="PENDING",
            created_by=actor_id,
            updated_by=actor_id,
        )
        followup_repo.create_followup(db, followup)
        write_audit(
            db,
            action="FOLLOWUP_CREATE",
            user_id=actor_id,
            user_role=_role_snapshot(actor_payload),
            entity_type="follow_up",
            entity_id=str(followup.id),
            patient_id=visit.patient_id,
            new_value={"follow_up_date": str(body.review_date), "status_code": "PENDING"},
            description="Created follow-up from consultation note review date",
            ip_address=ip,
            user_agent=ua,
            request_id=rid,
        )

    db.commit()
    return _filtered_note(note, actor_payload)


def list_consultation_notes(
    db: Session,
    visit_id: uuid.UUID,
    actor_payload: dict,
) -> list[ConsultationNoteOut]:
    visit = repo.get_visit_by_id(db, visit_id)
    if visit is None:
        raise NotFoundError(f"Visit {visit_id} not found")
    notes = repo.list_consultation_notes(db, visit_id)
    return [_filtered_note(n, actor_payload) for n in notes]
