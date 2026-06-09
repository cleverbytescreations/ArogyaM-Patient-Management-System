import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Database,
  FileArchive,
  Server,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { backupApi } from "@/api/backupApi";
import { getApiErrorMessage } from "@/api/errors";
import { formatDateTime } from "@/lib/format";
import type { BackupLogEntry, BackupType, BackupStatus } from "@/types/backup";

const BACKUP_TYPE_CONFIG: Record<BackupType, { label: string; icon: React.ReactNode }> = {
  DATABASE: { label: "Database", icon: <Database className="h-4 w-4" aria-hidden="true" /> },
  DOCUMENTS: { label: "Documents", icon: <FileArchive className="h-4 w-4" aria-hidden="true" /> },
  FULL: { label: "Full", icon: <Server className="h-4 w-4" aria-hidden="true" /> },
};

const STATUS_CONFIG: Record<
  BackupStatus,
  { label: string; icon: React.ReactNode; variant: "success" | "destructive" | "warning" }
> = {
  STARTED: {
    label: "In Progress",
    icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />,
    variant: "warning",
  },
  SUCCESS: {
    label: "Success",
    icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
    variant: "success",
  },
  FAILED: {
    label: "Failed",
    icon: <XCircle className="h-3 w-3" aria-hidden="true" />,
    variant: "destructive",
  },
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function LatestBackupCard({ entry }: { entry: BackupLogEntry }) {
  const typeCfg = BACKUP_TYPE_CONFIG[entry.backup_type];
  const statusCfg = STATUS_CONFIG[entry.status];

  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="flex items-center gap-2 text-base font-semibold">
          {typeCfg.icon}
          Latest Backup — {typeCfg.label}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant={statusCfg.variant} className="flex items-center gap-1">
            {statusCfg.icon}
            <span>{statusCfg.label}</span>
          </Badge>
        </div>
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Started</dt>
            <dd>{formatDateTime(entry.started_at)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Completed</dt>
            <dd>{formatDateTime(entry.completed_at)}</dd>
          </div>
          {entry.size_bytes != null && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Size</dt>
              <dd>{formatBytes(entry.size_bytes)}</dd>
            </div>
          )}
          {entry.message && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">Message</dt>
              <dd>{entry.message}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

const historyColumns: Column<BackupLogEntry>[] = [
  {
    key: "started_at",
    header: "Started",
    render: (e) => (
      <span className="whitespace-nowrap text-sm">{formatDateTime(e.started_at)}</span>
    ),
  },
  {
    key: "backup_type",
    header: "Type",
    render: (e) => {
      const cfg = BACKUP_TYPE_CONFIG[e.backup_type];
      return (
        <span className="flex items-center gap-1 text-sm">
          {cfg.icon}
          {cfg.label}
        </span>
      );
    },
  },
  {
    key: "status",
    header: "Status",
    render: (e) => {
      const cfg = STATUS_CONFIG[e.status];
      return (
        <Badge variant={cfg.variant} className="flex w-fit items-center gap-1">
          {cfg.icon}
          <span>{cfg.label}</span>
        </Badge>
      );
    },
  },
  {
    key: "size_bytes",
    header: "Size",
    render: (e) => formatBytes(e.size_bytes),
  },
  {
    key: "completed_at",
    header: "Completed",
    render: (e) => (
      <span className="whitespace-nowrap text-sm">{formatDateTime(e.completed_at)}</span>
    ),
  },
  {
    key: "message",
    header: "Message",
    render: (e) => (
      <span className="max-w-[240px] truncate block text-sm">{e.message ?? "—"}</span>
    ),
  },
];

export function BackupStatusPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["backup-status"],
    queryFn: backupApi.getStatus,
    staleTime: 60_000,
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Backup Status"
        subtitle="Read-only view of automated backup runs and outcomes. Restore is performed out-of-band by authorized technical personnel."
      />

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {getApiErrorMessage(error, "Could not load backup status.")}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2
            className="h-8 w-8 animate-spin text-muted-foreground"
            aria-label="Loading backup status…"
          />
        </div>
      )}

      {!isLoading && !error && (
        <>
          {data?.latest ? (
            <LatestBackupCard entry={data.latest} />
          ) : (
            <p className="text-sm text-muted-foreground">No backup runs recorded yet.</p>
          )}

          <section aria-labelledby="backup-history-heading">
            <h2
              id="backup-history-heading"
              className="mb-3 text-base font-semibold"
            >
              Recent Runs
            </h2>
            <DataTable
              columns={historyColumns}
              data={data?.history ?? []}
              isLoading={false}
              total={data?.history?.length ?? 0}
              page={1}
              pageSize={Math.max(data?.history?.length ?? 1, 1)}
              onPageChange={() => {}}
              getRowKey={(e) => String(e.id)}
              emptyMessage="No backup history available."
            />
          </section>
        </>
      )}
    </div>
  );
}
