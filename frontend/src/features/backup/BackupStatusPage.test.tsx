/**
 * BackupStatusPage — rendering, RBAC, and a11y tests.
 * Covers UI-T13.1.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { axe } from "jest-axe";
import { BackupStatusPage } from "./BackupStatusPage";
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

describe("BackupStatusPage — rendering", () => {
  it("renders the page heading", async () => {
    render(<BackupStatusPage />, { wrapper: makeWrapper() });
    expect(
      await screen.findByRole("heading", { name: /backup status/i })
    ).toBeInTheDocument();
  });

  it("shows latest backup card with status badge", async () => {
    render(<BackupStatusPage />, { wrapper: makeWrapper() });
    expect(await screen.findByText(/latest backup/i)).toBeInTheDocument();
    const successEls = screen.getAllByText(/success/i);
    expect(successEls.length).toBeGreaterThanOrEqual(1);
  });

  it("shows backup history table", async () => {
    render(<BackupStatusPage />, { wrapper: makeWrapper() });
    expect(await screen.findByRole("heading", { name: /recent runs/i })).toBeInTheDocument();
    const successBadges = await screen.findAllByText(/success/i);
    expect(successBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("formats file sizes correctly", async () => {
    render(<BackupStatusPage />, { wrapper: makeWrapper() });
    // 52428800 bytes = 50 MB — appears in both card and history
    const sizeEls = await screen.findAllByText(/50\.0 MB/i);
    expect(sizeEls.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'no backup runs' when latest is null", async () => {
    server.use(
      http.get("/api/v1/backup/status", () =>
        HttpResponse.json({ latest: null, history: [] })
      )
    );
    render(<BackupStatusPage />, { wrapper: makeWrapper() });
    expect(
      await screen.findByText(/no backup runs recorded yet/i)
    ).toBeInTheDocument();
  });

  it("shows error alert on API failure", async () => {
    server.use(
      http.get("/api/v1/backup/status", () =>
        HttpResponse.json(
          { error: { code: "FORBIDDEN", message: "Forbidden.", details: [], request_id: "r1" } },
          { status: 403 }
        )
      )
    );
    render(<BackupStatusPage />, { wrapper: makeWrapper() });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("has no restore button (restore is out-of-band)", async () => {
    render(<BackupStatusPage />, { wrapper: makeWrapper() });
    await screen.findByText(/latest backup/i);
    expect(screen.queryByRole("button", { name: /restore/i })).not.toBeInTheDocument();
  });

  it("shows Run Backup Now button and triggers on click", async () => {
    render(<BackupStatusPage />, { wrapper: makeWrapper() });
    await screen.findByText(/latest backup/i);
    const btn = screen.getByRole("button", { name: /run backup now/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /triggered/i })).toBeInTheDocument()
    );
  });

  it("has no a11y violations on load", async () => {
    const { container } = render(<BackupStatusPage />, { wrapper: makeWrapper() });
    await screen.findByText(/latest backup/i);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
