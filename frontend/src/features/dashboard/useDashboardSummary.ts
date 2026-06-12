import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/api/dashboardApi";
import type { DashboardSummary } from "@/types/dashboard";

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ["dashboard", "summary"],
    queryFn: dashboardApi.getSummary,
    refetchInterval: 60_000,
  });
}
