import { apiClient } from "@/api/client";
import type { BackupLogEntry } from "@/types/backup";

export interface BackupStatusResponse {
  latest: BackupLogEntry | null;
  recent: BackupLogEntry[];
}

export interface BackupTriggerResponse {
  triggered_at: string;
  message: string;
}

export const backupApi = {
  getStatus: () =>
    apiClient
      .get<BackupStatusResponse>("/backup/status")
      .then((r) => r.data),

  triggerBackup: () =>
    apiClient
      .post<BackupTriggerResponse>("/backup/trigger")
      .then((r) => r.data),
};
