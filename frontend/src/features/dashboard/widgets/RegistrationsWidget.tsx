import { UserPlus } from "lucide-react";
import { KpiCard, KpiCardSkeleton } from "../KpiCard";
import type { RegistrationsSummary } from "@/types/dashboard";

interface Props {
  data: RegistrationsSummary | null | undefined;
  loading?: boolean;
}

export function RegistrationsWidget({ data, loading }: Props) {
  if (loading) return <KpiCardSkeleton />;
  return (
    <KpiCard
      title="Registered Today"
      value={data?.today ?? 0}
      description={`${data?.this_week ?? 0} this week`}
      help="New patients who had an OP number assigned and a patient record created today. The 'this week' count includes all registrations from Monday of the current week."
      icon={<UserPlus className="h-4 w-4" />}
      to="/patients/search"
      aria-label={`${data?.today ?? 0} patients registered today`}
    />
  );
}
