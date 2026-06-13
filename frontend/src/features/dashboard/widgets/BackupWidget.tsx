import { HardDrive, CheckCircle, XCircle, Clock } from "lucide-react";
import { WidgetCard, WidgetCardSkeleton } from "../WidgetCard";
import { HelpTooltip } from "../HelpTooltip";
import { format, parseISO } from "date-fns";
import type { BackupSummary } from "@/types/dashboard";

interface Props {
  data: BackupSummary | null | undefined;
  loading?: boolean;
}

function statusIcon(status: string | null) {
  if (status === "SUCCESS")
    return <CheckCircle className="h-4 w-4 text-green-500" aria-hidden="true" />;
  if (status === "FAILED")
    return <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />;
  return <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

export function BackupWidget({ data, loading }: Props) {
  if (loading) return <WidgetCardSkeleton rows={2} />;

  const neverRun = !data?.last_run_at;
  const formattedDate = data?.last_run_at
    ? format(parseISO(data.last_run_at), "dd MMM yyyy, hh:mm a")
    : "Never";
  const ageText =
    data?.age_hours != null
      ? data.age_hours < 24
        ? `${data.age_hours}h ago`
        : `${Math.round(data.age_hours / 24)}d ago`
      : null;

  return (
    <WidgetCard title="Backup Status" actionLabel="View details" actionTo="/backup">
      <dl className="space-y-3">
        <div className="flex items-center justify-between">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <HardDrive className="h-4 w-4" aria-hidden="true" />
            Last backup
            <HelpTooltip text="Date and time the most recent database backup job was started. Backups protect against data loss." />
          </dt>
          <dd className="text-sm font-medium tabular-nums">{formattedDate}</dd>
        </div>
        {!neverRun && (
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              {statusIcon(data?.last_status ?? null)}
              Status
              <HelpTooltip text="Result of the last backup job: SUCCESS means the backup completed without errors, FAILED means it encountered an error and may need attention." />
            </dt>
            <dd
              className={`text-sm font-medium ${data?.last_status === "FAILED" ? "text-destructive" : ""}`}
            >
              {data?.last_status ?? "—"}
              {ageText && (
                <span className="ml-1 text-xs text-muted-foreground">({ageText})</span>
              )}
            </dd>
          </div>
        )}
        {neverRun && (
          <p className="text-xs text-muted-foreground">No backup has been run yet.</p>
        )}
      </dl>
    </WidgetCard>
  );
}
