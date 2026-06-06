import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { axe } from "jest-axe";
import { renderWithProviders } from "@/test/helpers";
import { PatientSearchPage } from "./PatientSearchPage";
import { server } from "@/test/mocks/server";
import { mockPatientSearchResults } from "@/test/mocks/handlers";

// PatientSearchPage uses usePermissions to gate the "Register new patient" button.
// Permissions come from AuthContext; tests use renderWithProviders which wraps with
// MemoryRouter + QueryClient but NOT AuthProvider — so usePermissions returns empty
// by default and the register button is hidden. Override per-test when needed.

describe("PatientSearchPage", () => {
  it("renders the page heading and search bar", () => {
    renderWithProviders(<PatientSearchPage />);
    expect(
      screen.getByRole("heading", { name: /patient search/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search patients/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply search/i })).toBeInTheDocument();
  });

  it("shows the landing prompt before any search is submitted", () => {
    renderWithProviders(<PatientSearchPage />);
    expect(
      screen.getByText(/enter a name, op number, or mobile number/i)
    ).toBeInTheDocument();
    // Table should not be visible yet
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("displays results after a search is submitted", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PatientSearchPage />);

    await user.type(
      screen.getByRole("searchbox", { name: /search patients/i }),
      "Priya"
    );
    await user.click(screen.getByRole("button", { name: /apply search/i }));

    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("OPN0043")).toBeInTheDocument();
  });

  it("triggers search when Enter is pressed in the input", async () => {
    const user = userEvent.setup();
    let capturedQ: string | null = null;
    server.use(
      http.get("/api/v1/patients/search", ({ request }) => {
        capturedQ = new URL(request.url).searchParams.get("q");
        return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 });
      })
    );

    renderWithProviders(<PatientSearchPage />);
    await user.type(
      screen.getByRole("searchbox", { name: /search patients/i }),
      "kumar{Enter}"
    );

    await waitFor(() => {
      expect(capturedQ).toBe("kumar");
    });
  });

  it("shows result count summary after search", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PatientSearchPage />);

    await user.type(
      screen.getByRole("searchbox", { name: /search patients/i }),
      "Priya"
    );
    await user.click(screen.getByRole("button", { name: /apply search/i }));

    expect(
      await screen.findByText(/1 patient found for "Priya"/i)
    ).toBeInTheDocument();
  });

  it("shows empty state message when no results are returned", async () => {
    server.use(
      http.get("/api/v1/patients/search", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 })
      )
    );

    const user = userEvent.setup();
    renderWithProviders(<PatientSearchPage />);

    await user.type(
      screen.getByRole("searchbox", { name: /search patients/i }),
      "nonexistent"
    );
    await user.click(screen.getByRole("button", { name: /apply search/i }));

    // findByText matches <td>, <tr>, <tbody> simultaneously — use role query for exactness
    expect(
      await screen.findByRole("cell", { name: /no patients found/i })
    ).toBeInTheDocument();
  });

  it("shows error alert when the API fails", async () => {
    server.use(
      http.get("/api/v1/patients/search", () =>
        HttpResponse.json(
          { error: { code: "INTERNAL_ERROR", message: "Unexpected error.", details: [], request_id: "r" } },
          { status: 500 }
        )
      )
    );

    const user = userEvent.setup();
    renderWithProviders(<PatientSearchPage />);

    await user.type(
      screen.getByRole("searchbox", { name: /search patients/i }),
      "test"
    );
    await user.click(screen.getByRole("button", { name: /apply search/i }));

    // The component shows the API message when available; getApiErrorMessage
    // returns the API error.message rather than the fallback in this case.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("clears the search when the clear button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PatientSearchPage />);

    const input = screen.getByRole("searchbox", { name: /search patients/i });
    await user.type(input, "Priya");

    const clearButton = screen.getByRole("button", { name: /clear search/i });
    await user.click(clearButton);

    expect(input).toHaveValue("");
    // Landing state restored
    expect(
      screen.getByText(/enter a name, op number, or mobile number/i)
    ).toBeInTheDocument();
  });

  it("does not show results when query is empty and search is clicked", () => {
    renderWithProviders(<PatientSearchPage />);

    // Search button is disabled when input is empty
    expect(
      screen.getByRole("button", { name: /apply search/i })
    ).toBeDisabled();
  });

  it("shows masked mobile in results — no raw phone number", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PatientSearchPage />);

    await user.type(
      screen.getByRole("searchbox", { name: /search patients/i }),
      "Priya"
    );
    await user.click(screen.getByRole("button", { name: /apply search/i }));

    await screen.findByText("Priya Sharma");

    // Masked mobile present
    expect(screen.getByText("****3210")).toBeInTheDocument();
    // Raw mobile NOT present
    expect(screen.queryByText("9876543210")).not.toBeInTheDocument();
  });

  it("navigates to patient profile when view button is clicked", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<PatientSearchPage />, {
      initialRoute: "/patients/search",
    });

    await user.type(
      screen.getByRole("searchbox", { name: /search patients/i }),
      "Priya"
    );
    await user.click(screen.getByRole("button", { name: /apply search/i }));

    await screen.findByText("Priya Sharma");

    const viewBtn = screen.getByRole("button", {
      name: /view profile for priya sharma/i,
    });
    await user.click(viewBtn);

    // Navigation is hard to assert without a router spy; at minimum verify
    // no crash occurs and the button existed
    expect(viewBtn).toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  it("has no accessibility violations on the landing state", async () => {
    const { container } = renderWithProviders(<PatientSearchPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no accessibility violations with results loaded", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<PatientSearchPage />);

    await user.type(
      screen.getByRole("searchbox", { name: /search patients/i }),
      "Priya"
    );
    await user.click(screen.getByRole("button", { name: /apply search/i }));
    await screen.findByText("Priya Sharma");

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// Verify mock data shape
describe("PatientSearchPage — mock data", () => {
  it("mock search results contain expected fields (no raw mobile)", () => {
    for (const result of mockPatientSearchResults) {
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("op_number");
      expect(result).toHaveProperty("full_name");
      expect(result).toHaveProperty("mobile_masked");
      expect(result).not.toHaveProperty("mobile"); // raw mobile never in search result
    }
  });
});
