import { useQuery } from "@tanstack/react-query";
import { CalendarClock, FileText, FileUp, HeartPulse, NotebookPen, Pill, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { patientsApi } from "@/api/patientsApi";
import { usePermissions } from "@/auth/usePermissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getApiErrorMessage } from "@/api/errors";
import type { TimelineEventType } from "@/types/timeline";

const EVENT_CONFIG: Record<TimelineEventType, { label: string; icon: React.ElementType; variant: "secondary" | "success" | "warning" }> = {
  VISIT: { label: "Visit", icon: Stethoscope, variant: "secondary" },
  CASE_SHEET: { label: "Case sheet", icon: FileText, variant: "success" },
  CONSULTATION_NOTE: { label: "Consultation", icon: NotebookPen, variant: "success" },
  PRESCRIPTION: { label: "Prescription", icon: Pill, variant: "success" },
  DISCHARGE_SUMMARY: { label: "Discharge", icon: HeartPulse, variant: "warning" },
  DOCUMENT: { label: "Document", icon: FileUp, variant: "secondary" },
  FOLLOW_UP: { label: "Follow-up", icon: CalendarClock, variant: "warning" },
};

interface TimelineTabProps {
  patientId: string;
  visitId?: string | null;
  onOpenSection?: (section: string) => void;
}

export function TimelineTab({ patientId, visitId, onOpenSection }: TimelineTabProps) {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission(PERMISSIONS.VIEW_MEDICAL_HISTORY);
  const { data, isLoading, error } = useQuery({
    queryKey: ["patient-timeline", patientId, visitId ?? null],
    queryFn: () => patientsApi.timeline(patientId, visitId),
    enabled: canRead,
  });

  if (!canRead) return <div role="alert" className="py-8 text-center text-sm text-muted-foreground">You do not have permission to view the patient timeline.</div>;
  if (isLoading) return <p className="pt-4 text-sm text-muted-foreground">Loading timeline…</p>;
  if (error) return <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{getApiErrorMessage(error, "Could not load timeline.")}</div>;

  const events = data?.events ?? [];

  if (events.length === 0) return <p className="pt-4 text-sm text-muted-foreground">No timeline events yet.</p>;

  const targetTab: Partial<Record<TimelineEventType, string>> = {
    VISIT: "visits",
    CASE_SHEET: "case-sheet",
    CONSULTATION_NOTE: "consultation-notes",
    PRESCRIPTION: "prescriptions",
    DISCHARGE_SUMMARY: "discharge",
    DOCUMENT: "documents",
    FOLLOW_UP: "followups",
  };

  return (
    <ol className="space-y-3 pt-4" aria-label="Patient timeline">
      {events.map((event) => {
        const config = EVENT_CONFIG[event.type];
        const Icon = config.icon;
        return (
          <li key={`${event.type}-${event.ref_id}-${event.occurred_on}`} className="grid grid-cols-[2rem_1fr] gap-3">
            <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full border bg-card">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <article className="rounded-md border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant={config.variant}>{config.label}</Badge>
                <time className="text-sm text-muted-foreground" dateTime={event.occurred_on}>{formatDate(event.occurred_on)}</time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{event.summary}</p>
              {targetTab[event.type] && (
                <Button className="mt-3" size="sm" variant="outline" onClick={() => onOpenSection?.(targetTab[event.type]!)}>Open section</Button>
              )}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
