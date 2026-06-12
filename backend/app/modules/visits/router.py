"""Visit and clinical routes (API-T6.1).

Routes:
  POST   /patients/{id}/visits            — create visit for patient
  GET    /patients/{id}/visits            — list visits for patient
  GET    /visits/{id}                     — get visit
  PUT    /visits/{id}                     — update visit
  PUT    /visits/{id}/case-sheet          — upsert case sheet (idempotent)
  GET    /visits/{id}/case-sheet          — read case sheet
  GET    /visits/{id}/case-sheet/report.pdf — download/print case sheet report (PDF)
  POST   /visits/{id}/consultation-notes  — append consultation note
  GET    /visits/{id}/consultation-notes  — list consultation notes
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import Response as RawResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db, require_permission
from app.core.errors import ForbiddenError
from app.core.pagination import PagedResponse, PaginationParams
from app.core.permissions import (
    PERM_ADD_CONSULTATION,
    PERM_EXPORT,
    PERM_VIEW_MEDICAL_HISTORY,
    PERM_VIEW_PATIENT,
)
from app.modules.visits import report_service
from app.modules.visits import service as svc
from app.modules.visits.schemas import (
    CaseSheetOut,
    CaseSheetUpsertRequest,
    ConsultationNoteCreateRequest,
    ConsultationNoteOut,
    VisitCreateRequest,
    VisitListItemOut,
    VisitOut,
    VisitQueueItem,
    VisitRegisterItem,
    VisitUpdateRequest,
)

# ── Dependency aliases ─────────────────────────────────────────────────────────

ViewPatient = Annotated[dict, Depends(require_permission(PERM_VIEW_PATIENT))]
AddConsultation = Annotated[dict, Depends(require_permission(PERM_ADD_CONSULTATION))]


def _require_case_sheet_export(payload: Annotated[dict, Depends(get_current_user)]) -> dict:
    """Exporting the full case sheet PDF needs export rights AND clinical-data
    visibility — neither permission alone is sufficient (avoids leaking PHI to
    a role that has one but not the other)."""
    perms: list[str] = payload.get("permissions", [])
    if PERM_EXPORT not in perms or PERM_VIEW_MEDICAL_HISTORY not in perms:
        raise ForbiddenError(f"Permission required: {PERM_EXPORT} and {PERM_VIEW_MEDICAL_HISTORY}")
    return payload


ExportCaseSheet = Annotated[dict, Depends(_require_case_sheet_export)]

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
    response_model=list[VisitListItemOut],
    summary="List all visits for a patient (most-recent first)",
)
def list_visits(
    patient_id: uuid.UUID,
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
) -> list[VisitListItemOut]:
    return svc.list_visits(db, patient_id, payload)


# ── Visit-scoped routes ────────────────────────────────────────────────────────

visits_router = APIRouter(prefix="/visits", tags=["visits"])


@visits_router.get(
    "/queue",
    response_model=list[VisitQueueItem],
    summary="Visit queue — filter by doctor, date, or status",
)
def get_visit_queue(
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
    doctor_id: uuid.UUID | None = None,
    visit_date: date | None = None,
    status: str | None = None,
) -> list[VisitQueueItem]:
    return svc.get_visit_queue(
        db,
        doctor_id=doctor_id,
        visit_date=visit_date,
        status=status,
    )


@visits_router.get(
    "/register",
    response_model=PagedResponse[VisitRegisterItem],
    summary="Visit Register — paginated list of visits with filters",
)
def get_visit_register(
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
    from_date: date | None = None,
    to_date: date | None = None,
    doctor_id: uuid.UUID | None = None,
    status: str | None = None,
) -> PagedResponse[VisitRegisterItem]:
    items, total = svc.get_visit_register(
        db,
        from_date=from_date,
        to_date=to_date,
        doctor_id=doctor_id,
        status=status,
        offset=pagination.offset,
        limit=pagination.page_size,
        actor_payload=payload,
    )
    return PagedResponse(
        items=items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


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


@visits_router.get(
    "/{visit_id}/case-sheet/report.pdf",
    summary="Download or print the Online Consultations Case Sheet as a PDF",
)
def get_case_sheet_report_pdf(
    visit_id: uuid.UUID,
    payload: ExportCaseSheet,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
    disposition: Literal["inline", "attachment"] = "attachment",
) -> RawResponse:
    pdf_bytes, filename = report_service.generate_case_sheet_report_pdf(
        db, visit_id, payload, request
    )
    return RawResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


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
