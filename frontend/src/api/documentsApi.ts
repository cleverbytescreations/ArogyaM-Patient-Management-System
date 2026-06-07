import { apiClient } from "@/api/client";
import type { PaginatedResponse } from "@/types/api";
import type {
  DocumentListParams,
  DocumentUpdateRequest,
  DocumentUploadRequest,
  PatientDocument,
  PresignedUrlResponse,
} from "@/types/documents";

export const documentsApi = {
  list: (patientId: string, params: DocumentListParams = {}) =>
    apiClient
      .get<PaginatedResponse<PatientDocument>>(`/patients/${patientId}/documents`, { params })
      .then((r) => r.data),

  upload: (patientId: string, data: DocumentUploadRequest) => {
    const formData = new FormData();
    formData.append("file", data.file);
    formData.append("document_type_code", data.document_type_code);
    if (data.visit_id) formData.append("visit_id", data.visit_id);
    if (data.title) formData.append("title", data.title);
    if (data.document_date) formData.append("document_date", data.document_date);
    formData.append("is_historical", String(data.is_historical ?? false));
    if (data.remarks) formData.append("remarks", data.remarks);

    return apiClient
      .post<PatientDocument>(`/patients/${patientId}/documents`, formData)
      .then((r) => r.data);
  },

  get: (documentId: string) =>
    apiClient.get<PatientDocument>(`/documents/${documentId}`).then((r) => r.data),

  update: (documentId: string, data: DocumentUpdateRequest) =>
    apiClient.put<PatientDocument>(`/documents/${documentId}`, data).then((r) => r.data),

  getContent: (documentId: string) =>
    apiClient
      .get<Blob>(`/documents/${documentId}/content`, { responseType: "blob" })
      .then((r) => r.data),

  getDownloadUrl: (documentId: string) =>
    apiClient
      .get<PresignedUrlResponse>(`/documents/${documentId}/download-url`)
      .then((r) => r.data),
};
