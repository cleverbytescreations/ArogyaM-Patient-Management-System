export type VisitStatus = "OPEN" | "COMPLETED" | "CANCELLED";
export type PatientAliasSource = "MERGE" | "HISTORICAL" | "CORRECTION";

export interface Visit {
  id: string;
  patient_id: string;
  visit_date: string;
  visit_type_code: string;
  consultation_category: string | null;
  doctor_id: string | null;
  is_scheduled: boolean;
  status: VisitStatus;
  reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface VisitCreateRequest {
  visit_date: string;
  visit_type_code: string;
  consultation_category?: string | null;
  doctor_id?: string | null;
  is_scheduled?: boolean;
  reason?: string | null;
}

export interface VisitUpdateRequest {
  version: number;
  status?: VisitStatus;
  doctor_id?: string | null;
  reason?: string | null;
}

export interface CaseSheet {
  id: string;
  visit_id: string;
  patient_id: string;
  appetite: string | null;
  sleep: string | null;
  motion: string | null;
  energy_level: string | null;
  hereditary_diseases: string | null;
  past_ailments: string | null;
  surgeries: string | null;
  exercise_routine: string | null;
  deliveries: string | null;
  present_complaints: string | null;
  other_observations: string | null;
  remarks: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CaseSheetUpsertRequest {
  appetite?: string | null;
  sleep?: string | null;
  motion?: string | null;
  energy_level?: string | null;
  hereditary_diseases?: string | null;
  past_ailments?: string | null;
  surgeries?: string | null;
  exercise_routine?: string | null;
  deliveries?: string | null;
  present_complaints?: string | null;
  other_observations?: string | null;
  remarks?: string | null;
  version?: number | null;
}

export interface ConsultationNote {
  id: string;
  visit_id: string;
  patient_id: string;
  doctor_id: string | null;
  presenting_complaints: string | null;
  diagnosis: string | null;
  observations: string | null;
  treatment_advice: string | null;
  diet_advice: string | null;
  yoga_advice: string | null;
  review_date: string | null;
  version: number;
  created_at: string;
}

export interface ConsultationNoteCreateRequest {
  doctor_id?: string | null;
  presenting_complaints?: string | null;
  diagnosis?: string | null;
  observations?: string | null;
  treatment_advice?: string | null;
  diet_advice?: string | null;
  yoga_advice?: string | null;
  review_date?: string | null;
}

export interface PatientAlias {
  id: string;
  patient_id: string;
  old_op_number: string;
  source: PatientAliasSource;
  remarks: string | null;
  created_at: string;
}
