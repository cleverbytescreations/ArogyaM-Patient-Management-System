import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "@/test/helpers";
import { DocumentsTab } from "./DocumentsTab";

let permissions = ["view_medical_history", "upload_document"];

vi.mock("@/auth/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (permission: string) => permissions.includes(permission),
  }),
}));

describe("DocumentsTab", () => {
  beforeEach(() => {
    permissions = ["view_medical_history", "upload_document"];
    vi.stubGlobal("open", vi.fn());
    URL.createObjectURL = vi.fn(() => "blob:secure-document");
    URL.revokeObjectURL = vi.fn();
  });

  it("lists documents and opens secure viewer", async () => {
    const user = userEvent.setup();
    renderWithQuery(<DocumentsTab patientId="patient-1" />);

    expect(await screen.findByText(/scanned prescription/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /view prescription.pdf/i }));

    expect(await screen.findByRole("heading", { name: /scanned prescription/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open secure stream/i }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith("blob:secure-document", "_blank", "noopener,noreferrer"));
  });

  it("blocks oversized uploads before API submission", async () => {
    const user = userEvent.setup();
    renderWithQuery(<DocumentsTab patientId="patient-1" />);

    await user.click(await screen.findByRole("button", { name: /upload document/i }));
    await user.selectOptions(screen.getByLabelText(/document type/i), "OTHER");
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText(/file/i), file);
    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    expect(await screen.findByText(/10 mb or smaller/i)).toBeInTheDocument();
  });

  it("soft-deletes with confirmation", async () => {
    const user = userEvent.setup();
    renderWithQuery(<DocumentsTab patientId="patient-1" />);

    await user.click(await screen.findByRole("button", { name: /delete prescription.pdf/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByText(/marks the document metadata as deleted/i)).not.toBeInTheDocument());
  });

  it("allows upload-only users to upload without listing documents", async () => {
    permissions = ["upload_document"];
    renderWithQuery(<DocumentsTab patientId="patient-1" />);

    expect(screen.getByRole("button", { name: /upload document/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/listing and secure viewing require medical-history access/i);
    expect(screen.queryByText(/scanned prescription/i)).not.toBeInTheDocument();
  });
});
