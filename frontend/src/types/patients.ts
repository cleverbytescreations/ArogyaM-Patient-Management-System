export type PatientStatus = "ACTIVE" | "INACTIVE" | "MERGED";
export type GenderCode = "MALE" | "FEMALE" | "OTHER";

export interface Patient {
  id: string;
  op_number: string;
  full_name: string;
  gender: GenderCode | null;
  date_of_birth: string | null;
  age_years: number | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  blood_group: string | null;
  marital_status: string | null;
  dietary_preference: string | null;
  occupation: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  hereditary_diseases: string | null;
  allergies: string | null;
  remarks: string | null;
  op_category_code: string;
  status: PatientStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DuplicateSuggestion {
  id: string;
  op_number: string;
  full_name: string;
  mobile_masked: string | null;
}

export interface PatientCreateRequest {
  full_name: string;
  op_category_code: string;
  gender?: GenderCode;
  date_of_birth?: string;
  age_years?: number;
  mobile?: string;
  email?: string;
  address?: string;
  blood_group?: string;
  marital_status?: string;
  dietary_preference?: string;
  occupation?: string;
  height_cm?: number;
  weight_kg?: number;
  hereditary_diseases?: string;
  allergies?: string;
  remarks?: string;
}

export interface PatientSearchResult {
  id: string;
  op_number: string;
  full_name: string;
  gender: GenderCode | null;
  age_or_dob: string | null;
  mobile_masked: string | null;
  op_category_code: string;
  status: PatientStatus;
}

export interface PatientSearchParams {
  q?: string;
  op_number?: string;
  mobile?: string;
  name?: string;
  op_category?: string;
  status?: PatientStatus;
  page?: number;
  page_size?: number;
}
