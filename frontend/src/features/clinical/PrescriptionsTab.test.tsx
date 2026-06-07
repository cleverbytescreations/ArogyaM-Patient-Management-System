import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "@/test/helpers";
import { PrescriptionsTab } from "./PrescriptionsTab";
import { mockVisit } from "@/test/mocks/handlers";

let permissions = ["view_medical_history", "add_prescription"];

vi.mock("@/auth/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (permission: string) => permissions.includes(permission),
  }),
}));

describe("PrescriptionsTab", () => {
  it("lists prescriptions and creates a structured prescription", async () => {
    const user = userEvent.setup();
    renderWithQuery(<PrescriptionsTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} onUploadScanned={vi.fn()} />);

    expect(await screen.findByText(/paracetamol/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /new prescription/i }));
    await user.clear(screen.getByLabelText(/^medicine$/i));
    await user.type(screen.getByLabelText(/^medicine$/i), "Triphala");
    await user.click(screen.getByRole("button", { name: /save prescription/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("defaults the prescription doctor from the selected visit and allows searchable override", async () => {
    const user = userEvent.setup();
    renderWithQuery(<PrescriptionsTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} onUploadScanned={vi.fn()} />);

    await screen.findByText(/paracetamol/i);

    await user.click(screen.getByRole("button", { name: /new prescription/i }));

    const lockedDoctor = await screen.findByLabelText(/^doctor$/i);
    expect(lockedDoctor).toBeDisabled();
    expect(lockedDoctor).toHaveValue("user-2");

    await user.click(screen.getByRole("button", { name: /change doctor/i }));
    const doctorSearch = screen.getByRole("textbox", { name: /^doctor$/i });

    await user.clear(doctorSearch);
    await user.type(doctorSearch, "Smi");
    await user.click(await screen.findByRole("option", { name: /dr\. john smith/i }));

    expect(doctorSearch).toHaveValue("Dr. John Smith");
  });

  it("hides write actions without prescription permission", async () => {
    permissions = ["view_medical_history"];
    renderWithQuery(<PrescriptionsTab selectedVisit={mockVisit} onSelectVisitTab={vi.fn()} onUploadScanned={vi.fn()} />);

    expect(await screen.findByText(/paracetamol/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new prescription/i })).not.toBeInTheDocument();
    permissions = ["view_medical_history", "add_prescription"];
  });
});
