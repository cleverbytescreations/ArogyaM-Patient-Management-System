import { apiClient } from "@/api/client";
import type { PaginatedResponse } from "@/types/api";
import type {
  User,
  Role,
  UserCreateRequest,
  UserUpdateRequest,
  UserStatusUpdateRequest,
  PasswordResetRequest,
  UserListParams,
} from "@/types/users";

export const usersApi = {
  list: (params: UserListParams = {}) =>
    apiClient
      .get<PaginatedResponse<User>>("/users", { params })
      .then((r) => r.data),

  get: (id: string) =>
    apiClient.get<User>(`/users/${id}`).then((r) => r.data),

  create: (data: UserCreateRequest) =>
    apiClient.post<User>("/users", data).then((r) => r.data),

  update: (id: string, data: UserUpdateRequest) =>
    apiClient.put<User>(`/users/${id}`, data).then((r) => r.data),

  updateStatus: (id: string, data: UserStatusUpdateRequest) =>
    apiClient.put<User>(`/users/${id}/status`, data).then((r) => r.data),

  resetPassword: (id: string, data: PasswordResetRequest) =>
    apiClient.post(`/users/${id}/reset-password`, data),

  getRoles: () =>
    apiClient.get<Role[]>("/roles").then((r) => r.data),
};
