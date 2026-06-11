"""Pydantic schemas for backup status API (BE-T13.1)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class BackupLogOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    backup_type: str
    status: str
    location_ref: str | None = None
    size_bytes: int | None = None
    message: str | None = None
    triggered_by: uuid.UUID | None = None
    started_at: datetime
    completed_at: datetime | None = None
    notification_status: str | None = None


class BackupStatusOut(BaseModel):
    latest: BackupLogOut | None = None
    recent: list[BackupLogOut] = []


class BackupTriggerOut(BaseModel):
    triggered_at: datetime
    message: str = "Backup triggered — check status in a few moments."
