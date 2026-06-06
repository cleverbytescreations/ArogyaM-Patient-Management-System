"""Pydantic schemas for patient registration & profile (BE-T3.1)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class PatientAliasOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    patient_id: uuid.UUID
    old_op_number: str
    source: str
    remarks: str | None = None
    created_at: datetime
    created_by: uuid.UUID | None = None


class PatientOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    op_number: str
    op_category_code: str
    full_name: str
    date_of_birth: date | None = None
    age_years: int | None = None
    gender: str | None = None
    mobile: str | None = None
    email: str | None = None
    address_line: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    marital_status: str | None = None
    profession: str | None = None
    dietary_preference: str | None = None
    blood_group: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    status: str
    merged_into: uuid.UUID | None = None
    is_historical: bool
    registration_date: date
    remarks: str | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class PatientCreateRequest(BaseModel):
    op_category_code: str = Field(..., min_length=1, max_length=40)
    full_name: str = Field(..., min_length=1, max_length=150)
    date_of_birth: date | None = None
    age_years: int | None = Field(default=None, ge=0, le=150)
    gender: str | None = Field(default=None, max_length=20)
    mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=254)
    address_line: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    pincode: str | None = Field(default=None, max_length=12)
    marital_status: str | None = Field(default=None, max_length=20)
    profession: str | None = Field(default=None, max_length=120)
    dietary_preference: str | None = Field(default=None, max_length=30)
    blood_group: str | None = Field(default=None, max_length=5)
    height_cm: float | None = Field(default=None, gt=0)
    weight_kg: float | None = Field(default=None, gt=0)
    is_historical: bool = False
    registration_date: date | None = None
    remarks: str | None = None


class PatientUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    date_of_birth: date | None = None
    age_years: int | None = Field(default=None, ge=0, le=150)
    gender: str | None = Field(default=None, max_length=20)
    mobile: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=254)
    address_line: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    pincode: str | None = Field(default=None, max_length=12)
    marital_status: str | None = Field(default=None, max_length=20)
    profession: str | None = Field(default=None, max_length=120)
    dietary_preference: str | None = Field(default=None, max_length=30)
    blood_group: str | None = Field(default=None, max_length=5)
    height_cm: float | None = Field(default=None, gt=0)
    weight_kg: float | None = Field(default=None, gt=0)
    remarks: str | None = None
    version: int = Field(..., ge=1)


class PatientSearchResult(BaseModel):
    id: uuid.UUID
    op_number: str
    op_category_code: str
    full_name: str
    age_years: int | None = None
    gender: str | None = None
    mobile_masked: str | None = None
    status: str
    registration_date: date
