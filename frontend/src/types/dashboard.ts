export interface RegistrationsSummary {
  today: number;
  this_week: number;
}

export interface VisitsSummary {
  open_today: number;
  completed_today: number;
}

export interface FollowupsSummary {
  due_today: number;
  overdue: number;
}

export interface MergeRequestsSummary {
  pending: number;
}

export interface UsersSummary {
  active: number;
  locked: number;
}

export interface BackupSummary {
  last_run_at: string | null;
  last_status: string | null;
  age_hours: number | null;
}

export interface AuditEntrySummary {
  id: number;
  action: string;
  entity_type: string | null;
  user_name: string | null;
  created_at: string;
}

export interface DashboardSummary {
  registrations: RegistrationsSummary | null;
  visits: VisitsSummary | null;
  followups: FollowupsSummary | null;
  merge_requests: MergeRequestsSummary | null;
  users: UsersSummary | null;
  backup: BackupSummary | null;
  audit_recent: AuditEntrySummary[] | null;
}
