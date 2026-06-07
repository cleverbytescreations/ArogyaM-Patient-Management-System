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
}

export interface PatientTimeline {
  patient_id: string;
  events: PatientTimelineEvent[];
}
