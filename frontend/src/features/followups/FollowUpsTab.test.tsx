/**
 * FollowUpsTab — component, RBAC, and interaction tests.
 * Covers UI-T11.1 and UI-TX.3 (component tests).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { axe } from "jest-axe";
import { FollowUpsTab } from "./FollowUpsTab";
import { server } from "@/test/mocks/server";
import { mockFollowUp } from "@/test/mocks/handlers";

vi.mock("@/auth/usePermissions", () => ({
  usePermissions: vi.fn(() => ({ hasPermission: () => true })),
}));

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe("FollowUpsTab — rendering", () => {
  it("shows follow-ups in a table", async () => {
    render(<FollowUpsTab patientId="patient-1" />, { wrapper: makeWrapper() });
    expect(await screen.findByText(/review after treatment/i)).toBeInTheDocument();
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  it("shows empty message when no follow-ups exist", async () => {
    server.use(
      http.get("/api/v1/patients/:id/follow-ups", () =>
        HttpResponse.json([])
      )
    );
    render(<FollowUpsTab patientId="patient-1" />, { wrapper: makeWrapper() });
    expect(
      await screen.findByText(/no follow-ups recorded/i)
    ).toBeInTheDocument();
  });

  it("shows error alert on API failure", async () => {
    server.use(
      http.get("/api/v1/patients/:id/follow-ups", () =>
        HttpResponse.json(
          { error: { code: "SERVER_ERROR", message: "Something went wrong.", details: [], request_id: "r1" } },
          { status: 500 }
        )
      )
    );
    render(<FollowUpsTab patientId="patient-1" />, { wrapper: makeWrapper() });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("has no a11y violations", async () => {
    const { container } = render(
      <FollowUpsTab patientId="patient-1" />,
      { wrapper: makeWrapper() }
    );
    await screen.findByText(/review after treatment/i);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

const makePermissions = (can: boolean) => ({
  permissions: can ? ["manage_followups"] : [],
  roles: [],
  hasPermission: () => can,
  hasRole: () => false,
  hasAnyPermission: () => can,
  hasAllPermissions: () => can,
});

describe("FollowUpsTab — RBAC", () => {
  it("hides Register button when user lacks manage_followups", async () => {
    const { usePermissions } = await import("@/auth/usePermissions");
    vi.mocked(usePermissions).mockReturnValue(makePermissions(false));

    render(<FollowUpsTab patientId="patient-1" />, { wrapper: makeWrapper() });
    await screen.findByText(/review after treatment/i);
    expect(
      screen.queryByRole("button", { name: /register follow-up/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /update/i })
    ).not.toBeInTheDocument();
  });

  it("shows Register button when user has manage_followups", async () => {
    const { usePermissions } = await import("@/auth/usePermissions");
    vi.mocked(usePermissions).mockReturnValue(makePermissions(true));

    render(<FollowUpsTab patientId="patient-1" />, { wrapper: makeWrapper() });
    await screen.findByText(/review after treatment/i);
    expect(
      screen.getByRole("button", { name: /register follow-up/i })
    ).toBeInTheDocument();
  });
});

describe("FollowUpsTab — interactions", () => {
  beforeEach(async () => {
    const { usePermissions } = await import("@/auth/usePermissions");
    vi.mocked(usePermissions).mockReturnValue(makePermissions(true));
  });

  it("opens the create dialog when Register Follow-Up is clicked", async () => {
    const user = userEvent.setup();
    render(<FollowUpsTab patientId="patient-1" />, { wrapper: makeWrapper() });
    await screen.findByText(/review after treatment/i);
    await user.click(screen.getByRole("button", { name: /register follow-up/i }));
    expect(
      await screen.findByRole("dialog", { name: /register follow-up/i })
    ).toBeInTheDocument();
  });

  it("opens the edit dialog when Update is clicked", async () => {
    const user = userEvent.setup();
    render(<FollowUpsTab patientId="patient-1" />, { wrapper: makeWrapper() });
    await screen.findByText(/review after treatment/i);
    const updateBtn = screen.getByRole("button", {
      name: new RegExp(`update follow-up scheduled for`, "i"),
    });
    await user.click(updateBtn);
    expect(
      await screen.findByRole("dialog", { name: /update follow-up/i })
    ).toBeInTheDocument();
  });

  it("creates a follow-up and closes dialog on success", async () => {
    const user = userEvent.setup();
    render(<FollowUpsTab patientId="patient-1" />, { wrapper: makeWrapper() });
    await screen.findByText(/review after treatment/i);

    await user.click(screen.getByRole("button", { name: /register follow-up/i }));
    await screen.findByRole("dialog", { name: /register follow-up/i });

    await user.type(screen.getByLabelText(/follow-up date/i), "2026-07-01");
    await user.click(screen.getByRole("button", { name: /register follow-up/i, hidden: false }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("shows validation error if date is empty", async () => {
    const user = userEvent.setup();
    render(<FollowUpsTab patientId="patient-1" />, { wrapper: makeWrapper() });
    await screen.findByText(/review after treatment/i);

    await user.click(screen.getByRole("button", { name: /register follow-up/i }));
    const dialog = await screen.findByRole("dialog", { name: /register follow-up/i });
    // fireEvent bypasses CSS pointer-events restrictions imposed by Radix Dialog
    const submitBtn = dialog.querySelector("button[type='submit']");
    expect(submitBtn).toBeTruthy();
    fireEvent.click(submitBtn!);

    await waitFor(() =>
      expect(screen.getByText(/follow-up date is required/i)).toBeInTheDocument()
    );
  });

  it("keeps dialog open when API returns an error", async () => {
    server.use(
      http.put("/api/v1/follow-ups/:id", () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_STATE_TRANSITION",
              message: "Invalid status transition.",
              details: [],
              request_id: "r2",
            },
          },
          { status: 409 }
        )
      )
    );
    const user = userEvent.setup();
    render(<FollowUpsTab patientId="patient-1" />, { wrapper: makeWrapper() });
    await screen.findByText(/review after treatment/i);

    await user.click(
      screen.getByRole("button", {
        name: new RegExp(`update follow-up scheduled for`, "i"),
      })
    );
    const dialog = await screen.findByRole("dialog", { name: /update follow-up/i });
    // fireEvent bypasses CSS pointer-events restrictions imposed by Radix Dialog
    const submitBtn = dialog.querySelector("button[type='submit']");
    expect(submitBtn).toBeTruthy();
    fireEvent.click(submitBtn!);

    // Dialog should remain open after an API error
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: /update follow-up/i })
      ).toBeInTheDocument()
    );
  });
});

// Export for use in other test files
export { mockFollowUp };
