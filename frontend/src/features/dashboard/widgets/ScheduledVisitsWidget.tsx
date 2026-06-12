import { Calendar, Footprints } from "lucide-react";
import { WidgetCard, WidgetCardSkeleton } from "../WidgetCard";
import { HelpTooltip } from "../HelpTooltip";
import type { VisitsSummary } from "@/types/dashboard";

interface Props {
  data: VisitsSummary | null | undefined;
  loading?: boolean;
}

export function ScheduledVisitsWidget({ data, loading }: Props) {
  if (loading) return <WidgetCardSkeleton rows={2} />;
  return (
    <WidgetCard title="Appointment Type" actionLabel="Search patients" actionTo="/patients/search">
      <ul className="space-y-3" role="list">
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 text-blue-500" aria-hidden="true" />
            Scheduled
            <HelpTooltip text="Visits booked in advance as appointments. The patient was expected and a slot was reserved before they arrived." />
          </span>
          <span
            className="text-lg font-semibold tabular-nums"
            aria-label={`${data?.scheduled_today ?? 0} scheduled visits today`}
          >
            {data?.scheduled_today ?? 0}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Footprints className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Walk-ins
            <HelpTooltip text="Visits from patients who arrived without a prior appointment. Counted when a visit is logged with the scheduled flag off." />
          </span>
          <span
            className="text-lg font-semibold tabular-nums"
            aria-label={`${data?.walkin_today ?? 0} walk-in visits today`}
          >
            {data?.walkin_today ?? 0}
          </span>
        </li>
      </ul>
    </WidgetCard>
  );
}
