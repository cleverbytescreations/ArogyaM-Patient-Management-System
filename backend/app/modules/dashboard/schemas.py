"""Dashboard summary schemas (BE-DASH.2)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class RegistrationsSummary(BaseModel):
    today: int
    this_week: int


class VisitsSummary(BaseModel):
    open_today: int
    completed_today: int


class FollowupsSummary(BaseModel):
    due_today: int
    overdue: int


class MergeRequestsSummary(BaseModel):
    pending: int


class UsersSummary(BaseModel):
    active: int
    locked: int


class BackupSummary(BaseModel):
    last_run_at: datetime | None
    last_status: str | None
    age_hours: float | None


class AuditEntrySummary(BaseModel):
    id: int
    action: str
    entity_type: str | None
    user_name: str | None
    created_at: datetime


class DashboardSummary(BaseModel):
    """Aggregated dashboard data. Each section is None when the caller lacks the
    gating permission — absence is meaningful, not an error."""

    registrations: RegistrationsSummary | None = None
    visits: VisitsSummary | None = None
    followups: FollowupsSummary | None = None
    merge_requests: MergeRequestsSummary | None = None
    users: UsersSummary | None = None
    backup: BackupSummary | None = None
    audit_recent: list[AuditEntrySummary] | None = None
