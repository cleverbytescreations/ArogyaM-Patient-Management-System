"""Pydantic schemas for document metadata and access."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class DocumentOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    patient_id: uuid.UUID
    visit_id: uuid.UUID | None = None
    document_type_code: str
    title: str | None = None
    file_name: str
    content_type: str | None = None
    file_size_bytes: int | None = None
    checksum_sha256: str | None = None
    document_date: date | None = None
    is_historical: bool
    status: str
    remarks: str | None = None
    uploaded_by: uuid.UUID | None = None
    uploaded_at: datetime
    updated_at: datetime
    updated_by: uuid.UUID | None = None


class DocumentUpdateRequest(BaseModel):
    document_type_code: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, max_length=200)
    document_date: date | None = None
    is_historical: bool | None = None
    status: str | None = Field(default=None, pattern="^(ACTIVE|ARCHIVED|DELETED)$")
    remarks: str | None = None


class DocumentDownloadUrlOut(BaseModel):
    url: str
    expires_in_seconds: int
