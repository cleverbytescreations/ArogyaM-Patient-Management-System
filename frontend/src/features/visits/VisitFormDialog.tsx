import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { visitsApi } from "@/api/visitsApi";
import { masterDataApi } from "@/api/masterDataApi";
import { usersApi } from "@/features/users/usersApi";
import { visitSchema, type VisitFormValues } from "@/lib/validation/visits";
import { getApiErrorCode, getApiErrorMessage, getFieldErrors } from "@/api/errors";
import type { Visit } from "@/types/visits";

interface VisitFormDialogProps {
  patientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (visit: Visit) => void;
}

export function VisitFormDialog({ patientId, open, onOpenChange, onCreated }: VisitFormDialogProps) {
  const queryClient = useQueryClient();

  const today = new Date().toISOString().slice(0, 10);

  const { data: visitTypeOptions = [] } = useQuery({
    queryKey: ["master-data", "visit_type"],
    queryFn: () => masterDataApi.list("visit_type"),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const { data: categoryOptions = [] } = useQuery({
    queryKey: ["master-data", "consultation_category"],
    queryFn: () => masterDataApi.list("consultation_category"),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const { data: doctorsPage } = useQuery({
    queryKey: ["users", { is_doctor: true }],
    queryFn: () => usersApi.list({ is_doctor: true, page_size: 100 }),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });
  const doctors = doctorsPage?.items ?? [];

  const form = useForm<VisitFormValues>({
    resolver: zodResolver(visitSchema),
    defaultValues: {
      visit_date: today,
      visit_type_code: "",
      consultation_category: "",
      doctor_id: "",
      is_scheduled: false,
      reason: "",
    },
  });

  const isScheduled = form.watch("is_scheduled");

  const { mutate: createVisit, isPending } = useMutation({
    mutationFn: (values: VisitFormValues) =>
      visitsApi.create(patientId, {
        visit_date: values.visit_date,
        visit_type_code: values.visit_type_code,
        consultation_category: values.consultation_category || null,
        doctor_id: values.doctor_id || null,
        is_scheduled: values.is_scheduled,
        reason: values.reason?.trim() || null,
      }),
    onSuccess: (visit) => {
      void queryClient.invalidateQueries({ queryKey: ["visits", patientId] });
      toast.success("Visit created.");
      form.reset({ visit_date: today, visit_type_code: "", consultation_category: "", doctor_id: "", is_scheduled: false, reason: "" });
      onCreated(visit);
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      const code = getApiErrorCode(error);
      if (code === "VALIDATION_ERROR") {
        const fieldErrors = getFieldErrors(error);
        for (const [field, message] of Object.entries(fieldErrors)) {
          form.setError(field as keyof VisitFormValues, { message });
        }
        return;
      }
      toast.error(getApiErrorMessage(error, "Could not create visit. Please try again."));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isPending) { form.reset(); onOpenChange(o); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Visit</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            id="visit-form"
            onSubmit={form.handleSubmit((v) => createVisit(v))}
            noValidate
            aria-label="Create visit form"
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="visit_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visit date <span aria-hidden="true">*</span></FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="date"
                        max={isScheduled ? undefined : today}
                        aria-required="true"
                        disabled={isPending}
                      />
                    </FormControl>
                    {isScheduled && (
                      <FormDescription>
                        Pick the date this visit is scheduled for — future dates are allowed.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="visit_type_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visit type <span aria-hidden="true">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger aria-label="Visit type" aria-required="true">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {visitTypeOptions.map((opt) => (
                          <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="consultation_category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Consultation category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger aria-label="Consultation category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categoryOptions.map((opt) => (
                          <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="doctor_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Consulting doctor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={isPending}>
                      <FormControl>
                        <SelectTrigger aria-label="Consulting doctor">
                          <SelectValue placeholder="Select doctor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {doctors.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_scheduled"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <input
                      type="checkbox"
                      id="is_scheduled"
                      checked={field.value}
                      onChange={field.onChange}
                      disabled={isPending}
                      className="h-4 w-4 rounded border-input"
                    />
                  </FormControl>
                  <FormLabel htmlFor="is_scheduled" className="!mt-0 cursor-pointer font-normal">
                    Scheduled (future date allowed)
                  </FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason / chief complaint</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Brief reason for visit" disabled={isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="visit-form" disabled={isPending} aria-busy={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Create visit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
