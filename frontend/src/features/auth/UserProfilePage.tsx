import { Mail, ShieldCheck, Clock, User, CircleCheck, CircleX } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/auth/AuthContext";
import { formatRoleCode, formatDateTime } from "@/lib/format";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 text-sm text-foreground">{value}</div>
      </div>
    </div>
  );
}

export function UserProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  const isActive = user.status === "ACTIVE";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Account" title="My Profile" />

      {/* Identity card */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
              {getInitials(user.full_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-medium leading-tight">{user.full_name}</h2>
            <p className="text-sm text-muted-foreground">@{user.username}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {user.roles.map((role) => (
                <Badge key={role} variant="secondary" className="text-xs">
                  {formatRoleCode(role)}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <Separator className="my-5" />

        <div className="grid gap-4 sm:grid-cols-2">
          <InfoRow
            icon={User}
            label="Username"
            value={<span className="font-mono">{user.username}</span>}
          />
          <InfoRow
            icon={Mail}
            label="Email"
            value={user.email ?? <span className="text-muted-foreground">Not set</span>}
          />
          <InfoRow
            icon={isActive ? CircleCheck : CircleX}
            label="Account status"
            value={
              <span
                className={
                  isActive
                    ? "text-green-600 dark:text-green-400"
                    : user.status === "LOCKED"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-destructive"
                }
              >
                {isActive ? "Active" : user.status === "LOCKED" ? "Locked" : "Disabled"}
              </span>
            }
          />
          <InfoRow
            icon={Clock}
            label="Last login"
            value={formatDateTime(user.last_login_at)}
          />
        </div>

        <Separator className="my-5" />

        <InfoRow
          icon={ShieldCheck}
          label="Assigned roles"
          value={
            <div className="mt-1 flex flex-wrap gap-1.5">
              {user.roles.map((role) => (
                <Badge key={role} variant="outline" className="text-xs">
                  {formatRoleCode(role)}
                </Badge>
              ))}
            </div>
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        To update your name, email, or password, contact an Administrator.
      </p>
    </div>
  );
}
