import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prescriptionSchema, type PrescriptionFormValues } from "@/lib/validation/clinical";

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
}

export function PrescriptionFormDialog({ open, onOpenChange, isPending, onSubmit }: PrescriptionFormDialogProps) {
  const form = useForm<PrescriptionFormValues>({
    resolver: zodResolver(prescriptionSchema) as Resolver<PrescriptionFormValues>,
    defaultValues: {
      doctor_id: "",
      prescription_date: new Date().toISOString().slice(0, 10),
      instructions: "",
      review_advice: "",
      medicine_details: "",
      items: [EMPTY_ITEM],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) form.reset();
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
                  <FormLabel>Doctor ID</FormLabel>
                  <FormControl><Input {...field} disabled={isPending} placeholder="Optional" /></FormControl>
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
