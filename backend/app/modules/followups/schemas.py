"""Pydantic schemas for follow-ups (BE-T11.1)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

# Valid status codes and allowed transitions
FOLLOWUP_STATUSES = frozenset({"PENDING", "CONTACTED", "NOT_REACHABLE", "COMPLETED", "RESCHEDULED"})

# Allowed transitions: from_status -> set of to_statuses
VALID_TRANSITIONS: dict[str, frozenset[str]] = {
    "PENDING": frozenset({"CONTACTED", "NOT_REACHABLE", "RESCHEDULED"}),
    "CONTACTED": frozenset({"COMPLETED", "RESCHEDULED"}),
    "NOT_REACHABLE": frozenset({"CONTACTED", "COMPLETED", "RESCHEDULED"}),
    "COMPLETED": frozenset(),
    "RESCHEDULED": frozenset(),
}


class FollowUpCreateRequest(BaseModel):
    follow_up_date: date
    reason: str | None = Field(default=None, max_length=255)
    assigned_to: uuid.UUID | None = None
    remarks: str | None = None
    visit_id: uuid.UUID | None = None


class FollowUpUpdateRequest(BaseModel):
    follow_up_date: date | None = None
    reason: str | None = Field(default=None, max_length=255)
    assigned_to: uuid.UUID | None = None
    status_code: str | None = Field(default=None, pattern="^(PENDING|CONTACTED|NOT_REACHABLE|COMPLETED|RESCHEDULED)$")
    remarks: str | None = None
    next_followup_id: uuid.UUID | None = None
    version: int = Field(..., ge=1)


class FollowUpOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    patient_id: uuid.UUID
    visit_id: uuid.UUID | None = None
    follow_up_date: date
    reason: str | None = None
    assigned_to: uuid.UUID | None = None
    status_code: str
    next_followup_id: uuid.UUID | None = None
    remarks: str | None = None
    version: int
    created_at: datetime
    updated_at: datetime
    created_by: uuid.UUID | None = None
    updated_by: uuid.UUID | None = None
