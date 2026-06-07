import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, CheckCircle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/DataTable";
import { visitsApi } from "@/api/visitsApi";
import { usersApi } from "@/features/users/usersApi";
import { usePermissions } from "@/auth/usePermissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getApiErrorMessage } from "@/api/errors";
import { VisitFormDialog } from "./VisitFormDialog";
import type { Visit, VisitStatus } from "@/types/visits";

const STATUS_CONFIG: Record<VisitStatus, { label: string; icon: React.ReactNode; variant: "success" | "warning" | "secondary" | "destructive" }> = {
  OPEN: { label: "Open", icon: <Clock className="h-3 w-3" aria-hidden="true" />, variant: "warning" },
  COMPLETED: { label: "Completed", icon: <CheckCircle className="h-3 w-3" aria-hidden="true" />, variant: "success" },
  CANCELLED: { label: "Cancelled", icon: <XCircle className="h-3 w-3" aria-hidden="true" />, variant: "secondary" },
};

interface VisitsTabProps {
  patientId: string;
  selectedVisitId: string | null;
  onVisitSelect: (visitId: string) => void;
}

export function VisitsTab({ patientId, selectedVisitId, onVisitSelect }: VisitsTabProps) {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(PERMISSIONS.EDIT_PATIENT);

  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["visits", patientId],
    queryFn: () => visitsApi.list(patientId),
    staleTime: 60_000,
  });

  const { data: doctorsPage } = useQuery({
    queryKey: ["users", { is_doctor: true }],
    queryFn: () => usersApi.list({ is_doctor: true, page_size: 100 }),
    staleTime: 5 * 60 * 1000,
  });
  const doctorNameById = new Map((doctorsPage?.items ?? []).map((d) => [d.id, d.full_name]));

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {getApiErrorMessage(error, "Could not load visits.")}
      </div>
    );
  }

  const visits = data ?? [];
  const total = visits.length;

  const columns: Column<Visit>[] = [
    {
      key: "visit_date",
      header: "Date",
      render: (v) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          {formatDate(v.visit_date)}
          {v.is_scheduled && (
            <Badge variant="secondary" className="whitespace-nowrap">
              Scheduled
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "visit_type_code",
      header: "Type",
      render: (v) => v.visit_type_code,
    },
    {
      key: "consultation_category",
      header: "Category",
      render: (v) => v.consultation_category ?? "—",
    },
    {
      key: "doctor_id",
      header: "Doctor",
      render: (v) => (v.doctor_id ? doctorNameById.get(v.doctor_id) ?? "—" : "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (v) => {
        const cfg = STATUS_CONFIG[v.status];
        return (
          <Badge variant={cfg.variant} className="flex w-fit items-center gap-1">
            {cfg.icon}
            {cfg.label}
          </Badge>
        );
      },
    },
    {
      key: "reason",
      header: "Reason",
      render: (v) => <span className="max-w-[200px] truncate block">{v.reason ?? "—"}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (v) => (
        <Button
          size="sm"
          variant={selectedVisitId === v.id ? "default" : "outline"}
          onClick={() => onVisitSelect(v.id)}
          aria-pressed={selectedVisitId === v.id}
          aria-label={`Use visit from ${formatDate(v.visit_date)} for case sheet and consultation notes`}
        >
          {selectedVisitId === v.id ? "Selected" : "Select"}
        </Button>
      ),
      className: "w-28",
    },
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {selectedVisitId
            ? "A visit is selected — switch to Case Sheet or Consultation Notes tabs to view details."
            : "Select a visit to view its case sheet and consultation notes."}
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            New visit
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={visits}
        isLoading={isLoading}
        total={total}
        page={1}
        pageSize={Math.max(total, 1)}
        onPageChange={() => {}}
        getRowKey={(v) => v.id}
        emptyMessage="No visits recorded for this patient."
      />

      <VisitFormDialog
        patientId={patientId}
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={(visit) => onVisitSelect(visit.id)}
      />
    </div>
  );
}
