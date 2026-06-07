import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { clinicalApi } from "@/api/clinicalApi";
import { masterDataApi } from "@/api/masterDataApi";
import { usePermissions } from "@/auth/usePermissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { getApiErrorCode, getApiErrorMessage, getFieldErrors } from "@/api/errors";
import { PrescriptionFormDialog, PRESCRIPTION_EDIT_WINDOW_HOURS } from "./PrescriptionFormDialog";
import type { PrescriptionFormValues } from "@/lib/validation/clinical";
import type { Prescription } from "@/types/clinical";
import type { Visit } from "@/types/visits";

function isWithinEditWindow(prescription: Prescription): boolean {
  const created = new Date(prescription.created_at);
  const diffMs = Date.now() - created.getTime();
  return diffMs <= PRESCRIPTION_EDIT_WINDOW_HOURS * 60 * 60 * 1000;
}

function editExpiresAt(prescription: Prescription): string {
  const expiry = new Date(new Date(prescription.created_at).getTime() + PRESCRIPTION_EDIT_WINDOW_HOURS * 60 * 60 * 1000);
  return expiry.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
}

interface PrescriptionsTabProps {
  selectedVisit: Visit | null;
  onSelectVisitTab: () => void;
  onUploadScanned: () => void;
}

export function PrescriptionsTab({ selectedVisit, onSelectVisitTab, onUploadScanned }: PrescriptionsTabProps) {
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Prescription | null>(null);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(PERMISSIONS.ADD_PRESCRIPTION);
  const canRead = hasPermission(PERMISSIONS.VIEW_MEDICAL_HISTORY) || canWrite;
  const queryClient = useQueryClient();

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["prescriptions", selectedVisit?.id],
    queryFn: () => clinicalApi.listPrescriptions(selectedVisit!.id),
    enabled: Boolean(selectedVisit?.id) && canRead,
  });

  const { data: routes = [] } = useQuery({ queryKey: ["master-data", "medicine_route"], queryFn: () => masterDataApi.list("medicine_route"), staleTime: 10 * 60 * 1000 });
  const { data: dosageUnits = [] } = useQuery({ queryKey: ["master-data", "dosage_unit"], queryFn: () => masterDataApi.list("dosage_unit"), staleTime: 10 * 60 * 1000 });
  const { data: frequencies = [] } = useQuery({ queryKey: ["master-data", "medicine_frequency"], queryFn: () => masterDataApi.list("medicine_frequency"), staleTime: 10 * 60 * 1000 });
  const { data: durationUnits = [] } = useQuery({ queryKey: ["master-data", "duration_unit"], queryFn: () => masterDataApi.list("duration_unit"), staleTime: 10 * 60 * 1000 });

  const labelOf = (list: { code: string; label: string }[], code: string | null | undefined) =>
    list.find((item) => item.code === code)?.label ?? code ?? "";

  const mutation = useMutation({
    mutationFn: (values: PrescriptionFormValues) =>
      clinicalApi.createPrescription(selectedVisit!.id, {
        doctor_id: values.doctor_id?.trim() || null,
        prescription_date: values.prescription_date?.trim() || null,
        instructions: values.instructions?.trim() || null,
        review_advice: values.review_advice?.trim() || null,
        medicine_details: values.medicine_details?.trim() || null,
        items: values.items
          .filter((item) => item.medicine_name?.trim())
          .map((item, index) => ({
            line_no: index + 1,
            medicine_name: item.medicine_name!.trim(),
            dosage: item.dosage?.trim() || null,
            dosage_unit: item.dosage_unit || null,
            timing: item.timing || null,
            duration: item.duration_unit === "ONGOING" ? null : (item.duration?.trim() || null),
            duration_unit: item.duration_unit || null,
            usage_instruction: item.usage_instruction?.trim() || null,
            application_route: item.application_route || null,
          })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prescriptions", selectedVisit?.id] });
      void queryClient.invalidateQueries({ queryKey: ["patient-timeline"] });
      setOpen(false);
      toast.success("Prescription saved.");
    },
    onError: (err) => {
      if (getApiErrorCode(err) === "VALIDATION_ERROR") {
        toast.error(Object.values(getFieldErrors(err))[0] ?? "Please check the prescription form.");
        return;
      }
      toast.error(getApiErrorMessage(err, "Could not save prescription."));
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, values, version }: { id: string; values: PrescriptionFormValues; version: number }) =>
      clinicalApi.updatePrescription(id, {
        version,
        doctor_id: values.doctor_id?.trim() || null,
        prescription_date: values.prescription_date?.trim() || null,
        instructions: values.instructions?.trim() || null,
        review_advice: values.review_advice?.trim() || null,
        medicine_details: values.medicine_details?.trim() || null,
        items: values.items
          .filter((item) => item.medicine_name?.trim())
          .map((item, index) => ({
            line_no: index + 1,
            medicine_name: item.medicine_name!.trim(),
            dosage: item.dosage?.trim() || null,
            dosage_unit: item.dosage_unit || null,
            timing: item.timing || null,
            duration: item.duration_unit === "ONGOING" ? null : (item.duration?.trim() || null),
            duration_unit: item.duration_unit || null,
            usage_instruction: item.usage_instruction?.trim() || null,
            application_route: item.application_route || null,
          })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prescriptions", selectedVisit?.id] });
      void queryClient.invalidateQueries({ queryKey: ["patient-timeline"] });
      setEditTarget(null);
      toast.success("Prescription updated.");
    },
    onError: (err) => {
      const code = getApiErrorCode(err);
      if (code === "EDIT_WINDOW_EXPIRED") {
        toast.error(`Edit window has closed. Prescriptions can only be edited within ${PRESCRIPTION_EDIT_WINDOW_HOURS} hours of creation.`);
        return;
      }
      if (code === "VERSION_CONFLICT") {
        toast.error("This prescription was updated by someone else. Please reload and try again.");
        return;
      }
      if (code === "VALIDATION_ERROR") {
        toast.error(Object.values(getFieldErrors(err))[0] ?? "Please check the prescription form.");
        return;
      }
      toast.error(getApiErrorMessage(err, "Could not update prescription."));
    },
  });

  if (!selectedVisit) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
        <p className="text-sm">No visit selected.</p>
        <Button variant="outline" size="sm" onClick={onSelectVisitTab}>Go to Visits tab to select a visit</Button>
      </div>
    );
  }

  if (!canRead) return <div role="alert" className="py-8 text-center text-sm text-muted-foreground">You do not have permission to view prescriptions.</div>;

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Visit: <span className="font-medium text-foreground">{formatDate(selectedVisit.visit_date)}</span>
        </p>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onUploadScanned}>
              <FileUp className="mr-2 h-4 w-4" aria-hidden="true" />
              Upload scanned
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              New prescription
            </Button>
          </div>
        )}
      </div>

      {error && <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{getApiErrorMessage(error, "Could not load prescriptions.")}</div>}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading prescriptions…</div>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No prescriptions recorded for this visit.</p>
      ) : (
        <div className="space-y-3">
          {data.map((prescription) => (
            <article key={prescription.id} className="space-y-3 rounded-md border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Prescription from {formatDate(prescription.prescription_date)}</h3>
                <div className="flex items-center gap-2">
                  {canWrite && isWithinEditWindow(prescription) && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        Editable until {editExpiresAt(prescription)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setEditTarget(prescription)}
                      >
                        <Pencil className="mr-1 h-3 w-3" aria-hidden="true" />
                        Edit
                      </Button>
                    </div>
                  )}
                  <Badge variant="secondary">Added {formatDateTime(prescription.created_at)}</Badge>
                </div>
              </div>
              {prescription.medicine_details && <p className="whitespace-pre-wrap text-sm">{prescription.medicine_details}</p>}
              {prescription.items.length > 0 && (
                <div className="overflow-x-auto rounded-md border text-sm">
                  <table className="w-full border-collapse" aria-label="Medicine items">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Medicine</th>
                        <th className="px-3 py-2">Dosage</th>
                        <th className="px-3 py-2">Timing</th>
                        <th className="px-3 py-2">Duration</th>
                        <th className="px-3 py-2">Route</th>
                        <th className="px-3 py-2">Instructions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prescription.items.map((item, index) => {
                        const dosage = [item.dosage, labelOf(dosageUnits, item.dosage_unit)].filter(Boolean).join(" ");
                        const duration = item.duration_unit === "ONGOING"
                          ? "Ongoing"
                          : [item.duration, labelOf(durationUnits, item.duration_unit)].filter(Boolean).join(" ");
                        return (
                          <tr key={`${prescription.id}-${index}`} className="border-b last:border-0 even:bg-muted/20">
                            <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                            <td className="px-3 py-2 font-medium">{item.medicine_name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{dosage || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{labelOf(frequencies, item.timing) || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{duration || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{labelOf(routes, item.application_route) || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{item.usage_instruction || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {prescription.instructions && <p className="whitespace-pre-wrap text-sm"><span className="font-medium">Instructions:</span> {prescription.instructions}</p>}
              {prescription.review_advice && <p className="whitespace-pre-wrap text-sm"><span className="font-medium">Review:</span> {prescription.review_advice}</p>}
            </article>
          ))}
        </div>
      )}

      <PrescriptionFormDialog
        open={open}
        onOpenChange={setOpen}
        isPending={mutation.isPending}
        onSubmit={(values) => mutation.mutate(values)}
        selectedVisit={selectedVisit}
      />

      {editTarget && (
        <PrescriptionFormDialog
          open={editTarget !== null}
          onOpenChange={(nextOpen) => { if (!nextOpen) setEditTarget(null); }}
          isPending={editMutation.isPending}
          onSubmit={(values) => editMutation.mutate({ id: editTarget.id, values, version: editTarget.version })}
          selectedVisit={selectedVisit}
          mode="edit"
          initialValues={{
            doctor_id: editTarget.doctor_id ?? "",
            prescription_date: editTarget.prescription_date,
            instructions: editTarget.instructions ?? "",
            review_advice: editTarget.review_advice ?? "",
            medicine_details: editTarget.medicine_details ?? "",
            items: editTarget.items.length > 0
              ? editTarget.items.map((item) => ({
                  medicine_name: item.medicine_name,
                  dosage: item.dosage ?? "",
                  dosage_unit: item.dosage_unit ?? "",
                  timing: item.timing ?? "",
                  duration: item.duration ?? "",
                  duration_unit: item.duration_unit ?? "",
                  usage_instruction: item.usage_instruction ?? "",
                  application_route: item.application_route ?? "",
                }))
              : [{ medicine_name: "", dosage: "", dosage_unit: "", timing: "", duration: "", duration_unit: "", usage_instruction: "", application_route: "" }],
          }}
          prescriptionCreatedAt={editTarget.created_at}
        />
      )}
    </div>
  );
}
