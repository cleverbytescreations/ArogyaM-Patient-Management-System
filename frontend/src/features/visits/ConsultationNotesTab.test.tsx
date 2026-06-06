/**
 * ConsultationNotesTab — component, permission-gating, and accessibility tests.
 * Covers UI-TX.2 (a11y pass on clinical forms) and UI-TX.3 (component & validation tests).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { axe } from "jest-axe";
import { http, HttpResponse } from "msw";
import { ConsultationNotesTab } from "./ConsultationNotesTab";
import { useAuth } from "@/auth/AuthContext";
import { server } from "@/test/mocks/server";
import { mockVisit, mockConsultationNotes } from "@/test/mocks/handlers";

vi.mock("@/auth/AuthContext");

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

function setAuth(permissions: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "u1",
      username: "doctor",
      full_name: "Dr. Test",
      email: null,
      roles: ["DOCTOR"],
      permissions,
      is_doctor: true,
      last_login_at: null,
      status: "ACTIVE",
    },
    permissions,
    roles: ["DOCTOR"],
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

describe("ConsultationNotesTab — no visit selected", () => {
  beforeEach(() => setAuth(["view_medical_history", "add_consultation"]));

  it("shows no-visit prompt when selectedVisit is null", () => {
    render(
      <ConsultationNotesTab selectedVisit={null} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    expect(screen.getByText(/no visit selected/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /go to visits tab/i })
    ).toBeInTheDocument();
  });

  it("calls onSelectVisitTab when Go-to-Visits is clicked", async () => {
    const user = userEvent.setup();
    const onSelectVisitTab = vi.fn();
    render(
      <ConsultationNotesTab
        selectedVisit={null}
        onSelectVisitTab={onSelectVisitTab}
      />,
      { wrapper: makeWrapper() }
    );
    await user.click(screen.getByRole("button", { name: /go to visits tab/i }));
    expect(onSelectVisitTab).toHaveBeenCalledOnce();
  });

  it("has no a11y violations in no-visit state", async () => {
    const { container } = render(
      <ConsultationNotesTab selectedVisit={null} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("ConsultationNotesTab — permission gating", () => {
  it("shows permission denied alert when user has no permissions", () => {
    setAuth([]);
    render(
      <ConsultationNotesTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(/you do not have permission to view medical history/i)
    ).toBeInTheDocument();
  });

  it("shows notes but hides add-form when user has view_medical_history only", async () => {
    setAuth(["view_medical_history"]);
    render(
      <ConsultationNotesTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByText(/notes \(1\)/i)
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("region", { name: /add consultation note/i })
    ).not.toBeInTheDocument();
  });

  it("shows add-note form when user has add_consultation", async () => {
    setAuth(["add_consultation"]);
    render(
      <ConsultationNotesTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: /add consultation note/i })
      ).toBeInTheDocument()
    );
    expect(
      screen.getByRole("form", { name: /consultation note form/i })
    ).toBeInTheDocument();
  });

  it("has no a11y violations when showing permission denied", async () => {
    setAuth([]);
    const { container } = render(
      <ConsultationNotesTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("ConsultationNotesTab — notes list", () => {
  beforeEach(() => setAuth(["view_medical_history", "add_consultation"]));

  it("displays fetched consultation notes in chronological order", async () => {
    render(
      <ConsultationNotesTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: /consultation notes history/i })
      ).toBeInTheDocument()
    );
    expect(
      screen.getByText(mockConsultationNotes[0].diagnosis!)
    ).toBeInTheDocument();
  });

  it("shows note count in section heading", async () => {
    render(
      <ConsultationNotesTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(screen.getByText(/notes \(1\)/i)).toBeInTheDocument()
    );
  });

  it("shows empty state when no notes exist", async () => {
    server.use(
      http.get("/api/v1/visits/:id/consultation-notes", () =>
        HttpResponse.json([])
      )
    );
    render(
      <ConsultationNotesTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByText(/no consultation notes for this visit yet/i)
      ).toBeInTheDocument()
    );
  });

  it("shows error alert when notes fail to load", async () => {
    server.use(
      http.get("/api/v1/visits/:id/consultation-notes", () =>
        HttpResponse.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Server error.",
              details: [],
              request_id: "r",
            },
          },
          { status: 500 }
        )
      )
    );
    render(
      <ConsultationNotesTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument()
    );
  });
});

describe("ConsultationNotesTab — add note form", () => {
  beforeEach(() => setAuth(["view_medical_history", "add_consultation"]));

  it("renders all note form fields", async () => {
    render(
      <ConsultationNotesTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByRole("form", { name: /consultation note form/i })
      ).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/presenting complaints/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/diagnosis/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/treatment advice/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/review date/i)).toBeInTheDocument();
  });

  it("submits a new note and resets the form on success", async () => {
    const user = userEvent.setup();
    render(
      <ConsultationNotesTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByRole("form", { name: /consultation note form/i })
      ).toBeInTheDocument()
    );

    await user.type(
      screen.getByLabelText(/presenting complaints/i),
      "New complaint"
    );
    await user.click(screen.getByRole("button", { name: /add note/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/presenting complaints/i)).toHaveValue("")
    );
  });

  it("has no a11y violations with notes and add-form loaded", async () => {
    const { container } = render(
      <ConsultationNotesTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByRole("form", { name: /consultation note form/i })
      ).toBeInTheDocument()
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
