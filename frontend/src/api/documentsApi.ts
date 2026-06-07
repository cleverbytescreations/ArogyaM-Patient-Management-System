import { apiClient } from "@/api/client";
import { useTokenStore } from "@/auth/tokenStore";
import type { PaginatedResponse } from "@/types/api";
import type {
  DocumentListParams,
  DocumentUpdateRequest,
  DocumentUploadRequest,
  PatientDocument,
  PresignedUrlResponse,
} from "@/types/documents";

const API_BASE_URL = apiClient.defaults.baseURL ?? "/api/v1";

async function uploadMultipart<T>(url: string, formData: FormData): Promise<T> {
  const requestId = crypto.randomUUID();
  const headers = new Headers({ "X-Request-ID": requestId });
  const { accessToken } = useTokenStore.getState();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE_URL}${url}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({
      error: {
        code: "UPLOAD_ERROR",
        message: "Could not upload document.",
        details: [],
        request_id: requestId,
      },
    }));
    throw { response: { data, status: response.status } };
  }

  return response.json() as Promise<T>;
}

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

    return uploadMultipart<PatientDocument>(`/patients/${patientId}/documents`, formData);
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
