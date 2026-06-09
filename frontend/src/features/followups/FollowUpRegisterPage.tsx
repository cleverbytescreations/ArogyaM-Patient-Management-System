import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  CheckCircle2,
  PhoneOff,
  Phone,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { followupsApi } from "@/api/followupsApi";
import { usersApi } from "@/features/users/usersApi";
import { getApiErrorMessage } from "@/api/errors";
import { formatDate } from "@/lib/format";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
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

const ALL_STATUSES: FollowUpStatusCode[] = [
  "PENDING",
  "CONTACTED",
  "NOT_REACHABLE",
  "COMPLETED",
  "RESCHEDULED",
];

export function FollowUpRegisterPage() {
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [editFollowUp, setEditFollowUp] = useState<FollowUp | null>(null);

  const params = {
    status: statusFilter !== "all" ? statusFilter : undefined,
    from: fromFilter || undefined,
    to: toFilter || undefined,
    assigned_to: assignedToFilter !== "all" ? assignedToFilter : undefined,
    page,
    page_size: DEFAULT_PAGE_SIZE,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["follow-ups-register", params],
    queryFn: () => followupsApi.list(params),
    staleTime: 30_000,
  });

  const { data: doctorsPage } = useQuery({
    queryKey: ["users", { is_doctor: true }],
    queryFn: () => usersApi.list({ is_doctor: true, page_size: 100 }),
    staleTime: 5 * 60 * 1000,
  });
  const doctors = doctorsPage?.items ?? [];
  const doctorNameById = new Map(doctors.map((d) => [d.id, d.full_name]));

  const followUps = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: Column<FollowUp>[] = [
    {
      key: "follow_up_date",
      header: "Date",
      render: (f) => formatDate(f.follow_up_date),
    },
    {
      key: "patient_id",
      header: "Patient",
      render: (f) => (
        <Button
          variant="link"
          className="h-auto p-0 font-normal"
          onClick={() => navigate(`/patients/${f.patient_id}`)}
          aria-label={`Open patient profile`}
        >
          View patient
        </Button>
      ),
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
      key: "actions",
      header: "Actions",
      render: (f) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditFollowUp(f)}
          aria-label={`Update follow-up for ${formatDate(f.follow_up_date)}`}
        >
          <Pencil className="mr-1 h-3 w-3" aria-hidden="true" />
          Update
        </Button>
      ),
      className: "w-28",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Follow-Ups"
        title="Follow-Up Register"
        subtitle="Queue of all patient follow-ups with status tracking."
      />

      {/* Filters */}
      <fieldset className="rounded-md border bg-card p-4">
        <legend className="px-1 text-sm font-medium text-muted-foreground">Filters</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="fu-status-filter">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v); setPage(1); }}
            >
              <SelectTrigger id="fu-status-filter" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_CONFIG[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="fu-from-filter">From date</Label>
            <Input
              id="fu-from-filter"
              type="date"
              value={fromFilter}
              onChange={(e) => { setFromFilter(e.target.value); setPage(1); }}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="fu-to-filter">To date</Label>
            <Input
              id="fu-to-filter"
              type="date"
              value={toFilter}
              onChange={(e) => { setToFilter(e.target.value); setPage(1); }}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="fu-assigned-filter">Assigned To</Label>
            <Select
              value={assignedToFilter}
              onValueChange={(v) => { setAssignedToFilter(v); setPage(1); }}
            >
              <SelectTrigger id="fu-assigned-filter" aria-label="Filter by assigned staff">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </fieldset>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {getApiErrorMessage(error, "Could not load follow-ups.")}
        </div>
      )}

      <DataTable
        columns={columns}
        data={followUps}
        isLoading={isLoading}
        total={total}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={setPage}
        getRowKey={(f) => f.id}
        emptyMessage="No follow-ups match the current filters."
      />

      {editFollowUp && (
        <FollowUpFormDialog
          patientId={editFollowUp.patient_id}
          followUp={editFollowUp}
          open={Boolean(editFollowUp)}
          onOpenChange={(open) => {
            if (!open) setEditFollowUp(null);
          }}
          onSaved={() => setEditFollowUp(null)}
        />
      )}
    </div>
  );
}
