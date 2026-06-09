"""Repository for audit log reads (BE-T12.1). Append-only — no writes here."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import and_, select, func
from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog


def get_audit_log_by_id(db: Session, log_id: int) -> AuditLog | None:
    return db.execute(select(AuditLog).where(AuditLog.id == log_id)).scalar_one_or_none()


def list_audit_logs(
    db: Session,
    *,
    user_id: uuid.UUID | None = None,
    patient_id: uuid.UUID | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    from_dt: datetime | None = None,
    to_dt: datetime | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[AuditLog], int]:
    conditions = []
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if patient_id:
        conditions.append(AuditLog.patient_id == patient_id)
    if action:
        conditions.append(AuditLog.action == action)
    if entity_type:
        conditions.append(AuditLog.entity_type == entity_type)
    if entity_id:
        conditions.append(AuditLog.entity_id == entity_id)
    if from_dt:
        conditions.append(AuditLog.created_at >= from_dt)
    if to_dt:
        conditions.append(AuditLog.created_at <= to_dt)

    base_q = select(AuditLog)
    if conditions:
        base_q = base_q.where(and_(*conditions))

    count_q = select(func.count()).select_from(base_q.subquery())
    total: int = db.execute(count_q).scalar_one()

    items = list(
        db.execute(
            base_q.order_by(AuditLog.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).scalars()
    )
    return items, total
