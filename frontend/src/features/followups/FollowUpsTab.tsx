import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  CheckCircle2,
  PhoneOff,
  Phone,
  RefreshCw,
  Plus,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/DataTable";
import { followupsApi } from "@/api/followupsApi";
import { usersApi } from "@/features/users/usersApi";
import { usePermissions } from "@/auth/usePermissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getApiErrorMessage } from "@/api/errors";
import { FollowUpFormDialog } from "./FollowUpFormDialog";
import type { FollowUp, FollowUpStatusCode } from "@/types/followups";

const STATUS_CONFIG: Record<
  FollowUpStatusCode,
  { label: string; icon: React.ReactNode; variant: "warning" | "success" | "secondary" | "destructive" }
> = {
  PENDING: { label: "Pending", icon: <Clock className="h-3 w-3" aria-hidden="true" />, variant: "warning" },
  CONTACTED: { label: "Contacted", icon: <Phone className="h-3 w-3" aria-hidden="true" />, variant: "secondary" },
  NOT_REACHABLE: { label: "Not Reachable", icon: <PhoneOff className="h-3 w-3" aria-hidden="true" />, variant: "destructive" },
  COMPLETED: { label: "Completed", icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />, variant: "success" },
  RESCHEDULED: { label: "Rescheduled", icon: <RefreshCw className="h-3 w-3" aria-hidden="true" />, variant: "secondary" },
};

interface FollowUpsTabProps {
  patientId: string;
}

export function FollowUpsTab({ patientId }: FollowUpsTabProps) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.MANAGE_FOLLOWUPS);

  const [showCreate, setShowCreate] = useState(false);
  const [editFollowUp, setEditFollowUp] = useState<FollowUp | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["follow-ups", patientId],
    queryFn: () => followupsApi.listForPatient(patientId),
    staleTime: 60_000,
  });

  const { data: doctorsPage } = useQuery({
    queryKey: ["users", { is_doctor: true }],
    queryFn: () => usersApi.list({ is_doctor: true, page_size: 100 }),
    staleTime: 5 * 60 * 1000,
  });
  const doctorNameById = new Map(
    (doctorsPage?.items ?? []).map((d) => [d.id, d.full_name])
  );

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {getApiErrorMessage(error, "Could not load follow-ups.")}
      </div>
    );
  }

  const followUps = data?.items ?? [];

  const columns: Column<FollowUp>[] = [
    {
      key: "follow_up_date",
      header: "Date",
      render: (f) => formatDate(f.follow_up_date),
    },
    {
      key: "status_code",
      header: "Status",
      render: (f) => {
        const cfg = STATUS_CONFIG[f.status_code] ?? STATUS_CONFIG.PENDING;
        return (
          <Badge variant={cfg.variant} className="flex w-fit items-center gap-1">
            {cfg.icon}
            <span>{cfg.label}</span>
          </Badge>
        );
      },
    },
    {
      key: "reason",
      header: "Reason",
      render: (f) => (
        <span className="max-w-[200px] truncate block">{f.reason ?? "—"}</span>
      ),
    },
    {
      key: "assigned_to",
      header: "Assigned To",
      render: (f) =>
        f.assigned_to ? doctorNameById.get(f.assigned_to) ?? "—" : "—",
    },
    {
      key: "remarks",
      header: "Remarks",
      render: (f) => (
        <span className="max-w-[200px] truncate block">{f.remarks ?? "—"}</span>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions" as const,
            header: "Actions",
            render: (f: FollowUp) => (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditFollowUp(f)}
                aria-label={`Update follow-up scheduled for ${formatDate(f.follow_up_date)}`}
              >
                <Pencil className="mr-1 h-3 w-3" aria-hidden="true" />
                Update
              </Button>
            ),
            className: "w-28",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {followUps.length === 0
            ? "No follow-ups recorded for this patient."
            : `${followUps.length} follow-up${followUps.length !== 1 ? "s" : ""} recorded.`}
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Register Follow-Up
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={followUps}
        isLoading={isLoading}
        total={followUps.length}
        page={1}
        pageSize={Math.max(followUps.length, 1)}
        onPageChange={() => {}}
        getRowKey={(f) => f.id}
        emptyMessage="No follow-ups recorded for this patient."
      />

      {canManage && (
        <>
          <FollowUpFormDialog
            patientId={patientId}
            open={showCreate}
            onOpenChange={setShowCreate}
            onSaved={() => setShowCreate(false)}
          />
          <FollowUpFormDialog
            patientId={patientId}
            followUp={editFollowUp}
            open={Boolean(editFollowUp)}
            onOpenChange={(open) => {
              if (!open) setEditFollowUp(null);
            }}
            onSaved={() => setEditFollowUp(null)}
          />
        </>
      )}
    </div>
  );
}
