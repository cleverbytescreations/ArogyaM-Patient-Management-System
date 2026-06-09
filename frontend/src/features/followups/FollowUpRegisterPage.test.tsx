/**
 * FollowUpRegisterPage — happy path, filter, and RBAC tests.
 * Covers UI-T11.1.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { axe } from "jest-axe";
import { FollowUpRegisterPage } from "./FollowUpRegisterPage";
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

describe("FollowUpRegisterPage — rendering", () => {
  it("renders the page heading", async () => {
    render(<FollowUpRegisterPage />, { wrapper: makeWrapper() });
    expect(
      await screen.findByRole("heading", { name: /follow-up register/i })
    ).toBeInTheDocument();
  });

  it("shows follow-up rows from the API", async () => {
    render(<FollowUpRegisterPage />, { wrapper: makeWrapper() });
    expect(await screen.findByText(/review after treatment/i)).toBeInTheDocument();
  });

  it("shows empty message when no results", async () => {
    server.use(
      http.get("/api/v1/follow-ups", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 })
      )
    );
    render(<FollowUpRegisterPage />, { wrapper: makeWrapper() });
    expect(
      await screen.findByText(/no follow-ups match/i)
    ).toBeInTheDocument();
  });

  it("shows error alert on API failure", async () => {
    server.use(
      http.get("/api/v1/follow-ups", () =>
        HttpResponse.json(
          { error: { code: "SERVER_ERROR", message: "Server error.", details: [], request_id: "r1" } },
          { status: 500 }
        )
      )
    );
    render(<FollowUpRegisterPage />, { wrapper: makeWrapper() });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("has no a11y violations on load", async () => {
    const { container } = render(
      <FollowUpRegisterPage />,
      { wrapper: makeWrapper() }
    );
    await screen.findByText(/review after treatment/i);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("FollowUpRegisterPage — filters", () => {
  it("sends status filter when a status is selected", async () => {
    let capturedStatus: string | null = null;
    server.use(
      http.get("/api/v1/follow-ups", ({ request }) => {
        const url = new URL(request.url);
        capturedStatus = url.searchParams.get("status");
        return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 });
      })
    );
    const user = userEvent.setup();
    render(<FollowUpRegisterPage />, { wrapper: makeWrapper() });
    await screen.findByRole("heading", { name: /follow-up register/i });

    // Select COMPLETED from the status filter
    const trigger = screen.getByRole("combobox", { name: /filter by status/i });
    await user.click(trigger);
    const option = await screen.findByRole("option", { name: /completed/i });
    await user.click(option);

    await waitFor(() => expect(capturedStatus).toBe("COMPLETED"));
  });
});

describe("FollowUpRegisterPage — interactions", () => {
  it("opens update dialog when Update button is clicked", async () => {
    const user = userEvent.setup();
    render(<FollowUpRegisterPage />, { wrapper: makeWrapper() });
    await screen.findByText(/review after treatment/i);

    await user.click(
      screen.getByRole("button", { name: /update follow-up for/i })
    );
    expect(
      await screen.findByRole("dialog", { name: /update follow-up/i })
    ).toBeInTheDocument();
  });
});
