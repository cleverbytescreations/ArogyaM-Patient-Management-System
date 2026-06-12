import { Shield } from "lucide-react";
import { format, parseISO } from "date-fns";
import { WidgetCard, WidgetCardSkeleton } from "../WidgetCard";
import type { AuditEntrySummary } from "@/types/dashboard";

interface Props {
  data: AuditEntrySummary[] | null | undefined;
  loading?: boolean;
}

function formatAction(action: string) {
  return action.replace(/_/g, " ").toLowerCase().replace(/\b\w/, (c) => c.toUpperCase());
}

export function AuditFeedWidget({ data, loading }: Props) {
  if (loading) return <WidgetCardSkeleton rows={5} />;
  const entries = data ?? [];

  return (
    <WidgetCard
      title="Recent Audit Events"
      actionLabel="View full log"
      actionTo="/audit-logs"
      className="col-span-full md:col-span-2"
    >
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
      ) : (
        <ul className="divide-y divide-border" role="list">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-4 py-2">
              <div className="flex items-start gap-2 min-w-0">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-none truncate">
                    {formatAction(entry.action)}
                  </p>
                  {entry.entity_type && (
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.entity_type}
                      {entry.user_name ? ` · ${entry.user_name}` : ""}
                    </p>
                  )}
                </div>
              </div>
              <time
                dateTime={entry.created_at}
                className="shrink-0 text-xs text-muted-foreground tabular-nums"
              >
                {format(parseISO(entry.created_at), "HH:mm")}
              </time>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
