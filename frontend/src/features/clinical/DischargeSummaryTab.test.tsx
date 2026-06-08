import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "@/test/helpers";
import { DischargeSummaryTab } from "./DischargeSummaryTab";
import { mockVisit } from "@/test/mocks/handlers";

vi.mock("@/auth/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (permission: string) => ["view_medical_history", "add_consultation"].includes(permission),
  }),
}));

describe("DischargeSummaryTab", () => {
  it("shows current draft and finalizes with confirmation", async () => {
    const user = userEvent.setup();
    renderWithQuery(<DischargeSummaryTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />);

    expect(await screen.findByDisplayValue(/viral fever/i)).toBeInTheDocument();
    expect(await screen.findByText(/cbc reviewed/i)).toBeInTheDocument();
    expect(await screen.findByText(/hydration and supportive care/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^finalize$/i }));
    await user.click(screen.getByRole("button", { name: /^finalize$/i }));

    await waitFor(() => expect(screen.queryByText(/after finalization/i)).not.toBeInTheDocument());
  });

  it("validates discharge date order", async () => {
    const user = userEvent.setup();
    renderWithQuery(<DischargeSummaryTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} />);

    const admission = await screen.findByLabelText(/admission date/i);
    const discharge = screen.getByLabelText(/discharge date/i);
    await user.clear(admission);
    await user.type(admission, "2026-06-10");
    await user.clear(discharge);
    await user.type(discharge, "2026-06-09");
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    expect(await screen.findByText(/on or after admission date/i)).toBeInTheDocument();
  });
});
