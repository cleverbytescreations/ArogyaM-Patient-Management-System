/**
 * VisitFormDialog — component, form validation, and accessibility tests.
 * Covers UI-TX.2 (a11y) and UI-TX.3 (component & zod validation tests).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { axe } from "jest-axe";
import { http, HttpResponse } from "msw";
import { VisitFormDialog } from "./VisitFormDialog";
import { server } from "@/test/mocks/server";
import { mockVisit } from "@/test/mocks/handlers";

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

const defaultProps = {
  patientId: "patient-1",
  open: true,
  onOpenChange: vi.fn(),
  onCreated: vi.fn(),
};

describe("VisitFormDialog — rendering", () => {
  beforeEach(() => {
    defaultProps.onOpenChange.mockReset();
    defaultProps.onCreated.mockReset();
  });

  it("does not render dialog content when closed", () => {
    render(
      <VisitFormDialog {...defaultProps} open={false} />,
      { wrapper: makeWrapper() }
    );
    expect(
      screen.queryByRole("dialog", { name: /create visit/i })
    ).not.toBeInTheDocument();
  });

  it("renders the dialog with form fields when open", async () => {
    render(<VisitFormDialog {...defaultProps} />, { wrapper: makeWrapper() });
    expect(
      await screen.findByRole("dialog", { name: /create visit/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create visit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("renders visit date input with today as default", async () => {
    const today = new Date().toISOString().slice(0, 10);
    render(<VisitFormDialog {...defaultProps} />, { wrapper: makeWrapper() });
    await screen.findByRole("dialog", { name: /create visit/i });
    const dateInput = screen.getByLabelText(/visit date/i);
    expect(dateInput).toHaveValue(today);
  });

  it("renders the scheduled checkbox unchecked by default", async () => {
    render(<VisitFormDialog {...defaultProps} />, { wrapper: makeWrapper() });
    await screen.findByRole("dialog", { name: /create visit/i });
    const checkbox = screen.getByRole("checkbox", {
      name: /scheduled/i,
    });
    expect(checkbox).not.toBeChecked();
  });

  it("closes dialog when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<VisitFormDialog {...defaultProps} />, { wrapper: makeWrapper() });
    await screen.findByRole("dialog", { name: /create visit/i });
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("has no a11y violations when dialog is open", async () => {
    const { container } = render(
      <VisitFormDialog {...defaultProps} />,
      { wrapper: makeWrapper() }
    );
    await screen.findByRole("dialog", { name: /create visit/i });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("VisitFormDialog — form validation", () => {
  beforeEach(() => {
    defaultProps.onOpenChange.mockReset();
    defaultProps.onCreated.mockReset();
  });

  it("shows visit type required error when form is submitted without a type", async () => {
    const user = userEvent.setup();
    render(<VisitFormDialog {...defaultProps} />, { wrapper: makeWrapper() });
    await screen.findByRole("dialog", { name: /create visit/i });
    await user.click(screen.getByRole("button", { name: /create visit/i }));
    await waitFor(() =>
      expect(screen.getByText(/visit type is required/i)).toBeInTheDocument()
    );
  });

  it("shows future-date error for non-scheduled visit with a future date", async () => {
    const user = userEvent.setup();
    render(<VisitFormDialog {...defaultProps} />, { wrapper: makeWrapper() });
    await screen.findByRole("dialog", { name: /create visit/i });

    // Pick a visit type first (Radix Select via fireEvent)
    fireEvent.click(screen.getByRole("combobox", { name: /visit type/i }));
    fireEvent.click(await screen.findByRole("option", { name: /new patient/i }));

    // Set a future date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 3);
    const futureDate = tomorrow.toISOString().slice(0, 10);
    await user.clear(screen.getByLabelText(/visit date/i));
    await user.type(screen.getByLabelText(/visit date/i), futureDate);

    await user.click(screen.getByRole("button", { name: /create visit/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/non-scheduled visits cannot be future-dated/i)
      ).toBeInTheDocument()
    );
  });

  it("allows future date when scheduled checkbox is checked", async () => {
    const user = userEvent.setup();
    render(<VisitFormDialog {...defaultProps} />, { wrapper: makeWrapper() });
    await screen.findByRole("dialog", { name: /create visit/i });

    // Check scheduled
    await user.click(screen.getByRole("checkbox", { name: /scheduled/i }));

    // Pick a visit type
    fireEvent.click(screen.getByRole("combobox", { name: /visit type/i }));
    fireEvent.click(await screen.findByRole("option", { name: /new patient/i }));

    // Set a future date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 3);
    const futureDate = tomorrow.toISOString().slice(0, 10);
    await user.clear(screen.getByLabelText(/visit date/i));
    await user.type(screen.getByLabelText(/visit date/i), futureDate);

    await user.click(screen.getByRole("button", { name: /create visit/i }));

    // No future-date error
    await waitFor(() =>
      expect(
        screen.queryByText(/non-scheduled visits cannot be future-dated/i)
      ).not.toBeInTheDocument()
    );
  });
});

describe("VisitFormDialog — successful submission", () => {
  beforeEach(() => {
    defaultProps.onOpenChange.mockReset();
    defaultProps.onCreated.mockReset();
  });

  it("calls onCreated and closes dialog on successful create", async () => {
    const user = userEvent.setup();
    render(<VisitFormDialog {...defaultProps} />, { wrapper: makeWrapper() });
    await screen.findByRole("dialog", { name: /create visit/i });

    // Select visit type
    fireEvent.click(screen.getByRole("combobox", { name: /visit type/i }));
    fireEvent.click(await screen.findByRole("option", { name: /new patient/i }));

    await user.click(screen.getByRole("button", { name: /create visit/i }));

    await waitFor(() => {
      expect(defaultProps.onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "visit-new", patient_id: "patient-1" })
      );
      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows API validation error on 422 response", async () => {
    server.use(
      http.post("/api/v1/patients/:id/visits", () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Validation failed.",
              details: [
                {
                  field: "visit_date",
                  code: "future_visit_date",
                  message: "Non-scheduled visits cannot be future-dated.",
                },
              ],
              request_id: "r",
            },
          },
          { status: 422 }
        )
      )
    );

    const user = userEvent.setup();
    render(<VisitFormDialog {...defaultProps} />, { wrapper: makeWrapper() });
    await screen.findByRole("dialog", { name: /create visit/i });

    fireEvent.click(screen.getByRole("combobox", { name: /visit type/i }));
    fireEvent.click(await screen.findByRole("option", { name: /new patient/i }));
    await user.click(screen.getByRole("button", { name: /create visit/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/non-scheduled visits cannot be future-dated/i)
      ).toBeInTheDocument()
    );
    expect(defaultProps.onCreated).not.toHaveBeenCalled();
  });

  // Keep a reference so tests can compare
  const _mockVisit = mockVisit;
  void _mockVisit;
});
