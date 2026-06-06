export type PatientStatus = "ACTIVE" | "INACTIVE" | "MERGED";
export type GenderCode = "MALE" | "FEMALE" | "OTHER";

export interface Patient {
  id: string;
  op_number: string;
  op_category_code: string;
  full_name: string;
  gender: GenderCode | null;
  date_of_birth: string | null;
  age_years: number | null;
  mobile: string | null;
  email: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  blood_group: string | null;
  marital_status: string | null;
  dietary_preference: string | null;
  profession: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  remarks: string | null;
  status: PatientStatus;
  merged_into: string | null;
  is_historical: boolean;
  registration_date: string;
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
  address_line?: string;
  city?: string;
  state?: string;
  pincode?: string;
  blood_group?: string;
  marital_status?: string;
  dietary_preference?: string;
  profession?: string;
  height_cm?: number;
  weight_kg?: number;
  remarks?: string;
}

export interface PatientUpdateRequest {
  full_name?: string;
  date_of_birth?: string | null;
  age_years?: number | null;
  gender?: GenderCode | null;
  mobile?: string | null;
  email?: string | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  marital_status?: string | null;
  profession?: string | null;
  dietary_preference?: string | null;
  blood_group?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  remarks?: string | null;
  version: number;
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
