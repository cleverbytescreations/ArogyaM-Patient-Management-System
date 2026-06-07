"""Prescription routes (API-T7.1).

Routes:
  POST   /visits/{id}/prescriptions          — create prescription with items
  GET    /visits/{id}/prescriptions          — list prescriptions for a visit
  GET    /prescriptions/{id}                 — get prescription with items
  PUT    /prescriptions/{id}                 — update prescription within edit window
  GET    /prescriptions/{id}/report.pdf      — download/print prescription report (PDF)
"""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import Response as RawResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db, require_permission
from app.core.errors import ForbiddenError
from app.core.permissions import PERM_ADD_PRESCRIPTION, PERM_EXPORT, PERM_VIEW_MEDICAL_HISTORY
from app.modules.clinical.prescriptions import report_service
from app.modules.clinical.prescriptions import service as svc
from app.modules.clinical.prescriptions.schemas import (
    PrescriptionCreateRequest,
    PrescriptionOut,
    PrescriptionUpdateRequest,
)

AddPrescription = Annotated[dict, Depends(require_permission(PERM_ADD_PRESCRIPTION))]
ViewMedicalHistory = Annotated[dict, Depends(require_permission(PERM_VIEW_MEDICAL_HISTORY))]


def _require_prescription_export(payload: Annotated[dict, Depends(get_current_user)]) -> dict:
    """Exporting the prescription PDF needs export rights AND clinical-data
    visibility — neither permission alone is sufficient (avoids leaking PHI to
    a role that has one but not the other)."""
    perms: list[str] = payload.get("permissions", [])
    if PERM_EXPORT not in perms or PERM_VIEW_MEDICAL_HISTORY not in perms:
        raise ForbiddenError(f"Permission required: {PERM_EXPORT} and {PERM_VIEW_MEDICAL_HISTORY}")
    return payload


ExportPrescription = Annotated[dict, Depends(_require_prescription_export)]

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


@router.put(
    "/{prescription_id}",
    response_model=PrescriptionOut,
    summary="Update a prescription within the edit window",
)
def update_prescription(
    prescription_id: uuid.UUID,
    body: PrescriptionUpdateRequest,
    payload: AddPrescription,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> PrescriptionOut:
    return svc.update_prescription(db, prescription_id, body, payload, request)


@router.get(
    "/{prescription_id}/report.pdf",
    summary="Download or print the prescription as a PDF",
)
def get_prescription_report_pdf(
    prescription_id: uuid.UUID,
    payload: ExportPrescription,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
    disposition: Literal["inline", "attachment"] = "attachment",
) -> RawResponse:
    pdf_bytes, filename = report_service.generate_prescription_report_pdf(
        db, prescription_id, payload, request
    )
    return RawResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )
