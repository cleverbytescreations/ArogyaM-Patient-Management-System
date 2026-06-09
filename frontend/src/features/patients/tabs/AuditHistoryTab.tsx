import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/DataTable";
import { auditApi } from "@/api/auditApi";
import { getApiErrorMessage } from "@/api/errors";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_PAGE_SIZE, PERMISSIONS } from "@/lib/constants";
import { usePermissions } from "@/auth/usePermissions";
import type { AuditLogEntry } from "@/types/audit";

function AuditEntryDetailPanel({
  entry,
  onClose,
}: {
  entry: AuditLogEntry;
  onClose: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Audit entry details"
      className="rounded-md border bg-muted/40 p-4 space-y-3 text-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Entry #{entry.id} · {formatDateTime(entry.created_at)}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label="Close details"
          className="h-6 w-6 p-0"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {entry.description && (
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">Description</p>
            <p>{entry.description}</p>
          </div>
        )}
        {entry.user_role && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Role</p>
            <p>{entry.user_role}</p>
          </div>
        )}
      </div>

      {entry.old_value && Object.keys(entry.old_value).length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Before</p>
          <pre className="max-h-36 overflow-auto rounded bg-muted px-2 py-1.5 text-xs">
            {JSON.stringify(entry.old_value, null, 2)}
          </pre>
        </div>
      )}

      {entry.new_value && Object.keys(entry.new_value).length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">After</p>
          <pre className="max-h-36 overflow-auto rounded bg-muted px-2 py-1.5 text-xs">
            {JSON.stringify(entry.new_value, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

interface AuditHistoryTabProps {
  patientId: string;
}

export function AuditHistoryTab({ patientId }: AuditHistoryTabProps) {
  const { hasPermission } = usePermissions();
  const canViewAudit = hasPermission(PERMISSIONS.VIEW_AUDIT);

  const [page, setPage] = useState(1);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const params = { patient_id: patientId, page, page_size: DEFAULT_PAGE_SIZE };

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => auditApi.list(params),
    staleTime: 30_000,
    enabled: canViewAudit,
  });

  const entries = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "created_at",
      header: "Timestamp",
      render: (e) => (
        <span className="whitespace-nowrap text-sm">{formatDateTime(e.created_at)}</span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (e) => (
        <Badge variant="secondary" className="font-mono text-xs">
          {e.action}
        </Badge>
      ),
    },
    {
      key: "entity_type",
      header: "Entity",
      render: (e) =>
        e.entity_type ? (
          <span className="text-sm">
            {e.entity_type}
            {e.entity_id && (
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                #{e.entity_id.slice(0, 8)}
              </span>
            )}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "user_role",
      header: "Role",
      render: (e) => e.user_role ?? "—",
    },
    {
      key: "description",
      header: "Summary",
      render: (e) => (
        <span className="max-w-[220px] truncate block text-sm">
          {e.description ?? "—"}
        </span>
      ),
    },
    {
      key: "detail",
      header: "Details",
      render: (e) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelectedEntry(selectedEntry?.id === e.id ? null : e)}
          aria-expanded={selectedEntry?.id === e.id}
          aria-label="View entry details"
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform ${selectedEntry?.id === e.id ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
        </Button>
      ),
      className: "w-10",
    },
  ];

  if (!canViewAudit) {
    return (
      <div
        role="alert"
        className="rounded-md border border-muted bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
      >
        You do not have permission to view audit history.
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {getApiErrorMessage(error, "Could not load audit history.")}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <p className="text-sm text-muted-foreground">
        Read-only history of all audited actions on this patient record.
      </p>

      <DataTable
        columns={columns}
        data={entries}
        isLoading={isLoading}
        total={total}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={setPage}
        getRowKey={(e) => String(e.id)}
        emptyMessage="No audit history for this patient."
      />

      {selectedEntry && (
        <AuditEntryDetailPanel
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}
