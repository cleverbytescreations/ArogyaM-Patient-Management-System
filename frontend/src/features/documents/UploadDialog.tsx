import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { documentUploadSchema, type DocumentUploadFormValues } from "@/lib/validation/documents";
import type { Visit } from "@/types/visits";

const DOCUMENT_TYPES = [
  "LAB_REPORT",
  "PHOTOGRAPH",
  "INVESTIGATION",
  "CASE_SHEET",
  "PRESCRIPTION",
  "DISCHARGE_SUMMARY",
  "OTHER",
];

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visits: Visit[];
  defaultDocumentType?: string;
  isPending: boolean;
  onSubmit: (values: DocumentUploadFormValues) => void;
}

export function UploadDialog({ open, onOpenChange, visits, defaultDocumentType = "", isPending, onSubmit }: UploadDialogProps) {
  const form = useForm<DocumentUploadFormValues>({
    resolver: zodResolver(documentUploadSchema),
    defaultValues: {
      document_type_code: defaultDocumentType,
      visit_id: "",
      title: "",
      document_date: "",
      is_historical: false,
      remarks: "",
    },
  });

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) form.reset({ document_type_code: defaultDocumentType, visit_id: "", title: "", document_date: "", is_historical: false, remarks: "" });
  };

  useEffect(() => {
    if (open) {
      form.setValue("document_type_code", defaultDocumentType);
    }
  }, [defaultDocumentType, form, open]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>Allowed files: PDF, JPEG, or PNG up to 10 MB.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="document-upload-form" className="space-y-4" noValidate onSubmit={form.handleSubmit(onSubmit)}>
            <FormField control={form.control} name="file" render={({ field: { onChange, value: _value, ...field } }) => (
              <FormItem>
                <FormLabel>File</FormLabel>
                <FormControl>
                  <Input {...field} type="file" accept="application/pdf,image/jpeg,image/png" disabled={isPending} onChange={(event) => onChange(event.target.files?.[0])} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="document_type_code" render={({ field }) => (
              <FormItem>
                <FormLabel>Document type</FormLabel>
                <FormControl>
                  <select {...field} disabled={isPending} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Select type</option>
                    {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="visit_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Visit</FormLabel>
                <FormControl>
                  <select {...field} disabled={isPending} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">No visit link</option>
                    {visits.map((visit) => <option key={visit.id} value={visit.id}>{visit.visit_date} · {visit.visit_type_code}</option>)}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl><Input {...field} disabled={isPending} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="document_date" render={({ field }) => (
              <FormItem>
                <FormLabel>Document date</FormLabel>
                <FormControl><Input {...field} type="date" disabled={isPending} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="is_historical" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-md border p-3">
                <FormLabel>Historical document</FormLabel>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isPending} aria-label="Historical document" /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="remarks" render={({ field }) => (
              <FormItem>
                <FormLabel>Remarks</FormLabel>
                <FormControl><Textarea {...field} rows={3} disabled={isPending} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={isPending}>Cancel</Button>
          <Button type="submit" form="document-upload-form" disabled={isPending} aria-busy={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
