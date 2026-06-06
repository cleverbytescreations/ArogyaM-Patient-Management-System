"""Visit and clinical routes (API-T6.1).

Routes:
  POST   /patients/{id}/visits            — create visit for patient
  GET    /patients/{id}/visits            — list visits for patient
  GET    /visits/{id}                     — get visit
  PUT    /visits/{id}                     — update visit
  PUT    /visits/{id}/case-sheet          — upsert case sheet (idempotent)
  GET    /visits/{id}/case-sheet          — read case sheet
  POST   /visits/{id}/consultation-notes  — append consultation note
  GET    /visits/{id}/consultation-notes  — list consultation notes
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_permission
from app.core.permissions import (
    PERM_ADD_CONSULTATION,
    PERM_VIEW_PATIENT,
)
from app.modules.visits import service as svc
from app.modules.visits.schemas import (
    CaseSheetOut,
    CaseSheetUpsertRequest,
    ConsultationNoteCreateRequest,
    ConsultationNoteOut,
    VisitCreateRequest,
    VisitOut,
    VisitUpdateRequest,
)

# ── Dependency aliases ─────────────────────────────────────────────────────────

ViewPatient = Annotated[dict, Depends(require_permission(PERM_VIEW_PATIENT))]
AddConsultation = Annotated[dict, Depends(require_permission(PERM_ADD_CONSULTATION))]

# ── Patient-scoped visit routes ────────────────────────────────────────────────

patients_router = APIRouter(prefix="/patients", tags=["visits"])


@patients_router.post(
    "/{patient_id}/visits",
    response_model=VisitOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a visit for a patient",
)
def create_visit(
    patient_id: uuid.UUID,
    body: VisitCreateRequest,
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> VisitOut:
    return svc.create_visit(db, patient_id, body, payload, request)


@patients_router.get(
    "/{patient_id}/visits",
    response_model=list[VisitOut],
    summary="List all visits for a patient (most-recent first)",
)
def list_visits(
    patient_id: uuid.UUID,
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
) -> list[VisitOut]:
    return svc.list_visits(db, patient_id, payload)


# ── Visit-scoped routes ────────────────────────────────────────────────────────

visits_router = APIRouter(prefix="/visits", tags=["visits"])


@visits_router.get("/{visit_id}", response_model=VisitOut, summary="Get a visit by ID")
def get_visit(
    visit_id: uuid.UUID,
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
) -> VisitOut:
    return svc.get_visit(db, visit_id, payload)


@visits_router.put("/{visit_id}", response_model=VisitOut, summary="Update a visit")
def update_visit(
    visit_id: uuid.UUID,
    body: VisitUpdateRequest,
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> VisitOut:
    return svc.update_visit(db, visit_id, body, payload, request)


# ── Case sheet ─────────────────────────────────────────────────────────────────


@visits_router.put(
    "/{visit_id}/case-sheet",
    response_model=CaseSheetOut,
    status_code=status.HTTP_200_OK,
    summary="Upsert case sheet (creates on first call → 201, updates on subsequent → 200)",
)
def upsert_case_sheet(
    visit_id: uuid.UUID,
    body: CaseSheetUpsertRequest,
    payload: AddConsultation,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
    response: Response,
) -> CaseSheetOut:
    result, created = svc.upsert_case_sheet(db, visit_id, body, payload, request)
    if created:
        response.status_code = status.HTTP_201_CREATED
    return result


@visits_router.get(
    "/{visit_id}/case-sheet",
    response_model=CaseSheetOut,
    summary="Read case sheet for a visit (clinical fields filtered by role)",
)
def get_case_sheet(
    visit_id: uuid.UUID,
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
) -> CaseSheetOut:
    return svc.get_case_sheet(db, visit_id, payload)


# ── Consultation notes ─────────────────────────────────────────────────────────


@visits_router.post(
    "/{visit_id}/consultation-notes",
    response_model=ConsultationNoteOut,
    status_code=status.HTTP_201_CREATED,
    summary="Append a consultation note (corrections are new entries, never overwrites)",
)
def add_consultation_note(
    visit_id: uuid.UUID,
    body: ConsultationNoteCreateRequest,
    payload: AddConsultation,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> ConsultationNoteOut:
    return svc.add_consultation_note(db, visit_id, body, payload, request)


@visits_router.get(
    "/{visit_id}/consultation-notes",
    response_model=list[ConsultationNoteOut],
    summary="List consultation notes for a visit (chronological; clinical fields filtered by role)",
)
def list_consultation_notes(
    visit_id: uuid.UUID,
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
) -> list[ConsultationNoteOut]:
    return svc.list_consultation_notes(db, visit_id, payload)
