"""Audit log routes (API-T12.1).

Routes:
  GET /audit-logs        — list with filters (admin only)
  GET /audit-logs/{id}   — single entry with old/new JSON (admin only)
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_permission
from app.core.permissions import PERM_VIEW_AUDIT
from app.modules.audit import service as svc
from app.modules.audit.schemas import AuditLogOut

ViewAudit = Annotated[dict, Depends(require_permission(PERM_VIEW_AUDIT))]

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("", summary="List audit log entries with optional filters (admin only)")
def list_audit_logs(
    payload: ViewAudit,
    db: Annotated[Session, Depends(get_db)],
    user_id: uuid.UUID | None = Query(default=None),
    patient_id: uuid.UUID | None = Query(default=None),
    action: str | None = Query(default=None, max_length=40),
    entity_type: str | None = Query(default=None, max_length=60),
    entity_id: str | None = Query(default=None, max_length=64),
    from_dt: datetime | None = Query(default=None, alias="from"),
    to_dt: datetime | None = Query(default=None, alias="to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    return svc.list_audit_logs(
        db,
        user_id=user_id,
        patient_id=patient_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        from_dt=from_dt,
        to_dt=to_dt,
        page=page,
        page_size=page_size,
    )


@router.get("/{log_id}", response_model=AuditLogOut, summary="Get a single audit log entry")
def get_audit_log(
    log_id: int,
    payload: ViewAudit,
    db: Annotated[Session, Depends(get_db)],
) -> AuditLogOut:
    return svc.get_audit_log(db, log_id)
