import { apiClient } from "@/api/client";
import type { DashboardSummary } from "@/types/dashboard";

export const dashboardApi = {
  getSummary: () =>
    apiClient.get<DashboardSummary>("/dashboard/summary").then((r) => r.data),
};
