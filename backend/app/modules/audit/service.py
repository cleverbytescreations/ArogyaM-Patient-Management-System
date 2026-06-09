"""Audit read service (BE-T12.1). No create/update/delete — append-only."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.config import settings
from app.core.errors import NotFoundError
from app.modules.audit import repository as repo
from app.modules.audit.models import AuditLog
from app.modules.audit.schemas import AuditLogOut


def list_audit_logs(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    patient_id: uuid.UUID | None,
    action: str | None,
    entity_type: str | None,
    entity_id: str | None,
    from_dt: datetime | None,
    to_dt: datetime | None,
    page: int,
    page_size: int,
) -> dict:
    rows, total = repo.list_audit_logs(
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
    return {
        "items": [_serialize(r.log, r.user_name, r.patient_name) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def purge_audit_logs(
    db: Session,
    *,
    dry_run: bool = False,
    actor_payload: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
) -> dict:
    """Delete audit records older than AUDIT_RETENTION_DAYS.

    Returns a summary dict with purged_count, cutoff_before, and dry_run flag.
    When dry_run=True, counts but does not delete.
    Raises ValueError if retention is disabled (AUDIT_RETENTION_DAYS=0).
    """
    retention_days = settings.audit_retention_days
    if retention_days <= 0:
        return {
            "purged_count": 0,
            "cutoff_before": None,
            "dry_run": dry_run,
            "skipped": True,
            "reason": "AUDIT_RETENTION_DAYS is 0 — purging is disabled",
        }

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=retention_days)
    count = repo.count_expired(db, cutoff)

    if not dry_run and count > 0:
        repo.delete_expired(db, cutoff)
        write_audit(
            db,
            action="PURGE_AUDIT_LOG",
            user_id=actor_payload["sub"] if actor_payload else None,
            user_role=",".join(actor_payload.get("roles", [])) if actor_payload else None,
            entity_type="audit_log",
            new_value={
                "purged_count": count,
                "cutoff_before": cutoff.isoformat(),
                "retention_days": retention_days,
            },
            description=f"Purged {count} audit records older than {cutoff.date().isoformat()}",
            ip_address=ip_address,
            user_agent=user_agent,
            request_id=request_id,
        )
        db.commit()

    return {
        "purged_count": count,
        "cutoff_before": cutoff.isoformat(),
        "dry_run": dry_run,
        "skipped": False,
    }


def get_audit_log(db: Session, log_id: int) -> AuditLogOut:
    row = repo.get_audit_log_by_id(db, log_id)
    if not row:
        raise NotFoundError(f"Audit log {log_id} not found")
    return _serialize(row.log, row.user_name, row.patient_name)


def _serialize(
    log: AuditLog,
    user_name: str | None = None,
    patient_name: str | None = None,
) -> AuditLogOut:
    data = AuditLogOut.model_validate(log, from_attributes=True)
    if log.ip_address is not None:
        data.ip_address = str(log.ip_address)
    data.user_name = user_name
    data.patient_name = patient_name
    return data
