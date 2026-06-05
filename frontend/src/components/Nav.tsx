import type { ElementType } from "react";
import { NavLink } from "react-router-dom";
import {
  Users,
  FileText,
  HardDrive,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/auth/usePermissions";
import { PERMISSIONS } from "@/lib/constants";

interface NavItem {
  to: string;
  label: string;
  icon: ElementType;
  permission?: string;
}

const navItems: NavItem[] = [
  {
    to: "/users",
    label: "User Management",
    icon: Users,
    permission: PERMISSIONS.MANAGE_USERS,
  },
  {
    to: "/audit-logs",
    label: "Audit Logs",
    icon: FileText,
    permission: PERMISSIONS.VIEW_AUDIT,
  },
  {
    to: "/backup",
    label: "Backup Status",
    icon: HardDrive,
    permission: PERMISSIONS.BACKUP_CONTROL,
  },
];

const commonNavItems: NavItem[] = [
  {
    to: "/",
    label: "Dashboard",
    icon: Activity,
  },
];

export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { hasPermission } = usePermissions();

  const allItems = [
    ...commonNavItems,
    ...navItems.filter((item) =>
      item.permission ? hasPermission(item.permission) : true
    ),
  ];

  return (
    <nav aria-label="Main navigation">
      <ul className="space-y-1" role="list">
        {allItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
