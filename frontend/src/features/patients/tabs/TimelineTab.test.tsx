import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "@/test/helpers";
import { TimelineTab } from "./TimelineTab";

let permissions = ["view_medical_history"];

vi.mock("@/auth/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (permission: string) => permissions.includes(permission),
  }),
}));

describe("TimelineTab", () => {
  it("renders timeline events with labels", async () => {
    renderWithQuery(<TimelineTab patientId="patient-1" onOpenSection={vi.fn()} />);

    expect(await screen.findByText(/scanned prescription uploaded/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^prescription$/i)[0]).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /open section/i })[0]).toBeInTheDocument();
  });

  it("shows permission message for limited roles", () => {
    permissions = [];
    renderWithQuery(<TimelineTab patientId="patient-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent(/do not have permission/i);
    permissions = ["view_medical_history"];
  });
});
