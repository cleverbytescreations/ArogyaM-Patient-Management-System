import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { RequireAuth } from "./RequireAuth";
import { RequirePermission } from "./RequirePermission";
import { AppShell } from "@/components/AppShell";
import { LoginPage } from "@/features/auth/LoginPage";
import { PageLoader } from "@/components/PageLoader";
import { PERMISSIONS } from "@/lib/constants";

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

const PatientDetailPage = lazy(
  () =>
    import("@/features/patients/PatientDetailPage").then((m) => ({
      default: m.PatientDetailPage,
    }))
);

function DashboardPlaceholder() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground">
        Welcome to ArogyaM Patient Management System. Use the navigation to
        get started.
      </p>
    </div>
  );
}

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
                  <Route path="/" element={<DashboardPlaceholder />} />

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

                  {/* Patient detail */}
                  <Route
                    path="/patients/:id"
                    element={
                      <RequirePermission permission={PERMISSIONS.VIEW_PATIENT}>
                        <PatientDetailPage />
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
