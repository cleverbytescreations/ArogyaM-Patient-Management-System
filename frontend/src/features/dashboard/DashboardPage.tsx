import { usePermissions } from "@/auth/usePermissions";
import { useAuth } from "@/auth/AuthContext";
import { PERMISSIONS } from "@/lib/constants";
import { useDashboardSummary } from "./useDashboardSummary";
import { WidgetGuard } from "./WidgetGuard";
import { RegistrationsWidget } from "./widgets/RegistrationsWidget";
import { TodaysQueueWidget } from "./widgets/TodaysQueueWidget";
import { RegisterPatientCta } from "./widgets/RegisterPatientCta";
import { FollowupsDueWidget } from "./widgets/FollowupsDueWidget";
import { PendingMergeWidget } from "./widgets/PendingMergeWidget";
import { UsersWidget } from "./widgets/UsersWidget";
import { BackupWidget } from "./widgets/BackupWidget";
import { AuditFeedWidget } from "./widgets/AuditFeedWidget";
import { TodayFollowupsWidget } from "./widgets/TodayFollowupsWidget";

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardPage() {
  const { data, isLoading } = useDashboardSummary();
  const { roles } = usePermissions();
  const { user } = useAuth();

  const isAdmin = roles.includes("ADMIN");
  const isDoctor = roles.includes("DOCTOR");
  const isStaff = !isDoctor && (roles.includes("RECEPTION") || roles.includes("DATA_ENTRY"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greet()}{user?.full_name ? `, ${user.full_name}` : ""}
        </h1>
        <p className="text-muted-foreground">Here's what's happening at the clinic today.</p>
      </div>

      {/* ── Admin: governance row first ─────────────────────────────────── */}
      {isAdmin && (
        <section aria-labelledby="admin-section">
          <h2 id="admin-section" className="sr-only">System overview</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <WidgetGuard permission={PERMISSIONS.VIEW_PATIENT}>
              <RegistrationsWidget data={data?.registrations} loading={isLoading} />
            </WidgetGuard>
            <WidgetGuard permission={PERMISSIONS.MERGE_RECORDS}>
              <PendingMergeWidget data={data?.merge_requests} loading={isLoading} />
            </WidgetGuard>
            <WidgetGuard permission={PERMISSIONS.MANAGE_USERS}>
              <UsersWidget data={data?.users} loading={isLoading} />
            </WidgetGuard>
            <WidgetGuard permission={PERMISSIONS.BACKUP_CONTROL}>
              <BackupWidget data={data?.backup} loading={isLoading} />
            </WidgetGuard>
          </div>
        </section>
      )}

      {/* ── Clinical section: visits + follow-ups ───────────────────────── */}
      <section aria-labelledby="clinical-section">
        <h2 id="clinical-section" className="sr-only">Clinical activity</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* Doctor: queue first; Reception/DataEntry: CTA first */}
          {isDoctor ? (
            <>
              <WidgetGuard permission={PERMISSIONS.VIEW_PATIENT}>
                <TodaysQueueWidget data={data?.visits} loading={isLoading} />
              </WidgetGuard>
              <WidgetGuard permission={PERMISSIONS.MANAGE_FOLLOWUPS}>
                <FollowupsDueWidget data={data?.followups} loading={isLoading} />
              </WidgetGuard>
              {!isAdmin && (
                <WidgetGuard permission={PERMISSIONS.VIEW_PATIENT}>
                  <RegistrationsWidget data={data?.registrations} loading={isLoading} />
                </WidgetGuard>
              )}
            </>
          ) : (
            <>
              <WidgetGuard permission={PERMISSIONS.CREATE_PATIENT}>
                <RegisterPatientCta />
              </WidgetGuard>
              <WidgetGuard permission={PERMISSIONS.VIEW_PATIENT}>
                <TodaysQueueWidget data={data?.visits} loading={isLoading} />
              </WidgetGuard>
              <WidgetGuard permission={PERMISSIONS.MANAGE_FOLLOWUPS}>
                <FollowupsDueWidget data={data?.followups} loading={isLoading} />
              </WidgetGuard>
              {!isAdmin && (
                <WidgetGuard permission={PERMISSIONS.VIEW_PATIENT}>
                  <RegistrationsWidget data={data?.registrations} loading={isLoading} />
                </WidgetGuard>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Doctor: today's patients (own queue) ────────────────────────── */}
      {isDoctor && user && (
        <WidgetGuard permission={PERMISSIONS.VIEW_PATIENT}>
          <section aria-labelledby="doctor-queue-section">
            <h2 id="doctor-queue-section" className="sr-only">Today's patients</h2>
            <TodayFollowupsWidget doctorId={user.id} />
          </section>
        </WidgetGuard>
      )}

      {/* ── Staff: today's queue across all doctors ──────────────────────── */}
      {isStaff && (
        <WidgetGuard permission={PERMISSIONS.VIEW_PATIENT}>
          <section aria-labelledby="staff-queue-section">
            <h2 id="staff-queue-section" className="sr-only">Today's queue — all doctors</h2>
            <TodayFollowupsWidget />
          </section>
        </WidgetGuard>
      )}

      {/* ── Audit feed: admin only, full-width ──────────────────────────── */}
      <WidgetGuard permission={PERMISSIONS.VIEW_AUDIT}>
        <section aria-labelledby="audit-section">
          <h2 id="audit-section" className="sr-only">Recent audit events</h2>
          <AuditFeedWidget data={data?.audit_recent} loading={isLoading} />
        </section>
      </WidgetGuard>
    </div>
  );
}
