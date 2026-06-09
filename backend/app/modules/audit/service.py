"""Audit read service (BE-T12.1). No create/update/delete — append-only."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.modules.audit import repository as repo
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
    items, total = repo.list_audit_logs(
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
        "items": [_serialize(item) for item in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def get_audit_log(db: Session, log_id: int) -> AuditLogOut:
    log = repo.get_audit_log_by_id(db, log_id)
    if not log:
        raise NotFoundError(f"Audit log {log_id} not found")
    return _serialize(log)


def _serialize(log) -> AuditLogOut:
    # ip_address is stored as PostgreSQL INET type — convert to str for Pydantic
    data = AuditLogOut.model_validate(log, from_attributes=True)
    if log.ip_address is not None:
        data.ip_address = str(log.ip_address)
    return data
