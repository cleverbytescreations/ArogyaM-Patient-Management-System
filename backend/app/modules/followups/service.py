"""Follow-up service with status lifecycle (BE-T11.1)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.concurrency import bump_version, ensure_current_version
from app.core.errors import InvalidStateTransitionError, NotFoundError, ValidationAppError
from app.core.permissions import ROLE_ADMIN, ROLE_DOCTOR
from app.modules.auth.models import User
from app.modules.followups import repository as repo
from app.modules.followups.models import FollowUp
from app.modules.followups.schemas import (
    FollowUpCreateRequest,
    FollowUpOut,
    FollowUpUpdateRequest,
    RegisterVisitRequest,
    RegisterVisitResponse,
    VALID_TRANSITIONS,
)
from app.modules.masterdata import repository as master_repo
from app.modules.patients import repository as patient_repo
from app.modules.visits import repository as visit_repo
from app.modules.visits.models import Visit
from app.modules.visits.schemas import VisitOut


def _actor_id(actor_payload: dict) -> uuid.UUID:
    return uuid.UUID(actor_payload["sub"])


def _role_snapshot(actor_payload: dict) -> str:
    return ",".join(actor_payload.get("roles", []))


def _out(f: FollowUp) -> FollowUpOut:
    return FollowUpOut.model_validate(f)


def create_followup(
    db: Session,
    patient_id: uuid.UUID,
    body: FollowUpCreateRequest,
    actor_payload: dict,
    request: Any = None,
) -> FollowUpOut:
    patient = patient_repo.get_patient_by_id(db, patient_id)
    if not patient:
        raise NotFoundError(f"Patient {patient_id} not found")

    actor = _actor_id(actor_payload)
    followup = FollowUp(
        patient_id=patient_id,
        visit_id=body.visit_id,
        follow_up_date=body.follow_up_date,
        reason=body.reason,
        assigned_to=body.assigned_to,
        status_code="PENDING",
        remarks=body.remarks,
        created_by=actor,
        updated_by=actor,
    )
    repo.create_followup(db, followup)

    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="FOLLOWUP_CREATE",
        user_id=actor,
        user_role=_role_snapshot(actor_payload),
        entity_type="follow_up",
        entity_id=str(followup.id),
        patient_id=patient_id,
        new_value={"follow_up_date": str(body.follow_up_date), "status_code": "PENDING"},
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )

    db.commit()
    db.refresh(followup)
    return _out(followup)


def list_followups_for_patient(
    db: Session,
    patient_id: uuid.UUID,
    actor_payload: dict,
    *,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    patient = patient_repo.get_patient_by_id(db, patient_id)
    if not patient:
        raise NotFoundError(f"Patient {patient_id} not found")
    items, total = repo.list_followups_for_patient(db, patient_id, page=page, page_size=page_size)
    return {"items": [_out(f) for f in items], "total": total, "page": page, "page_size": page_size}


def get_followup_queue(
    db: Session,
    *,
    status: str | None,
    from_date: date | None,
    to_date: date | None,
    assigned_to: uuid.UUID | None,
    patient_id: uuid.UUID | None,
    page: int,
    page_size: int,
    actor_payload: dict,
) -> dict:
    doctor_id: uuid.UUID | None = None
    _roles = actor_payload.get("roles", [])
    if bool(actor_payload.get("is_doctor")) or (
        ROLE_DOCTOR in _roles and ROLE_ADMIN not in _roles
    ):
        # Skip the visit-history scoping filter when assigned_to is already
        # provided — the assignment filter already narrows to the right doctor,
        # and the EXISTS check would hide follow-ups for new patients.
        if assigned_to is None:
            doctor_id = _actor_id(actor_payload)

    rows, total = repo.list_followup_queue(
        db,
        status=status,
        from_date=from_date,
        to_date=to_date,
        assigned_to=assigned_to,
        patient_id=patient_id,
        doctor_id=doctor_id,
        page=page,
        page_size=page_size,
    )
    items = []
    for f, patient_name in rows:
        out = _out(f)
        out.patient_name = patient_name
        items.append(out)
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def register_followup_visit(
    db: Session,
    followup_id: uuid.UUID,
    body: RegisterVisitRequest,
    actor_payload: dict,
    request: Any = None,
) -> RegisterVisitResponse:
    """Convert a follow-up into a clinical visit in a single atomic transaction.

    Creates the Visit, links it to the follow-up via visit_id, and marks the
    follow-up COMPLETED — bypassing the normal status-machine since arriving in
    person is a distinct terminal action regardless of prior contact state.
    """
    followup = repo.get_followup_by_id(db, followup_id)
    if not followup:
        raise NotFoundError(f"Follow-up {followup_id} not found")

    if followup.status_code in ("COMPLETED", "RESCHEDULED"):
        raise InvalidStateTransitionError(
            f"Cannot register a visit: follow-up is already {followup.status_code}"
        )
    if followup.visit_id is not None:
        raise InvalidStateTransitionError("A visit is already registered for this follow-up")

    patient = patient_repo.get_patient_by_id(db, followup.patient_id)
    if not patient:
        raise NotFoundError(f"Patient {followup.patient_id} not found")

    # Validate master-data lookups
    details = []
    if master_repo.get_by_type_and_code(db, "visit_type", body.visit_type_code) is None:
        details.append({
            "field": "visit_type_code",
            "code": "invalid_lookup",
            "message": f"Unknown visit_type code '{body.visit_type_code}'",
        })
    if body.consultation_category is not None:
        if master_repo.get_by_type_and_code(db, "consultation_category", body.consultation_category) is None:
            details.append({
                "field": "consultation_category",
                "code": "invalid_lookup",
                "message": f"Unknown consultation_category code '{body.consultation_category}'",
            })
    if body.doctor_id is not None:
        doctor = db.execute(
            select(User).where(User.id == body.doctor_id, User.is_doctor.is_(True))
        ).scalar_one_or_none()
        if doctor is None:
            details.append({
                "field": "doctor_id",
                "code": "invalid_doctor",
                "message": f"User '{body.doctor_id}' is not a doctor or does not exist",
            })
    if details:
        raise ValidationAppError("Invalid visit fields", details=details)

    if not body.is_scheduled and body.visit_date > date.today():
        raise ValidationAppError(
            "Non-scheduled visit date cannot be in the future",
            details=[{
                "field": "visit_date",
                "code": "future_visit_date",
                "message": "Set is_scheduled=true to allow a future visit date",
            }],
        )

    actor = _actor_id(actor_payload)

    visit = Visit(
        patient_id=followup.patient_id,
        visit_date=body.visit_date,
        visit_type_code=body.visit_type_code,
        consultation_category=body.consultation_category,
        doctor_id=body.doctor_id,
        is_scheduled=body.is_scheduled,
        reason=body.reason,
        status="OPEN",
        version=1,
        created_by=actor,
        updated_by=actor,
    )
    visit_repo.create_visit(db, visit)

    followup.visit_id = visit.id
    followup.status_code = "COMPLETED"
    followup.updated_by = actor
    bump_version(followup)
    repo.save_followup(db, followup)

    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="CREATE",
        user_id=actor,
        user_role=_role_snapshot(actor_payload),
        entity_type="visit",
        entity_id=str(visit.id),
        patient_id=followup.patient_id,
        new_value={
            "visit_date": str(body.visit_date),
            "visit_type_code": body.visit_type_code,
            "source": "follow_up_register",
            "follow_up_id": str(followup_id),
        },
        description="Created visit from follow-up registration",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    write_audit(
        db,
        action="FOLLOWUP_REGISTER_VISIT",
        user_id=actor,
        user_role=_role_snapshot(actor_payload),
        entity_type="follow_up",
        entity_id=str(followup_id),
        patient_id=followup.patient_id,
        new_value={"status_code": "COMPLETED", "visit_id": str(visit.id)},
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )

    db.commit()
    db.refresh(visit)
    db.refresh(followup)
    return RegisterVisitResponse(
        visit=VisitOut.model_validate(visit),
        follow_up=_out(followup),
    )


def update_followup(
    db: Session,
    followup_id: uuid.UUID,
    body: FollowUpUpdateRequest,
    actor_payload: dict,
    request: Any = None,
) -> FollowUpOut:
    followup = repo.get_followup_by_id(db, followup_id)
    if not followup:
        raise NotFoundError(f"Follow-up {followup_id} not found")

    ensure_current_version(followup, body.version)

    old_snapshot = {
        "status_code": followup.status_code,
        "follow_up_date": str(followup.follow_up_date),
        "remarks": followup.remarks,
    }

    # Validate status transition if status_code is being changed
    if body.status_code and body.status_code != followup.status_code:
        allowed = VALID_TRANSITIONS.get(followup.status_code, frozenset())
        if body.status_code not in allowed:
            raise InvalidStateTransitionError(
                f"Invalid status transition from {followup.status_code} to {body.status_code}",
            )
        followup.status_code = body.status_code

    actor = _actor_id(actor_payload)

    if body.follow_up_date is not None:
        followup.follow_up_date = body.follow_up_date
    if body.reason is not None:
        followup.reason = body.reason
    if body.assigned_to is not None:
        followup.assigned_to = body.assigned_to
    if body.remarks is not None:
        followup.remarks = body.remarks
    if body.next_followup_id is not None:
        followup.next_followup_id = body.next_followup_id
    followup.updated_by = actor
    bump_version(followup)

    new_snapshot = {
        "status_code": followup.status_code,
        "follow_up_date": str(followup.follow_up_date),
        "remarks": followup.remarks,
    }

    ip, ua, rid = extract_request_meta(request)
    write_audit(
        db,
        action="FOLLOWUP_UPDATE",
        user_id=actor,
        user_role=_role_snapshot(actor_payload),
        entity_type="follow_up",
        entity_id=str(followup_id),
        patient_id=followup.patient_id,
        old_value=old_snapshot,
        new_value=new_snapshot,
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )

    repo.save_followup(db, followup)
    db.commit()
    db.refresh(followup)
    return _out(followup)
