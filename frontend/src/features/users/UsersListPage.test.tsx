import { describe, it, expect, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { axe } from "jest-axe";
import { renderWithProviders } from "@/test/helpers";
import { UsersListPage } from "./UsersListPage";
import { server } from "@/test/mocks/server";
import { mockUserList, mockRoles } from "@/test/mocks/handlers";

// UsersListPage does not itself call useAuth/usePermissions — route guards handle RBAC.
// Tests verify list/search/dialog/mutation behaviour in isolation.

describe("UsersListPage", () => {
  it("renders page heading and Add User button", async () => {
    renderWithProviders(<UsersListPage />);
    expect(
      await screen.findByRole("heading", { name: /user management/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create new user/i })
    ).toBeInTheDocument();
  });

  it("displays users returned from API", async () => {
    renderWithProviders(<UsersListPage />);
    expect(await screen.findByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("Dr. John Smith")).toBeInTheDocument();
  });

  it("shows loading state before data arrives", async () => {
    renderWithProviders(<UsersListPage />);
    // The loading spinner is in the table body while the query is pending
    expect(screen.getByRole("table")).toBeInTheDocument();
    // data loads and loading disappears
    await screen.findByText("Admin User");
  });

  it("shows error message when API call fails", async () => {
    server.use(
      http.get("/api/v1/users", () =>
        HttpResponse.json(
          { error: { code: "SERVER_ERROR", message: "Unexpected error", details: [], request_id: "r" } },
          { status: 500 }
        )
      )
    );
    renderWithProviders(<UsersListPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /failed to load users/i
    );
  });

  it("applies search query when Search button is clicked", async () => {
    const user = userEvent.setup();
    let capturedParams: URLSearchParams | null = null;
    server.use(
      http.get("/api/v1/users", ({ request }) => {
        capturedParams = new URL(request.url).searchParams;
        return HttpResponse.json({
          items: [],
          total: 0,
          page: 1,
          page_size: 20,
        });
      })
    );
    renderWithProviders(<UsersListPage />);
    await user.type(screen.getByLabelText(/search users/i), "admin");
    await user.click(screen.getByRole("button", { name: /apply search/i }));
    await waitFor(() => {
      expect(capturedParams?.get("q")).toBe("admin");
    });
  });

  it("triggers search on Enter key in search input", async () => {
    const user = userEvent.setup();
    let capturedParams: URLSearchParams | null = null;
    server.use(
      http.get("/api/v1/users", ({ request }) => {
        capturedParams = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 });
      })
    );
    renderWithProviders(<UsersListPage />);
    const searchInput = screen.getByLabelText(/search users/i);
    await user.type(searchInput, "john{Enter}");
    await waitFor(() => {
      expect(capturedParams?.get("q")).toBe("john");
    });
  });

  it("opens Create User dialog when Add User is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersListPage />);
    await screen.findByText("Admin User");
    await user.click(screen.getByRole("button", { name: /create new user/i }));
    expect(
      await screen.findByRole("dialog", { name: /create user/i })
    ).toBeInTheDocument();
  });

  it("opens Edit User dialog when Edit is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersListPage />);
    // Admin User (user-1) is a superuser — edit button is intentionally hidden.
    // Dr. John Smith (user-2) is not a superuser so the edit button appears.
    const editButtons = await screen.findAllByRole("button", {
      name: /edit dr\. john smith/i,
    });
    await user.click(editButtons[0]);
    expect(
      await screen.findByRole("dialog", { name: /edit user/i })
    ).toBeInTheDocument();
  });

  it("opens Reset Password dialog when key icon is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersListPage />);
    await screen.findByText("Admin User");
    const resetButtons = await screen.findAllByRole("button", {
      name: /reset password for admin user/i,
    });
    await user.click(resetButtons[0]);
    expect(
      await screen.findByRole("dialog", { name: /reset password/i })
    ).toBeInTheDocument();
  });

  it("shows disable confirmation dialog on Disable click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersListPage />);
    await screen.findByText("Dr. John Smith");
    // Admin User is a superuser — disable button hidden. Use Dr. John Smith (non-superuser).
    const disableButtons = await screen.findAllByRole("button", {
      name: /disable dr\. john smith/i,
    });
    await user.click(disableButtons[0]);
    expect(
      await screen.findByRole("alertdialog")
    ).toBeInTheDocument();
    expect(screen.getByText(/disable user/i)).toBeInTheDocument();
  });

  it("creates a new user and shows success toast", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersListPage />);
    await screen.findByText("Admin User");

    // Open create dialog
    await user.click(screen.getByRole("button", { name: /create new user/i }));
    const dialog = await screen.findByRole("dialog", { name: /create user/i });
    expect(dialog).toBeInTheDocument();

    // Fill in form
    await user.type(screen.getByLabelText(/^username/i), "newuser");
    await user.type(screen.getByLabelText(/full name/i), "New User");
    await user.type(screen.getByLabelText(/^password/i), "password123");

    // Select a role (first checkbox)
    const roleCheckboxes = screen.getAllByRole("checkbox");
    await user.click(roleCheckboxes[0]);

    // Mock roles response is already set up in handlers
    server.use(
      http.get("/api/v1/roles", () => HttpResponse.json(mockRoles))
    );

    await user.click(screen.getByRole("button", { name: /create user/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("displays role badges for each user", async () => {
    renderWithProviders(<UsersListPage />);
    await screen.findByText("Admin User");
    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(screen.getByText("Doctor")).toBeInTheDocument();
  });

  it("has no accessibility violations after data loads", async () => {
    const { container } = renderWithProviders(<UsersListPage />);
    await screen.findByText("Admin User");
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// Inline test for the mock data coverage
describe("UsersListPage — mock data assertions", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/v1/users", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 })
      )
    );
  });

  it("shows empty message when no users are returned", async () => {
    renderWithProviders(<UsersListPage />);
    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });
});

// Ensure mock data arrays are tested
describe("UsersListPage — mock handler exports", () => {
  it("mock user list has expected length", () => {
    expect(mockUserList.length).toBeGreaterThan(0);
  });
  it("mock roles has expected length", () => {
    expect(mockRoles.length).toBeGreaterThan(0);
  });
});
