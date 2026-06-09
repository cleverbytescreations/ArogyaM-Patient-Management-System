"""Backup status route (API-T13.1).

Routes:
  GET /backup/status — most-recent run + last-N history (admin only)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_permission
from app.core.permissions import PERM_BACKUP_CONTROL
from app.modules.backup import service as svc
from app.modules.backup.schemas import BackupStatusOut

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
