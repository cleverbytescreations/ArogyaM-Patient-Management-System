"""Patient routes (API-T3.1, API-T5.1)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_permission
from app.core.pagination import PagedResponse, PaginationParams
from app.core.permissions import PERM_CREATE_PATIENT, PERM_EDIT_PATIENT, PERM_VIEW_PATIENT
from app.modules.patients import service as svc
from app.modules.patients import timeline_service
from app.modules.patients.schemas import (
    PatientAliasOut,
    PatientCreateRequest,
    PatientOut,
    PatientSearchResult,
    PatientUpdateRequest,
)
from app.modules.patients.timeline_service import PatientTimeline
from app.modules.search import service as search_svc

router = APIRouter(prefix="/patients", tags=["patients"])

CreatePatient = Annotated[dict, Depends(require_permission(PERM_CREATE_PATIENT))]
ViewPatient = Annotated[dict, Depends(require_permission(PERM_VIEW_PATIENT))]
EditPatient = Annotated[dict, Depends(require_permission(PERM_EDIT_PATIENT))]


@router.get(
    "/search",
    response_model=PagedResponse[PatientSearchResult],
    summary="Search patients with minimal identifiers only",
)
def search_patients(
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[PaginationParams, Depends()],
    q: str | None = Query(default=None, min_length=1, max_length=150),
    op_number: str | None = Query(default=None, min_length=1, max_length=30),
    mobile: str | None = Query(default=None, min_length=1, max_length=20),
    name: str | None = Query(default=None, min_length=1, max_length=150),
    op_category: str | None = Query(default=None, max_length=40),
    status: str | None = Query(default=None, pattern="^(ACTIVE|INACTIVE|MERGED)$"),
) -> PagedResponse[PatientSearchResult]:
    items, total = search_svc.search_patients(
        db,
        q=q,
        op_number=op_number,
        mobile=mobile,
        name=name,
        op_category=op_category,
        status=status,
        limit=page.page_size,
        offset=page.offset,
    )
    return PagedResponse[PatientSearchResult](
        items=items, total=total, page=page.page, page_size=page.page_size
    )


@router.post(
    "",
    response_model=PatientOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a patient with atomic OP number generation",
)
def register_patient(
    body: PatientCreateRequest,
    payload: CreatePatient,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
    confirm_create: bool = Query(default=False),
) -> PatientOut:
    return svc.register_patient(db, body, payload, confirm_create=confirm_create, request=request)


@router.get("/{patient_id}", response_model=PatientOut, summary="Read patient profile")
def get_patient(
    patient_id: uuid.UUID,
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> PatientOut:
    return svc.get_patient_profile(db, patient_id, payload, request)


@router.put("/{patient_id}", response_model=PatientOut, summary="Update patient profile")
def update_patient(
    patient_id: uuid.UUID,
    body: PatientUpdateRequest,
    payload: EditPatient,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> PatientOut:
    return svc.update_patient(db, patient_id, body, payload, request)


@router.get(
    "/{patient_id}/aliases",
    response_model=list[PatientAliasOut],
    summary="List patient OP aliases",
)
def list_aliases(
    patient_id: uuid.UUID,
    _: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
) -> list[PatientAliasOut]:
    return svc.list_patient_aliases(db, patient_id)


@router.get(
    "/{patient_id}/timeline",
    response_model=PatientTimeline,
    summary="Get unified patient timeline",
)
def get_patient_timeline(
    patient_id: uuid.UUID,
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
    visit_id: uuid.UUID | None = Query(default=None),
) -> PatientTimeline:
    return timeline_service.get_patient_timeline(db, patient_id, payload, visit_id=visit_id)
