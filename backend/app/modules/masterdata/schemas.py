"""Pydantic schemas for master data and OP sequences (BE-T2.1, BE-T2.2)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.modules.masterdata.models import VALID_MASTER_DATA_TYPES


class MasterDataItemOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    type: str
    code: str
    label: str
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    created_by: uuid.UUID | None = None
    updated_by: uuid.UUID | None = None


class MasterDataCreateRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=40, pattern=r"^[A-Z0-9_]+$")
    label: str = Field(..., min_length=1, max_length=120)
    sort_order: int = Field(default=0, ge=0, le=32767)

    @model_validator(mode="after")
    def _strip(self) -> "MasterDataCreateRequest":
        self.code = self.code.strip().upper()
        self.label = self.label.strip()
        return self


class MasterDataUpdateRequest(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    sort_order: int | None = Field(default=None, ge=0, le=32767)
    is_active: bool | None = None

    @model_validator(mode="after")
    def _at_least_one(self) -> "MasterDataUpdateRequest":
        if self.label is None and self.sort_order is None and self.is_active is None:
            raise ValueError("At least one field must be provided for update")
        if self.label is not None:
            self.label = self.label.strip()
        return self


# ── OP Sequence schemas ───────────────────────────────────────────────────────


class OpSequenceOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    category_code: str
    prefix: str
    last_sequence: int
    padding_width: int
    number_format: str
    reset_policy: str
    is_active: bool
    last_reset_year: int | None = None
    created_at: datetime
    updated_at: datetime


class OpSequenceUpdateRequest(BaseModel):
    prefix: str | None = Field(default=None, min_length=1, max_length=10, pattern=r"^[A-Z0-9]+$")
    padding_width: int | None = Field(default=None, ge=1, le=12)
    number_format: str | None = Field(default=None, min_length=1, max_length=40)
    reset_policy: str | None = Field(default=None, pattern=r"^(NEVER|YEARLY)$")
    is_active: bool | None = None

    @model_validator(mode="after")
    def _at_least_one(self) -> "OpSequenceUpdateRequest":
        fields = [self.prefix, self.padding_width, self.number_format, self.reset_policy, self.is_active]
        if all(f is None for f in fields):
            raise ValueError("At least one field must be provided for update")
        if self.prefix is not None:
            self.prefix = self.prefix.strip().upper()
        return self
