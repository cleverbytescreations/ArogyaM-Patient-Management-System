import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2, Printer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { visitsApi } from "@/api/visitsApi";
import { usePermissions } from "@/auth/usePermissions";
import { PERMISSIONS } from "@/lib/constants";
import { getApiErrorCode, getApiErrorMessage, getFieldErrors } from "@/api/errors";
import { useConflictHandler } from "@/lib/conflict";
import { caseSheetSchema, type CaseSheetFormValues } from "@/lib/validation/visits";
import { formatDate } from "@/lib/format";
import type { Visit } from "@/types/visits";
import type { GenderCode } from "@/types/patients";

const CASE_SHEET_FIELDS: { name: keyof CaseSheetFormValues; label: string; rows?: number }[] = [
  { name: "present_complaints", label: "Present complaints", rows: 2 },
  { name: "appetite", label: "Appetite", rows: 2 },
  { name: "sleep", label: "Sleep", rows: 2 },
  { name: "motion", label: "Motion / bowel habits", rows: 2 },
  { name: "energy_level", label: "Energy level", rows: 2 },
  { name: "hereditary_diseases_mother", label: "Hereditary diseases (mother)", rows: 2 },
  { name: "hereditary_diseases_father", label: "Hereditary diseases (father)", rows: 2 },
  { name: "past_ailments", label: "Past ailments", rows: 2 },
  { name: "surgeries", label: "Previous surgeries", rows: 2 },
  { name: "exercise_routine", label: "Exercise routine", rows: 2 },
  { name: "other_observations", label: "Other observations", rows: 2 },
  { name: "remarks", label: "Remarks", rows: 2 },
];

const EMPTY_DEFAULTS: CaseSheetFormValues = {
  appetite: "",
  sleep: "",
  motion: "",
  energy_level: "",
  hereditary_diseases_mother: "",
  hereditary_diseases_father: "",
  past_ailments: "",
  surgeries: "",
  exercise_routine: "",
  normal_deliveries: "",
  caesarian_deliveries: "",
  present_complaints: "",
  other_observations: "",
  remarks: "",
};

function toFormValue(value: number | null): string {
  return value === null || value === undefined ? "" : String(value);
}

function toApiCount(value: string | undefined): number | null {
  const trimmed = value?.trim();
  return trimmed ? Number(trimmed) : null;
}

interface CaseSheetTabProps {
  selectedVisit: Visit | null;
  patientGender?: GenderCode | null;
  onSelectVisitTab: () => void;
}

