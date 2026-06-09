export type TimelineEventType =
  | "VISIT"
  | "CASE_SHEET"
  | "CONSULTATION_NOTE"
  | "PRESCRIPTION"
  | "DISCHARGE_SUMMARY"
  | "DOCUMENT"
  | "FOLLOW_UP";

export interface PatientTimelineEvent {
  type: TimelineEventType;
  occurred_on: string;
  ref_id: string;
  summary: string;
  visit_id: string | null;
}

export interface PatientTimeline {
  patient_id: string;
  events: PatientTimelineEvent[];
}
