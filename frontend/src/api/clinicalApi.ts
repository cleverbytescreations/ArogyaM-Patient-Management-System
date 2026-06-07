import { apiClient } from "@/api/client";
import type {
  DischargeSummary,
  DischargeSummaryCreateRequest,
  DischargeSummaryUpdateRequest,
  Prescription,
  PrescriptionCreateRequest,
  PrescriptionUpdateRequest,
} from "@/types/clinical";

export const clinicalApi = {
  listPrescriptions: (visitId: string) =>
    apiClient
      .get<Prescription[]>(`/visits/${visitId}/prescriptions`)
      .then((r) => r.data),

  createPrescription: (visitId: string, data: PrescriptionCreateRequest) =>
    apiClient
      .post<Prescription>(`/visits/${visitId}/prescriptions`, data)
      .then((r) => r.data),

  getPrescription: (prescriptionId: string) =>
    apiClient
      .get<Prescription>(`/prescriptions/${prescriptionId}`)
      .then((r) => r.data),

  updatePrescription: (prescriptionId: string, data: PrescriptionUpdateRequest) =>
    apiClient
      .put<Prescription>(`/prescriptions/${prescriptionId}`, data)
      .then((r) => r.data),

  getPrescriptionReportPdf: (prescriptionId: string, disposition: "inline" | "attachment") =>
    apiClient
      .get<Blob>(`/prescriptions/${prescriptionId}/report.pdf`, {
        params: { disposition },
        responseType: "blob",
      })
      .then((r) => r.data),

  getCurrentDischargeSummary: (visitId: string) =>
    apiClient
      .get<DischargeSummary>(`/visits/${visitId}/discharge-summary`)
      .then((r) => r.data),

  createDischargeSummary: (visitId: string, data: DischargeSummaryCreateRequest) =>
    apiClient
      .post<DischargeSummary>(`/visits/${visitId}/discharge-summary`, data)
      .then((r) => r.data),

  listDischargeSummaryHistory: (visitId: string) =>
    apiClient
      .get<DischargeSummary[]>(`/visits/${visitId}/discharge-summary/history`)
      .then((r) => r.data),

  updateDischargeSummary: (id: string, data: DischargeSummaryUpdateRequest) =>
    apiClient.put<DischargeSummary>(`/discharge-summaries/${id}`, data).then((r) => r.data),

  finalizeDischargeSummary: (id: string, version: number) =>
    apiClient
      .put<DischargeSummary>(`/discharge-summaries/${id}/finalize`, { version })
      .then((r) => r.data),

  amendDischargeSummary: (id: string, data: DischargeSummaryCreateRequest) =>
    apiClient
      .post<DischargeSummary>(`/discharge-summaries/${id}/amend`, data)
      .then((r) => r.data),
};
