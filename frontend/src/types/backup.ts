export type BackupType = "DATABASE" | "DOCUMENTS" | "FULL";
export type BackupStatus = "STARTED" | "SUCCESS" | "FAILED";

export interface BackupLogEntry {
  id: number;
  backup_type: BackupType;
  status: BackupStatus;
  location_ref: string | null;
  size_bytes: number | null;
  message: string | null;
  triggered_by: string | null;
  started_at: string;
  completed_at: string | null;
  deleted_at: string | null;
}
