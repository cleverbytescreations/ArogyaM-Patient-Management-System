import { useAuth } from "./AuthContext";

export function usePermissions() {
  const { permissions, roles } = useAuth();

  const hasPermission = (permission: string): boolean =>
    permissions.includes(permission);

  const hasRole = (role: string): boolean => roles.includes(role);

  const hasAnyPermission = (...perms: string[]): boolean =>
    perms.some((p) => permissions.includes(p));

  const hasAllPermissions = (...perms: string[]): boolean =>
    perms.every((p) => permissions.includes(p));

  return { permissions, roles, hasPermission, hasRole, hasAnyPermission, hasAllPermissions };
}
