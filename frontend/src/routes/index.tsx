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