export function CaseSheetTab({ selectedVisit, patientGender, onSelectVisitTab }: CaseSheetTabProps) {
  const { hasPermission } = usePermissions();
  const showDeliveryFields = patientGender === "FEMALE";
  const canWrite = hasPermission(PERMISSIONS.ADD_CONSULTATION);
  const canRead = hasPermission(PERMISSIONS.VIEW_MEDICAL_HISTORY) || canWrite;
  const canExportReport = hasPermission(PERMISSIONS.EXPORT) && hasPermission(PERMISSIONS.VIEW_MEDICAL_HISTORY);

  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  const queryClient = useQueryClient();
  const { hasConflict, handlePossibleConflict, clearConflict } = useConflictHandler();

  const {
    data: caseSheet,
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey: ["case-sheet", selectedVisit?.id],
    queryFn: () => visitsApi.getCaseSheet(selectedVisit!.id),
    enabled: Boolean(selectedVisit?.id) && canRead,
    retry: (count, err: unknown) => {
      const e = err as { response?: { status?: number } };
      if (e?.response?.status === 404) return false;
      return count < 2;
    },
  });

  const form = useForm<CaseSheetFormValues>({
    resolver: zodResolver(caseSheetSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  useEffect(() => {
    if (caseSheet) {
      form.reset({
        appetite: caseSheet.appetite ?? "",
        sleep: caseSheet.sleep ?? "",
        motion: caseSheet.motion ?? "",
        energy_level: caseSheet.energy_level ?? "",
        hereditary_diseases_mother: caseSheet.hereditary_diseases_mother ?? "",
        hereditary_diseases_father: caseSheet.hereditary_diseases_father ?? "",
        past_ailments: caseSheet.past_ailments ?? "",
        surgeries: caseSheet.surgeries ?? "",
        exercise_routine: caseSheet.exercise_routine ?? "",
        normal_deliveries: toFormValue(caseSheet.normal_deliveries),
        caesarian_deliveries: toFormValue(caseSheet.caesarian_deliveries),
        present_complaints: caseSheet.present_complaints ?? "",
        other_observations: caseSheet.other_observations ?? "",
        remarks: caseSheet.remarks ?? "",
      });
      clearConflict();
    }
  }, [caseSheet, form, clearConflict]);

  const { mutate: saveCaseSheet, isPending } = useMutation({
    mutationFn: (values: CaseSheetFormValues) => {
      const { normal_deliveries, caesarian_deliveries, ...rest } = values;
      return visitsApi.saveCaseSheet(selectedVisit!.id, {
        ...Object.fromEntries(
          Object.entries(rest).map(([k, v]) => [k, (v as string).trim() || null])
        ),
        normal_deliveries: toApiCount(normal_deliveries),
        caesarian_deliveries: toApiCount(caesarian_deliveries),
        version: caseSheet?.version ?? null,
      });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["case-sheet", selectedVisit?.id] });
      toast.success("Case sheet saved.");
      form.reset({
        appetite: saved.appetite ?? "",
        sleep: saved.sleep ?? "",
        motion: saved.motion ?? "",
        energy_level: saved.energy_level ?? "",
        hereditary_diseases_mother: saved.hereditary_diseases_mother ?? "",
        hereditary_diseases_father: saved.hereditary_diseases_father ?? "",
        past_ailments: saved.past_ailments ?? "",
        surgeries: saved.surgeries ?? "",
        exercise_routine: saved.exercise_routine ?? "",
        normal_deliveries: toFormValue(saved.normal_deliveries),
        caesarian_deliveries: toFormValue(saved.caesarian_deliveries),
        present_complaints: saved.present_complaints ?? "",
        other_observations: saved.other_observations ?? "",
        remarks: saved.remarks ?? "",
      });
      clearConflict();
    },
    onError: (error: unknown) => {
      if (handlePossibleConflict(error)) return;
      const code = getApiErrorCode(error);
      if (code === "VALIDATION_ERROR") {
        const fieldErrors = getFieldErrors(error);
        for (const [field, message] of Object.entries(fieldErrors)) {
          form.setError(field as keyof CaseSheetFormValues, { message });
        }
        return;
      }
      toast.error(getApiErrorMessage(error, "Could not save case sheet."));
    },
  });

  const { mutate: downloadReport, isPending: isDownloadingReport } = useMutation({
    mutationFn: () => visitsApi.getCaseSheetReportPdf(selectedVisit!.id, "attachment"),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `case-sheet-${selectedVisit!.id}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onError: (error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        toast.error("Save the case sheet before downloading the report.");
        return;
      }
      toast.error(getApiErrorMessage(error, "Could not generate the case sheet report."));
    },
  });

  const { mutate: printReport, isPending: isPrintingReport } = useMutation({
    mutationFn: () => visitsApi.getCaseSheetReportPdf(selectedVisit!.id, "inline"),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const frame = printFrameRef.current;
      if (!frame) return;
      frame.onload = () => {
        frame.contentWindow?.print();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      };
      frame.src = url;
    },
    onError: (error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        toast.error("Save the case sheet before printing the report.");
        return;
      }
      toast.error(getApiErrorMessage(error, "Could not generate the case sheet report."));
    },
  });

  if (!selectedVisit) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
        <p className="text-sm">No visit selected.</p>
        <Button variant="outline" size="sm" onClick={onSelectVisitTab}>
          Go to Visits tab to select a visit
        </Button>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div role="alert" className="py-8 text-center text-sm text-muted-foreground">
        You do not have permission to view medical history.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading case sheet…
      </div>
    );
  }

  if (hasConflict) {
    return (
      <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive space-y-3">
        <p className="font-semibold">This case sheet was updated by someone else.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            clearConflict();
            void queryClient.invalidateQueries({ queryKey: ["case-sheet", selectedVisit.id] });
          }}
        >
          Reload case sheet
        </Button>
      </div>
    );
  }

  const is404 = (fetchError as { response?: { status?: number } } | null)?.response?.status === 404;

  const reportDisabled = !caseSheet || is404;

  return (
    <div className="space-y-4 pt-4">
      {/* Hidden iframe used to load the inline PDF and trigger the browser print dialog. */}
      <iframe ref={printFrameRef} title="Case sheet report" className="hidden" aria-hidden="true" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Visit: <span className="font-medium text-foreground">{formatDate(selectedVisit.visit_date)}</span>
          {" · "}
          Type: <span className="font-medium text-foreground">{selectedVisit.visit_type_code}</span>
          {caseSheet ? (
            <span className="ml-2 text-xs">
              · {is404 ? "New case sheet" : `Version ${caseSheet.version}`}
            </span>
          ) : is404 ? (
            <span className="ml-2 text-xs text-muted-foreground">· No case sheet yet — fill in and save to create one</span>
          ) : null}
        </div>

        {canExportReport && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={reportDisabled || isPrintingReport}
              aria-busy={isPrintingReport}
              onClick={() => printReport()}
              title={reportDisabled ? "Save the case sheet before printing" : undefined}
            >
              {isPrintingReport ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Print
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={reportDisabled || isDownloadingReport}
              aria-busy={isDownloadingReport}
              onClick={() => downloadReport()}
              title={reportDisabled ? "Save the case sheet before downloading" : undefined}
            >
              {isDownloadingReport ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Download PDF
            </Button>
          </div>
        )}
      </div>

      {fetchError && !is404 ? (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {getApiErrorMessage(fetchError, "Could not load case sheet.")}
        </div>
      ) : (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => saveCaseSheet(v))}
            noValidate
            aria-label="Case sheet form"
            className="space-y-4"
          >
            <fieldset className="space-y-3 rounded-md border bg-card p-4">
              <legend className="px-1 text-sm font-semibold">Case Sheet</legend>
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                {CASE_SHEET_FIELDS.map(({ name, label, rows }) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={rows ?? 2}
                            disabled={isPending || !canWrite}
                            placeholder={canWrite ? `Enter ${label.toLowerCase()}` : undefined}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}

                {showDeliveryFields && (
                  <>
                    <FormField
                      control={form.control}
                      name="normal_deliveries"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Normal deliveries</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min={0}
                              max={99}
                              inputMode="numeric"
                              disabled={isPending || !canWrite}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="caesarian_deliveries"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Caesarian deliveries</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min={0}
                              max={99}
                              inputMode="numeric"
                              disabled={isPending || !canWrite}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </div>
            </fieldset>

            {canWrite && (
              <div className="flex justify-end">
                <Button type="submit" disabled={isPending} aria-busy={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  Save case sheet
                </Button>
              </div>
            )}
          </form>
        </Form>
      )}
    </div>
  );
}
