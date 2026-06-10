/**
 * AuditLogsPage — rendering, filtering, RBAC, and a11y tests.
 * Covers UI-T12.1.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { axe } from "jest-axe";
import { AuditLogsPage } from "./AuditLogsPage";
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

describe("AuditLogsPage — rendering", () => {
  it("renders the page heading", async () => {
    render(<AuditLogsPage />, { wrapper: makeWrapper() });
    expect(
      await screen.findByRole("heading", { name: /audit logs/i })
    ).toBeInTheDocument();
  });

  it("shows audit log entries from the API", async () => {
    render(<AuditLogsPage />, { wrapper: makeWrapper() });
    expect(await screen.findByText(/viewed patient profile/i)).toBeInTheDocument();
    expect(screen.getByText("VIEW")).toBeInTheDocument();
  });

  it("shows empty message when no entries match", async () => {
    server.use(
      http.get("/api/v1/audit-logs", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 })
      )
    );
    render(<AuditLogsPage />, { wrapper: makeWrapper() });
    expect(
      await screen.findByText(/no audit log entries match/i)
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
    render(<AuditLogsPage />, { wrapper: makeWrapper() });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("is read-only — no create/edit/delete buttons", async () => {
    render(<AuditLogsPage />, { wrapper: makeWrapper() });
    await screen.findByText(/viewed patient profile/i);
    expect(screen.queryByRole("button", { name: /create/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("has no a11y violations on load", async () => {
    const { container } = render(<AuditLogsPage />, { wrapper: makeWrapper() });
    await screen.findByText(/viewed patient profile/i);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("AuditLogsPage — detail panel", () => {
  it("expands entry detail panel when chevron button is clicked", async () => {
    const user = userEvent.setup();
    render(<AuditLogsPage />, { wrapper: makeWrapper() });
    await screen.findByText(/updated patient demographics/i);

    const detailBtn = screen.getAllByRole("button", { name: /view entry details/i })[1];
    await user.click(detailBtn);

    expect(await screen.findByRole("region", { name: /audit entry details/i })).toBeInTheDocument();
    expect(screen.getByText(/before/i)).toBeInTheDocument();
    expect(screen.getByText(/after/i)).toBeInTheDocument();
  });

  it("collapses detail panel when the close button is clicked", async () => {
    const user = userEvent.setup();
    render(<AuditLogsPage />, { wrapper: makeWrapper() });
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

describe("AuditLogsPage — filters", () => {
  it("passes action filter to API", async () => {
    let capturedAction: string | null = null;
    server.use(
      http.get("/api/v1/audit-logs", ({ request }) => {
        const url = new URL(request.url);
        capturedAction = url.searchParams.get("action");
        return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 });
      })
    );
    const user = userEvent.setup();
    render(<AuditLogsPage />, { wrapper: makeWrapper() });
    await screen.findByRole("heading", { name: /audit logs/i });

    await user.type(screen.getByLabelText(/action/i), "LOGIN");

    await waitFor(() => expect(capturedAction).toBe("LOGIN"));
  });
});
