"""Patient timeline aggregation service (BE-T10.1)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.core.permissions import PERM_VIEW_MEDICAL_HISTORY
from app.modules.patients import repository as patient_repo
from app.modules.patients import timeline_repository as repo


class TimelineEvent(BaseModel):
    type: str
    occurred_on: datetime
    ref_id: uuid.UUID
    summary: str
    visit_id: uuid.UUID | None = None
    patient_id: uuid.UUID
    details: dict[str, str | bool | int | None] = Field(default_factory=dict)


class PatientTimeline(BaseModel):
    patient_id: uuid.UUID
    events: list[TimelineEvent]


def _has_medical_view(actor_payload: dict) -> bool:
    return PERM_VIEW_MEDICAL_HISTORY in actor_payload.get("permissions", [])


def _occurred_on(value: datetime) -> datetime:
    return repo.as_datetime(value)


def get_patient_timeline(
    db: Session,
    patient_id: uuid.UUID,
    actor_payload: dict,
    visit_id: uuid.UUID | None = None,
) -> PatientTimeline:
    patient = patient_repo.get_patient_by_id(db, patient_id)
    if patient is None:
        raise NotFoundError(f"Patient {patient_id} not found")

    can_view_medical = _has_medical_view(actor_payload)
    events: list[TimelineEvent] = []

    for visit in repo.list_visits(db, patient_id):
        events.append(
            TimelineEvent(
                type="VISIT",
                occurred_on=repo.as_datetime(visit.visit_date),
                ref_id=visit.id,
                visit_id=visit.id,
                patient_id=patient_id,
                summary=f"Visit {visit.visit_type_code} ({visit.status})",
                details={"visit_type_code": visit.visit_type_code, "status": visit.status},
            )
        )

    for case_sheet in repo.list_case_sheets(db, patient_id):
        events.append(
            TimelineEvent(
                type="CASE_SHEET",
                occurred_on=_occurred_on(case_sheet.created_at),
                ref_id=case_sheet.id,
                visit_id=case_sheet.visit_id,
                patient_id=patient_id,
                summary="Case sheet recorded" if can_view_medical else "Clinical record updated",
                details={},
            )
        )

    for note in repo.list_consultation_notes(db, patient_id):
        summary = "Consultation note recorded"
        if can_view_medical and note.diagnosis:
            summary = f"Consultation note: {note.diagnosis[:120]}"
        events.append(
            TimelineEvent(
                type="CONSULTATION_NOTE",
                occurred_on=_occurred_on(note.created_at),
                ref_id=note.id,
                visit_id=note.visit_id,
                patient_id=patient_id,
                summary=summary,
                details={"has_review_date": note.review_date is not None},
            )
        )

    for prescription in repo.list_prescriptions(db, patient_id):
        events.append(
            TimelineEvent(
                type="PRESCRIPTION",
                occurred_on=repo.as_datetime(prescription.prescription_date),
                ref_id=prescription.id,
                visit_id=prescription.visit_id,
                patient_id=patient_id,
                summary="Prescription created",
                details={},
            )
        )

    for summary in repo.list_discharge_summaries(db, patient_id):
        text = "Discharge summary finalized" if summary.is_finalized else "Discharge summary draft"
        if can_view_medical and summary.diagnosis:
            text = f"{text}: {summary.diagnosis[:120]}"
        occurred = summary.finalized_at or summary.updated_at or summary.created_at
        events.append(
            TimelineEvent(
                type="DISCHARGE_SUMMARY",
                occurred_on=_occurred_on(occurred),
                ref_id=summary.id,
                visit_id=summary.visit_id,
                patient_id=patient_id,
                summary=text,
                details={"is_finalized": summary.is_finalized},
            )
        )

    for document in repo.list_documents(db, patient_id):
        events.append(
            TimelineEvent(
                type="DOCUMENT",
                occurred_on=repo.as_datetime(document.document_date)
                if document.document_date
                else _occurred_on(document.uploaded_at),
                ref_id=document.id,
                visit_id=document.visit_id,
                patient_id=patient_id,
                summary=f"Document uploaded: {document.document_type_code}",
                details={"status": document.status, "content_type": document.content_type},
            )
        )

    for follow_up in repo.list_follow_ups(db, patient_id):
        events.append(
            TimelineEvent(
                type="FOLLOW_UP",
                occurred_on=repo.as_datetime(follow_up.follow_up_date),
                ref_id=follow_up.id,
                patient_id=patient_id,
                summary=f"Follow-up {follow_up.status_code}",
                details={"status_code": follow_up.status_code},
            )
        )

    if visit_id is not None:
        events = [e for e in events if e.visit_id == visit_id]

    sorted_events = sorted(events, key=lambda event: event.occurred_on, reverse=True)
    return PatientTimeline(patient_id=patient_id, events=sorted_events)
