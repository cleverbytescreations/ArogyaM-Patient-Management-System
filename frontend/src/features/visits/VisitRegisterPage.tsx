import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { visitsApi } from "@/api/visitsApi";
import { usersApi } from "@/features/users/usersApi";
import { getApiErrorMessage } from "@/api/errors";
import { formatDate } from "@/lib/format";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { VisitRegisterItem, VisitStatus } from "@/types/visits";

const STATUS_CONFIG: Record<
  VisitStatus,
  { label: string; icon: React.ReactNode; variant: "warning" | "success" | "secondary" | "destructive" }
> = {
  OPEN: { label: "Open", icon: <Clock className="h-3 w-3" aria-hidden="true" />, variant: "warning" },
  COMPLETED: { label: "Completed", icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />, variant: "success" },
  CANCELLED: { label: "Cancelled", icon: <XCircle className="h-3 w-3" aria-hidden="true" />, variant: "destructive" },
};

const ALL_STATUSES: VisitStatus[] = ["OPEN", "COMPLETED", "CANCELLED"];

export function VisitRegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const isDoctor = roles.includes("DOCTOR") && !roles.includes("ADMIN");

  const today = new Date().toISOString().slice(0, 10);

  const [fromFilter, setFromFilter] = useState(today);
  const [toFilter, setToFilter] = useState("");
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("OPEN");
  const [page, setPage] = useState(1);

  const [completeTarget, setCompleteTarget] = useState<VisitRegisterItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<VisitRegisterItem | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [editTarget, setEditTarget] = useState<VisitRegisterItem | null>(null);
  const [editDoctorId, setEditDoctorId] = useState<string>("");
  const [editVisitDate, setEditVisitDate] = useState<string>("");
  const [editChangeReason, setEditChangeReason] = useState<string>("");

  const params = {
    from_date: fromFilter || undefined,
    to_date: toFilter || undefined,
    doctor_id: doctorFilter !== "all" ? doctorFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page,
    page_size: DEFAULT_PAGE_SIZE,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["visit-register", params],
    queryFn: () => visitsApi.register(params),
    staleTime: 30_000,
  });

  const { data: doctorsPage } = useQuery({
    queryKey: ["users", { is_doctor: true }],
    queryFn: () => usersApi.list({ is_doctor: true, page_size: 100 }),
    staleTime: 5 * 60 * 1000,
  });
  const doctors = doctorsPage?.items ?? [];

  const { mutate: completeVisit, isPending: isCompleting } = useMutation({
    mutationFn: (visit: VisitRegisterItem) =>
      visitsApi.update(visit.id, { version: visit.version, status: "COMPLETED" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["visit-register"] });
      toast.success("Visit marked as completed.");
      setCompleteTarget(null);
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, "Could not complete the visit."));
      setCompleteTarget(null);
    },
  });

  const { mutate: updateVisit, isPending: isUpdatingVisit } = useMutation({
    mutationFn: (visit: VisitRegisterItem) =>
      visitsApi.update(visit.id, {
        version: visit.version,
        doctor_id: editDoctorId || null,
        visit_date: editVisitDate,
        is_scheduled: editVisitDate > today ? true : visit.is_scheduled,
        change_reason: editChangeReason.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["visit-register"] });
      toast.success("Visit updated.");
      setEditTarget(null);
      setEditChangeReason("");
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, "Could not update the visit."));
    },
  });

  const { mutate: cancelVisit, isPending: isCancelling } = useMutation({
    mutationFn: (visit: VisitRegisterItem) =>
      visitsApi.update(visit.id, {
        version: visit.version,
        status: "CANCELLED",
        cancellation_reason: cancellationReason.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["visit-register"] });
      toast.success("Visit cancelled.");
      setCancelTarget(null);
      setCancellationReason("");
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, "Could not cancel the visit."));
    },
  });

  const visits = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: Column<VisitRegisterItem>[] = [
    {
      key: "visit_date",
      header: "Date",
      render: (v) => (
        <span className="flex items-center gap-1.5">
          {formatDate(v.visit_date)}
          {v.is_scheduled && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              Scheduled
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: "patient_id",
      header: "Patient",
      render: (v) => (
        <div>
          <Button
            variant="link"
            className="h-auto p-0 font-normal"
            onClick={() => navigate(`/patients/${v.patient_id}`)}
            aria-label={`Open patient profile for ${v.patient_name}`}
          >
            {v.patient_name}
          </Button>
          <div className="text-xs text-muted-foreground">{v.op_number}</div>
        </div>
      ),
    },
    {
      key: "visit_type_code",
      header: "Visit Type",
      render: (v) => (
        <div>
          <span>{v.visit_type_code}</span>
          {v.consultation_category && (
            <div className="text-xs text-muted-foreground">{v.consultation_category}</div>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (v) => {
        const cfg = STATUS_CONFIG[v.status] ?? STATUS_CONFIG.OPEN;
        return (
          <Badge variant={cfg.variant} className="flex w-fit items-center gap-1">
            {cfg.icon}
            <span>{cfg.label}</span>
          </Badge>
        );
      },
    },
    {
      key: "doctor_name",
      header: "Doctor",
      render: (v) => v.doctor_name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "reason",
      header: "Reason",
      render: (v) => {
        if (v.status === "CANCELLED" && v.cancellation_reason) {
          return <span className="max-w-[200px] truncate block">Cancelled: {v.cancellation_reason}</span>;
        }
        return v.reason ? (
          <span className="max-w-[200px] truncate block">{v.reason}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (v) =>
        v.status === "OPEN" ? (
          <div className="flex items-center gap-2">
            {v.visit_date >= today && (
              <Button
                variant="outline"
                size="sm"
                className="border-yellow-500 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-700 dark:text-yellow-400 dark:hover:bg-yellow-950"
                onClick={() => {
                  setEditTarget(v);
                  setEditDoctorId(v.doctor_id ?? "");
                  setEditVisitDate(v.visit_date);
                  setEditChangeReason("");
                }}
                aria-label={`Edit assigned doctor for ${v.patient_name}`}
              >
                Edit
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-green-600 text-green-600 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:hover:bg-green-950"
              onClick={() => setCompleteTarget(v)}
              aria-label={`Mark visit for ${v.patient_name} as completed`}
            >
              Complete
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-red-600 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950"
              onClick={() => setCancelTarget(v)}
              aria-label={`Cancel visit for ${v.patient_name}`}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Visits"
        title="Visit Register"
        subtitle="Planned and scheduled patient visits."
      />

      <fieldset className="rounded-md border bg-card p-4">
        <legend className="px-1 text-sm font-medium text-muted-foreground">Filters</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="vr-from-filter">From date</Label>
            <Input
              id="vr-from-filter"
              type="date"
              value={fromFilter}
              onChange={(e) => { setFromFilter(e.target.value); setPage(1); }}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="vr-to-filter">To date</Label>
            <Input
              id="vr-to-filter"
              type="date"
              value={toFilter}
              onChange={(e) => { setToFilter(e.target.value); setPage(1); }}
            />
          </div>

          {!isDoctor && (
            <div className="space-y-1">
              <Label htmlFor="vr-doctor-filter">Doctor</Label>
              <Select
                value={doctorFilter}
                onValueChange={(v) => { setDoctorFilter(v); setPage(1); }}
              >
                <SelectTrigger id="vr-doctor-filter" aria-label="Filter by doctor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All doctors</SelectItem>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="vr-status-filter">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v); setPage(1); }}
            >
              <SelectTrigger id="vr-status-filter" aria-label="Filter by status">
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
        </div>
      </fieldset>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {getApiErrorMessage(error, "Could not load visits.")}
        </div>
      )}

      <DataTable
        columns={columns}
        data={visits}
        isLoading={isLoading}
        total={total}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={setPage}
        getRowKey={(v) => v.id}
        emptyMessage="No visits match the current filters."
      />

      <AlertDialog open={completeTarget !== null} onOpenChange={(open) => { if (!open) setCompleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark visit as completed?</AlertDialogTitle>
            <AlertDialogDescription>
              {completeTarget && (
                <>This will mark {completeTarget.patient_name}&apos;s visit on {formatDate(completeTarget.visit_date)} as completed.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCompleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isCompleting}
              onClick={(e) => {
                e.preventDefault();
                if (completeTarget) completeVisit(completeTarget);
              }}
            >
              {isCompleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Mark completed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isUpdatingVisit) {
            setEditTarget(null);
            setEditDoctorId("");
            setEditVisitDate("");
            setEditChangeReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit visit</DialogTitle>
            <DialogDescription>
              {editTarget && (
                <>Update the visit date or assigned doctor for {editTarget.patient_name}&apos;s visit on {formatDate(editTarget.visit_date)}.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="vr-edit-visit-date">Visit date</Label>
              <Input
                id="vr-edit-visit-date"
                type="date"
                value={editVisitDate}
                min={today}
                onChange={(e) => setEditVisitDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="vr-edit-doctor">Assigned doctor</Label>
              <Select value={editDoctorId || "none"} onValueChange={(v) => setEditDoctorId(v === "none" ? "" : v)}>
                <SelectTrigger id="vr-edit-doctor" aria-label="Assigned doctor">
                  <SelectValue placeholder="Select doctor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="vr-edit-reason">Reason for change <span aria-hidden="true">*</span></Label>
              <Textarea
                id="vr-edit-reason"
                rows={3}
                value={editChangeReason}
                onChange={(e) => setEditChangeReason(e.target.value)}
                aria-required="true"
                placeholder="e.g. Patient requested a different doctor / rescheduled"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setEditTarget(null); setEditDoctorId(""); setEditVisitDate(""); setEditChangeReason(""); }}
              disabled={isUpdatingVisit}
            >
              Close
            </Button>
            <Button
              disabled={isUpdatingVisit || !editVisitDate || !editChangeReason.trim()}
              onClick={() => { if (editTarget) updateVisit(editTarget); }}
            >
              {isUpdatingVisit && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isCancelling) {
            setCancelTarget(null);
            setCancellationReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel visit</DialogTitle>
            <DialogDescription>
              {cancelTarget && (
                <>Cancel {cancelTarget.patient_name}&apos;s visit on {formatDate(cancelTarget.visit_date)}. Provide a reason for the record.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1">
            <Label htmlFor="vr-cancel-reason">Cancellation reason <span aria-hidden="true">*</span></Label>
            <Textarea
              id="vr-cancel-reason"
              rows={3}
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              aria-required="true"
              disabled={isCancelling}
              placeholder="e.g. Patient unable to attend, rescheduled by clinic"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setCancelTarget(null); setCancellationReason(""); }}
              disabled={isCancelling}
            >
              Close
            </Button>
            <Button
              variant="destructive"
              disabled={isCancelling || !cancellationReason.trim()}
              onClick={() => { if (cancelTarget) cancelVisit(cancelTarget); }}
            >
              {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Cancel visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
