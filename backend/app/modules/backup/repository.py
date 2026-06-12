"""Repository for backup_log (BE-T13.1)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
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


def get_expired_backup_entries(db: Session, retention_days: int = 7) -> list[BackupLog]:
    """Return successful backup_log rows older than retention_days that are not yet purged."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    return list(
        db.execute(
            select(BackupLog)
            .where(
                BackupLog.status == "SUCCESS",
                BackupLog.deleted_at.is_(None),
                BackupLog.started_at < cutoff,
            )
            .order_by(BackupLog.started_at.asc())
        ).scalars()
    )


def soft_delete_backup_entries(db: Session, entry_ids: list[int]) -> int:
    """Set deleted_at on the given backup_log row IDs. Returns the count updated."""
    if not entry_ids:
        return 0
    result = db.execute(
        update(BackupLog)
        .where(BackupLog.id.in_(entry_ids), BackupLog.deleted_at.is_(None))
        .values(deleted_at=datetime.now(timezone.utc))
    )
    return result.rowcount
