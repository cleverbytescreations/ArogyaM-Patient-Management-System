export type DocumentStatus = "ACTIVE" | "ARCHIVED" | "DELETED";
export type DocumentTypeCode =
  | "LAB_REPORT"
  | "PHOTOGRAPH"
  | "INVESTIGATION"
  | "CASE_SHEET"
  | "PRESCRIPTION"
  | "DISCHARGE_SUMMARY"
  | "OTHER";

export const DOCUMENT_TYPES: DocumentTypeCode[] = [
  "LAB_REPORT",
  "PHOTOGRAPH",
  "INVESTIGATION",
  "CASE_SHEET",
  "PRESCRIPTION",
  "DISCHARGE_SUMMARY",
  "OTHER",
];

export interface PatientDocument {
  id: string;
  patient_id: string;
  visit_id: string | null;
  document_type_code: DocumentTypeCode | string;
  title: string | null;
  file_name: string;
  content_type: string | null;
  file_size_bytes: number | null;
  document_date: string | null;
  is_historical: boolean;
  status: DocumentStatus;
  remarks: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface DocumentListParams {
  document_type?: string;
  visit_id?: string;
  status?: DocumentStatus;
  page?: number;
  page_size?: number;
}

export interface DocumentUploadRequest {
  file: File;
  document_type_code: string;
  visit_id?: string | null;
  title?: string | null;
  document_date?: string | null;
  is_historical?: boolean;
  remarks?: string | null;
}

export interface DocumentUpdateRequest {
  title?: string | null;
  document_type_code: string;
  status: DocumentStatus;
  remarks?: string | null;
}

export interface PresignedUrlResponse {
  url: string;
  expires_at: string;
}
