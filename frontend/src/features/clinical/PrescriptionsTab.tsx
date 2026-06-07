import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { clinicalApi } from "@/api/clinicalApi";
import { usePermissions } from "@/auth/usePermissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { getApiErrorCode, getApiErrorMessage, getFieldErrors } from "@/api/errors";
import { PrescriptionFormDialog } from "./PrescriptionFormDialog";
import type { PrescriptionFormValues } from "@/lib/validation/clinical";
import type { Visit } from "@/types/visits";

interface PrescriptionsTabProps {
  selectedVisit: Visit | null;
  onSelectVisitTab: () => void;
  onUploadScanned: () => void;
}

export function PrescriptionsTab({ selectedVisit, onSelectVisitTab, onUploadScanned }: PrescriptionsTabProps) {
  const [open, setOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(PERMISSIONS.ADD_PRESCRIPTION);
  const canRead = hasPermission(PERMISSIONS.VIEW_MEDICAL_HISTORY) || canWrite;
  const queryClient = useQueryClient();

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["prescriptions", selectedVisit?.id],
    queryFn: () => clinicalApi.listPrescriptions(selectedVisit!.id),
    enabled: Boolean(selectedVisit?.id) && canRead,
  });

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
            timing: item.timing?.trim() || null,
            duration: item.duration?.trim() || null,
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
                <Badge variant="secondary">Added {formatDateTime(prescription.created_at)}</Badge>
              </div>
              {prescription.medicine_details && <p className="whitespace-pre-wrap text-sm">{prescription.medicine_details}</p>}
              {prescription.items.length > 0 && (
                <ul className="space-y-2" aria-label="Medicine items">
                  {prescription.items.map((item, index) => (
                    <li key={`${prescription.id}-${index}`} className="rounded-md bg-muted/40 p-3 text-sm">
                      <span className="font-medium">{item.medicine_name}</span>
                      <span className="text-muted-foreground"> · {[item.dosage, item.timing, item.duration, item.application_route].filter(Boolean).join(" · ") || "No dosage details"}</span>
                      {item.usage_instruction && <p className="mt-1 text-muted-foreground">{item.usage_instruction}</p>}
                    </li>
                  ))}
                </ul>
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
    </div>
  );
}
