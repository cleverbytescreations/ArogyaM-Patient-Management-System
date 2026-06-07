export const APP_NAME = "ArogyaM PMS";
export const APP_VERSION = "1.0";

export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const PERMISSIONS = {
  CREATE_PATIENT: "create_patient",
  EDIT_PATIENT: "edit_patient",
  VIEW_PATIENT: "view_patient",
  VIEW_MEDICAL_HISTORY: "view_medical_history",
  ADD_CONSULTATION: "add_consultation",
  ADD_PRESCRIPTION: "add_prescription",
  UPLOAD_DOCUMENT: "upload_document",
  MANAGE_FOLLOWUPS: "manage_followups",
  REQUEST_MERGE: "request_merge",
  MERGE_RECORDS: "merge_records",
  MANAGE_USERS: "manage_users",
  MANAGE_MASTER_DATA: "manage_master_data",
  VIEW_AUDIT: "view_audit",
  BACKUP_CONTROL: "backup_control",
  VIEW_REPORTS: "view_reports",
  EXPORT: "export",
} as const;

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
export const DEFAULT_PAGE_SIZE = 20;

export const DATE_FORMAT = "dd MMM yyyy";
export const DATETIME_FORMAT = "dd MMM yyyy, HH:mm";
