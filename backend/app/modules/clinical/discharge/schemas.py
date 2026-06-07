"""Pydantic schemas for discharge summary APIs (API-T8.1)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator


class DischargeSummaryFields(BaseModel):
    doctor_id: uuid.UUID | None = None
    admission_date: date | None = None
    discharge_date: date | None = None
    diagnosis: str | None = None
    presenting_complaints: str | None = None
    investigations_admission: str | None = None
    treatments: str | None = None
    condition_at_discharge: str | None = Field(default=None, max_length=40)
    follow_up_period: str | None = Field(default=None, max_length=100)
    discharge_advice: str | None = None
    medications: str | None = None
    yoga_guidance: str | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> DischargeSummaryFields:
        if (
            self.admission_date is not None
            and self.discharge_date is not None
            and self.discharge_date < self.admission_date
        ):
            raise ValueError("discharge_date must be on or after admission_date")
        return self


class DischargeSummaryCreateRequest(DischargeSummaryFields):
    pass


class DischargeSummaryUpdateRequest(DischargeSummaryFields):
    version: int = Field(..., ge=1)


class DischargeSummaryFinalizeRequest(BaseModel):
    version: int = Field(..., ge=1)


class DischargeSummaryAmendRequest(DischargeSummaryFields):
    pass


class DischargeSummaryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    visit_id: uuid.UUID
    patient_id: uuid.UUID
    doctor_id: uuid.UUID | None = None
    admission_date: date | None = None
    discharge_date: date | None = None
    diagnosis: str | None = None
    presenting_complaints: str | None = None
    investigations_admission: str | None = None
    treatments: str | None = None
    condition_at_discharge: str | None = None
    follow_up_period: str | None = None
    discharge_advice: str | None = None
    medications: str | None = None
    yoga_guidance: str | None = None
    is_finalized: bool
    finalized_at: datetime | None = None
    finalized_by: uuid.UUID | None = None
    amends_id: uuid.UUID | None = None
    is_superseded: bool = False
    superseded_by: uuid.UUID | None = None
    version: int
    created_at: datetime
    created_by: uuid.UUID | None = None
    updated_at: datetime
    updated_by: uuid.UUID | None = None
