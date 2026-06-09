"""Follow-up routes (API-T11.1).

Routes:
  POST /patients/{id}/follow-ups       — create follow-up
  GET  /patients/{id}/follow-ups       — list follow-ups for patient
  PUT  /follow-ups/{id}                — update follow-up (status lifecycle)
  GET  /follow-ups                     — queue list with filters
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db, require_permission
from app.core.permissions import PERM_MANAGE_FOLLOWUPS
from app.modules.followups import service as svc
from app.modules.followups.schemas import (
    FollowUpCreateRequest,
    FollowUpOut,
    FollowUpUpdateRequest,
)

ManageFollowups = Annotated[dict, Depends(require_permission(PERM_MANAGE_FOLLOWUPS))]

# ── Patient-scoped routes ──────────────────────────────────────────────────────

patients_router = APIRouter(prefix="/patients", tags=["follow-ups"])


@patients_router.post(
    "/{patient_id}/follow-ups",
    response_model=FollowUpOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a follow-up for a patient",
)
def create_followup(
    patient_id: uuid.UUID,
    body: FollowUpCreateRequest,
    payload: ManageFollowups,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> FollowUpOut:
    return svc.create_followup(db, patient_id, body, payload, request)


@patients_router.get(
    "/{patient_id}/follow-ups",
    summary="List follow-ups for a patient (paginated)",
)
def list_followups_for_patient(
    patient_id: uuid.UUID,
    payload: ManageFollowups,
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    return svc.list_followups_for_patient(db, patient_id, payload, page=page, page_size=page_size)


# ── Global follow-up routes ────────────────────────────────────────────────────

followups_router = APIRouter(prefix="/follow-ups", tags=["follow-ups"])


@followups_router.get(
    "",
    summary="Follow-up queue with optional filters",
)
def get_followup_queue(
    payload: ManageFollowups,
    db: Annotated[Session, Depends(get_db)],
    status_filter: str | None = Query(
        default=None,
        alias="status",
        pattern="^(PENDING|CONTACTED|NOT_REACHABLE|COMPLETED|RESCHEDULED)$",
    ),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    assigned_to: uuid.UUID | None = Query(default=None),
    patient_id: uuid.UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    return svc.get_followup_queue(
        db,
        status=status_filter,
        from_date=from_date,
        to_date=to_date,
        assigned_to=assigned_to,
        patient_id=patient_id,
        page=page,
        page_size=page_size,
        actor_payload=payload,
    )


@followups_router.put(
    "/{followup_id}",
    response_model=FollowUpOut,
    summary="Update a follow-up (enforces status lifecycle)",
)
def update_followup(
    followup_id: uuid.UUID,
    body: FollowUpUpdateRequest,
    payload: ManageFollowups,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> FollowUpOut:
    return svc.update_followup(db, followup_id, body, payload, request)
