import { forwardRef, useLayoutEffect, useRef } from "react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  rows?: number;
  id?: string;
  name?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-label"?: string;
}

interface ToolbarButtonProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolbarButton({ label, disabled, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}

type Transform = (
  text: string,
  start: number,
  end: number
) => [newText: string, newStart: number, newEnd: number];

export const MarkdownEditor = forwardRef<HTMLDivElement, MarkdownEditorProps>(
  function MarkdownEditor(
    { value, onChange, onBlur, disabled, rows = 6, id, name, className, ...aria },
    ref
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const pendingSelectionRef = useRef<[number, number] | null>(null);

    // Restore cursor/selection after every render where a toolbar action fired.
    useLayoutEffect(() => {
      if (pendingSelectionRef.current !== null && textareaRef.current) {
        textareaRef.current.setSelectionRange(...pendingSelectionRef.current);
        pendingSelectionRef.current = null;
      }
    });

    function applyTransform(transform: Transform) {
      const el = textareaRef.current;
      if (!el) return;
      const [newText, newStart, newEnd] = transform(value, el.selectionStart, el.selectionEnd);
      if (newText !== value) {
        onChange(newText);
        pendingSelectionRef.current = [newStart, newEnd];
      }
      el.focus();
    }

    function handleBold() {
      applyTransform((text, start, end) => {
        const selected = text.slice(start, end);
        const inner = selected || "bold text";
        return [
          text.slice(0, start) + `**${inner}**` + text.slice(end),
          start + 2,
          start + 2 + inner.length,
        ];
      });
    }

    function handleItalic() {
      applyTransform((text, start, end) => {
        const selected = text.slice(start, end);
        const inner = selected || "italic text";
        return [
          text.slice(0, start) + `_${inner}_` + text.slice(end),
          start + 1,
          start + 1 + inner.length,
        ];
      });
    }

    function handleBulletList() {
      applyTransform((text, start, end) => {
        const lineStart = text.lastIndexOf("\n", start - 1) + 1;
        const tailIdx = text.indexOf("\n", end);
        const lineEnd = tailIdx === -1 ? text.length : tailIdx;
        const lines = text.slice(lineStart, lineEnd).split("\n");
        const allBulleted = lines.every((l) => l.startsWith("- "));
        const newLines = allBulleted
          ? lines.map((l) => l.slice(2))
          : lines.map((l) => `- ${l.replace(/^-\s+/, "").replace(/^\d+\.\s+/, "")}`);
        const newBlock = newLines.join("\n");
        return [text.slice(0, lineStart) + newBlock + text.slice(lineEnd), lineStart, lineStart + newBlock.length];
      });
    }

    function handleOrderedList() {
      applyTransform((text, start, end) => {
        const lineStart = text.lastIndexOf("\n", start - 1) + 1;
        const tailIdx = text.indexOf("\n", end);
        const lineEnd = tailIdx === -1 ? text.length : tailIdx;
        const lines = text.slice(lineStart, lineEnd).split("\n");
        const allNumbered = lines.every((l) => /^\d+\.\s/.test(l));
        let counter = 1;
        const newLines = allNumbered
          ? lines.map((l) => l.replace(/^\d+\.\s+/, ""))
          : lines.map((l) => `${counter++}. ${l.replace(/^-\s+/, "").replace(/^\d+\.\s+/, "")}`);
        const newBlock = newLines.join("\n");
        return [text.slice(0, lineStart) + newBlock + text.slice(lineEnd), lineStart, lineStart + newBlock.length];
      });
    }

    return (
      <div
        ref={ref}
        className={cn(
          "overflow-hidden rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <div
          role="toolbar"
          aria-label="Markdown formatting"
          className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/40 px-1.5 py-1"
        >
          <ToolbarButton label="Bold" onClick={handleBold} disabled={disabled}>
            <Bold className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Italic" onClick={handleItalic} disabled={disabled}>
            <Italic className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <ToolbarButton label="Bullet list" onClick={handleBulletList} disabled={disabled}>
            <List className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Numbered list" onClick={handleOrderedList} disabled={disabled}>
            <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolbarButton>
        </div>
        <textarea
          ref={textareaRef}
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          rows={rows}
          aria-describedby={aria["aria-describedby"]}
          aria-invalid={aria["aria-invalid"]}
          aria-label={aria["aria-label"]}
          className="w-full resize-y bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    );
  }
);
