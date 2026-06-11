"""Backup service (BE-T13.1). Read-only status + on-demand trigger."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.backup import repository as repo
from app.modules.backup.schemas import BackupLogOut, BackupStatusOut, BackupTriggerOut


def get_backup_status(db: Session, recent_limit: int = 10) -> BackupStatusOut:
    latest = repo.get_latest_backup(db)
    recent = repo.list_recent_backups(db, limit=recent_limit)
    return BackupStatusOut(
        latest=BackupLogOut.model_validate(latest) if latest else None,
        recent=[BackupLogOut.model_validate(r) for r in recent],
    )


def trigger_backup(user_id: uuid.UUID) -> BackupTriggerOut:
    """Write the trigger sentinel file that the backup container polls for.

    The backup container detects this file (checked every 10 s), reads the
    user_id, deletes the file, and runs both backup scripts immediately with
    MANUAL_TRIGGER_USER_ID set so the backup_log rows carry triggered_by.
    """
    trigger_path = Path(settings.backup_trigger_file)
    try:
        trigger_path.parent.mkdir(parents=True, exist_ok=True)
        trigger_path.write_text(str(user_id))
    except OSError as exc:
        raise RuntimeError(
            f"Backup trigger file could not be written ({trigger_path}): {exc}. "
            "Ensure the backup volume is mounted at the correct path."
        ) from exc
    return BackupTriggerOut(triggered_at=datetime.now(timezone.utc))
