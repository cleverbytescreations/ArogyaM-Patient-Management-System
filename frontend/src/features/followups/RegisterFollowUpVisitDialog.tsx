import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
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
import { followupsApi } from "@/api/followupsApi";
import { masterDataApi } from "@/api/masterDataApi";
import { visitsApi } from "@/api/visitsApi";
import { usersApi } from "@/features/users/usersApi";
import { visitSchema, type VisitFormValues } from "@/lib/validation/visits";
import { getApiErrorCode, getApiErrorMessage, getFieldErrors } from "@/api/errors";
import type { FollowUp } from "@/types/followups";

interface RegisterFollowUpVisitDialogProps {
  followUp: FollowUp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RegisterFollowUpVisitDialog({
  followUp,
  open,
  onOpenChange,
}: RegisterFollowUpVisitDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  const { data: visits } = useQuery({
    queryKey: ["visits", followUp.patient_id],
    queryFn: () => visitsApi.list(followUp.patient_id),
    enabled: open,
  });
  const lastVisit = visits?.[0];

  const form = useForm<VisitFormValues>({
    resolver: zodResolver(visitSchema),
    defaultValues: {
      visit_date: followUp.follow_up_date,
      visit_type_code: "",
      consultation_category: "",
      doctor_id: followUp.assigned_to ?? "",
      is_scheduled: followUp.follow_up_date > today,
      reason: followUp.reason ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        visit_date: followUp.follow_up_date,
        visit_type_code: lastVisit?.visit_type_code ?? "",
        consultation_category: lastVisit?.consultation_category ?? "",
        doctor_id: followUp.assigned_to ?? "",
        is_scheduled: followUp.follow_up_date > today,
        reason: followUp.reason ?? "",
      });
    }
  }, [open, followUp.assigned_to, followUp.reason, followUp.follow_up_date, today, lastVisit, form]);

  const isScheduled = form.watch("is_scheduled");

  const { mutate: registerVisit, isPending } = useMutation({
    mutationFn: (values: VisitFormValues) =>
      followupsApi.registerVisit(followUp.id, {
        visit_date: values.visit_date,
        visit_type_code: values.visit_type_code,
        consultation_category: values.consultation_category || null,
        doctor_id: values.doctor_id || null,
        is_scheduled: values.is_scheduled,
        reason: values.reason?.trim() || null,
      }),
    onSuccess: ({ visit }) => {
      void queryClient.invalidateQueries({ queryKey: ["follow-ups", followUp.patient_id] });
      void queryClient.invalidateQueries({ queryKey: ["follow-ups-register"] });
      void queryClient.invalidateQueries({ queryKey: ["visits", followUp.patient_id] });
      toast.success("Visit registered. Opening patient record.");
      onOpenChange(false);
      navigate(`/patients/${followUp.patient_id}`, { state: { activeTab: "visits", visitId: visit.id } });
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
      toast.error(getApiErrorMessage(error, "Could not register visit. Please try again."));
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!isPending) {
          form.reset();
          onOpenChange(o);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register Follow-Up Visit</DialogTitle>
          <DialogDescription>
            The patient has arrived. Fill in the visit details — this will create a new visit
            and mark this follow-up as completed.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="register-followup-visit-form"
            onSubmit={form.handleSubmit((v) => registerVisit(v))}
            noValidate
            aria-label="Register follow-up visit form"
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
                        Future dates allowed for scheduled visits.
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
                      id="reg-visit-is-scheduled"
                      checked={field.value}
                      onChange={field.onChange}
                      disabled={isPending}
                      className="h-4 w-4 rounded border-input"
                    />
                  </FormControl>
                  <FormLabel htmlFor="reg-visit-is-scheduled" className="!mt-0 cursor-pointer font-normal">
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
          <Button
            type="submit"
            form="register-followup-visit-form"
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Register Visit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
