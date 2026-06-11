import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithProviders } from "@/test/helpers";
import { SignatureUpload } from "./SignatureUpload";
import { usersApi } from "./usersApi";
import { mockUserList } from "@/test/mocks/handlers";
import type { User } from "@/types/users";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const doctor: User = mockUserList[1];

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:signature");
  URL.revokeObjectURL = vi.fn();
});

describe("SignatureUpload", () => {
  it("shows Upload control and empty state when no signature exists", () => {
    renderWithProviders(<SignatureUpload user={{ ...doctor, has_signature: false }} />);
    expect(screen.getByRole("button", { name: /upload/i })).toBeInTheDocument();
    expect(screen.getByText(/no signature uploaded yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("shows Replace + Remove and a preview when a signature exists", async () => {
    vi.spyOn(usersApi, "getSignatureBlob").mockResolvedValue(
      new Blob([new Uint8Array([0x89, 0x50])], { type: "image/png" })
    );
    renderWithProviders(<SignatureUpload user={{ ...doctor, has_signature: true }} />);
    expect(screen.getByRole("button", { name: /replace/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByAltText(/doctor signature preview/i)).toBeInTheDocument()
    );
  });

  it("rejects a non-image file client-side without calling the API", async () => {
    const spy = vi.spyOn(usersApi, "uploadSignature");
    renderWithProviders(<SignatureUpload user={{ ...doctor, has_signature: false }} />);
    const input = screen.getByLabelText(/signature image file/i) as HTMLInputElement;
    // fireEvent bypasses the input's `accept` filter that userEvent.upload honours.
    fireEvent.change(input, {
      target: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] },
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Signature must be a PNG or JPEG image.")
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("uploads a PNG via the API and reports success", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(usersApi, "uploadSignature")
      .mockResolvedValue({ ...doctor, has_signature: true });
    renderWithProviders(<SignatureUpload user={{ ...doctor, has_signature: false }} />);
    const input = screen.getByLabelText(/signature image file/i) as HTMLInputElement;
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "sig.png", {
      type: "image/png",
    });
    await user.upload(input, file);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(doctor.id, file));
    expect(toast.success).toHaveBeenCalledWith("Signature uploaded.");
  });

  it("shows the preview live after upload without the user prop changing", async () => {
    const user = userEvent.setup();
    vi.spyOn(usersApi, "uploadSignature").mockResolvedValue({
      ...doctor,
      has_signature: true,
    });
    vi.spyOn(usersApi, "getSignatureBlob").mockResolvedValue(
      new Blob([new Uint8Array([0x89, 0x50])], { type: "image/png" })
    );
    // Prop stays has_signature: false (stale snapshot) for the whole test.
    renderWithProviders(<SignatureUpload user={{ ...doctor, has_signature: false }} />);
    const input = screen.getByLabelText(/signature image file/i) as HTMLInputElement;
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "sig.png", {
      type: "image/png",
    });
    await user.upload(input, file);
    await waitFor(() =>
      expect(screen.getByAltText(/doctor signature preview/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /replace/i })).toBeInTheDocument();
  });

  it("clears the preview live after delete without the user prop changing", async () => {
    const user = userEvent.setup();
    vi.spyOn(usersApi, "getSignatureBlob").mockResolvedValue(
      new Blob([new Uint8Array([0x89, 0x50])], { type: "image/png" })
    );
    vi.spyOn(usersApi, "deleteSignature").mockResolvedValue({} as never);
    renderWithProviders(<SignatureUpload user={{ ...doctor, has_signature: true }} />);
    await waitFor(() =>
      expect(screen.getByAltText(/doctor signature preview/i)).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() =>
      expect(screen.getByText(/no signature uploaded yet/i)).toBeInTheDocument()
    );
    expect(screen.queryByAltText(/doctor signature preview/i)).not.toBeInTheDocument();
  });
});
