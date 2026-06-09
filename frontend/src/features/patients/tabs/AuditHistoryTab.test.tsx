/**
 * AuditHistoryTab — per-patient audit history tests.
 * Covers UI-T12.1 (patient Audit History tab).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { axe } from "jest-axe";
import { AuditHistoryTab } from "./AuditHistoryTab";
import { server } from "@/test/mocks/server";

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

describe("AuditHistoryTab — rendering", () => {
  it("shows patient audit entries", async () => {
    render(<AuditHistoryTab patientId="patient-1" />, { wrapper: makeWrapper() });
    expect(await screen.findByText(/viewed patient profile/i)).toBeInTheDocument();
  });

  it("shows empty message when no history exists", async () => {
    server.use(
      http.get("/api/v1/audit-logs", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 })
      )
    );
    render(<AuditHistoryTab patientId="patient-1" />, { wrapper: makeWrapper() });
    expect(
      await screen.findByText(/no audit history for this patient/i)
    ).toBeInTheDocument();
  });

  it("shows error alert on API failure", async () => {
    server.use(
      http.get("/api/v1/audit-logs", () =>
        HttpResponse.json(
          { error: { code: "FORBIDDEN", message: "Forbidden.", details: [], request_id: "r1" } },
          { status: 403 }
        )
      )
    );
    render(<AuditHistoryTab patientId="patient-1" />, { wrapper: makeWrapper() });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("is read-only — no create/edit buttons", async () => {
    render(<AuditHistoryTab patientId="patient-1" />, { wrapper: makeWrapper() });
    await screen.findByText(/viewed patient profile/i);
    expect(screen.queryByRole("button", { name: /create/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("has no a11y violations on load", async () => {
    const { container } = render(
      <AuditHistoryTab patientId="patient-1" />,
      { wrapper: makeWrapper() }
    );
    await screen.findByText(/viewed patient profile/i);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("AuditHistoryTab — detail panel", () => {
  it("shows old/new value when an entry with data is expanded", async () => {
    const user = userEvent.setup();
    render(<AuditHistoryTab patientId="patient-1" />, { wrapper: makeWrapper() });
    await screen.findByText(/updated patient demographics/i);

    const detailBtn = screen.getAllByRole("button", { name: /view entry details/i })[1];
    await user.click(detailBtn);

    await screen.findByRole("region", { name: /audit entry details/i });
    expect(screen.getByText(/before/i)).toBeInTheDocument();
    expect(screen.getByText(/after/i)).toBeInTheDocument();
  });

  it("closes detail panel when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<AuditHistoryTab patientId="patient-1" />, { wrapper: makeWrapper() });
    await screen.findByText(/updated patient demographics/i);

    const detailBtn = screen.getAllByRole("button", { name: /view entry details/i })[1];
    await user.click(detailBtn);
    await screen.findByRole("region", { name: /audit entry details/i });

    await user.click(screen.getByRole("button", { name: /close details/i }));
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: /audit entry details/i })
      ).not.toBeInTheDocument()
    );
  });
});
