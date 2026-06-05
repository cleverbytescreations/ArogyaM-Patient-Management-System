import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { axe } from "jest-axe";
import { LoginPage } from "./LoginPage";
import { useAuth } from "@/auth/AuthContext";

vi.mock("@/auth/AuthContext");
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null, pathname: "/login" }),
  };
});

const mockNavigate = vi.fn();
const mockLogin = vi.fn();

beforeEach(() => {
  mockNavigate.mockReset();
  mockLogin.mockReset();
  vi.mocked(useAuth).mockReturnValue({
    login: mockLogin,
    logout: vi.fn(),
    user: null,
    permissions: [],
    roles: [],
    isLoading: false,
    isAuthenticated: false,
  });
});

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  it("renders the login form with username and password fields", () => {
    renderLoginPage();
    expect(screen.getByRole("heading", { name: /arogyam/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/^password/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows validation errors when form is submitted empty", async () => {
    const user = userEvent.setup();
    renderLoginPage();
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(
      await screen.findByText(/username is required/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it("calls login with correct credentials on valid submit", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce(undefined);
    renderLoginPage();
    await user.type(screen.getByLabelText(/username/i), "admin");
    await user.type(screen.getByLabelText(/^password/i), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("admin", "password123");
    });
    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("shows generic error for invalid credentials", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          error: {
            code: "AUTH_INVALID_CREDENTIALS",
            message: "Invalid credentials.",
            details: [],
            request_id: "r1",
          },
        },
      },
    });
    renderLoginPage();
    await user.type(screen.getByLabelText(/username/i), "wrong");
    await user.type(screen.getByLabelText(/^password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /invalid credentials/i
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows locked account message for AUTH_ACCOUNT_LOCKED", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce({
      response: {
        status: 401,
        data: {
          error: {
            code: "AUTH_ACCOUNT_LOCKED",
            message: "Account is locked.",
            details: [],
            request_id: "r2",
          },
        },
      },
    });
    renderLoginPage();
    await user.type(screen.getByLabelText(/username/i), "locked");
    await user.type(screen.getByLabelText(/^password/i), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /temporarily locked/i
    );
  });

  it("shows disabled account message for AUTH_ACCOUNT_DISABLED", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce({
      response: {
        status: 403,
        data: {
          error: {
            code: "AUTH_ACCOUNT_DISABLED",
            message: "Account is disabled.",
            details: [],
            request_id: "r3",
          },
        },
      },
    });
    renderLoginPage();
    await user.type(screen.getByLabelText(/username/i), "disabled");
    await user.type(screen.getByLabelText(/^password/i), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /has been disabled/i
    );
  });

  it("shows rate-limit message on 429 response", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce({
      response: { status: 429 },
    });
    renderLoginPage();
    await user.type(screen.getByLabelText(/username/i), "user");
    await user.type(screen.getByLabelText(/^password/i), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /too many login attempts/i
    );
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    renderLoginPage();
    const passwordInput = screen.getByLabelText(/^password/i);
    expect(passwordInput).toHaveAttribute("type", "password");
    await user.click(screen.getByLabelText(/show password/i));
    expect(passwordInput).toHaveAttribute("type", "text");
    await user.click(screen.getByLabelText(/hide password/i));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("disables submit button and shows spinner while submitting", async () => {
    const user = userEvent.setup();
    let resolveLogin!: () => void;
    mockLogin.mockReturnValueOnce(
      new Promise<void>((res) => {
        resolveLogin = res;
      })
    );
    renderLoginPage();
    await user.type(screen.getByLabelText(/username/i), "admin");
    await user.type(screen.getByLabelText(/^password/i), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    });
    resolveLogin();
    // Flush the post-resolution navigation inside act() to avoid a warning.
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("has no accessibility violations", async () => {
    const { container } = renderLoginPage();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
