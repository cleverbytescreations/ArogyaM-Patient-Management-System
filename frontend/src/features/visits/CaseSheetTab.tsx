import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const CASE_SHEET_FIELDS: { name: keyof CaseSheetFormValues; label: string; rows?: number }[] = [
  { name: "present_complaints", label: "Present complaints", rows: 4 },
  { name: "appetite", label: "Appetite" },
  { name: "sleep", label: "Sleep" },
  { name: "motion", label: "Motion / bowel habits" },
  { name: "energy_level", label: "Energy level" },
  { name: "hereditary_diseases", label: "Hereditary / family diseases", rows: 3 },
  { name: "past_ailments", label: "Past ailments", rows: 3 },
  { name: "surgeries", label: "Previous surgeries", rows: 3 },
  { name: "exercise_routine", label: "Exercise routine" },
  { name: "deliveries", label: "Deliveries (obstetric history)" },
  { name: "other_observations", label: "Other observations", rows: 3 },
  { name: "remarks", label: "Remarks", rows: 3 },
];

const EMPTY_DEFAULTS: CaseSheetFormValues = {
  appetite: "",
  sleep: "",
  motion: "",
  energy_level: "",
  hereditary_diseases: "",
  past_ailments: "",
  surgeries: "",
  exercise_routine: "",
  deliveries: "",
  present_complaints: "",
  other_observations: "",
  remarks: "",
};

interface CaseSheetTabProps {
  selectedVisit: Visit | null;
  onSelectVisitTab: () => void;
}

export function CaseSheetTab({ selectedVisit, onSelectVisitTab }: CaseSheetTabProps) {
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(PERMISSIONS.ADD_CONSULTATION);
  const canRead = hasPermission(PERMISSIONS.VIEW_MEDICAL_HISTORY) || canWrite;

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
        hereditary_diseases: caseSheet.hereditary_diseases ?? "",
        past_ailments: caseSheet.past_ailments ?? "",
        surgeries: caseSheet.surgeries ?? "",
        exercise_routine: caseSheet.exercise_routine ?? "",
        deliveries: caseSheet.deliveries ?? "",
        present_complaints: caseSheet.present_complaints ?? "",
        other_observations: caseSheet.other_observations ?? "",
        remarks: caseSheet.remarks ?? "",
      });
      clearConflict();
    }
  }, [caseSheet, form, clearConflict]);

  const { mutate: saveCaseSheet, isPending } = useMutation({
    mutationFn: (values: CaseSheetFormValues) =>
      visitsApi.saveCaseSheet(selectedVisit!.id, {
        ...Object.fromEntries(
          Object.entries(values).map(([k, v]) => [k, (v as string).trim() || null])
        ),
        version: caseSheet?.version ?? null,
      }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["case-sheet", selectedVisit?.id] });
      toast.success("Case sheet saved.");
      form.reset({
        appetite: saved.appetite ?? "",
        sleep: saved.sleep ?? "",
        motion: saved.motion ?? "",
        energy_level: saved.energy_level ?? "",
        hereditary_diseases: saved.hereditary_diseases ?? "",
        past_ailments: saved.past_ailments ?? "",
        surgeries: saved.surgeries ?? "",
        exercise_routine: saved.exercise_routine ?? "",
        deliveries: saved.deliveries ?? "",
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

  return (
    <div className="space-y-4 pt-4">
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
            <fieldset className="space-y-4 rounded-md border bg-card p-5">
              <legend className="px-1 text-sm font-semibold">Case Sheet</legend>
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
