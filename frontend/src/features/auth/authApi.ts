import { apiClient } from "@/api/client";
import type { UserProfile, PermissionsResponse } from "@/types/auth";

export const authApi = {
  getMe: () => apiClient.get<UserProfile>("/me").then((r) => r.data),

  getPermissions: () =>
    apiClient.get<PermissionsResponse>("/me/permissions").then((r) => r.data),

  logout: () => apiClient.post("/auth/logout"),
};
