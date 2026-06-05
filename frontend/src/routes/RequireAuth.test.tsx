import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./RequireAuth";
import { useAuth } from "@/auth/AuthContext";

vi.mock("@/auth/AuthContext");

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    permissions: [],
    roles: [],
    isLoading: false,
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
});

function renderWithRouter(authenticated: boolean, loading = false) {
  vi.mocked(useAuth).mockReturnValue({
    user: authenticated
      ? {
          id: "1",
          username: "admin",
          full_name: "Admin",
          email: null,
          roles: ["ADMIN"],
          permissions: ["manage_users"],
          is_doctor: false,
          last_login_at: null,
          status: "ACTIVE",
        }
      : null,
    permissions: authenticated ? ["manage_users"] : [],
    roles: authenticated ? ["ADMIN"] : [],
    isLoading: loading,
    isAuthenticated: authenticated,
    login: vi.fn(),
    logout: vi.fn(),
  });

  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/protected"
          element={
            <RequireAuth>
              <div>Protected Content</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireAuth", () => {
  it("renders protected content when authenticated", () => {
    renderWithRouter(true);
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    renderWithRouter(false);
    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("shows full-page loader while isLoading is true", () => {
    renderWithRouter(false, true);
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
  });

  it("renders children directly when authenticated (no extra wrappers)", () => {
    renderWithRouter(true);
    const content = screen.getByText("Protected Content");
    expect(content.tagName).toBe("DIV");
  });
});
