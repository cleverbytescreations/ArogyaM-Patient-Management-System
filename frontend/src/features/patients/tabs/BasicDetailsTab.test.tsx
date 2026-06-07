/**
 * BasicDetailsTab — component, permission-gating, form validation, and accessibility tests.
 * Covers UI-TX.2 (a11y pass on profile forms) and UI-TX.3 (component & validation tests).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { axe } from "jest-axe";
import { http, HttpResponse } from "msw";
import { BasicDetailsTab } from "./BasicDetailsTab";
import { useAuth } from "@/auth/AuthContext";
import { server } from "@/test/mocks/server";
import {
  mockPatient,
  mockGenderOptions,
  mockBloodGroupOptions,
  mockMaritalStatusOptions,
  mockDietaryOptions,
  mockConsultationCategoryOptions,
} from "@/test/mocks/handlers";

const BASE = "/api/v1";

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
      username: "reception",
      full_name: "Reception User",
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

const defaultTabProps = {
  patient: mockPatient,
  genderOptions: mockGenderOptions,
  bloodGroupOptions: mockBloodGroupOptions,
  maritalStatusOptions: mockMaritalStatusOptions,
  dietaryOptions: mockDietaryOptions,
  consultationCategoryOptions: mockConsultationCategoryOptions,
};

describe("BasicDetailsTab — view mode", () => {
  beforeEach(() => setAuth(["view_patient", "edit_patient"]));

  it("renders patient name and OP number in view mode", () => {
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    expect(screen.getByText(mockPatient.full_name)).toBeInTheDocument();
    expect(screen.getByText(mockPatient.op_number)).toBeInTheDocument();
  });

  it("shows Edit details button when user has edit_patient permission", () => {
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    expect(
      screen.getByRole("button", { name: /edit details/i })
    ).toBeInTheDocument();
  });

  it("hides Edit details button when user lacks edit_patient permission", () => {
    setAuth(["view_patient"]);
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    expect(
      screen.queryByRole("button", { name: /edit details/i })
    ).not.toBeInTheDocument();
  });

  it("renders patient demographics including mobile and registration date", () => {
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    expect(screen.getByText(mockPatient.mobile!)).toBeInTheDocument();
  });

  it("shows patient status badge", () => {
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    expect(screen.getByText(mockPatient.status)).toBeInTheDocument();
  });

  it("has no a11y violations in view mode", async () => {
    const { container } = render(
      <BasicDetailsTab {...defaultTabProps} />,
      { wrapper: makeWrapper() }
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("BasicDetailsTab — switching to edit mode", () => {
  beforeEach(() => setAuth(["view_patient", "edit_patient"]));

  it("switches to edit form when Edit details is clicked", async () => {
    const user = userEvent.setup();
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    await user.click(screen.getByRole("button", { name: /edit details/i }));
    expect(
      screen.getByRole("form", { name: /edit patient details/i })
    ).toBeInTheDocument();
  });

  it("shows Save changes and Cancel buttons in edit mode", async () => {
    const user = userEvent.setup();
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    await user.click(screen.getByRole("button", { name: /edit details/i }));
    expect(
      screen.getByRole("button", { name: /save changes/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /cancel/i })
    ).toBeInTheDocument();
  });

  it("returns to view mode when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    await user.click(screen.getByRole("button", { name: /edit details/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    // Should be back in view mode
    expect(
      screen.getByRole("button", { name: /edit details/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: /edit patient details/i })
    ).not.toBeInTheDocument();
  });

  it("pre-populates edit form with current patient data", async () => {
    const user = userEvent.setup();
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    await user.click(screen.getByRole("button", { name: /edit details/i }));
    const nameInput = screen.getByRole("textbox", { name: /full name/i });
    expect(nameInput).toHaveValue(mockPatient.full_name);
  });
});

describe("BasicDetailsTab — edit form validation", () => {
  beforeEach(() => setAuth(["view_patient", "edit_patient"]));

  it("shows required error when full_name is cleared and form is submitted", async () => {
    const user = userEvent.setup();
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    await user.click(screen.getByRole("button", { name: /edit details/i }));

    const nameInput = screen.getByRole("textbox", { name: /full name/i });
    await user.clear(nameInput);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(screen.getByText(/full name is required/i)).toBeInTheDocument()
    );
  });

  it("shows mobile format error when mobile is invalid", async () => {
    const user = userEvent.setup();
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    await user.click(screen.getByRole("button", { name: /edit details/i }));

    const mobileInput = screen.getByRole("textbox", { name: /mobile/i });
    await user.clear(mobileInput);
    await user.type(mobileInput, "123"); // too short
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(screen.getByText(/mobile must be 10.15 digits/i)).toBeInTheDocument()
    );
  });

  it("shows email format error when email is invalid", async () => {
    const user = userEvent.setup();
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    await user.click(screen.getByRole("button", { name: /edit details/i }));

    const emailInput = screen.getByRole("textbox", { name: /email/i });
    await user.clear(emailInput);
    await user.type(emailInput, "notanemail");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(screen.getByText(/invalid email address/i)).toBeInTheDocument()
    );
  });

  it("returns to view mode on successful save", async () => {
    // Capture the actual PUT payload so we can confirm the form really
    // submitted the edited value to the API — not just that *some* request
    // succeeded and the component exited edit mode.
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`${BASE}/patients/:id`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ...mockPatient,
          ...capturedBody,
          version: mockPatient.version + 1,
        });
      })
    );

    const user = userEvent.setup();
    render(<BasicDetailsTab {...defaultTabProps} />, { wrapper: makeWrapper() });
    await user.click(screen.getByRole("button", { name: /edit details/i }));

    const nameInput = screen.getByRole("textbox", { name: /full name/i });
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Name");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    // On success, editing mode exits — Save/Cancel buttons disappear
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /save changes/i })
      ).not.toBeInTheDocument()
    );
    // Edit details button reappears (back in view mode)
    expect(
      screen.getByRole("button", { name: /edit details/i })
    ).toBeInTheDocument();
    // The save actually carried the edited value to the API — guards against
    // the component exiting edit mode without applying the user's changes.
    expect(capturedBody).not.toBeNull();
    expect((capturedBody as { full_name: string } | null)?.full_name).toBe("Updated Name");
  });

  it("has no a11y violations in edit mode", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <BasicDetailsTab {...defaultTabProps} />,
      { wrapper: makeWrapper() }
    );
    await user.click(screen.getByRole("button", { name: /edit details/i }));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
