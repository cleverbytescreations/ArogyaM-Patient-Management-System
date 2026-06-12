import { apiClient } from "@/api/client";
import type { PaginatedResponse } from "@/types/api";
import type {
  Visit,
  VisitCreateRequest,
  VisitUpdateRequest,
  VisitQueueItem,
  VisitRegisterItem,
  CaseSheet,
  CaseSheetUpsertRequest,
  ConsultationNote,
  ConsultationNoteCreateRequest,
  PatientAlias,
} from "@/types/visits";

export interface VisitRegisterParams {
  from_date?: string;
  to_date?: string;
  doctor_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export const visitsApi = {
  register: (params?: VisitRegisterParams) =>
    apiClient
      .get<PaginatedResponse<VisitRegisterItem>>("/visits/register", { params })
      .then((r) => r.data),

  queue: (params?: { doctor_id?: string; visit_date?: string; status?: string }) =>
    apiClient
      .get<VisitQueueItem[]>("/visits/queue", { params })
      .then((r) => r.data),

  list: (patientId: string) =>
    apiClient.get<Visit[]>(`/patients/${patientId}/visits`).then((r) => r.data),

  create: (patientId: string, data: VisitCreateRequest) =>
    apiClient
      .post<Visit>(`/patients/${patientId}/visits`, data)
      .then((r) => r.data),

  get: (visitId: string) =>
    apiClient.get<Visit>(`/visits/${visitId}`).then((r) => r.data),

  update: (visitId: string, data: VisitUpdateRequest) =>
    apiClient.put<Visit>(`/visits/${visitId}`, data).then((r) => r.data),

  getCaseSheet: (visitId: string) =>
    apiClient
      .get<CaseSheet>(`/visits/${visitId}/case-sheet`)
      .then((r) => r.data),

  saveCaseSheet: (visitId: string, data: CaseSheetUpsertRequest) =>
    apiClient
      .put<CaseSheet>(`/visits/${visitId}/case-sheet`, data)
      .then((r) => r.data),

  getCaseSheetReportPdf: (visitId: string, disposition: "inline" | "attachment") =>
    apiClient
      .get<Blob>(`/visits/${visitId}/case-sheet/report.pdf`, {
        params: { disposition },
        responseType: "blob",
      })
      .then((r) => r.data),

  listConsultationNotes: (visitId: string) =>
    apiClient
      .get<ConsultationNote[]>(`/visits/${visitId}/consultation-notes`)
      .then((r) => r.data),

  addConsultationNote: (visitId: string, data: ConsultationNoteCreateRequest) =>
    apiClient
      .post<ConsultationNote>(`/visits/${visitId}/consultation-notes`, data)
      .then((r) => r.data),

  getAliases: (patientId: string) =>
    apiClient
      .get<PatientAlias[]>(`/patients/${patientId}/aliases`)
      .then((r) => r.data),
};
