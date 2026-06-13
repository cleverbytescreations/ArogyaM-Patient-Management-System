import { Clock, CheckCircle } from "lucide-react";
import { WidgetCard, WidgetCardSkeleton } from "../WidgetCard";
import { HelpTooltip } from "../HelpTooltip";
import type { VisitsSummary } from "@/types/dashboard";

interface Props {
  data: VisitsSummary | null | undefined;
  loading?: boolean;
}

export function TodaysQueueWidget({ data, loading }: Props) {
  if (loading) return <WidgetCardSkeleton rows={2} />;
  return (
    <WidgetCard title="Today's Visits" actionLabel="Visit Register" actionTo="/visit-register">
      <ul className="space-y-3" role="list">
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 text-amber-500" aria-hidden="true" />
            Waiting / Open
            <HelpTooltip text="Visits logged for today that have not yet been marked as completed. Includes patients currently waiting or being seen by a doctor." />
          </span>
          <span
            className="text-lg font-semibold tabular-nums"
            aria-label={`${data?.open_today ?? 0} visits open today`}
          >
            {data?.open_today ?? 0}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" />
            Completed
            <HelpTooltip text="Visits where the consultation has been finished and the record marked complete today." />
          </span>
          <span
            className="text-lg font-semibold tabular-nums"
            aria-label={`${data?.completed_today ?? 0} visits completed today`}
          >
            {data?.completed_today ?? 0}
          </span>
        </li>
      </ul>
    </WidgetCard>
  );
}
