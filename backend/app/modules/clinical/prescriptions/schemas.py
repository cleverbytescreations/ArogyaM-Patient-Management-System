"""Pydantic schemas for prescription APIs (API-T7.1)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class PrescriptionItemCreateRequest(BaseModel):
    line_no: int | None = Field(default=None, ge=1, le=32767)
    medicine_name: str = Field(..., min_length=1, max_length=200)
    dosage: str | None = Field(default=None, max_length=100)
    dosage_unit: str | None = Field(default=None, max_length=20)
    timing: str | None = Field(default=None, max_length=100)
    duration: str | None = Field(default=None, max_length=100)
    duration_unit: str | None = Field(default=None, max_length=20)
    usage_instruction: str | None = None
    application_route: str | None = Field(default=None, max_length=20)


class PrescriptionCreateRequest(BaseModel):
    doctor_id: uuid.UUID | None = None
    prescription_date: date | None = None
    instructions: str | None = None
    review_advice: str | None = None
    medicine_details: str | None = None
    items: list[PrescriptionItemCreateRequest] = Field(default_factory=list)

    @field_validator("items")
    @classmethod
    def unique_line_numbers(
        cls, items: list[PrescriptionItemCreateRequest]
    ) -> list[PrescriptionItemCreateRequest]:
        explicit = [item.line_no for item in items if item.line_no is not None]
        if len(explicit) != len(set(explicit)):
            raise ValueError("Duplicate prescription item line_no values are not allowed")
        return items


class PrescriptionUpdateRequest(BaseModel):
    version: int = Field(..., ge=1)
    doctor_id: uuid.UUID | None = None
    prescription_date: date | None = None
    instructions: str | None = None
    review_advice: str | None = None
    medicine_details: str | None = None
    items: list[PrescriptionItemCreateRequest] = Field(default_factory=list)

    @field_validator("items")
    @classmethod
    def unique_line_numbers(
        cls, items: list[PrescriptionItemCreateRequest]
    ) -> list[PrescriptionItemCreateRequest]:
        explicit = [item.line_no for item in items if item.line_no is not None]
        if len(explicit) != len(set(explicit)):
            raise ValueError("Duplicate prescription item line_no values are not allowed")
        return items


class PrescriptionItemOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    prescription_id: uuid.UUID
    line_no: int
    medicine_name: str
    dosage: str | None = None
    dosage_unit: str | None = None
    timing: str | None = None
    duration: str | None = None
    duration_unit: str | None = None
    usage_instruction: str | None = None
    application_route: str | None = None
    created_at: datetime


class PrescriptionOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    visit_id: uuid.UUID
    patient_id: uuid.UUID
    doctor_id: uuid.UUID | None = None
    prescription_date: date
    instructions: str | None = None
    review_advice: str | None = None
    medicine_details: str | None = None
    version: int
    created_at: datetime
    created_by: uuid.UUID | None = None
    updated_at: datetime
    updated_by: uuid.UUID | None = None
    items: list[PrescriptionItemOut] = Field(default_factory=list)
