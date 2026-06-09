"""Pydantic schemas for audit log read API (BE-T12.1)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class AuditLogOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    user_id: uuid.UUID | None = None
    user_name: str | None = None
    user_role: str | None = None
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    patient_id: uuid.UUID | None = None
    patient_name: str | None = None
    old_value: Any | None = None
    new_value: Any | None = None
    description: str | None = None
    ip_address: str | None = None

    @field_validator("ip_address", mode="before")
    @classmethod
    def coerce_ip_address(cls, v: object) -> str | None:
        if v is None:
            return None
        return str(v)
    user_agent: str | None = None
    request_id: str | None = None
    created_at: datetime
