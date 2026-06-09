"""Repository for backup_log (BE-T13.1)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.backup.models import BackupLog


def get_latest_backup(db: Session) -> BackupLog | None:
    return db.execute(
        select(BackupLog).order_by(BackupLog.started_at.desc()).limit(1)
    ).scalar_one_or_none()


def list_recent_backups(db: Session, limit: int = 10) -> list[BackupLog]:
    return list(
        db.execute(
            select(BackupLog).order_by(BackupLog.started_at.desc()).limit(limit)
        ).scalars()
    )
