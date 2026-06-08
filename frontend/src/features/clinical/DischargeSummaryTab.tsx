import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Download, Edit2, FilePlus2, Loader2, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { clinicalApi } from "@/api/clinicalApi";
import { masterDataApi } from "@/api/masterDataApi";
import { usersApi } from "@/features/users/usersApi";
import { usePermissions } from "@/auth/usePermissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getApiErrorCode, getApiErrorMessage, getFieldErrors } from "@/api/errors";
import { dischargeSummarySchema, type DischargeSummaryFormValues } from "@/lib/validation/clinical";
import type { DischargeSummary } from "@/types/clinical";
import type { User } from "@/types/users";
import type { Visit } from "@/types/visits";

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70";

const TEXT_FIELDS_BEFORE_CONDITION: { name: keyof DischargeSummaryFormValues; label: string; rows?: number }[] = [
  { name: "diagnosis", label: "Diagnosis", rows: 3 },
  { name: "presenting_complaints", label: "Presenting complaints", rows: 3 },
  { name: "investigations_admission", label: "Investigations on admission", rows: 6 },
  { name: "treatments", label: "Treatments", rows: 6 },
];

const TEXT_FIELDS_AFTER_CONDITION: { name: keyof DischargeSummaryFormValues; label: string; rows?: number; hint?: string }[] = [
  { name: "condition_notes", label: "Condition at discharge — details", rows: 2 },
  { name: "follow_up_period", label: "Follow-up period", rows: 3 },
  { name: "discharge_advice", label: "Discharge advice", rows: 3, hint: "(Do's and Don'ts)" },
  { name: "medications", label: "Medications", rows: 3 },
  { name: "yoga_guidance", label: "Yoga guidance", rows: 3 },
];

const STANDARD_INVESTIGATIONS_CHECKLIST = [
  "Complete Blood Count",
  "Fasting Blood Sugar",
  "HbA1c",
  "Kidney Function Test",
  "Lipid profile",
  "Blood group",
  "Urine routine analysis",
  "Blood Pressure levels",
  "ECG (if above 40 years of age)",
].join("\n");

const EMPTY_VALUES: DischargeSummaryFormValues = {
  doctor_id: "",
  admission_date: "",
  discharge_date: "",
  diagnosis: "",
  presenting_complaints: "",
  investigations_admission: "",
  treatments: "",
  condition_at_discharge: "",
  condition_notes: "",
  follow_up_period: "",
  discharge_advice: "",
  medications: "",
  yoga_guidance: "",
};

function toForm(summary: DischargeSummary | null | undefined): DischargeSummaryFormValues {
  if (!summary) return EMPTY_VALUES;
  return {
    doctor_id: summary.doctor_id ?? "",
    admission_date: summary.admission_date ?? "",
    discharge_date: summary.discharge_date ?? "",
    diagnosis: summary.diagnosis ?? "",
    presenting_complaints: summary.presenting_complaints ?? "",
    investigations_admission: summary.investigations_admission ?? "",
    treatments: summary.treatments ?? "",
    condition_at_discharge: summary.condition_at_discharge ?? "",
    condition_notes: summary.condition_notes ?? "",
    follow_up_period: summary.follow_up_period ?? "",
    discharge_advice: summary.discharge_advice ?? "",
    medications: summary.medications ?? "",
    yoga_guidance: summary.yoga_guidance ?? "",
  };
}

function toPayload(values: DischargeSummaryFormValues) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value.trim() || null : value])
  );
}

function toUpdatePayload(values: DischargeSummaryFormValues, version: number) {
  return { ...toPayload(values), version };
}

interface DischargeSummaryTabProps {
  selectedVisit: Visit | null;
  onSelectVisitTab: () => void;
}

