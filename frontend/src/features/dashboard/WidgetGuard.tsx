import type { ReactNode } from "react";
import { usePermissions } from "@/auth/usePermissions";

interface WidgetGuardProps {
  permission: string;
  children: ReactNode;
}

/** Renders children only when the current user has the required permission.
 *  Unlike RequirePermission (which redirects), this silently omits the widget. */
export function WidgetGuard({ permission, children }: WidgetGuardProps) {
  const { hasPermission } = usePermissions();
  if (!hasPermission(permission)) return null;
  return <>{children}</>;
}
