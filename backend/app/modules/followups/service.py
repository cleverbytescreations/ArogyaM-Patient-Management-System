"""Follow-up service with status lifecycle (BE-T11.1)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.concurrency import bump_version, ensure_current_version
from app.core.errors import InvalidStateTransitionError, NotFoundError
from app.core.permissions import ROLE_ADMIN, ROLE_DOCTOR
from app.modules.followups import repository as repo
from app.modules.followups.models import FollowUp
from app.modules.followups.schemas import (
    FollowUpCreateRequest,
    FollowUpOut,
    FollowUpUpdateRequest,
    VALID_TRANSITIONS,
)
from app.modules.patients import repository as patient_repo


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
