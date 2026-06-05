import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders title and description when open", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete User"
        description="This action cannot be undone."
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Delete User")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
  });

  it("uses custom confirmLabel and cancelLabel", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Disable"
        description="Disable this user?"
        confirmLabel="Yes, Disable"
        cancelLabel="Keep Active"
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Yes, Disable")).toBeInTheDocument();
    expect(screen.getByText("Keep Active")).toBeInTheDocument();
  });

  it("calls onConfirm when action button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Title"
        description="Desc"
        confirmLabel="Proceed"
        onConfirm={onConfirm}
      />
    );
    await user.click(screen.getByText("Proceed"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Title"
        description="Desc"
        onConfirm={vi.fn()}
      />
    );
    await user.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not render content when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="Delete"
        description="Are you sure?"
        onConfirm={vi.fn()}
      />
    );
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(screen.queryByText("Are you sure?")).not.toBeInTheDocument();
  });
});
