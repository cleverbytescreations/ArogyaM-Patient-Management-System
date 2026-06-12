import { GitMerge } from "lucide-react";
import { KpiCard, KpiCardSkeleton } from "../KpiCard";
import type { MergeRequestsSummary } from "@/types/dashboard";

interface Props {
  data: MergeRequestsSummary | null | undefined;
  loading?: boolean;
}

export function PendingMergeWidget({ data, loading }: Props) {
  if (loading) return <KpiCardSkeleton />;
  return (
    <KpiCard
      title="Pending Merge Requests"
      value={data?.pending ?? 0}
      description="Duplicate patient records awaiting review"
      help="Patient records flagged as potential duplicates by staff. An administrator must review and merge them to ensure each patient has a single accurate record."
      icon={<GitMerge className="h-4 w-4" />}
      aria-label={`${data?.pending ?? 0} merge requests pending approval`}
    />
  );
}
