import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { visitsApi } from "@/api/visitsApi";
import { getApiErrorMessage } from "@/api/errors";
import { formatDateTime } from "@/lib/format";
import type { PatientAliasSource } from "@/types/visits";

const SOURCE_LABELS: Record<PatientAliasSource, string> = {
  MERGE: "Merge",
  HISTORICAL: "Historical import",
  CORRECTION: "OP correction",
};

export function AliasesPanel({ patientId }: { patientId: string }) {
  const { data: aliases, isLoading, error } = useQuery({
    queryKey: ["patient-aliases", patientId],
    queryFn: () => visitsApi.getAliases(patientId),
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading aliases…
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {getApiErrorMessage(error, "Could not load aliases.")}
      </p>
    );
  }

  if (!aliases || aliases.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No legacy OP numbers on record.</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm" aria-label="Legacy OP numbers">
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">
              Old OP number
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">
              Source
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">
              Remarks
            </th>
            <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">
              Date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {aliases.map((alias) => (
            <tr key={alias.id} className="bg-card">
              <td className="px-4 py-2 font-mono font-medium">{alias.old_op_number}</td>
              <td className="px-4 py-2">{SOURCE_LABELS[alias.source] ?? alias.source}</td>
              <td className="px-4 py-2 text-muted-foreground">{alias.remarks ?? "—"}</td>
              <td className="px-4 py-2 text-muted-foreground">{formatDateTime(alias.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
