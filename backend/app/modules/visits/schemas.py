"""Pydantic schemas for visits, case sheets, and consultation notes (BE-T6.1–BE-T6.3)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


# ── Patient profile shell (BE-T3.x) ───────────────────────────────────────────
# Compact patient reference embedded in visit responses so callers have context
# without needing a separate patient lookup.  Clinical fields (blood_group, etc.)
# are not included here — those live on the full PatientOut schema.


class PatientProfileShell(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    op_number: str
    full_name: str
    op_category_code: str
    gender: str | None = None
    age_years: int | None = None
    status: str


# ── Visit ──────────────────────────────────────────────────────────────────────


class VisitCreateRequest(BaseModel):
    visit_date: date
    visit_type_code: str = Field(..., min_length=1, max_length=40)
    consultation_category: str | None = Field(default=None, max_length=40)
    doctor_id: uuid.UUID | None = None
    is_scheduled: bool = False
    reason: str | None = Field(default=None, max_length=255)


class VisitUpdateRequest(BaseModel):
    visit_date: date | None = None
    visit_type_code: str | None = Field(default=None, min_length=1, max_length=40)
    consultation_category: str | None = Field(default=None, max_length=40)
    doctor_id: uuid.UUID | None = None
    is_scheduled: bool | None = None
    status: str | None = Field(default=None, pattern="^(OPEN|COMPLETED|CANCELLED)$")
    reason: str | None = Field(default=None, max_length=255)
    cancellation_reason: str | None = Field(default=None, max_length=255)
    change_reason: str | None = Field(default=None, max_length=255)
    version: int = Field(..., ge=1)


class VisitOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    patient_id: uuid.UUID
    visit_date: date
    visit_type_code: str
    consultation_category: str | None = None
    doctor_id: uuid.UUID | None = None
    is_scheduled: bool
    status: str
    reason: str | None = None
    cancellation_reason: str | None = None
    version: int
    created_at: datetime
    updated_at: datetime
    created_by: uuid.UUID | None = None
    patient_shell: PatientProfileShell | None = None


class VisitListItemOut(VisitOut):
    """Visit row for list views — adds at-a-glance clinical record indicators."""

    has_case_sheet: bool = False
    consultation_notes_count: int = 0


class VisitQueueItem(BaseModel):
    """Compact visit row for the daily queue — no PHI beyond patient name/OP."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    patient_id: uuid.UUID
    patient_name: str
    op_number: str
    visit_date: date
    visit_type_code: str
    consultation_category: str | None = None
    status: str
    reason: str | None = None
    doctor_name: str | None = None


class VisitRegisterItem(BaseModel):
    """Paginated visit row for the Visit Register — includes is_scheduled flag."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    patient_id: uuid.UUID
    patient_name: str
    op_number: str
    visit_date: date
    visit_type_code: str
    consultation_category: str | None = None
    is_scheduled: bool
    status: str
    reason: str | None = None
    cancellation_reason: str | None = None
    version: int
    doctor_id: uuid.UUID | None = None
    doctor_name: str | None = None


# ── Case sheet ─────────────────────────────────────────────────────────────────

# All content fields are marked optional so a partial upsert is possible.
# The uq_case_sheets_visit constraint enforces one-per-visit at the DB level.


class CaseSheetUpsertRequest(BaseModel):
    appetite: str | None = None
    sleep: str | None = None
    motion: str | None = None
    energy_level: str | None = None
    hereditary_diseases: str | None = None
    hereditary_diseases_mother: str | None = None
    hereditary_diseases_father: str | None = None
    past_ailments: str | None = None
    surgeries: str | None = None
    exercise_routine: str | None = None
    deliveries: str | None = None
    normal_deliveries: int | None = Field(default=None, ge=0)
    caesarian_deliveries: int | None = Field(default=None, ge=0)
    present_complaints: str | None = None
    other_observations: str | None = None
    remarks: str | None = None
    # version is required only for updates; omit on first PUT (will be ignored)
    version: int | None = Field(default=None, ge=1)


class CaseSheetOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    visit_id: uuid.UUID
    patient_id: uuid.UUID
    appetite: str | None = None
    sleep: str | None = None
    motion: str | None = None
    energy_level: str | None = None
    hereditary_diseases: str | None = None
    hereditary_diseases_mother: str | None = None
    hereditary_diseases_father: str | None = None
    past_ailments: str | None = None
    surgeries: str | None = None
    exercise_routine: str | None = None
    deliveries: str | None = None
    normal_deliveries: int | None = None
    caesarian_deliveries: int | None = None
    present_complaints: str | None = None
    other_observations: str | None = None
    remarks: str | None = None
    version: int
    created_at: datetime
    updated_at: datetime
    created_by: uuid.UUID | None = None
    updated_by: uuid.UUID | None = None


# ── Consultation notes ─────────────────────────────────────────────────────────
# Append-only — each POST creates a new entry; corrections are amendments.


class ConsultationNoteCreateRequest(BaseModel):
    doctor_id: uuid.UUID | None = None
    presenting_complaints: str | None = None
    diagnosis: str | None = None
    observations: str | None = None
    treatment_advice: str | None = None
    diet_advice: str | None = None
    yoga_advice: str | None = None
    review_date: date | None = None


class ConsultationNoteOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    visit_id: uuid.UUID
    patient_id: uuid.UUID
    doctor_id: uuid.UUID | None = None
    presenting_complaints: str | None = None
    diagnosis: str | None = None
    observations: str | None = None
    treatment_advice: str | None = None
    diet_advice: str | None = None
    yoga_advice: str | None = None
    review_date: date | None = None
    version: int
    created_at: datetime
    created_by: uuid.UUID | None = None
