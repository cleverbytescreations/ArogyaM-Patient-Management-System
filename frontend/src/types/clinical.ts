export interface PrescriptionItem {
  line_no?: number | null;
  medicine_name: string;
  dosage?: string | null;
  dosage_unit?: string | null;
  timing?: string | null;
  duration?: string | null;
  duration_unit?: string | null;
  usage_instruction?: string | null;
  application_route?: string | null;
}

export interface Prescription {
  id: string;
  visit_id: string;
  patient_id: string;
  doctor_id: string | null;
  prescription_date: string;
  instructions: string | null;
  review_advice: string | null;
  medicine_details: string | null;
  items: PrescriptionItem[];
  version: number;
  created_at: string;
}

export interface PrescriptionCreateRequest {
  doctor_id?: string | null;
  prescription_date?: string | null;
  instructions?: string | null;
  review_advice?: string | null;
  medicine_details?: string | null;
  items: PrescriptionItem[];
}

export interface PrescriptionUpdateRequest extends PrescriptionCreateRequest {
  version: number;
}

export interface DischargeSummary {
  id: string;
  visit_id: string;
  patient_id: string;
  doctor_id: string | null;
  admission_date: string | null;
  discharge_date: string | null;
  diagnosis: string | null;
  presenting_complaints: string | null;
  investigations_admission: string | null;
  treatments: string | null;
  condition_at_discharge: string | null;
  follow_up_period: string | null;
  discharge_advice: string | null;
  medications: string | null;
  yoga_guidance: string | null;
  is_finalized: boolean;
  finalized_at: string | null;
  finalized_by: string | null;
  amends_id: string | null;
  is_superseded: boolean;
  superseded_by: string | null;
  version: number;
  created_at: string;
}

export interface DischargeSummaryCreateRequest {
  doctor_id?: string | null;
  admission_date?: string | null;
  discharge_date?: string | null;
  diagnosis?: string | null;
  presenting_complaints?: string | null;
  investigations_admission?: string | null;
  treatments?: string | null;
  condition_at_discharge?: string | null;
  follow_up_period?: string | null;
  discharge_advice?: string | null;
  medications?: string | null;
  yoga_guidance?: string | null;
}

export type DischargeSummaryUpdateRequest = Omit<DischargeSummaryCreateRequest, "doctor_id"> & {
  version: number;
};