export function DischargeSummaryTab({ selectedVisit, onSelectVisitTab }: DischargeSummaryTabProps) {
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [amendMode, setAmendMode] = useState(false);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(PERMISSIONS.ADD_CONSULTATION);
  const canRead = hasPermission(PERMISSIONS.VIEW_MEDICAL_HISTORY) || canWrite;
  const canExportReport = hasPermission(PERMISSIONS.EXPORT) && hasPermission(PERMISSIONS.VIEW_MEDICAL_HISTORY);
  const queryClient = useQueryClient();
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  const currentQuery = useQuery({
    queryKey: ["discharge-summary", selectedVisit?.id],
    queryFn: () => clinicalApi.getCurrentDischargeSummary(selectedVisit!.id),
    enabled: Boolean(selectedVisit?.id) && canRead,
    retry: (count, err: unknown) => ((err as { response?: { status?: number } })?.response?.status === 404 ? false : count < 2),
  });

  const historyQuery = useQuery({
    queryKey: ["discharge-summary-history", selectedVisit?.id],
    queryFn: () => clinicalApi.listDischargeSummaryHistory(selectedVisit!.id),
    enabled: Boolean(selectedVisit?.id) && canRead,
    retry: false,
  });

  const current = currentQuery.data ?? null;
  const isMissing = (currentQuery.error as { response?: { status?: number } } | null)?.response?.status === 404;
  const locked = Boolean(current?.is_finalized) && !amendMode;

  const visitDoctorId = selectedVisit?.doctor_id ?? "";
  const currentDoctorId = current?.doctor_id ?? "";
  const doctorFieldLocked = locked;
  const [doctorOverrideEnabled, setDoctorOverrideEnabled] = useState(!visitDoctorId);
  const [doctorSearch, setDoctorSearch] = useState("");
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);

  const { data: conditions = [] } = useQuery({
    queryKey: ["master-data", "condition_at_discharge"],
    queryFn: () => masterDataApi.list("condition_at_discharge"),
    staleTime: 10 * 60 * 1000,
    enabled: canWrite,
  });

  const { data: doctorsPage } = useQuery({
    queryKey: ["users", { is_doctor: true }],
    queryFn: () => usersApi.list({ is_doctor: true, page_size: 100 }),
    staleTime: 5 * 60 * 1000,
    enabled: canWrite,
  });

  const { data: visitDoctor } = useQuery({
    queryKey: ["users", visitDoctorId],
    queryFn: () => usersApi.get(visitDoctorId),
    staleTime: 5 * 60 * 1000,
    enabled: canWrite && Boolean(visitDoctorId),
  });

  const { data: currentDoctor } = useQuery({
    queryKey: ["users", currentDoctorId],
    queryFn: () => usersApi.get(currentDoctorId),
    staleTime: 5 * 60 * 1000,
    enabled: canWrite && Boolean(currentDoctorId) && currentDoctorId !== visitDoctorId,
  });

  const { data: doctorSearchPage, isFetching: isSearchingDoctors } = useQuery({
    queryKey: ["users", { is_doctor: true, q: doctorSearch }],
    queryFn: () => usersApi.list({ is_doctor: true, q: doctorSearch, page_size: 10 }),
    staleTime: 60 * 1000,
    enabled: canWrite && doctorOverrideEnabled && doctorSearch.trim().length >= 3,
  });

  const doctors = useMemo(() => {
    const byId = new Map<string, User>();
    for (const doctor of doctorsPage?.items ?? []) byId.set(doctor.id, doctor);
    if (visitDoctor?.is_doctor) byId.set(visitDoctor.id, visitDoctor);
    if (currentDoctor?.is_doctor) byId.set(currentDoctor.id, currentDoctor);
    for (const doctor of doctorSearchPage?.items ?? []) byId.set(doctor.id, doctor);
    return [...byId.values()];
  }, [currentDoctor, doctorSearchPage?.items, doctorsPage?.items, visitDoctor]);

  const form = useForm<DischargeSummaryFormValues>({
    resolver: zodResolver(dischargeSummarySchema),
    defaultValues: EMPTY_VALUES,
  });

  const selectedDoctorId = form.watch("doctor_id") ?? "";
  const selectedDoctor = doctors.find((doctor) => doctor.id === selectedDoctorId);
  const searchResults = doctorSearchPage?.items ?? [];

  const selectDoctor = (doctor: User, onChange: (value: string) => void) => {
    onChange(doctor.id);
    setDoctorSearch(doctor.full_name);
    setDoctorDropdownOpen(false);
  };

  useEffect(() => {
    form.reset(toForm(current));
    setAmendMode(false);
    setDoctorOverrideEnabled(current ? false : !visitDoctorId);
    setDoctorSearch("");
    setDoctorDropdownOpen(false);
  }, [current, form, visitDoctorId]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["discharge-summary", selectedVisit?.id] });
    void queryClient.invalidateQueries({ queryKey: ["discharge-summary-history", selectedVisit?.id] });
    void queryClient.invalidateQueries({ queryKey: ["patient-timeline"] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: DischargeSummaryFormValues) => {
      const payload = toPayload(values);
      if (amendMode && current) return clinicalApi.amendDischargeSummary(current.id, payload);
      if (current) return clinicalApi.updateDischargeSummary(current.id, toUpdatePayload(values, current.version));
      return clinicalApi.createDischargeSummary(selectedVisit!.id, payload);
    },
    onSuccess: () => {
      invalidate();
      setAmendMode(false);
      toast.success(amendMode ? "Amendment created." : "Discharge summary saved.");
    },
    onError: (err) => {
      if (getApiErrorCode(err) === "VALIDATION_ERROR") {
        for (const [field, message] of Object.entries(getFieldErrors(err))) {
          form.setError(field as keyof DischargeSummaryFormValues, { message });
        }
        return;
      }
      toast.error(getApiErrorMessage(err, "Could not save discharge summary."));
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => clinicalApi.finalizeDischargeSummary(current!.id, current!.version),
    onSuccess: () => {
      invalidate();
      setFinalizeOpen(false);
      toast.success("Discharge summary finalized.");
    },
    onError: (err) => toast.error(getApiErrorMessage(err, "Could not finalize discharge summary.")),
  });

  const downloadReportMutation = useMutation({
    mutationFn: (summaryId: string) => clinicalApi.getDischargeSummaryReportPdf(summaryId, "attachment"),
    onSuccess: (blob, summaryId) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `discharge-summary-${summaryId}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, "Could not generate the discharge summary report.")),
  });

  const printReportMutation = useMutation({
    mutationFn: (summaryId: string) => clinicalApi.getDischargeSummaryReportPdf(summaryId, "inline"),
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
    onError: (err) => toast.error(getApiErrorMessage(err, "Could not generate the discharge summary report.")),
  });

  if (!selectedVisit) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
        <p className="text-sm">No visit selected.</p>
        <Button variant="outline" size="sm" onClick={onSelectVisitTab}>Go to Visits tab to select a visit</Button>
      </div>
    );
  }
  if (!canRead) return <div role="alert" className="py-8 text-center text-sm text-muted-foreground">You do not have permission to view discharge summaries.</div>;
  if (currentQuery.isLoading) return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading discharge summary…</div>;

  return (
    <div className="space-y-5 pt-4">
      {/* Hidden iframe used to load the inline PDF and trigger the browser print dialog. */}
      <iframe ref={printFrameRef} title="Discharge summary report" className="hidden" aria-hidden="true" />

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>Visit: <span className="font-medium text-foreground">{formatDate(selectedVisit.visit_date)}</span></span>
        <div className="flex flex-wrap items-center gap-2">
          {current?.is_superseded && <Badge variant="warning">Superseded</Badge>}
          {current?.is_finalized ? <Badge variant="success">Finalized</Badge> : <Badge variant="secondary">{isMissing ? "No summary" : "Draft"}</Badge>}
          {canExportReport && current?.is_finalized && (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={printReportMutation.isPending}
                aria-busy={printReportMutation.isPending}
                onClick={() => printReportMutation.mutate(current.id)}
              >
                {printReportMutation.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Printer className="mr-1 h-3 w-3" aria-hidden="true" />
                )}
                Print
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={downloadReportMutation.isPending}
                aria-busy={downloadReportMutation.isPending}
                onClick={() => downloadReportMutation.mutate(current.id)}
              >
                {downloadReportMutation.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="mr-1 h-3 w-3" aria-hidden="true" />
                )}
                Download
              </Button>
            </div>
          )}
        </div>
      </div>

      {Boolean(currentQuery.error) && !isMissing && (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{getApiErrorMessage(currentQuery.error, "Could not load discharge summary.")}</div>
      )}

      {current?.is_finalized && (
        <div className="rounded-md border bg-card p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Finalized {current.finalized_at ? formatDateTime(current.finalized_at) : ""}
          </div>
          <p className="mt-1 text-muted-foreground">Finalized summaries are immutable. Create an amendment to record a corrected version.</p>
        </div>
      )}

      <Form {...form}>
        <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <fieldset className="grid gap-4 rounded-md border bg-card p-5 sm:grid-cols-2" disabled={!canWrite || locked || saveMutation.isPending}>
            <legend className="px-1 text-sm font-semibold">{amendMode ? "Amend discharge summary" : "Current discharge summary"}</legend>
            <FormField control={form.control} name="admission_date" render={({ field }) => (
              <FormItem>
                <FormLabel>Admission date</FormLabel>
                <FormControl><Input {...field} type="date" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="discharge_date" render={({ field }) => (
              <FormItem>
                <FormLabel>Discharge date</FormLabel>
                <FormControl><Input {...field} type="date" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="doctor_id" render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Doctor</FormLabel>
                <div className="flex items-start gap-2">
                  <FormControl>
                    {doctorOverrideEnabled ? (
                      <div className="relative w-full">
                        <Input
                          value={doctorSearch || selectedDoctor?.full_name || ""}
                          onChange={(event) => {
                            const nextSearch = event.target.value;
                            setDoctorSearch(nextSearch);
                            setDoctorDropdownOpen(true);
                            if (!nextSearch.trim()) field.onChange("");
                          }}
                          disabled={doctorFieldLocked || saveMutation.isPending}
                          placeholder="Type at least 3 letters"
                          aria-label="Doctor"
                          aria-autocomplete="list"
                          aria-controls="discharge-doctor-options"
                        />
                        {!doctorFieldLocked && doctorDropdownOpen && doctorSearch.trim().length >= 3 && (
                          <div
                            id="discharge-doctor-options"
                            role="listbox"
                            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                          >
                            {isSearchingDoctors ? (
                              <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                Searching doctors...
                              </div>
                            ) : searchResults.length > 0 ? (
                              searchResults.map((doctor) => (
                                <button
                                  key={doctor.id}
                                  type="button"
                                  role="option"
                                  aria-selected={field.value === doctor.id}
                                  className={cn(
                                    "w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none",
                                    field.value === doctor.id && "bg-accent text-accent-foreground"
                                  )}
                                  onClick={() => selectDoctor(doctor, field.onChange)}
                                >
                                  {doctor.full_name}
                                </button>
                              ))
                            ) : (
                              <p className="px-2 py-2 text-sm text-muted-foreground">No matching doctors found.</p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <select
                        {...field}
                        disabled
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                        aria-label="Doctor"
                      >
                        <option value="">{currentDoctorId ? "Loading doctor..." : "No doctor recorded"}</option>
                        {doctors.map((doctor) => (
                          <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>
                        ))}
                      </select>
                    )}
                  </FormControl>
                  {!doctorOverrideEnabled && !doctorFieldLocked && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setDoctorOverrideEnabled(true);
                        setDoctorSearch(selectedDoctor?.full_name ?? "");
                      }}
                      disabled={saveMutation.isPending}
                      aria-label="Change doctor"
                      title="Change doctor"
                    >
                      <Edit2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )} />
            {TEXT_FIELDS_BEFORE_CONDITION.map(({ name, label, rows }) => (
              <FormField key={name} control={form.control} name={name} render={({ field }) => (
                <FormItem className={rows ? "sm:col-span-2" : undefined}>
                  <div className="flex items-center justify-between gap-2">
                    <FormLabel>{label}</FormLabel>
                    {name === "investigations_admission" && canWrite && !locked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto px-2 py-1 text-xs"
                        onClick={() => field.onChange(STANDARD_INVESTIGATIONS_CHECKLIST)}
                      >
                        Use standard checklist
                      </Button>
                    )}
                  </div>
                  <FormControl><Textarea {...field} rows={rows ?? 2} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            ))}
            <FormField control={form.control} name="condition_at_discharge" render={({ field }) => (
              <FormItem>
                <FormLabel>Condition at discharge</FormLabel>
                <FormControl>
                  <select {...field} className={SELECT_CLASS}>
                    <option value="">—</option>
                    {conditions.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {TEXT_FIELDS_AFTER_CONDITION.map(({ name, label, rows, hint }) => (
              <FormField key={name} control={form.control} name={name} render={({ field }) => (
                <FormItem className={rows ? "sm:col-span-2" : undefined}>
                  <FormLabel>{label}</FormLabel>
                  {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
                  <FormControl><Textarea {...field} rows={rows ?? 2} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            ))}
          </fieldset>

          {canWrite && (
            <div className="flex flex-wrap justify-end gap-2">
              {current?.is_finalized && !amendMode && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAmendMode(true);
                    setDoctorOverrideEnabled(true);
                    setDoctorSearch(selectedDoctor?.full_name ?? "");
                  }}
                >
                  <FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Amend
                </Button>
              )}
              {current && !current.is_finalized && (
                <Button type="button" variant="outline" onClick={() => setFinalizeOpen(true)} disabled={saveMutation.isPending}>
                  Finalize
                </Button>
              )}
              {(!locked || amendMode) && (
                <Button type="submit" disabled={saveMutation.isPending} aria-busy={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  {amendMode ? "Save amendment" : "Save draft"}
                </Button>
              )}
            </div>
          )}
        </form>
      </Form>

      <section aria-label="Discharge summary history" className="space-y-3">
        <h3 className="text-sm font-semibold">History</h3>
        {historyQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading history…</p> : (historyQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No discharge summary history yet.</p>
        ) : (
          <div className="space-y-2">
            {(historyQuery.data ?? []).map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3 text-sm">
                <span>{item.is_finalized ? "Finalized" : "Draft"} · Created {formatDateTime(item.created_at)}</span>
                <div className="flex gap-2">
                  {item.amends_id && <Badge variant="secondary">Amendment</Badge>}
                  {item.is_superseded && <Badge variant="warning">Superseded</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        title="Finalize discharge summary?"
        description="After finalization, this version cannot be edited. Later corrections must be added as an amendment."
        confirmLabel={finalizeMutation.isPending ? "Finalizing..." : "Finalize"}
        onConfirm={() => finalizeMutation.mutate()}
      />
    </div>
  );
}
