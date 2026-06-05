import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { axe } from "jest-axe";
import { UserMenu } from "./UserMenu";
import { useAuth } from "@/auth/AuthContext";
import type { UserProfile } from "@/types/auth";

vi.mock("@/auth/AuthContext");
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockNavigate = vi.fn();
const mockLogout = vi.fn();

const mockUser: UserProfile = {
  id: "user-1",
  username: "drsmith",
  full_name: "Dr. John Smith",
  email: "john@example.com",
  roles: ["DOCTOR"],
  permissions: [],
  is_doctor: true,
  last_login_at: "2026-06-04T10:00:00Z",
  status: "ACTIVE",
};

beforeEach(() => {
  mockNavigate.mockReset();
  mockLogout.mockReset();
  vi.mocked(useAuth).mockReturnValue({
    user: mockUser,
    logout: mockLogout,
    login: vi.fn(),
    permissions: mockUser.permissions,
    roles: mockUser.roles,
    isLoading: false,
    isAuthenticated: true,
  });
});

function renderUserMenu() {
  return render(
    <MemoryRouter>
      <UserMenu />
    </MemoryRouter>
  );
}

describe("UserMenu", () => {
  it("renders user initials in avatar", () => {
    renderUserMenu();
    expect(screen.getByText("DJ")).toBeInTheDocument();
  });

  it("shows full name, username and role in dropdown", async () => {
    const user = userEvent.setup();
    renderUserMenu();
    await user.click(
      screen.getByRole("button", { name: /user menu for dr\. john smith/i })
    );
    await waitFor(() => {
      expect(screen.getByText("Dr. John Smith")).toBeInTheDocument();
      expect(screen.getByText("drsmith")).toBeInTheDocument();
      expect(screen.getByText("Doctor")).toBeInTheDocument();
    });
  });

  it("calls logout and navigates to /login on sign-out click", async () => {
    const user = userEvent.setup();
    mockLogout.mockResolvedValueOnce(undefined);
    renderUserMenu();
    await user.click(
      screen.getByRole("button", { name: /user menu for dr\. john smith/i })
    );
    const signOutItem = await screen.findByText(/sign out/i);
    await user.click(signOutItem);
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledOnce();
      expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
    });
  });

  it("renders nothing when user is null", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      logout: mockLogout,
      login: vi.fn(),
      permissions: [],
      roles: [],
      isLoading: false,
      isAuthenticated: false,
    });
    const { container } = renderUserMenu();
    expect(container).toBeEmptyDOMElement();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderUserMenu();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
