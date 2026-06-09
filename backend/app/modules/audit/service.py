"""Audit read service (BE-T12.1). No create/update/delete — append-only."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

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
