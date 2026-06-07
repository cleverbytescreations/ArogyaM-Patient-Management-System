"""Prescription routes (API-T7.1)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_permission
from app.core.permissions import PERM_ADD_PRESCRIPTION, PERM_VIEW_MEDICAL_HISTORY
from app.modules.clinical.prescriptions import service as svc
from app.modules.clinical.prescriptions.schemas import PrescriptionCreateRequest, PrescriptionOut

AddPrescription = Annotated[dict, Depends(require_permission(PERM_ADD_PRESCRIPTION))]
ViewMedicalHistory = Annotated[dict, Depends(require_permission(PERM_VIEW_MEDICAL_HISTORY))]

visits_router = APIRouter(prefix="/visits", tags=["prescriptions"])
router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])


@visits_router.post(
    "/{visit_id}/prescriptions",
    response_model=PrescriptionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a prescription with structured items",
)
def create_prescription(
    visit_id: uuid.UUID,
    body: PrescriptionCreateRequest,
    payload: AddPrescription,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> PrescriptionOut:
    return svc.create_prescription(db, visit_id, body, payload, request)


@visits_router.get(
    "/{visit_id}/prescriptions",
    response_model=list[PrescriptionOut],
    summary="List prescriptions for a visit",
)
def list_prescriptions(
    visit_id: uuid.UUID,
    payload: ViewMedicalHistory,
    db: Annotated[Session, Depends(get_db)],
) -> list[PrescriptionOut]:
    return svc.list_prescriptions(db, visit_id, payload)


@router.get(
    "/{prescription_id}", response_model=PrescriptionOut, summary="Get prescription with items"
)
def get_prescription(
    prescription_id: uuid.UUID,
    payload: ViewMedicalHistory,
    db: Annotated[Session, Depends(get_db)],
) -> PrescriptionOut:
    return svc.get_prescription(db, prescription_id, payload)
