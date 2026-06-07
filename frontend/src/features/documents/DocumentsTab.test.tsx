import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
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

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("uploads files as multipart form data with default prescription visit metadata", async () => {
    const user = userEvent.setup();
    const received = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const formData = init?.body as FormData;
        received({
          contentType: init?.headers instanceof Headers ? init.headers.get("content-type") : null,
          file: formData.get("file"),
          documentType: formData.get("document_type_code"),
          visitId: formData.get("visit_id"),
          isHistorical: formData.get("is_historical"),
        });
        return new Response(JSON.stringify({
          id: "doc-new",
          patient_id: "patient-1",
          visit_id: "visit-1",
          document_type_code: "PRESCRIPTION",
          title: "Uploaded document",
          file_name: "prescription.png",
          content_type: "image/png",
          file_size_bytes: 4,
          document_date: null,
          is_historical: false,
          status: "ACTIVE",
          remarks: null,
          uploaded_by: "user-1",
          uploaded_at: "2026-06-07T10:00:00Z",
        }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      })
    );
    renderWithQuery(<DocumentsTab patientId="patient-1" defaultDocumentType="PRESCRIPTION" defaultVisitId="visit-1" />);

    const file = new File(["scan"], "prescription.png", { type: "image/png" });
    await user.upload(await screen.findByLabelText(/file/i), file);
    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    await waitFor(() => expect(received).toHaveBeenCalled());
    const payload = received.mock.calls[0][0];
    expect(payload.contentType).toBeNull();
    expect(payload.file).toBeInstanceOf(File);
    expect(payload.documentType).toBe("PRESCRIPTION");
    expect(payload.visitId).toBe("visit-1");
    expect(payload.isHistorical).toBe("false");
  });

  it("shows backend upload validation details beside matching fields", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/v1/patients/:id/documents", () =>
        HttpResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Request validation failed",
              details: [
                { field: "body.file", code: "missing", message: "Field required" },
                { field: "body.document_type_code", code: "missing", message: "Field required" },
              ],
              request_id: "upload-request-id",
            },
          },
          { status: 422 }
        )
      )
    );
    renderWithQuery(<DocumentsTab patientId="patient-1" defaultDocumentType="PRESCRIPTION" />);

    const file = new File(["scan"], "prescription.png", { type: "image/png" });
    await user.upload(await screen.findByLabelText(/file/i), file);
    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    expect(await screen.findAllByText(/field required/i)).toHaveLength(2);
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
