import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "@/auth/usePermissions";

interface RequirePermissionProps {
  permission: string;
  children: ReactNode;
  redirectTo?: string;
}

export function RequirePermission({
  permission,
  children,
  redirectTo = "/",
}: RequirePermissionProps) {
  const { hasPermission } = usePermissions();

  if (!hasPermission(permission)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
