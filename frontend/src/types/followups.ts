export type FollowUpStatusCode =
  | "PENDING"
  | "CONTACTED"
  | "NOT_REACHABLE"
  | "COMPLETED"
  | "RESCHEDULED";

export interface FollowUp {
  id: string;
  patient_id: string;
  patient_name: string | null;
  visit_id: string | null;
  follow_up_date: string;
  reason: string | null;
  assigned_to: string | null;
  status_code: FollowUpStatusCode;
  next_followup_id: string | null;
  remarks: string | null;
  version: number;
  created_at: string;
}

export interface FollowUpCreateRequest {
  follow_up_date: string;
  visit_id?: string | null;
  reason?: string | null;
  assigned_to?: string | null;
  status_code?: FollowUpStatusCode;
}

export interface FollowUpUpdateRequest {
  version: number;
  follow_up_date?: string;
  reason?: string | null;
  assigned_to?: string | null;
  status_code?: FollowUpStatusCode;
  remarks?: string | null;
}
