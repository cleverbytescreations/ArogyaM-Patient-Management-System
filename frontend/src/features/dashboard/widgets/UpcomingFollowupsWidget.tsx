import { CalendarDays } from "lucide-react";
import { KpiCard, KpiCardSkeleton } from "../KpiCard";
import type { FollowupsSummary } from "@/types/dashboard";

interface Props {
  data: FollowupsSummary | null | undefined;
  loading?: boolean;
}

export function UpcomingFollowupsWidget({ data, loading }: Props) {
  if (loading) return <KpiCardSkeleton />;
  return (
    <KpiCard
      title="Follow-ups This Week"
      value={data?.upcoming_7days ?? 0}
      description="Scheduled in next 7 days"
      help="Pending follow-ups scheduled for any day in the next 7 days (excluding today). Useful for proactively contacting patients before their follow-up date."
      icon={<CalendarDays className="h-4 w-4" />}
      to="/follow-ups"
      aria-label={`${data?.upcoming_7days ?? 0} follow-ups scheduled in next 7 days`}
    />
  );
}
