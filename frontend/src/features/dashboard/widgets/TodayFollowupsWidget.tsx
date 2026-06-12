import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  CheckCircle2,
  PhoneOff,
  Phone,
  RefreshCw,
  CalendarCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WidgetCard, WidgetCardSkeleton } from "../WidgetCard";
import { followupsApi } from "@/api/followupsApi";
import type { FollowUpStatusCode } from "@/types/followups";

const OPEN_STATUSES = new Set<FollowUpStatusCode>([
  "PENDING",
  "CONTACTED",
  "NOT_REACHABLE",
]);

const STATUS_CONFIG: Record<
  FollowUpStatusCode,
  {
    label: string;
    icon: React.ReactNode;
    variant: "warning" | "success" | "secondary" | "destructive";
  }
> = {
  PENDING: {
    label: "Pending",
    icon: <Clock className="h-3 w-3" aria-hidden="true" />,
    variant: "warning",
  },
  CONTACTED: {
    label: "Contacted",
    icon: <Phone className="h-3 w-3" aria-hidden="true" />,
    variant: "secondary",
  },
  NOT_REACHABLE: {
    label: "Not Reachable",
    icon: <PhoneOff className="h-3 w-3" aria-hidden="true" />,
    variant: "destructive",
  },
  COMPLETED: {
    label: "Completed",
    icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
    variant: "success",
  },
  RESCHEDULED: {
    label: "Rescheduled",
    icon: <RefreshCw className="h-3 w-3" aria-hidden="true" />,
    variant: "secondary",
  },
};

interface Props {
  doctorId: string;
}

export function TodayFollowupsWidget({ doctorId }: Props) {
  const [showCompleted, setShowCompleted] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["followups", "today-doctor", doctorId, today],
    queryFn: () =>
      followupsApi.list({
        from: today,
        to: today,
        assigned_to: doctorId,
        page_size: 100,
      }),
    staleTime: 60_000,
  });

  if (isLoading) return <WidgetCardSkeleton rows={5} />;

  const allFollowups = data?.items ?? [];
  const followups = showCompleted
    ? allFollowups
    : allFollowups.filter((f) => OPEN_STATUSES.has(f.status_code));

  const openCount = allFollowups.filter((f) =>
    OPEN_STATUSES.has(f.status_code)
  ).length;
  const completedCount = allFollowups.length - openCount;

  return (
    <WidgetCard
      title="Today's Follow-ups"
      actionLabel="View register"
      actionTo="/follow-ups"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {openCount === 0 && !showCompleted
            ? "No open follow-ups for today."
            : `${openCount} open${completedCount > 0 ? `, ${completedCount} completed` : ""}`}
        </p>
        <div className="flex items-center gap-2">
          <Switch
            id="show-completed-toggle"
            checked={showCompleted}
            onCheckedChange={setShowCompleted}
            aria-label="Show completed follow-ups"
          />
          <Label
            htmlFor="show-completed-toggle"
            className="cursor-pointer text-xs text-muted-foreground"
          >
            Show completed
          </Label>
        </div>
      </div>

      {followups.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-10 text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <CalendarCheck className="mb-2 h-8 w-8 opacity-40" aria-hidden="true" />
          <p className="text-sm">
            {showCompleted
              ? "No follow-ups scheduled for today."
              : "All clear — no open follow-ups for today."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {followups.map((f) => {
                const cfg = STATUS_CONFIG[f.status_code] ?? STATUS_CONFIG.PENDING;
                return (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/patients/${f.patient_id}`}
                        className="text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        {f.patient_name ?? "Unknown"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-[240px] truncate text-sm text-muted-foreground">
                        {f.reason ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={cfg.variant}
                        className="flex w-fit items-center gap-1"
                      >
                        {cfg.icon}
                        <span>{cfg.label}</span>
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </WidgetCard>
  );
}
