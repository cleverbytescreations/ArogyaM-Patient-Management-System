import { Download, ExternalLink, Loader2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { documentsApi } from "@/api/documentsApi";
import { getApiErrorMessage } from "@/api/errors";
import { formatDate, formatDateTime } from "@/lib/format";

interface SecureViewerProps {
  documentId: string;
}

export function SecureViewer({ documentId }: SecureViewerProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["documents", "metadata", documentId],
    queryFn: () => documentsApi.get(documentId),
  });

  const contentMutation = useMutation({
    mutationFn: () => documentsApi.getContent(documentId),
    onError: (err) => toast.error(getApiErrorMessage(err, "Could not open document.")),
  });

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading document metadata…</div>;
  if (error || !data) return <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{getApiErrorMessage(error, "Could not load document.")}</div>;

  const openDocument = () => {
    contentMutation.mutate(undefined, {
      onSuccess: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
    });
  };

  const downloadDocument = () => {
    contentMutation.mutate(undefined, {
      onSuccess: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = data.file_name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
    });
  };

  return (
    <section className="space-y-4" aria-label="Secure document viewer">
      <div className="rounded-md border bg-card p-4">
        <h2 className="text-base font-semibold">{data.title || data.file_name}</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Type</dt><dd>{data.document_type_code.replace(/_/g, " ")}</dd></div>
          <div><dt className="text-muted-foreground">Status</dt><dd>{data.status}</dd></div>
          <div><dt className="text-muted-foreground">Document date</dt><dd>{data.document_date ? formatDate(data.document_date) : "—"}</dd></div>
          <div><dt className="text-muted-foreground">Uploaded</dt><dd>{formatDateTime(data.uploaded_at)}</dd></div>
        </dl>
        {data.remarks && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{data.remarks}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={openDocument} disabled={contentMutation.isPending} aria-busy={contentMutation.isPending}>
          {contentMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />}
          Open secure stream
        </Button>
        <Button variant="outline" onClick={downloadDocument} disabled={contentMutation.isPending}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Download
        </Button>
      </div>
    </section>
  );
}
