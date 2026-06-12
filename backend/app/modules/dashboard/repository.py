"""Read-only aggregation queries for the dashboard summary (BE-DASH.3).

All queries return counts/timestamps only — no PII/PHI in results.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog
from app.modules.auth.models import User
from app.modules.backup.models import BackupLog
from app.modules.followups.models import FollowUp
from app.modules.patients.models import Patient
from app.modules.visits.models import Visit


def count_registrations(db: Session, today: date) -> tuple[int, int]:
    """Return (today_count, this_week_count) for patient registrations."""
    week_start = today - timedelta(days=today.weekday())  # Monday

    today_count: int = db.execute(
        select(func.count(Patient.id)).where(Patient.registration_date == today)
    ).scalar_one()

    week_count: int = db.execute(
        select(func.count(Patient.id)).where(Patient.registration_date >= week_start)
    ).scalar_one()

    return today_count, week_count


def count_visits_by_status(
    db: Session,
    today: date,
    doctor_id: uuid.UUID | None = None,
) -> tuple[int, int]:
    """Return (open_today, completed_today) for visits on today's date.

    Pass doctor_id to restrict counts to a single doctor's visits.
    """
    base_conditions_open = [Visit.visit_date == today, Visit.status == "OPEN"]
    base_conditions_comp = [Visit.visit_date == today, Visit.status == "COMPLETED"]
    if doctor_id is not None:
        base_conditions_open.append(Visit.doctor_id == doctor_id)
        base_conditions_comp.append(Visit.doctor_id == doctor_id)

    open_count: int = db.execute(
        select(func.count(Visit.id)).where(*base_conditions_open)
    ).scalar_one()

    completed_count: int = db.execute(
        select(func.count(Visit.id)).where(*base_conditions_comp)
    ).scalar_one()

    return open_count, completed_count


def count_scheduled_visits(db: Session, today: date) -> tuple[int, int]:
    """Return (scheduled_today, walkin_today) based on is_scheduled flag."""
    scheduled: int = db.execute(
        select(func.count(Visit.id)).where(
            Visit.visit_date == today,
            Visit.is_scheduled.is_(True),
        )
    ).scalar_one()

    walkin: int = db.execute(
        select(func.count(Visit.id)).where(
            Visit.visit_date == today,
            Visit.is_scheduled.is_(False),
        )
    ).scalar_one()

    return scheduled, walkin


def count_followups_due(db: Session, today: date) -> tuple[int, int, int]:
    """Return (due_today, overdue, upcoming_7days) counts for PENDING follow-ups."""
    due_today: int = db.execute(
        select(func.count(FollowUp.id)).where(
            FollowUp.follow_up_date == today,
            FollowUp.status_code == "PENDING",
        )
    ).scalar_one()

    overdue: int = db.execute(
        select(func.count(FollowUp.id)).where(
            FollowUp.follow_up_date < today,
            FollowUp.status_code == "PENDING",
        )
    ).scalar_one()

    week_end = today + timedelta(days=7)
    upcoming_7days: int = db.execute(
        select(func.count(FollowUp.id)).where(
            FollowUp.follow_up_date > today,
            FollowUp.follow_up_date <= week_end,
            FollowUp.status_code == "PENDING",
        )
    ).scalar_one()

    return due_today, overdue, upcoming_7days


def count_pending_merge_requests(db: Session) -> int:
    """Count PENDING merge requests. Uses text() since there is no ORM model."""
    result = db.execute(
        text("SELECT COUNT(*) FROM merge_requests WHERE status = 'PENDING'")
    ).scalar_one()
    return int(result)


def count_users_by_status(db: Session) -> tuple[int, int]:
    """Return (active_count, locked_count) for user accounts."""
    active: int = db.execute(
        select(func.count(User.id)).where(User.status == "ACTIVE")
    ).scalar_one()

    locked: int = db.execute(
        select(func.count(User.id)).where(User.status == "LOCKED")
    ).scalar_one()

    return active, locked


def get_latest_backup(db: Session) -> BackupLog | None:
    return db.execute(
        select(BackupLog).order_by(BackupLog.started_at.desc()).limit(1)
    ).scalar_one_or_none()


def get_recent_audit_entries(
    db: Session,
    limit: int = 10,
) -> list[tuple[AuditLog, str | None]]:
    """Return the most recent audit entries with actor full_name (no patient data)."""
    rows = db.execute(
        select(AuditLog, User.full_name.label("user_name"))
        .outerjoin(User, AuditLog.user_id == User.id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    ).all()
    return [(row.AuditLog, row.user_name) for row in rows]
