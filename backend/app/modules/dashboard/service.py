"""Dashboard service — assembles the summary filtered by caller permissions (BE-DASH.4)."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.core.permissions import (
    PERM_BACKUP_CONTROL,
    PERM_MANAGE_FOLLOWUPS,
    PERM_MANAGE_USERS,
    PERM_MERGE_RECORDS,
    PERM_VIEW_AUDIT,
    PERM_VIEW_PATIENT,
)
from app.modules.dashboard import repository as repo
from app.modules.dashboard.schemas import (
    AuditEntrySummary,
    BackupSummary,
    DashboardSummary,
    FollowupsSummary,
    MergeRequestsSummary,
    RegistrationsSummary,
    UsersSummary,
    VisitsSummary,
)


def get_summary(db: Session, actor_payload: dict) -> DashboardSummary:
    perms: set[str] = set(actor_payload.get("permissions", []))
    today = date.today()
    result = DashboardSummary()

    if PERM_VIEW_PATIENT in perms:
        today_reg, week_reg = repo.count_registrations(db, today)
        result.registrations = RegistrationsSummary(today=today_reg, this_week=week_reg)

        open_v, completed_v = repo.count_visits_by_status(db, today)
        result.visits = VisitsSummary(open_today=open_v, completed_today=completed_v)

    if PERM_MANAGE_FOLLOWUPS in perms:
        due, overdue = repo.count_followups_due(db, today)
        result.followups = FollowupsSummary(due_today=due, overdue=overdue)

    if PERM_MERGE_RECORDS in perms:
        pending = repo.count_pending_merge_requests(db)
        result.merge_requests = MergeRequestsSummary(pending=pending)

    if PERM_MANAGE_USERS in perms:
        active, locked = repo.count_users_by_status(db)
        result.users = UsersSummary(active=active, locked=locked)

    if PERM_BACKUP_CONTROL in perms:
        backup = repo.get_latest_backup(db)
        if backup:
            now = datetime.now(timezone.utc)
            started = backup.started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            age_hours = (now - started).total_seconds() / 3600
            result.backup = BackupSummary(
                last_run_at=backup.started_at,
                last_status=backup.status,
                age_hours=round(age_hours, 1),
            )
        else:
            result.backup = BackupSummary(
                last_run_at=None,
                last_status=None,
                age_hours=None,
            )

    if PERM_VIEW_AUDIT in perms:
        entries = repo.get_recent_audit_entries(db, limit=10)
        result.audit_recent = [
            AuditEntrySummary(
                id=log.id,
                action=log.action,
                entity_type=log.entity_type,
                user_name=user_name,
                created_at=log.created_at,
            )
            for log, user_name in entries
        ]

    return result
