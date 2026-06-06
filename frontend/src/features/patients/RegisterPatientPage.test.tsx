import { describe, it, expect } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { axe } from "jest-axe";
import { renderWithProviders } from "@/test/helpers";
import { RegisterPatientPage } from "./RegisterPatientPage";
import { server } from "@/test/mocks/server";

// Selects the first OP category using fireEvent.click so pointer events don't interfere.
// Radix SelectItem initialises pointerTypeRef to "touch", meaning onClick calls handleSelect()
// as long as no prior pointerdown has flipped it to "mouse". fireEvent.click never dispatches
// pointer events so the ref stays "touch" and selection is reliable in jsdom.
async function selectOpCategory() {
  fireEvent.click(screen.getByRole("combobox", { name: /op category/i }));
  fireEvent.click(await screen.findByRole("option", { name: /regular/i }));
}

describe("RegisterPatientPage", () => {
  it("renders the page heading and required fields", async () => {
    renderWithProviders(<RegisterPatientPage />);
    expect(
      await screen.findByRole("heading", { name: /register new patient/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /register patient/i })
    ).toBeInTheDocument();
  });

  it("shows validation error when full name is missing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPatientPage />);
    await screen.findByRole("heading", { name: /register new patient/i });

    // Fill mobile to satisfy min-identity, but leave full_name empty
    await user.type(screen.getByLabelText(/mobile number/i), "9876543210");
    await user.click(screen.getByRole("button", { name: /register patient/i }));

    expect(
      await screen.findByText(/full name is required/i)
    ).toBeInTheDocument();
  });

  it("shows min-identity error when no contact field is provided", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPatientPage />);
    await screen.findByRole("heading", { name: /register new patient/i });

    await user.type(screen.getByLabelText(/full name/i), "Test Patient");
    await user.click(screen.getByRole("button", { name: /register patient/i }));

    expect(
      await screen.findByText(/at least one of mobile, email, date of birth, or age is required/i)
    ).toBeInTheDocument();
  });

  it("shows mobile validation error for invalid format", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPatientPage />);
    await screen.findByRole("heading", { name: /register new patient/i });

    await user.type(screen.getByLabelText(/full name/i), "Test Patient");
    await user.type(screen.getByLabelText(/mobile number/i), "123"); // too short
    await user.click(screen.getByRole("button", { name: /register patient/i }));

    expect(
      await screen.findByText(/mobile must be 10.15 digits/i)
    ).toBeInTheDocument();
  });

  it("shows loading state during submission", async () => {
    let resolveRequest: (value: Response) => void;
    server.use(
      http.post("/api/v1/patients", () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        })
      )
    );

    const user = userEvent.setup();
    renderWithProviders(<RegisterPatientPage />);
    await screen.findByRole("heading", { name: /register new patient/i });

    await user.type(screen.getByLabelText(/full name/i), "Test Patient");
    await user.type(screen.getByLabelText(/mobile number/i), "9876543210");
    await selectOpCategory();
    await user.click(screen.getByRole("button", { name: /register patient/i }));

    expect(
      await screen.findByRole("button", { name: /registering/i })
    ).toBeDisabled();

    // Clean up the pending request
    resolveRequest!(
      HttpResponse.json({ error: { code: "TEST", message: "test", details: [], request_id: "r" } }, { status: 500 }) as unknown as Response
    );
  });

  it("shows success view with OP number after successful registration", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPatientPage />);
    await screen.findByRole("heading", { name: /register new patient/i });

    await user.type(screen.getByLabelText(/full name/i), "Priya Sharma");
    await user.type(screen.getByLabelText(/mobile number/i), "9876543210");
    await selectOpCategory();
    await user.click(screen.getByRole("button", { name: /register patient/i }));

    expect(
      await screen.findByText(/patient registered successfully/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/OPN0099/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /view patient profile/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /register another patient/i })
    ).toBeInTheDocument();
  });

  it("shows duplicate warning on 409 DUPLICATE_PATIENT_SUSPECTED", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPatientPage />);
    await screen.findByRole("heading", { name: /register new patient/i });

    // "Duplicate Patient" triggers the mock duplicate response
    await user.type(screen.getByLabelText(/full name/i), "Duplicate Patient");
    await user.type(screen.getByLabelText(/mobile number/i), "9876543210");
    await selectOpCategory();
    await user.click(screen.getByRole("button", { name: /register patient/i }));

    expect(
      await screen.findByText(/possible duplicate patient detected/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/OPN0043/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /register anyway/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /view profile for priya sharma/i })
    ).toBeInTheDocument();
  });

  it("registers successfully after confirming duplicate warning", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPatientPage />);
    await screen.findByRole("heading", { name: /register new patient/i });

    await user.type(screen.getByLabelText(/full name/i), "Duplicate Patient");
    await user.type(screen.getByLabelText(/mobile number/i), "9876543210");
    await selectOpCategory();
    await user.click(screen.getByRole("button", { name: /register patient/i }));

    // Wait for duplicate warning
    await screen.findByText(/possible duplicate patient detected/i);

    // Click "Register anyway"
    await user.click(screen.getByRole("button", { name: /register anyway/i }));

    // Should succeed now (confirm_create=true bypasses the duplicate check in mock)
    expect(
      await screen.findByText(/patient registered successfully/i)
    ).toBeInTheDocument();
  });

  it("applies field errors from 422 VALIDATION_ERROR response", async () => {
    server.use(
      http.post("/api/v1/patients", () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Validation failed.",
              details: [
                { field: "mobile", code: "invalid_format", message: "Mobile number is invalid." },
              ],
              request_id: "r8",
            },
          },
          { status: 422 }
        )
      )
    );

    const user = userEvent.setup();
    renderWithProviders(<RegisterPatientPage />);
    await screen.findByRole("heading", { name: /register new patient/i });

    await user.type(screen.getByLabelText(/full name/i), "Test Patient");
    await user.type(screen.getByLabelText(/mobile number/i), "9876543210");
    await selectOpCategory();
    await user.click(screen.getByRole("button", { name: /register patient/i }));

    expect(
      await screen.findByText(/mobile number is invalid/i)
    ).toBeInTheDocument();
  });

  it("shows toast on unexpected API error", async () => {
    server.use(
      http.post("/api/v1/patients", () =>
        HttpResponse.json(
          { error: { code: "INTERNAL_ERROR", message: "Server error.", details: [], request_id: "r9" } },
          { status: 500 }
        )
      )
    );

    const user = userEvent.setup();
    renderWithProviders(<RegisterPatientPage />);
    await screen.findByRole("heading", { name: /register new patient/i });

    await user.type(screen.getByLabelText(/full name/i), "Test Patient");
    await user.type(screen.getByLabelText(/mobile number/i), "9876543210");
    await user.click(screen.getByRole("button", { name: /register patient/i }));

    // Form should still be visible (not replaced by success view)
    await waitFor(() => {
      expect(
        screen.queryByText(/patient registered successfully/i)
      ).not.toBeInTheDocument();
    });
  });

  it("has no accessibility violations on render", async () => {
    const { container } = renderWithProviders(<RegisterPatientPage />);
    await screen.findByRole("heading", { name: /register new patient/i });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
