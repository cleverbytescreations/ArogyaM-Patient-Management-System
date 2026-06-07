import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Edit, Eye, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { documentsApi } from "@/api/documentsApi";
import { visitsApi } from "@/api/visitsApi";
import { usePermissions } from "@/auth/usePermissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { getApiError, getApiErrorCode, getApiErrorMessage, getFieldErrors } from "@/api/errors";
import { documentUpdateSchema, type DocumentUpdateFormValues, type DocumentUploadFormValues } from "@/lib/validation/documents";
import { UploadDialog } from "./UploadDialog";
import { SecureViewer } from "./SecureViewer";
import { DOCUMENT_TYPES, type DocumentStatus, type PatientDocument } from "@/types/documents";

const STATUS_VARIANT: Record<DocumentStatus, "success" | "warning" | "secondary"> = {
  ACTIVE: "success",
  ARCHIVED: "warning",
  DELETED: "secondary",
};

interface DocumentsTabProps {
  patientId: string;
  defaultDocumentType?: string;
  defaultVisitId?: string;
  onDefaultDocumentTypeConsumed?: () => void;
}

type UploadFieldErrors = Partial<Record<keyof DocumentUploadFormValues, string>>;

const UPLOAD_FIELD_LABELS: Record<string, string> = {
  file: "File",
  document_type_code: "Document type",
  visit_id: "Visit",
  title: "Title",
  document_date: "Document date",
  is_historical: "Historical document",
  remarks: "Remarks",
};

function normalizeUploadFieldErrors(error: unknown): UploadFieldErrors {
  const fieldErrors = getFieldErrors(error);
  return Object.entries(fieldErrors).reduce<UploadFieldErrors>((acc, [field, message]) => {
    const normalizedField = field.replace(/^body\./, "") as keyof DocumentUploadFormValues;
    acc[normalizedField] = message;
    return acc;
  }, {});
}

function getUploadValidationMessage(error: unknown): string {
  const apiError = getApiError(error);
  const fieldErrors = normalizeUploadFieldErrors(error);
  const details = Object.entries(fieldErrors)
    .map(([field, message]) => `${UPLOAD_FIELD_LABELS[field] ?? field}: ${message}`)
    .join(" ");
  const requestId = apiError?.request_id ? ` Request ID: ${apiError.request_id}` : "";
  return details ? `${details}${requestId}` : getApiErrorMessage(error, "Could not upload document.");
}

