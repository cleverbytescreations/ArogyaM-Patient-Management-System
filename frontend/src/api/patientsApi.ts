import { apiClient } from "@/api/client";
import type { PaginatedResponse } from "@/types/api";
import type {
  Patient,
  PatientCreateRequest,
  PatientSearchResult,
  PatientSearchParams,
} from "@/types/patients";

export const patientsApi = {
  register: (data: PatientCreateRequest, confirmCreate = false) =>
    apiClient
      .post<Patient>("/patients", data, {
        params: confirmCreate ? { confirm_create: true } : undefined,
      })
      .then((r) => r.data),

  search: (params: PatientSearchParams = {}) =>
    apiClient
      .get<PaginatedResponse<PatientSearchResult>>("/patients/search", { params })
      .then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Patient>(`/patients/${id}`).then((r) => r.data),
};
