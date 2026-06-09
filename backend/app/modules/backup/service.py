"""Backup status service (BE-T13.1). Read-only — cron scripts write backup_log rows."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.modules.backup import repository as repo
from app.modules.backup.schemas import BackupLogOut, BackupStatusOut


def get_backup_status(db: Session, recent_limit: int = 10) -> BackupStatusOut:
    latest = repo.get_latest_backup(db)
    recent = repo.list_recent_backups(db, limit=recent_limit)
    return BackupStatusOut(
        latest=BackupLogOut.model_validate(latest) if latest else None,
        recent=[BackupLogOut.model_validate(r) for r in recent],
    )
