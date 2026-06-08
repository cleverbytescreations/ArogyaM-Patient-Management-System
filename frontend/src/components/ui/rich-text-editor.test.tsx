import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RichTextEditor } from "./rich-text-editor";

const API_INVESTIGATIONS_HTML =
  "<ul><li><p>Complete Blood Count</p></li><li><p>Fasting Blood Sugar</p></li><li><p>HbA1c</p></li><li><p>Kidney Function Test</p></li><li><p>Lipid profile</p></li><li><p>Blood group</p></li><li><p>Urine routine analysis</p></li><li><p>Blood Pressure levels</p></li><li><p>ECG (if above 40 years of age)</p></li></ul>";

const API_TREATMENTS_HTML =
  "<ul><li><p>Udvarthanam \u2013 3 days<br><em>(Kola kulatha, Nimbadi choornam, Triphala kashayam)</em></p></li><li><p>Bashpasveda \u2013 3 days</p></li><li><p>Kati pichu \u2013 7 days<br><em>(Karpooradi Taila &amp; Dhanvantra Tailam)</em></p></li><li><p>Patrapinda Sweda \u2013 9 days</p></li><li><p>Snehapana <em>(Triphala Gritha)</em> \u2013 4 days</p></li><li><p>Virechana <em>(Nimbamrutadi Eranda Tailam)</em></p></li></ul><p></p>";

function Controlled({ initial = "", onChange }: { initial?: string; onChange?: (html: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <RichTextEditor
      value={value}
      onChange={(html) => {
        setValue(html);
        onChange?.(html);
      }}
      aria-label="Treatments"
    />
  );
}

describe("RichTextEditor", () => {
  it("renders the formatting toolbar and initial content", async () => {
    render(<Controlled initial="<p>Hello <strong>world</strong></p>" />);

    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
    for (const label of ["Bold", "Italic", "Bulleted list", "Numbered list", "Align left", "Align center", "Align right", "Justify"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    await waitFor(() => expect(screen.getByText("world")).toBeInTheDocument());
  });

  it("syncs content when value is loaded after mount", async () => {
    const { rerender } = render(<RichTextEditor value="" onChange={vi.fn()} aria-label="Treatments" />);

    rerender(<RichTextEditor value="<p>Hydration and supportive care</p>" onChange={vi.fn()} aria-label="Treatments" />);

    await waitFor(() => expect(screen.getByText("Hydration and supportive care")).toBeInTheDocument());
  });

  it("syncs externally loaded content even when the editor is focused", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RichTextEditor value="" onChange={vi.fn()} aria-label="Treatments" />);

    await user.click(screen.getByLabelText("Treatments"));
    rerender(<RichTextEditor value="<p>Hydration and supportive care</p>" onChange={vi.fn()} aria-label="Treatments" />);

    await waitFor(() => expect(screen.getByText("Hydration and supportive care")).toBeInTheDocument());
  });

  it("renders list-heavy API HTML provided on initial mount", async () => {
    render(<RichTextEditor value={API_INVESTIGATIONS_HTML} onChange={vi.fn()} aria-label="Investigations on admission" />);

    expect(await screen.findByText("Complete Blood Count")).toBeInTheDocument();
    expect(await screen.findByText("ECG (if above 40 years of age)")).toBeInTheDocument();
  });

  it("syncs list-heavy treatment API HTML after mount", async () => {
    const { rerender } = render(<RichTextEditor value="" onChange={vi.fn()} aria-label="Treatments" />);

    rerender(<RichTextEditor value={API_TREATMENTS_HTML} onChange={vi.fn()} aria-label="Treatments" />);

    expect(await screen.findByText("Udvarthanam \u2013 3 days")).toBeInTheDocument();
    expect(await screen.findByText("(Karpooradi Taila & Dhanvantra Tailam)")).toBeInTheDocument();
  });

  it("applies bold formatting and emits sanitizable HTML via onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial="" onChange={onChange} />);

    const editable = screen.getByLabelText("Treatments");
    await user.click(editable);
    await user.click(screen.getByRole("button", { name: "Bold" }));
    await user.type(editable, "Strict rest");

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string;
      expect(lastCall).toContain("<strong>");
      expect(lastCall).toContain("Strict rest");
    });
  });

  it("toggles a bulleted list around the typed line via the toolbar", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial="" onChange={onChange} />);

    const editable = screen.getByLabelText("Treatments");
    await user.click(editable);
    await user.type(editable, "Daily walk");
    await user.click(screen.getByRole("button", { name: "Bulleted list" }));

    await waitFor(() => {
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as string;
      expect(lastCall).toContain("<ul>");
      expect(lastCall).toContain("Daily walk");
    });
  });

  it("disables the editor and toolbar when disabled", () => {
    render(
      <RichTextEditor value="<p>Locked</p>" onChange={vi.fn()} disabled aria-label="Treatments" />
    );

    expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled();
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });
});
