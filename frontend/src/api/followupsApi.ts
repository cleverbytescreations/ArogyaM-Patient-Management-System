import { apiClient } from "@/api/client";
import type { PaginatedResponse } from "@/types/api";
import type {
  FollowUp,
  FollowUpCreateRequest,
  FollowUpUpdateRequest,
} from "@/types/followups";

export interface FollowUpListParams {
  status?: string;
  from?: string;
  to?: string;
  assigned_to?: string;
  page?: number;
  page_size?: number;
}

export const followupsApi = {
  listForPatient: (patientId: string, page = 1, pageSize = 100) =>
    apiClient
      .get<PaginatedResponse<FollowUp>>(`/patients/${patientId}/follow-ups`, {
        params: { page, page_size: pageSize },
      })
      .then((r) => r.data),

  create: (patientId: string, data: FollowUpCreateRequest) =>
    apiClient
      .post<FollowUp>(`/patients/${patientId}/follow-ups`, data)
      .then((r) => r.data),

  update: (followUpId: string, data: FollowUpUpdateRequest) =>
    apiClient
      .put<FollowUp>(`/follow-ups/${followUpId}`, data)
      .then((r) => r.data),

  list: (params?: FollowUpListParams) =>
    apiClient
      .get<PaginatedResponse<FollowUp>>("/follow-ups", { params })
      .then((r) => r.data),
};
