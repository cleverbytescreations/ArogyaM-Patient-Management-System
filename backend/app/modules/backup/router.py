"""Backup routes (API-T13.1).

Routes:
  GET  /backup/status   — most-recent run + last-N history (admin only)
  POST /backup/trigger  — write sentinel file to kick off an immediate backup run
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_permission
from app.core.permissions import PERM_BACKUP_CONTROL
from app.modules.backup import service as svc
from app.modules.backup.schemas import BackupStatusOut, BackupTriggerOut

BackupControl = Annotated[dict, Depends(require_permission(PERM_BACKUP_CONTROL))]

router = APIRouter(prefix="/backup", tags=["backup"])


@router.get(
    "/status",
    response_model=BackupStatusOut,
    summary="Backup status — latest run + recent history (admin only)",
)
def get_backup_status(
    payload: BackupControl,
    db: Annotated[Session, Depends(get_db)],
    recent_limit: int = Query(default=10, ge=1, le=50),
) -> BackupStatusOut:
    return svc.get_backup_status(db, recent_limit=recent_limit)


@router.post(
    "/trigger",
    response_model=BackupTriggerOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger an immediate backup run (admin only)",
)
def trigger_backup(
    payload: BackupControl,
) -> BackupTriggerOut:
    """Writes a sentinel file that the backup container detects within ~10 s and
    acts on. Returns 202 immediately — the backup itself runs asynchronously.
    Check GET /backup/status for results."""
    user_id: uuid.UUID = uuid.UUID(str(payload["sub"]))
    try:
        return svc.trigger_backup(user_id)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
