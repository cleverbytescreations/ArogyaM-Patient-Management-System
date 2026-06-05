import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequirePermission } from "./RequirePermission";
import { useAuth } from "@/auth/AuthContext";

vi.mock("@/auth/AuthContext");

function setupAuth(permissions: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "1",
      username: "user",
      full_name: "Test User",
      email: null,
      roles: ["RECEPTION"],
      permissions,
      is_doctor: false,
      last_login_at: null,
      status: "ACTIVE",
    },
    permissions,
    roles: ["RECEPTION"],
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function renderWithPermission(
  userPermissions: string[],
  required: string,
  redirectTo?: string
) {
  setupAuth(userPermissions);
  return render(
    <MemoryRouter initialEntries={["/gated"]}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/forbidden" element={<div>Forbidden</div>} />
        <Route
          path="/gated"
          element={
            <RequirePermission
              permission={required}
              redirectTo={redirectTo ?? "/"}
            >
              <div>Gated Content</div>
            </RequirePermission>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequirePermission", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
  });

  it("renders children when user has the required permission", () => {
    renderWithPermission(["manage_users", "view_audit"], "manage_users");
    expect(screen.getByText("Gated Content")).toBeInTheDocument();
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
  });

  it("redirects to default '/' when permission is missing", () => {
    renderWithPermission(["view_patient"], "manage_users");
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByText("Gated Content")).not.toBeInTheDocument();
  });

  it("redirects to custom redirectTo path when permission is missing", () => {
    renderWithPermission(["view_patient"], "manage_users", "/forbidden");
    expect(screen.getByText("Forbidden")).toBeInTheDocument();
    expect(screen.queryByText("Gated Content")).not.toBeInTheDocument();
  });

  it("renders children when user has multiple permissions including required", () => {
    renderWithPermission(
      ["view_patient", "edit_patient", "manage_users"],
      "edit_patient"
    );
    expect(screen.getByText("Gated Content")).toBeInTheDocument();
  });

  it("redirects when user has no permissions at all", () => {
    renderWithPermission([], "manage_users");
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByText("Gated Content")).not.toBeInTheDocument();
  });
});
