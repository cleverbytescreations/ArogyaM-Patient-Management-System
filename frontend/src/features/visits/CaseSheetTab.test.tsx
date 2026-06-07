/**
 * CaseSheetTab — component, permission-gating, and accessibility tests.
 * Covers UI-TX.2 (a11y pass on clinical forms) and UI-TX.3 (component & validation tests).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { axe } from "jest-axe";
import { http, HttpResponse } from "msw";
import { CaseSheetTab } from "./CaseSheetTab";
import { useAuth } from "@/auth/AuthContext";
import { server } from "@/test/mocks/server";
import { mockCaseSheet, mockVisit } from "@/test/mocks/handlers";

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

describe("CaseSheetTab — no visit selected", () => {
  beforeEach(() => setAuth(["view_medical_history", "add_consultation"]));

  it("shows no-visit prompt when selectedVisit is null", () => {
    render(<CaseSheetTab selectedVisit={null} onSelectVisitTab={vi.fn()} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText(/no visit selected/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /go to visits tab/i })
    ).toBeInTheDocument();
  });

  it("calls onSelectVisitTab when the Go-to-Visits button is clicked", async () => {
    const user = userEvent.setup();
    const onSelectVisitTab = vi.fn();
    render(
      <CaseSheetTab selectedVisit={null} onSelectVisitTab={onSelectVisitTab} />,
      { wrapper: makeWrapper() }
    );
    await user.click(screen.getByRole("button", { name: /go to visits tab/i }));
    expect(onSelectVisitTab).toHaveBeenCalledOnce();
  });

  it("has no a11y violations in no-visit state", async () => {
    const { container } = render(
      <CaseSheetTab selectedVisit={null} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("CaseSheetTab — permission gating", () => {
  it("shows permission denied alert when user lacks both view and write permissions", () => {
    setAuth([]);
    render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(/you do not have permission to view medical history/i)
    ).toBeInTheDocument();
  });

  it("hides save button when user has view_medical_history but not add_consultation", async () => {
    setAuth(["view_medical_history"]);
    render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByRole("form", { name: /case sheet form/i })
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("button", { name: /save case sheet/i })
    ).not.toBeInTheDocument();
  });

  it("shows save button when user has add_consultation", async () => {
    setAuth(["add_consultation"]);
    render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /save case sheet/i })
      ).toBeInTheDocument()
    );
  });

  it("has no a11y violations on permission denied state", async () => {
    setAuth([]);
    const { container } = render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("CaseSheetTab — form content", () => {
  beforeEach(() => setAuth(["view_medical_history", "add_consultation"]));

  it("renders all expected case sheet fields", async () => {
    render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByRole("form", { name: /case sheet form/i })
      ).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/present complaints/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/appetite/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sleep/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hereditary diseases \(mother\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hereditary diseases \(father\)/i)).toBeInTheDocument();
  });

  it("shows delivery count fields for a female patient", async () => {
    render(
      <CaseSheetTab selectedVisit={mockVisit} patientGender="FEMALE" onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByRole("form", { name: /case sheet form/i })
      ).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/normal deliveries/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/caesarian deliveries/i)).toBeInTheDocument();
  });

  it("hides delivery count fields for a male patient", async () => {
    render(
      <CaseSheetTab selectedVisit={mockVisit} patientGender="MALE" onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByRole("form", { name: /case sheet form/i })
      ).toBeInTheDocument()
    );
    expect(screen.queryByLabelText(/normal deliveries/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/caesarian deliveries/i)).not.toBeInTheDocument();
  });

  it("pre-populates fields with data from the fetched case sheet", async () => {
    render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByDisplayValue(mockCaseSheet.present_complaints!)
      ).toBeInTheDocument()
    );
    expect(
      screen.getByDisplayValue(mockCaseSheet.appetite!)
    ).toBeInTheDocument();
  });

  it("shows empty form when case sheet is not found (404)", async () => {
    server.use(
      http.get("/api/v1/visits/:id/case-sheet", () =>
        HttpResponse.json(
          {
            error: {
              code: "RESOURCE_NOT_FOUND",
              message: "No case sheet.",
              details: [],
              request_id: "r",
            },
          },
          { status: 404 }
        )
      )
    );
    render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByRole("form", { name: /case sheet form/i })
      ).toBeInTheDocument()
    );
    // Fields are empty (no pre-populated data)
    const textarea = screen.getByLabelText(/present complaints/i);
    expect(textarea).toHaveValue("");
  });

  it("shows conflict alert on VERSION_CONFLICT error from save", async () => {
    server.use(
      http.put("/api/v1/visits/:id/case-sheet", () =>
        HttpResponse.json(
          {
            error: {
              code: "VERSION_CONFLICT",
              message: "Version conflict.",
              details: [],
              request_id: "r",
            },
          },
          { status: 409 }
        )
      )
    );
    render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    // Wait for the form to load
    await screen.findByRole("form", { name: /case sheet form/i });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /save case sheet/i }));
    // The conflict alert replaces the form
    await waitFor(
      () =>
        expect(
          screen.getByText(/updated by someone else/i)
        ).toBeInTheDocument(),
      { timeout: 3000 }
    );
    expect(
      screen.getByRole("button", { name: /reload case sheet/i })
    ).toBeInTheDocument();
  });

  it("has no a11y violations when case sheet is fully loaded", async () => {
    const { container } = render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await waitFor(() =>
      expect(
        screen.getByRole("form", { name: /case sheet form/i })
      ).toBeInTheDocument()
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("CaseSheetTab — report print/download", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:case-sheet-report");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows Print and Download buttons when user has export + medical history permissions", async () => {
    setAuth(["view_medical_history", "add_consultation", "export"]);
    render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    expect(await screen.findByRole("button", { name: /^print$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
  });

  it("hides report buttons when user lacks the export permission", async () => {
    setAuth(["view_medical_history", "add_consultation"]);
    render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    await screen.findByRole("form", { name: /case sheet form/i });
    expect(screen.queryByRole("button", { name: /^print$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download pdf/i })).not.toBeInTheDocument();
  });

  it("downloads the report PDF when Download is clicked", async () => {
    setAuth(["view_medical_history", "add_consultation", "export"]);
    const user = userEvent.setup();
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    const downloadButton = await screen.findByRole("button", { name: /download pdf/i });
    await user.click(downloadButton);

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(URL.createObjectURL).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("does not trigger a download when the report endpoint 404s (no saved case sheet)", async () => {
    server.use(
      http.get("/api/v1/visits/:id/case-sheet/report.pdf", () =>
        HttpResponse.json(
          { error: { code: "RESOURCE_NOT_FOUND", message: "No case sheet for visit", details: [], request_id: "r" } },
          { status: 404 }
        )
      )
    );
    setAuth(["view_medical_history", "add_consultation", "export"]);
    const user = userEvent.setup();
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    render(
      <CaseSheetTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />,
      { wrapper: makeWrapper() }
    );
    const downloadButton = await screen.findByRole("button", { name: /download pdf/i });
    await user.click(downloadButton);

    await waitFor(() => expect(downloadButton).not.toBeDisabled());
    expect(clickSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
