import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
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
  const actor = entry.user_name ?? entry.user_id?.slice(0, 8) ?? "System";
  const target = entry.patient_name ?? entry.patient_id?.slice(0, 8) ?? "—";

  return (
    <div
      role="region"
      aria-label="Audit entry details"
      className="bg-muted/60 border-t px-4 py-3 space-y-3 text-sm"
    >
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      <p className="font-medium text-foreground">
        <span className="text-primary">{actor}</span>
        {entry.user_role && (
          <span className="ml-1 text-xs text-muted-foreground">
            ({entry.user_role})
          </span>
        )}
        {entry.description ? ` — ${entry.description}` : ""}
        {entry.patient_name && (
          <>
            {" · patient "}
            <span className="text-primary">{target}</span>
          </>
        )}
      </p>

      <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
        <div>
          <span className="font-medium">Entry #</span> {entry.id}
        </div>
        <div>
          <span className="font-medium">Time</span>{" "}
          {formatDateTime(entry.created_at)}
        </div>
        {entry.ip_address && (
          <div>
            <span className="font-medium">IP</span> {entry.ip_address}
          </div>
        )}
        {entry.request_id && (
          <div className="truncate">
            <span className="font-medium">Request</span>{" "}
            <span className="font-mono">{entry.request_id}</span>
          </div>
        )}
        {entry.user_agent && (
          <div className="sm:col-span-2 truncate">
            <span className="font-medium">User-Agent</span> {entry.user_agent}
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      key: "performed_by",
      header: "Performed By",
      render: (e) => (
        <span className="text-sm">
          {e.user_name ?? (e.user_id ? e.user_id.slice(0, 8) : "System")}
          {e.user_role && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({e.user_role})
            </span>
          )}
        </span>
      ),
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
      header: <span className="sr-only">Details</span>,
      render: (e) => {
        const isExpanded = expandedId === String(e.id);
        return (
          <button
            type="button"
            onClick={() => setExpandedId(isExpanded ? null : String(e.id))}
            aria-expanded={isExpanded}
            aria-label="View entry details"
            className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
          </button>
        );
      },
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
        onPageChange={(p) => { setPage(p); setExpandedId(null); }}
        getRowKey={(e) => String(e.id)}
        expandedRowKey={expandedId}
        renderExpandedRow={(e) => (
          <AuditEntryDetailPanel entry={e} onClose={() => setExpandedId(null)} />
        )}
        emptyMessage="No audit history for this patient."
      />
    </div>
  );
}
