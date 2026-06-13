import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { visitsApi } from "@/api/visitsApi";
import { usersApi } from "@/features/users/usersApi";
import { usePermissions } from "@/auth/usePermissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { getApiErrorCode, getApiErrorMessage, getFieldErrors } from "@/api/errors";
import { consultationNoteSchema, type ConsultationNoteFormValues } from "@/lib/validation/visits";
import type { Visit, ConsultationNote } from "@/types/visits";

const NOTE_FIELDS: { name: keyof ConsultationNoteFormValues; label: string; rows?: number; fullWidth?: boolean }[] = [
  { name: "presenting_complaints", label: "Presenting complaints", rows: 3 },
  { name: "diagnosis", label: "Diagnosis", rows: 3 },
  { name: "observations", label: "Observations", rows: 3 },
  { name: "treatment_advice", label: "Treatment advice", rows: 3 },
  { name: "diet_advice", label: "Diet advice", rows: 2 },
  { name: "yoga_advice", label: "Yoga / exercise advice", rows: 2 },
];

function defaultNoteValues(visit: Visit | null): ConsultationNoteFormValues {
  return {
    presenting_complaints: "",
    diagnosis: "",
    observations: "",
    treatment_advice: "",
    diet_advice: "",
    yoga_advice: "",
    review_date: "",
    doctor_id: visit?.doctor_id ?? "",
  };
}

interface NoteCardProps {
  note: ConsultationNote;
  doctorName?: string | null;
}

