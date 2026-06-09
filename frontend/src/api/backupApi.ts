import { apiClient } from "@/api/client";
import type { BackupLogEntry } from "@/types/backup";

export interface BackupStatusResponse {
  latest: BackupLogEntry | null;
  history: BackupLogEntry[];
}

export const backupApi = {
  getStatus: () =>
    apiClient
      .get<BackupStatusResponse>("/backup/status")
      .then((r) => r.data),
};
