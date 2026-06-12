import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { RequireAuth } from "./RequireAuth";
import { RequirePermission } from "./RequirePermission";
import { AppShell } from "@/components/AppShell";
import { LoginPage } from "@/features/auth/LoginPage";
import { PageLoader } from "@/components/PageLoader";
import { PERMISSIONS } from "@/lib/constants";

const DashboardPage = lazy(
  () =>
    import("@/features/dashboard/DashboardPage").then((m) => ({
      default: m.DashboardPage,
    }))
);

const UsersListPage = lazy(
  () =>
    import("@/features/users/UsersListPage").then((m) => ({
      default: m.UsersListPage,
    }))
);

const PatientSearchPage = lazy(
  () =>
    import("@/features/search/PatientSearchPage").then((m) => ({
      default: m.PatientSearchPage,
    }))
);

const RegisterPatientPage = lazy(
  () =>
    import("@/features/patients/RegisterPatientPage").then((m) => ({
      default: m.RegisterPatientPage,
    }))
);

const PatientProfilePage = lazy(
  () =>
    import("@/features/patients/PatientProfilePage").then((m) => ({
      default: m.PatientProfilePage,
    }))
);

const DocumentsRegisterPage = lazy(
  () =>
    import("@/features/documents/DocumentsRegisterPage").then((m) => ({
      default: m.DocumentsRegisterPage,
    }))
);

const VisitRegisterPage = lazy(
  () =>
    import("@/features/visits/VisitRegisterPage").then((m) => ({
      default: m.VisitRegisterPage,
    }))
);

const FollowUpRegisterPage = lazy(
  () =>
    import("@/features/followups/FollowUpRegisterPage").then((m) => ({
      default: m.FollowUpRegisterPage,
    }))
);

const AuditLogsPage = lazy(
  () =>
    import("@/features/audit/AuditLogsPage").then((m) => ({
      default: m.AuditLogsPage,
    }))
);

const BackupStatusPage = lazy(
  () =>
    import("@/features/backup/BackupStatusPage").then((m) => ({
      default: m.BackupStatusPage,
    }))
);

const UserProfilePage = lazy(
  () =>
    import("@/features/auth/UserProfilePage").then((m) => ({
      default: m.UserProfilePage,
    }))
);

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppShell>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />

                  {/* Patient search — default landing for staff */}
                  <Route
                    path="/patients/search"
                    element={
                      <RequirePermission permission={PERMISSIONS.VIEW_PATIENT}>
                        <PatientSearchPage />
                      </RequirePermission>
                    }
                  />

                  {/* Patient registration */}
                  <Route
                    path="/patients/new"
                    element={
                      <RequirePermission permission={PERMISSIONS.CREATE_PATIENT}>
                        <RegisterPatientPage />
                      </RequirePermission>
                    }
                  />

                  {/* Patient profile */}
                  <Route
                    path="/patients/:id"
                    element={
                      <RequirePermission permission={PERMISSIONS.VIEW_PATIENT}>
                        <PatientProfilePage />
                      </RequirePermission>
                    }
                  />

                  <Route
                    path="/documents"
                    element={
                      <RequirePermission permission={PERMISSIONS.VIEW_MEDICAL_HISTORY}>
                        <DocumentsRegisterPage />
                      </RequirePermission>
                    }
                  />

                  {/* User management */}
                  <Route
                    path="/users"
                    element={
                      <RequirePermission permission={PERMISSIONS.MANAGE_USERS}>
                        <UsersListPage />
                      </RequirePermission>
                    }
                  />

                  {/* Visit Register */}
                  <Route
                    path="/visit-register"
                    element={
                      <RequirePermission permission={PERMISSIONS.VIEW_PATIENT}>
                        <VisitRegisterPage />
                      </RequirePermission>
                    }
                  />

                  {/* Follow-Up Register */}
                  <Route
                    path="/follow-ups"
                    element={
                      <RequirePermission permission={PERMISSIONS.MANAGE_FOLLOWUPS}>
                        <FollowUpRegisterPage />
                      </RequirePermission>
                    }
                  />

                  {/* Audit Logs */}
                  <Route
                    path="/audit-logs"
                    element={
                      <RequirePermission permission={PERMISSIONS.VIEW_AUDIT}>
                        <AuditLogsPage />
                      </RequirePermission>
                    }
                  />

                  {/* Backup Status */}
                  <Route
                    path="/backup"
                    element={
                      <RequirePermission permission={PERMISSIONS.BACKUP_CONTROL}>
                        <BackupStatusPage />
                      </RequirePermission>
                    }
                  />

                  {/* User profile — available to all authenticated users */}
                  <Route path="/profile" element={<UserProfilePage />} />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </AppShell>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
