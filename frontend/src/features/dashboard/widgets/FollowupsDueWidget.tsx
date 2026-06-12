import { CalendarClock, AlertCircle } from "lucide-react";
import { WidgetCard, WidgetCardSkeleton } from "../WidgetCard";
import { HelpTooltip } from "../HelpTooltip";
import type { FollowupsSummary } from "@/types/dashboard";

interface Props {
  data: FollowupsSummary | null | undefined;
  loading?: boolean;
}

export function FollowupsDueWidget({ data, loading }: Props) {
  if (loading) return <WidgetCardSkeleton rows={2} />;
  return (
    <WidgetCard
      title="Follow-ups"
      actionLabel="View register"
      actionTo="/follow-ups"
    >
      <ul className="space-y-3" role="list">
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4 text-blue-500" aria-hidden="true" />
            Due today
            <HelpTooltip text="Patients with a pending follow-up scheduled for today. These patients should be contacted or seen today." />
          </span>
          <span
            className="text-lg font-semibold tabular-nums"
            aria-label={`${data?.due_today ?? 0} follow-ups due today`}
          >
            {data?.due_today ?? 0}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle
              className={`h-4 w-4 ${(data?.overdue ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"}`}
              aria-hidden="true"
            />
            Overdue
            <HelpTooltip text="Pending follow-ups whose scheduled date has already passed without being actioned. These require rescheduling or urgent attention." />
          </span>
          <span
            className={`text-lg font-semibold tabular-nums ${(data?.overdue ?? 0) > 0 ? "text-destructive" : ""}`}
            aria-label={`${data?.overdue ?? 0} overdue follow-ups`}
          >
            {data?.overdue ?? 0}
          </span>
        </li>
      </ul>
    </WidgetCard>
  );
}
