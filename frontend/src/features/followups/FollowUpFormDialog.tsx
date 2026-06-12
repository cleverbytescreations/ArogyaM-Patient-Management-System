import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { followupsApi } from "@/api/followupsApi";
import { usersApi } from "@/features/users/usersApi";
import { getApiErrorMessage, getFieldErrors } from "@/api/errors";
import type { FollowUp } from "@/types/followups";

const STATUSES = [
  { code: "PENDING", label: "Pending" },
  { code: "CONTACTED", label: "Contacted" },
  { code: "NOT_REACHABLE", label: "Not Reachable" },
  { code: "COMPLETED", label: "Completed" },
  { code: "RESCHEDULED", label: "Rescheduled" },
] as const;

const createSchema = z.object({
  follow_up_date: z.string().min(1, "Follow-up date is required"),
  reason: z.string().optional(),
  assigned_to: z.string().optional(),
});

const updateSchema = z.object({
  follow_up_date: z.string().min(1, "Follow-up date is required"),
  status_code: z.string().min(1, "Status is required"),
  reason: z.string().optional(),
  assigned_to: z.string().optional(),
  remarks: z.string().optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;
type UpdateFormValues = z.infer<typeof updateSchema>;

interface FollowUpFormDialogProps {
  patientId: string;
  followUp?: FollowUp | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (followUp: FollowUp) => void;
}

export function FollowUpFormDialog({
  patientId,
  followUp,
  open,
  onOpenChange,
  onSaved,
}: FollowUpFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(followUp);

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { follow_up_date: "", reason: "", assigned_to: "" },
  });

  const updateForm = useForm<UpdateFormValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      follow_up_date: followUp?.follow_up_date ?? "",
      status_code: followUp?.status_code ?? "PENDING",
      reason: followUp?.reason ?? "",
      assigned_to: followUp?.assigned_to ?? "",
      remarks: followUp?.remarks ?? "",
    },
  });

  useEffect(() => {
    if (open && followUp) {
      updateForm.reset({
        follow_up_date: followUp.follow_up_date,
        status_code: followUp.status_code,
        reason: followUp.reason ?? "",
        assigned_to: followUp.assigned_to ?? "",
        remarks: followUp.remarks ?? "",
      });
    }
    if (open && !followUp) {
      createForm.reset({ follow_up_date: "", reason: "", assigned_to: "" });
    }
  }, [open, followUp, createForm, updateForm]);

  const { data: doctorsPage } = useQuery({
    queryKey: ["users", { is_doctor: true }],
    queryFn: () => usersApi.list({ is_doctor: true, page_size: 100 }),
    staleTime: 5 * 60 * 1000,
  });
  const doctors = doctorsPage?.items ?? [];

  const createMutation = useMutation({
    mutationFn: (values: CreateFormValues) =>
      followupsApi.create(patientId, {
        follow_up_date: values.follow_up_date,
        reason: values.reason || undefined,
        assigned_to: values.assigned_to || undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["follow-ups", patientId] });
      queryClient.invalidateQueries({ queryKey: ["followups", "today-doctor"] });
      toast.success("Follow-up created.");
      onSaved(result);
      onOpenChange(false);
    },
    onError: (err) => {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        createForm.setError(field as keyof CreateFormValues, { message });
      });
      if (!Object.keys(fieldErrors).length) {
        toast.error(getApiErrorMessage(err, "Failed to create follow-up."));
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: UpdateFormValues) =>
      followupsApi.update(followUp!.id, {
        version: followUp!.version,
        follow_up_date: values.follow_up_date,
        status_code: values.status_code as FollowUp["status_code"],
        reason: values.reason || undefined,
        assigned_to: values.assigned_to || undefined,
        remarks: values.remarks || undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["follow-ups", patientId] });
      queryClient.invalidateQueries({ queryKey: ["follow-ups-register"] });
      queryClient.invalidateQueries({ queryKey: ["followups", "today-doctor"] });
      toast.success("Follow-up updated.");
      onSaved(result);
      onOpenChange(false);
    },
    onError: (err) => {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        updateForm.setError(field as keyof UpdateFormValues, { message });
      });
      if (!Object.keys(fieldErrors).length) {
        const msg = getApiErrorMessage(err, "Failed to update follow-up.");
        if (msg.toLowerCase().includes("state transition")) {
          toast.error("Invalid status transition. Please refresh and try again.");
        } else {
          toast.error(msg);
        }
      }
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isEdit) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-labelledby="edit-followup-title">
          <DialogHeader>
            <DialogTitle id="edit-followup-title">Update Follow-Up</DialogTitle>
            <DialogDescription>Update the status, date, assignment, or notes for this follow-up.</DialogDescription>
          </DialogHeader>
          <Form {...updateForm}>
            <form
              onSubmit={updateForm.handleSubmit((v) => updateMutation.mutate(v))}
              className="space-y-4"
            >
              <FormField
                control={updateForm.control}
                name="follow_up_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Follow-Up Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={updateForm.control}
                name="status_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger aria-label="Status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s.code} value={s.code}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={updateForm.control}
                name="assigned_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned To</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                      value={field.value || "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger aria-label="Assigned to">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {doctors.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={updateForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Input placeholder="Reason for follow-up" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={updateForm.control}
                name="remarks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Remarks</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Remarks or notes" rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-labelledby="create-followup-title">
        <DialogHeader>
          <DialogTitle id="create-followup-title">Register Follow-Up</DialogTitle>
          <DialogDescription>Schedule a new follow-up call or visit for this patient.</DialogDescription>
        </DialogHeader>
        <Form {...createForm}>
          <form
            onSubmit={createForm.handleSubmit((v) => createMutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={createForm.control}
              name="follow_up_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Follow-Up Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={createForm.control}
              name="assigned_to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign To</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                    value={field.value || "__none__"}
                  >
                    <FormControl>
                      <SelectTrigger aria-label="Assign to">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {doctors.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={createForm.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Input placeholder="Reason for follow-up" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div role="note" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Label className="font-medium text-foreground">Note:</Label> Follow-ups cannot be deleted. Use status updates to manage the lifecycle.
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Register Follow-Up
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
