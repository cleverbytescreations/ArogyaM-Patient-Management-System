import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle2, Users } from "lucide-react";
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
import { visitsApi } from "@/api/visitsApi";

interface Props {
  /** When provided, filters to this doctor's visits only. Omit for all-doctors view. */
  doctorId?: string;
}

export function TodayFollowupsWidget({ doctorId }: Props) {
  const [showCompleted, setShowCompleted] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const allDoctors = !doctorId;

  const { data: openVisits = [], isLoading: loadingOpen } = useQuery({
    queryKey: ["visits", "queue", doctorId ?? "all", today, "OPEN"],
    queryFn: () =>
      visitsApi.queue({
        ...(doctorId ? { doctor_id: doctorId } : {}),
        visit_date: today,
        status: "OPEN",
      }),
    staleTime: 60_000,
  });

  const { data: completedVisits = [], isLoading: loadingCompleted } = useQuery({
    queryKey: ["visits", "queue", doctorId ?? "all", today, "COMPLETED"],
    queryFn: () =>
      visitsApi.queue({
        ...(doctorId ? { doctor_id: doctorId } : {}),
        visit_date: today,
        status: "COMPLETED",
      }),
    staleTime: 60_000,
    enabled: showCompleted,
  });

  const isLoading = loadingOpen || (showCompleted && loadingCompleted);
  if (isLoading) return <WidgetCardSkeleton rows={5} />;

  const rows = showCompleted ? completedVisits : openVisits;

  return (
    <WidgetCard
      title={allDoctors ? "Today's Queue" : "Today's Patients"}
      actionLabel="Search patients"
      actionTo="/patients/search"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {showCompleted
            ? completedVisits.length === 0
              ? "No completed visits for today."
              : `${completedVisits.length} completed`
            : openVisits.length === 0
              ? "No open visits for today."
              : `${openVisits.length} open`}
        </p>
        <div className="flex items-center gap-2">
          <Switch
            id="show-completed-visits"
            checked={showCompleted}
            onCheckedChange={setShowCompleted}
            aria-label="Show completed visits"
          />
          <Label
            htmlFor="show-completed-visits"
            className="cursor-pointer text-xs text-muted-foreground"
          >
            Show completed
          </Label>
        </div>
      </div>

      {rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-10 text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Users className="mb-2 h-8 w-8 opacity-40" aria-hidden="true" />
          <p className="text-sm">
            {showCompleted ? "No completed visits for today." : "No open visits for today."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>OP No.</TableHead>
                <TableHead>Type</TableHead>
                {allDoctors && <TableHead>Doctor</TableHead>}
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/patients/${v.patient_id}`}
                      className="text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      {v.patient_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {v.op_number}
                  </TableCell>
                  <TableCell className="text-sm">
                    {v.visit_type_code}
                    {v.consultation_category ? ` · ${v.consultation_category}` : ""}
                  </TableCell>
                  {allDoctors && (
                    <TableCell className="text-sm text-muted-foreground">
                      {v.doctor_name ?? "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    <span className="block max-w-[200px] truncate text-sm text-muted-foreground">
                      {v.reason ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {v.status === "OPEN" ? (
                      <Badge variant="warning" className="flex w-fit items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        <span>Open</span>
                      </Badge>
                    ) : (
                      <Badge variant="success" className="flex w-fit items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        <span>Completed</span>
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </WidgetCard>
  );
}
