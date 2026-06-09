import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { auditApi } from "@/api/auditApi";
import { getApiErrorMessage } from "@/api/errors";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
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
      className="rounded-md border bg-card p-4 space-y-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            <Badge variant="secondary" className="mr-2 font-mono text-xs">
              {entry.action}
            </Badge>
            {entry.entity_type && (
              <span className="text-sm text-muted-foreground">
                {entry.entity_type}
                {entry.entity_id && ` #${entry.entity_id.slice(0, 8)}`}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateTime(entry.created_at)}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label="Close details panel"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
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
        {entry.ip_address && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">IP Address</p>
            <p>{entry.ip_address}</p>
          </div>
        )}
        {entry.request_id && (
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">Request ID</p>
            <p className="font-mono text-xs">{entry.request_id}</p>
          </div>
        )}
      </div>

      {entry.old_value && Object.keys(entry.old_value).length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Before</p>
          <pre className="max-h-48 overflow-auto rounded bg-muted px-2 py-1.5 text-xs">
            {JSON.stringify(entry.old_value, null, 2)}
          </pre>
        </div>
      )}

      {entry.new_value && Object.keys(entry.new_value).length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">After</p>
          <pre className="max-h-48 overflow-auto rounded bg-muted px-2 py-1.5 text-xs">
            {JSON.stringify(entry.new_value, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function AuditLogsPage() {
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [patientIdFilter, setPatientIdFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const params = {
    user_id: userIdFilter || undefined,
    patient_id: patientIdFilter || undefined,
    action: actionFilter || undefined,
    entity_type: entityTypeFilter || undefined,
    from: fromFilter || undefined,
    to: toFilter || undefined,
    page,
    page_size: DEFAULT_PAGE_SIZE,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => auditApi.list(params),
    staleTime: 30_000,
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
        <span className="max-w-[260px] truncate block text-sm">
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Audit Logs"
        subtitle="Read-only audit trail of all sensitive system actions."
      />

      {/* Filters */}
      <fieldset className="rounded-md border bg-card p-4">
        <legend className="px-1 text-sm font-medium text-muted-foreground">Filters</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="al-action-filter">Action</Label>
            <Input
              id="al-action-filter"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              placeholder="e.g. LOGIN, CREATE, UPDATE"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="al-entity-filter">Entity Type</Label>
            <Input
              id="al-entity-filter"
              value={entityTypeFilter}
              onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }}
              placeholder="e.g. patient, visit"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="al-user-filter">User ID</Label>
            <Input
              id="al-user-filter"
              value={userIdFilter}
              onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }}
              placeholder="UUID"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="al-patient-filter">Patient ID</Label>
            <Input
              id="al-patient-filter"
              value={patientIdFilter}
              onChange={(e) => { setPatientIdFilter(e.target.value); setPage(1); }}
              placeholder="UUID"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="al-from-filter">From date</Label>
            <Input
              id="al-from-filter"
              type="date"
              value={fromFilter}
              onChange={(e) => { setFromFilter(e.target.value); setPage(1); }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="al-to-filter">To date</Label>
            <Input
              id="al-to-filter"
              type="date"
              value={toFilter}
              onChange={(e) => { setToFilter(e.target.value); setPage(1); }}
            />
          </div>
        </div>
      </fieldset>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {getApiErrorMessage(error, "Could not load audit logs.")}
        </div>
      )}

      <DataTable
        columns={columns}
        data={entries}
        isLoading={isLoading}
        total={total}
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={setPage}
        getRowKey={(e) => String(e.id)}
        emptyMessage="No audit log entries match the current filters."
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
