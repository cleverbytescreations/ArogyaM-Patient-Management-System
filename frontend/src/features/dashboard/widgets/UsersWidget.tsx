import { Users, ShieldAlert } from "lucide-react";
import { WidgetCard, WidgetCardSkeleton } from "../WidgetCard";
import type { UsersSummary } from "@/types/dashboard";

interface Props {
  data: UsersSummary | null | undefined;
  loading?: boolean;
}

export function UsersWidget({ data, loading }: Props) {
  if (loading) return <WidgetCardSkeleton rows={2} />;
  return (
    <WidgetCard title="User Accounts" actionLabel="Manage users" actionTo="/users">
      <ul className="space-y-3" role="list">
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4 text-green-500" aria-hidden="true" />
            Active
          </span>
          <span
            className="text-lg font-semibold tabular-nums"
            aria-label={`${data?.active ?? 0} active user accounts`}
          >
            {data?.active ?? 0}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldAlert
              className={`h-4 w-4 ${(data?.locked ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"}`}
              aria-hidden="true"
            />
            Locked
          </span>
          <span
            className={`text-lg font-semibold tabular-nums ${(data?.locked ?? 0) > 0 ? "text-destructive" : ""}`}
            aria-label={`${data?.locked ?? 0} locked user accounts`}
          >
            {data?.locked ?? 0}
          </span>
        </li>
      </ul>
    </WidgetCard>
  );
}
