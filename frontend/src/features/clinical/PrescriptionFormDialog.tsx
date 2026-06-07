import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit2, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usersApi } from "@/features/users/usersApi";
import { prescriptionSchema, type PrescriptionFormValues } from "@/lib/validation/clinical";
import { cn } from "@/lib/utils";
import type { User } from "@/types/users";
import type { Visit } from "@/types/visits";

const EMPTY_ITEM: PrescriptionFormValues["items"][number] = {
  medicine_name: "",
  dosage: "",
  timing: "",
  duration: "",
  usage_instruction: "",
  application_route: "",
};

interface PrescriptionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onSubmit: (values: PrescriptionFormValues) => void;
  selectedVisit: Visit;
}

export function PrescriptionFormDialog({ open, onOpenChange, isPending, onSubmit, selectedVisit }: PrescriptionFormDialogProps) {
  const visitDoctorId = selectedVisit.doctor_id ?? "";
  const [doctorOverrideEnabled, setDoctorOverrideEnabled] = useState(!visitDoctorId);
  const [doctorSearch, setDoctorSearch] = useState("");

  const { data: doctorsPage } = useQuery({
    queryKey: ["users", { is_doctor: true }],
    queryFn: () => usersApi.list({ is_doctor: true, page_size: 100 }),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const { data: visitDoctor } = useQuery({
    queryKey: ["users", visitDoctorId],
    queryFn: () => usersApi.get(visitDoctorId),
    staleTime: 5 * 60 * 1000,
    enabled: open && Boolean(visitDoctorId),
  });

  const { data: doctorSearchPage, isFetching: isSearchingDoctors } = useQuery({
    queryKey: ["users", { is_doctor: true, q: doctorSearch }],
    queryFn: () => usersApi.list({ is_doctor: true, q: doctorSearch, page_size: 10 }),
    staleTime: 60 * 1000,
    enabled: open && doctorOverrideEnabled && doctorSearch.trim().length >= 3,
  });

  const doctors = useMemo(() => {
    const byId = new Map<string, User>();
    for (const doctor of doctorsPage?.items ?? []) byId.set(doctor.id, doctor);
    if (visitDoctor?.is_doctor) byId.set(visitDoctor.id, visitDoctor);
    for (const doctor of doctorSearchPage?.items ?? []) byId.set(doctor.id, doctor);
    return [...byId.values()];
  }, [doctorSearchPage?.items, doctorsPage?.items, visitDoctor]);

  const form = useForm<PrescriptionFormValues>({
    resolver: zodResolver(prescriptionSchema) as Resolver<PrescriptionFormValues>,
    defaultValues: {
      doctor_id: visitDoctorId,
      prescription_date: new Date().toISOString().slice(0, 10),
      instructions: "",
      review_advice: "",
      medicine_details: "",
      items: [EMPTY_ITEM],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const selectedDoctorId = form.watch("doctor_id") ?? "";
  const selectedDoctor = doctors.find((doctor) => doctor.id === selectedDoctorId);
  const searchResults = doctorSearchPage?.items ?? [];

  useEffect(() => {
    if (!open) return;
    form.reset({
      doctor_id: visitDoctorId,
      prescription_date: new Date().toISOString().slice(0, 10),
      instructions: "",
      review_advice: "",
      medicine_details: "",
      items: [EMPTY_ITEM],
    });
    setDoctorOverrideEnabled(!visitDoctorId);
    setDoctorSearch("");
  }, [form, open, visitDoctorId]);

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) form.reset();
  };

  const selectDoctor = (doctor: User, onChange: (value: string) => void) => {
    onChange(doctor.id);
    setDoctorSearch(doctor.full_name);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New prescription</DialogTitle>
          <DialogDescription>Add structured medicines or use free-text medicine details.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="prescription-form"
            className="space-y-5"
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="prescription_date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Prescription date</FormLabel>
                  <FormControl><Input {...field} type="date" disabled={isPending} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="doctor_id" render={({ field }) => (
                <FormItem>
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
                              if (!nextSearch.trim()) field.onChange("");
                            }}
                            disabled={isPending}
                            placeholder="Type at least 3 letters"
                            aria-label="Doctor"
                            aria-autocomplete="list"
                            aria-controls="prescription-doctor-options"
                          />
                          {doctorSearch.trim().length >= 3 && (
                            <div
                              id="prescription-doctor-options"
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
                          <option value="">{visitDoctorId ? "Loading doctor..." : "No doctor mapped"}</option>
                          {doctors.map((doctor) => (
                            <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>
                          ))}
                        </select>
                      )}
                    </FormControl>
                    {visitDoctorId && !doctorOverrideEnabled && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setDoctorOverrideEnabled(true);
                          setDoctorSearch(selectedDoctor?.full_name ?? "");
                        }}
                        disabled={isPending}
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
            </div>

            <fieldset className="space-y-3 rounded-md border p-4">
              <legend className="px-1 text-sm font-semibold">Medicine items</legend>
              {fields.map((item, index) => (
                <div key={item.id} className="grid gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-6">
                  <FormField control={form.control} name={`items.${index}.medicine_name`} render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Medicine</FormLabel>
                      <FormControl><Input {...field} disabled={isPending} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.dosage`} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dosage</FormLabel>
                      <FormControl><Input {...field} disabled={isPending} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.timing`} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Timing</FormLabel>
                      <FormControl><Input {...field} disabled={isPending} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.duration`} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration</FormLabel>
                      <FormControl><Input {...field} disabled={isPending} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.application_route`} render={({ field }) => (
                    <FormItem>
                      <FormLabel>Route</FormLabel>
                      <FormControl>
                        <select {...field} disabled={isPending} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                          <option value="">Select</option>
                          <option value="INTERNAL">Internal</option>
                          <option value="EXTERNAL">External</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name={`items.${index}.usage_instruction`} render={({ field }) => (
                    <FormItem className="md:col-span-5">
                      <FormLabel>Usage instruction</FormLabel>
                      <FormControl><Input {...field} disabled={isPending} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={isPending || fields.length === 1} aria-label={`Remove medicine row ${index + 1}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append(EMPTY_ITEM)} disabled={isPending}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Add medicine
              </Button>
              {typeof form.formState.errors.items?.message === "string" && (
                <p className="text-sm font-medium text-destructive">{form.formState.errors.items.message}</p>
              )}
            </fieldset>

            <FormField control={form.control} name="medicine_details" render={({ field }) => (
              <FormItem>
                <FormLabel>Free-text medicine details</FormLabel>
                <FormControl><Textarea {...field} rows={3} disabled={isPending} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="instructions" render={({ field }) => (
              <FormItem>
                <FormLabel>Instructions</FormLabel>
                <FormControl><Textarea {...field} rows={3} disabled={isPending} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="review_advice" render={({ field }) => (
              <FormItem>
                <FormLabel>Review advice</FormLabel>
                <FormControl><Textarea {...field} rows={2} disabled={isPending} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={isPending}>Cancel</Button>
          <Button type="submit" form="prescription-form" disabled={isPending} aria-busy={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Save prescription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
