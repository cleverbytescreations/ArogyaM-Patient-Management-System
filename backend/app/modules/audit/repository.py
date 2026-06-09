"""Repository for audit log reads (BE-T12.1). Append-only — no writes here."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import NamedTuple

from sqlalchemy import and_, select, func
from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog
from app.modules.auth.models import User
from app.modules.patients.models import Patient


class AuditLogRow(NamedTuple):
    log: AuditLog
    user_name: str | None
    patient_name: str | None


def _data_query(conditions: list):
    q = (
        select(
            AuditLog,
            User.full_name.label("user_name"),
            Patient.full_name.label("patient_name"),
        )
        .outerjoin(User, AuditLog.user_id == User.id)
        .outerjoin(Patient, AuditLog.patient_id == Patient.id)
    )
    if conditions:
        q = q.where(and_(*conditions))
    return q


def get_audit_log_by_id(db: Session, log_id: int) -> AuditLogRow | None:
    row = db.execute(
        _data_query([AuditLog.id == log_id])
    ).first()
    if row is None:
        return None
    return AuditLogRow(log=row.AuditLog, user_name=row.user_name, patient_name=row.patient_name)


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
) -> tuple[list[AuditLogRow], int]:
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

    count_base = select(AuditLog)
    if conditions:
        count_base = count_base.where(and_(*conditions))
    count_q = select(func.count()).select_from(count_base.subquery())
    total: int = db.execute(count_q).scalar_one()

    rows = db.execute(
        _data_query(conditions)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return [
        AuditLogRow(log=r.AuditLog, user_name=r.user_name, patient_name=r.patient_name)
        for r in rows
    ], total
