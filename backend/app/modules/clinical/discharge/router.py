"""Discharge summary routes (API-T8.1)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_permission
from app.core.permissions import PERM_ADD_CONSULTATION, PERM_VIEW_MEDICAL_HISTORY
from app.modules.clinical.discharge import service as svc
from app.modules.clinical.discharge.schemas import (
    DischargeSummaryAmendRequest,
    DischargeSummaryCreateRequest,
    DischargeSummaryFinalizeRequest,
    DischargeSummaryOut,
    DischargeSummaryUpdateRequest,
)

AddConsultation = Annotated[dict, Depends(require_permission(PERM_ADD_CONSULTATION))]
ViewMedicalHistory = Annotated[dict, Depends(require_permission(PERM_VIEW_MEDICAL_HISTORY))]

visits_router = APIRouter(prefix="/visits", tags=["discharge summaries"])
router = APIRouter(prefix="/discharge-summaries", tags=["discharge summaries"])


@visits_router.post(
    "/{visit_id}/discharge-summary",
    response_model=DischargeSummaryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a discharge summary draft",
)
def create_discharge_summary(
    visit_id: uuid.UUID,
    body: DischargeSummaryCreateRequest,
    payload: AddConsultation,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> DischargeSummaryOut:
    return svc.create_summary(db, visit_id, body, payload, request)


@visits_router.get(
    "/{visit_id}/discharge-summary",
    response_model=DischargeSummaryOut,
    summary="Get current-effective discharge summary for a visit",
)
def get_current_discharge_summary(
    visit_id: uuid.UUID,
    payload: ViewMedicalHistory,
    db: Annotated[Session, Depends(get_db)],
) -> DischargeSummaryOut:
    return svc.get_current_for_visit(db, visit_id, payload)


@visits_router.get(
    "/{visit_id}/discharge-summary/history",
    response_model=list[DischargeSummaryOut],
    summary="Get discharge summary amendment history for a visit",
)
def get_discharge_summary_history(
    visit_id: uuid.UUID,
    payload: ViewMedicalHistory,
    db: Annotated[Session, Depends(get_db)],
) -> list[DischargeSummaryOut]:
    return svc.history_for_visit(db, visit_id, payload)


@router.put("/{summary_id}", response_model=DischargeSummaryOut, summary="Update a draft summary")
def update_discharge_summary(
    summary_id: uuid.UUID,
    body: DischargeSummaryUpdateRequest,
    payload: AddConsultation,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> DischargeSummaryOut:
    return svc.update_summary(db, summary_id, body, payload, request)


@router.put(
    "/{summary_id}/finalize",
    response_model=DischargeSummaryOut,
    summary="Finalize a discharge summary",
)
def finalize_discharge_summary(
    summary_id: uuid.UUID,
    body: DischargeSummaryFinalizeRequest,
    payload: AddConsultation,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> DischargeSummaryOut:
    return svc.finalize_summary(db, summary_id, body, payload, request)


@router.post(
    "/{summary_id}/amend",
    response_model=DischargeSummaryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an amendment summary linked to a prior summary",
)
def amend_discharge_summary(
    summary_id: uuid.UUID,
    body: DischargeSummaryAmendRequest,
    payload: AddConsultation,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> DischargeSummaryOut:
    return svc.amend_summary(db, summary_id, body, payload, request)
