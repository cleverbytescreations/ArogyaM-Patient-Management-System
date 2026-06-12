import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Database,
  FileArchive,
  Server,
  PlayCircle,
  RefreshCw,
  Trash2,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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

function isPurged(entry: BackupLogEntry): boolean {
  return entry.deleted_at != null;
}

function StatusBadge({ entry }: { entry: BackupLogEntry }) {
  if (isPurged(entry)) {
    return (
      <Badge variant="destructive" className="flex w-fit items-center gap-1 opacity-80">
        <Trash2 className="h-3 w-3" aria-hidden="true" />
        <span>Purged</span>
      </Badge>
    );
  }
  const cfg = STATUS_CONFIG[entry.status];
  return (
    <Badge variant={cfg.variant} className="flex w-fit items-center gap-1">
      {cfg.icon}
      <span>{cfg.label}</span>
    </Badge>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── Details dialog ──────────────────────────────────────────────────────────

function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
      <dt className="text-xs font-medium text-muted-foreground pt-0.5">{label}</dt>
      <dd className={`text-sm break-all ${mono ? "font-mono text-xs" : ""}`}>{value ?? "—"}</dd>
    </div>
  );
}

function BackupDetailsDialog({
  entry,
  open,
  onClose,
}: {
  entry: BackupLogEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!entry) return null;

  const typeCfg = BACKUP_TYPE_CONFIG[entry.backup_type];
  const purged = isPurged(entry);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {typeCfg.icon}
            Backup Run Details
            {purged && (
              <Badge variant="destructive" className="ml-1 flex items-center gap-1 text-xs">
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Purged
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Full details for backup run #{entry.id}
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-2.5 mt-1">
          <DetailRow label="ID" value={`#${entry.id}`} />
          <DetailRow label="Type" value={
            <span className="flex items-center gap-1">
              {typeCfg.icon} {typeCfg.label}
            </span>
          } />
          <DetailRow label="Status" value={<StatusBadge entry={entry} />} />
          <DetailRow label="Started" value={formatDateTime(entry.started_at)} />
          <DetailRow label="Completed" value={formatDateTime(entry.completed_at)} />
          {entry.size_bytes != null && (
            <DetailRow label="Size" value={formatBytes(entry.size_bytes)} />
          )}
          {entry.location_ref && (
            <DetailRow label="Storage path" value={entry.location_ref} mono />
          )}
          {entry.message && (
            <DetailRow label="Message" value={entry.message} />
          )}
          {entry.triggered_by && (
            <DetailRow label="Triggered by" value={entry.triggered_by} mono />
          )}
          {purged && entry.deleted_at && (
            <DetailRow
              label="Purged at"
              value={
                <span className="text-destructive">{formatDateTime(entry.deleted_at)}</span>
              }
            />
          )}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

// ─── Latest backup card ───────────────────────────────────────────────────────

function LatestBackupCard({ entry }: { entry: BackupLogEntry }) {
  const typeCfg = BACKUP_TYPE_CONFIG[entry.backup_type];
  const statusCfg = STATUS_CONFIG[entry.status];
  const purged = isPurged(entry);

  return (
    <Card className={purged ? "border-destructive/40 bg-destructive/5" : undefined}>
      <CardHeader className="pb-2">
        <p className={`flex items-center gap-2 text-base font-semibold ${purged ? "text-destructive" : ""}`}>
          {typeCfg.icon}
          Latest Backup — {typeCfg.label}
          {purged && <span className="text-xs font-normal">(storage purged)</span>}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {purged ? (
            <Badge variant="destructive" className="flex items-center gap-1 opacity-80">
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              <span>Purged</span>
            </Badge>
          ) : (
            <Badge variant={statusCfg.variant} className="flex items-center gap-1">
              {statusCfg.icon}
              <span>{statusCfg.label}</span>
            </Badge>
          )}
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
          {purged && entry.deleted_at && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Purged at</dt>
              <dd className="text-destructive">{formatDateTime(entry.deleted_at)}</dd>
            </div>
          )}
          {entry.message && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">Message</dt>
              <dd className="truncate">{entry.message}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function getHistoryRowClassName(entry: BackupLogEntry): string | undefined {
  return isPurged(entry)
    ? "bg-destructive/5 text-destructive/80 hover:bg-destructive/10"
    : undefined;
}

export function BackupStatusPage() {
  const queryClient = useQueryClient();
  const [detailEntry, setDetailEntry] = useState<BackupLogEntry | null>(null);

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["backup-status"],
    queryFn: backupApi.getStatus,
    staleTime: 60_000,
    refetchInterval: 5 * 60 * 1000,
  });

  const triggerMutation = useMutation({
    mutationFn: backupApi.triggerBackup,
    onSuccess: () => {
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["backup-status"] });
      }, 5000);
    },
  });

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
      render: (e) => <StatusBadge entry={e} />,
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
      key: "details",
      header: "",
      className: "w-10 text-right",
      render: (e) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label={`View details for backup run #${e.id}`}
          onClick={(ev) => {
            ev.stopPropagation();
            setDetailEntry(e);
          }}
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </Button>
      ),
    },
  ];

  const runBackupButton = (
    <Button
      size="sm"
      variant="outline"
      onClick={() => triggerMutation.mutate()}
      disabled={triggerMutation.isPending || triggerMutation.isSuccess}
    >
      {triggerMutation.isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <PlayCircle className="mr-2 h-4 w-4" aria-hidden="true" />
      )}
      {triggerMutation.isPending
        ? "Triggering…"
        : triggerMutation.isSuccess
          ? "Triggered — check status shortly"
          : "Run Backup Now"}
    </Button>
  );

  const refreshButton = (
    <Button
      size="sm"
      variant="outline"
      onClick={() => void refetch()}
      disabled={isFetching}
    >
      <RefreshCw
        className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      Refresh
    </Button>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Backup Status"
        subtitle="View automated backup runs or trigger an immediate backup. Backups older than 7 days are automatically purged from storage (shown in red). Restore is performed out-of-band by authorized technical personnel."
        actions={
          <>
            {refreshButton}
            {runBackupButton}
          </>
        }
      />

      {triggerMutation.isError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {getApiErrorMessage(triggerMutation.error, "Could not trigger backup.")}
        </div>
      )}

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
              {data?.recent?.some(isPurged) && (
                <span className="ml-2 text-xs font-normal text-destructive">
                  — red rows have been purged from storage (7-day retention)
                </span>
              )}
            </h2>
            <DataTable
              columns={historyColumns}
              data={data?.recent ?? []}
              isLoading={false}
              total={data?.recent?.length ?? 0}
              page={1}
              pageSize={Math.max(data?.recent?.length ?? 1, 1)}
              onPageChange={() => {}}
              getRowKey={(e) => String(e.id)}
              getRowClassName={getHistoryRowClassName}
              emptyMessage="No backup history available."
            />
          </section>
        </>
      )}

      <BackupDetailsDialog
        entry={detailEntry}
        open={detailEntry != null}
        onClose={() => setDetailEntry(null)}
      />
    </div>
  );
}
