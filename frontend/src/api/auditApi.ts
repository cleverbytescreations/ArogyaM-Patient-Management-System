import { apiClient } from "@/api/client";
import type { PaginatedResponse } from "@/types/api";
import type { AuditLogEntry } from "@/types/audit";

export interface AuditLogListParams {
  user_id?: string;
  patient_id?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}

export const auditApi = {
  list: (params?: AuditLogListParams) =>
    apiClient
      .get<PaginatedResponse<AuditLogEntry>>("/audit-logs", { params })
      .then((r) => r.data),

  get: (id: number) =>
    apiClient
      .get<AuditLogEntry>(`/audit-logs/${id}`)
      .then((r) => r.data),
};