function NoteCard({ note, doctorName }: NoteCardProps) {
  const fields: { label: string; value: string | null }[] = [
    { label: "Presenting complaints", value: note.presenting_complaints },
    { label: "Diagnosis", value: note.diagnosis },
    { label: "Observations", value: note.observations },
    { label: "Treatment advice", value: note.treatment_advice },
    { label: "Diet advice", value: note.diet_advice },
    { label: "Yoga / exercise advice", value: note.yoga_advice },
    { label: "Review date", value: note.review_date ? formatDate(note.review_date) : null },
  ];

  return (
    <article
      className="rounded-md border bg-card p-4 space-y-3"
      aria-label={`Consultation note from ${formatDateTime(note.created_at)}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Added {formatDateTime(note.created_at)}</p>
        {doctorName && (
          <p className="text-xs font-medium text-foreground">{doctorName}</p>
        )}
      </div>
      <dl className="grid gap-2">
        {fields
          .filter((f) => f.value)
          .map(({ label, value }) => (
            <div key={label} className="grid grid-cols-[10rem_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
      </dl>
    </article>
  );
}

interface ConsultationNotesTabProps {
  selectedVisit: Visit | null;
  onSelectVisitTab: () => void;
}

export function ConsultationNotesTab({ selectedVisit, onSelectVisitTab }: ConsultationNotesTabProps) {
  const [completeVisitOpen, setCompleteVisitOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(PERMISSIONS.ADD_CONSULTATION);
  const canRead = hasPermission(PERMISSIONS.VIEW_MEDICAL_HISTORY) || canWrite;

  const queryClient = useQueryClient();

  const { data: notes = [], isLoading, error: fetchError } = useQuery({
    queryKey: ["consultation-notes", selectedVisit?.id],
    queryFn: () => visitsApi.listConsultationNotes(selectedVisit!.id),
    enabled: Boolean(selectedVisit?.id) && canRead,
    staleTime: 30_000,
  });

  const { data: doctorsPage } = useQuery({
    queryKey: ["users", { is_doctor: true }],
    queryFn: () => usersApi.list({ is_doctor: true, page_size: 100 }),
    staleTime: 5 * 60 * 1000,
    enabled: canRead,
  });
  const doctors = doctorsPage?.items ?? [];
  const doctorNameMap = new Map(doctors.map((d) => [d.id, d.full_name]));

  const form = useForm<ConsultationNoteFormValues>({
    resolver: zodResolver(consultationNoteSchema),
    defaultValues: defaultNoteValues(selectedVisit),
  });

  useEffect(() => {
    form.reset(defaultNoteValues(selectedVisit));
  }, [selectedVisit, form]);

  const { mutate: addNote, isPending } = useMutation({
    mutationFn: (values: ConsultationNoteFormValues) =>
      visitsApi.addConsultationNote(selectedVisit!.id, {
        doctor_id: values.doctor_id || null,
        presenting_complaints: values.presenting_complaints?.trim() || null,
        diagnosis: values.diagnosis?.trim() || null,
        observations: values.observations?.trim() || null,
        treatment_advice: values.treatment_advice?.trim() || null,
        diet_advice: values.diet_advice?.trim() || null,
        yoga_advice: values.yoga_advice?.trim() || null,
        review_date: values.review_date?.trim() || null,
      }),
    onSuccess: (_, values) => {
      void queryClient.invalidateQueries({ queryKey: ["consultation-notes", selectedVisit?.id] });
      if (values.review_date?.trim()) {
        void queryClient.invalidateQueries({ queryKey: ["follow-ups", selectedVisit?.patient_id] });
      }
      toast.success("Consultation note added.");
      form.reset(defaultNoteValues(selectedVisit));
    },
    onError: (error: unknown) => {
      const code = getApiErrorCode(error);
      if (code === "VALIDATION_ERROR") {
        const fieldErrors = getFieldErrors(error);
        for (const [field, message] of Object.entries(fieldErrors)) {
          form.setError(field as keyof ConsultationNoteFormValues, { message });
        }
        return;
      }
      toast.error(getApiErrorMessage(error, "Could not add note. Please try again."));
    },
  });

  const { mutate: completeVisit, isPending: isCompletingVisit } = useMutation({
    mutationFn: () =>
      visitsApi.update(selectedVisit!.id, { version: selectedVisit!.version, status: "COMPLETED" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["visits", "single", selectedVisit?.id] });
      void queryClient.invalidateQueries({ queryKey: ["visits", selectedVisit?.patient_id] });
      setCompleteVisitOpen(false);
      toast.success("Visit marked as completed.");
    },
    onError: (error: unknown) => {
      setCompleteVisitOpen(false);
      const code = getApiErrorCode(error);
      if (code === "VERSION_CONFLICT") {
        toast.error("Visit was updated by someone else. Please reload and try again.");
        void queryClient.invalidateQueries({ queryKey: ["visits", "single", selectedVisit?.id] });
        return;
      }
      toast.error(getApiErrorMessage(error, "Could not complete visit. Please try again."));
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

  return (
    <div className="space-y-6 pt-4">
      <div className="text-sm text-muted-foreground">
        Visit: <span className="font-medium text-foreground">{formatDate(selectedVisit.visit_date)}</span>
        {" · "}Type: <span className="font-medium text-foreground">{selectedVisit.visit_type_code}</span>
      </div>

      {fetchError && (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {getApiErrorMessage(fetchError, "Could not load consultation notes.")}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No consultation notes for this visit yet.</p>
      ) : (
        <section aria-label="Consultation notes history">
          <h3 className="mb-3 text-sm font-semibold">Notes ({notes.length})</h3>
          <div className="space-y-3">
            {[...notes].reverse().map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                doctorName={note.doctor_id ? (doctorNameMap.get(note.doctor_id) ?? null) : null}
              />
            ))}
          </div>
        </section>
      )}

      {canWrite && (
        <section aria-label="Add consultation note">
          <h3 className="mb-3 text-sm font-semibold">Add new note</h3>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => addNote(v))}
              noValidate
              aria-label="Consultation note form"
              className="rounded-md border bg-card p-5 space-y-4"
            >
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="doctor_id"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Doctor</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          disabled={isPending}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                          aria-label="Doctor"
                        >
                          <option value="">Select doctor</option>
                          {doctors.map((d) => (
                            <option key={d.id} value={d.id}>{d.full_name}</option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {NOTE_FIELDS.map(({ name, label, rows }) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={rows ?? 2} disabled={isPending} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}

                <FormField
                  control={form.control}
                  name="review_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Review date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" disabled={isPending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isPending} aria-busy={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Add note
                </Button>
              </div>
            </form>
          </Form>
        </section>
      )}

      {canWrite && notes.length > 0 && selectedVisit.status === "OPEN" && (
        <div className="flex flex-col gap-1.5 rounded-md border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium">Mark visit as completed</p>
            <p className="text-muted-foreground">Close this visit once the doctor's consultation is done.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCompleteVisitOpen(true)}
            disabled={isCompletingVisit}
            aria-busy={isCompletingVisit}
          >
            {isCompletingVisit ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Mark as completed
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={completeVisitOpen}
        onOpenChange={setCompleteVisitOpen}
        title="Mark visit as completed?"
        description="This will close the visit. The visit status will change to Completed and can no longer be updated."
        confirmLabel="Mark as completed"
        onConfirm={() => completeVisit()}
      />
    </div>
  );
}