export function DocumentsTab({ patientId, defaultDocumentType, defaultVisitId, onDefaultDocumentTypeConsumed }: DocumentsTabProps) {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState(defaultDocumentType ?? "");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "">("ACTIVE");
  const [visitFilter, setVisitFilter] = useState("");
  const [uploadOpen, setUploadOpen] = useState(Boolean(defaultDocumentType));
  const [uploadFieldErrors, setUploadFieldErrors] = useState<UploadFieldErrors>({});
  const [editing, setEditing] = useState<PatientDocument | null>(null);
  const [deleting, setDeleting] = useState<PatientDocument | null>(null);
  const [viewing, setViewing] = useState<PatientDocument | null>(null);

  const { hasPermission } = usePermissions();
  const canUpload = hasPermission(PERMISSIONS.UPLOAD_DOCUMENT);
  const canRead = hasPermission(PERMISSIONS.VIEW_MEDICAL_HISTORY);
  const canAccess = canRead || canUpload;
  const queryClient = useQueryClient();

  const params = useMemo(() => ({
    page,
    page_size: 10,
    document_type: typeFilter || undefined,
    status: statusFilter || undefined,
    visit_id: visitFilter || undefined,
  }), [page, statusFilter, typeFilter, visitFilter]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["documents", patientId, params],
    queryFn: () => documentsApi.list(patientId, params),
    enabled: canRead,
  });

  const { data: visits = [] } = useQuery({
    queryKey: ["visits", patientId],
    queryFn: () => visitsApi.list(patientId),
    enabled: canAccess,
  });

  const updateForm = useForm<DocumentUpdateFormValues>({
    resolver: zodResolver(documentUpdateSchema),
    defaultValues: { title: "", document_type_code: "OTHER", status: "ACTIVE", remarks: "" },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["documents", patientId] });
    void queryClient.invalidateQueries({ queryKey: ["patient-timeline", patientId] });
  };

  const uploadMutation = useMutation({
    mutationFn: (values: DocumentUploadFormValues) =>
      documentsApi.upload(patientId, {
        ...values,
        visit_id: values.visit_id || null,
        title: values.title?.trim() || null,
        document_date: values.document_date?.trim() || null,
        remarks: values.remarks?.trim() || null,
      }),
    onSuccess: () => {
      invalidate();
      setUploadOpen(false);
      setUploadFieldErrors({});
      onDefaultDocumentTypeConsumed?.();
      toast.success("Document uploaded.");
    },
    onError: (err) => {
      if (getApiErrorCode(err) === "VALIDATION_ERROR") {
        setUploadFieldErrors(normalizeUploadFieldErrors(err));
        toast.error(getUploadValidationMessage(err));
        return;
      }
      toast.error(getApiErrorMessage(err, "Could not upload document."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: DocumentUpdateFormValues) => documentsApi.update(editing!.id, {
      title: values.title?.trim() || null,
      document_type_code: values.document_type_code,
      status: values.status,
      remarks: values.remarks?.trim() || null,
    }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Document metadata updated.");
    },
    onError: (err) => {
      if (getApiErrorCode(err) === "VALIDATION_ERROR") {
        for (const [field, message] of Object.entries(getFieldErrors(err))) {
          updateForm.setError(field as keyof DocumentUpdateFormValues, { message });
        }
        return;
      }
      toast.error(getApiErrorMessage(err, "Could not update document."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => documentsApi.update(deleting!.id, {
      title: deleting!.title,
      document_type_code: deleting!.document_type_code,
      status: "DELETED",
      remarks: deleting!.remarks,
    }),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success("Document deleted.");
    },
    onError: (err) => toast.error(getApiErrorMessage(err, "Could not delete document.")),
  });

  const openEdit = (doc: PatientDocument) => {
    setEditing(doc);
    updateForm.reset({
      title: doc.title ?? "",
      document_type_code: doc.document_type_code,
      status: doc.status,
      remarks: doc.remarks ?? "",
    });
  };

  useEffect(() => {
    if (!defaultDocumentType) return;
    setTypeFilter(defaultDocumentType);
    setVisitFilter(defaultVisitId ?? "");
    setUploadOpen(true);
  }, [defaultDocumentType, defaultVisitId]);

  const downloadMutation = useMutation({
    mutationFn: (doc: PatientDocument) =>
      documentsApi.getContent(doc.id).then((blob) => ({ blob, doc })),
    onSuccess: ({ blob, doc }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.file_name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, "Could not download document.")),
  });

  if (!canAccess) return <div role="alert" className="py-8 text-center text-sm text-muted-foreground">You do not have permission to access documents.</div>;

  const rows = data?.items ?? [];
  const columns: Column<PatientDocument>[] = [
    { key: "title", header: "Document", render: (doc) => (
      <div>
        <p className="font-medium">{doc.title || doc.file_name}</p>
        <p className="text-xs text-muted-foreground">{doc.file_name}</p>
      </div>
    ) },
    { key: "type", header: "Type", render: (doc) => doc.document_type_code.replace(/_/g, " ") },
    { key: "status", header: "Status", render: (doc) => <Badge variant={STATUS_VARIANT[doc.status]}>{doc.status}</Badge> },
    { key: "date", header: "Date", render: (doc) => doc.document_date ? formatDate(doc.document_date) : "—" },
    { key: "uploaded", header: "Uploaded", render: (doc) => formatDateTime(doc.uploaded_at) },
    { key: "actions", header: "", className: "w-44", render: (doc) => (
      <div className="flex justify-end gap-1">
        <Button size="icon" variant="ghost" aria-label={`View ${doc.file_name}`} onClick={() => setViewing(doc)}><Eye className="h-4 w-4" aria-hidden="true" /></Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Download ${doc.file_name}`}
          disabled={downloadMutation.isPending}
          onClick={() => downloadMutation.mutate(doc)}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </Button>
        {canUpload && <Button size="icon" variant="ghost" aria-label={`Edit ${doc.file_name}`} onClick={() => openEdit(doc)}><Edit className="h-4 w-4" aria-hidden="true" /></Button>}
        {canUpload && doc.status !== "DELETED" && <Button size="icon" variant="ghost" aria-label={`Delete ${doc.file_name}`} onClick={() => setDeleting(doc)}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>}
      </div>
    ) },
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Type</span>
            <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">All types</option>
              {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Status</span>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as DocumentStatus | ""); setPage(1); }} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
              <option value="DELETED">Deleted</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Visit</span>
            <select value={visitFilter} onChange={(event) => { setVisitFilter(event.target.value); setPage(1); }} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">All visits</option>
              {visits.map((visit) => <option key={visit.id} value={visit.id}>{visit.visit_date}</option>)}
            </select>
          </label>
        </div>
        {canUpload && (
          <Button size="sm" onClick={() => { setUploadFieldErrors({}); setUploadOpen(true); }}>
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            Upload document
          </Button>
        )}
      </div>

      {canRead ? (
        <>
          {error && <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{getApiErrorMessage(error, "Could not load documents.")}</div>}

          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            total={data?.total ?? 0}
            page={data?.page ?? page}
            pageSize={data?.page_size ?? 10}
            onPageChange={setPage}
            getRowKey={(doc) => doc.id}
            emptyMessage="No documents found for these filters."
          />
        </>
      ) : (
        <div role="status" className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
          You can upload documents, but document listing and secure viewing require medical-history access.
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) {
            setUploadFieldErrors({});
            onDefaultDocumentTypeConsumed?.();
          }
        }}
        visits={visits}
        defaultDocumentType={defaultDocumentType}
        defaultVisitId={defaultVisitId}
        isPending={uploadMutation.isPending}
        serverFieldErrors={uploadFieldErrors}
        onSubmit={(values) => {
          setUploadFieldErrors({});
          uploadMutation.mutate(values);
        }}
      />

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit document metadata</DialogTitle>
            <DialogDescription>Update searchable metadata or archive/delete this document record.</DialogDescription>
          </DialogHeader>
          <Form {...updateForm}>
            <form id="document-edit-form" className="space-y-4" noValidate onSubmit={updateForm.handleSubmit((values) => updateMutation.mutate(values))}>
              <FormField control={updateForm.control} name="title" render={({ field }) => (
                <FormItem><FormLabel>Title</FormLabel><FormControl><Input {...field} disabled={updateMutation.isPending} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={updateForm.control} name="document_type_code" render={({ field }) => (
                <FormItem><FormLabel>Document type</FormLabel><FormControl><Input {...field} disabled={updateMutation.isPending} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={updateForm.control} name="status" render={({ field }) => (
                <FormItem><FormLabel>Status</FormLabel><FormControl><select {...field} disabled={updateMutation.isPending} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option><option value="DELETED">Deleted</option></select></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={updateForm.control} name="remarks" render={({ field }) => (
                <FormItem><FormLabel>Remarks</FormLabel><FormControl><Textarea {...field} rows={3} disabled={updateMutation.isPending} /></FormControl><FormMessage /></FormItem>
              )} />
            </form>
          </Form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={updateMutation.isPending}>Cancel</Button>
            <Button type="submit" form="document-edit-form" disabled={updateMutation.isPending}>{updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Secure viewer</DialogTitle>
            <DialogDescription>Open or download this document through the permission-checked backend stream.</DialogDescription>
          </DialogHeader>
          {viewing && <SecureViewer documentId={viewing.id} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete document?"
        description="This marks the document metadata as deleted. Access remains audited and controlled by the backend."
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"}
        destructive
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
