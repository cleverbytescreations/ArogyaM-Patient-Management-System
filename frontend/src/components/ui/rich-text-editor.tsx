import { forwardRef, useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  /** Approximate visible height, expressed in textarea "rows" for parity with <Textarea rows=. */
  rows?: number;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-label"?: string;
}

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolbarButton({ label, active, disabled, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
        active && "bg-accent text-accent-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/40 px-1.5 py-1"
    >
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <ToolbarButton
        label="Bulleted list"
        active={editor.isActive("bulletList")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <ToolbarButton
        label="Align left"
        active={editor.isActive({ textAlign: "left" })}
        disabled={disabled}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Align center"
        active={editor.isActive({ textAlign: "center" })}
        disabled={disabled}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Align right"
        active={editor.isActive({ textAlign: "right" })}
        disabled={disabled}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton
        label="Justify"
        active={editor.isActive({ textAlign: "justify" })}
        disabled={disabled}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
      >
        <AlignJustify className="h-3.5 w-3.5" aria-hidden="true" />
      </ToolbarButton>
    </div>
  );
}

/**
 * Minimal WYSIWYG editor (TipTap) for clinical free-text fields that benefit from
 * basic structure — bold/italic, bulleted/numbered lists, paragraph alignment.
 * Persists content as a sanitized HTML string (see backend app.core.sanitize).
 */
export const RichTextEditor = forwardRef<HTMLDivElement, RichTextEditorProps>(function RichTextEditor(
  { value, onChange, onBlur, disabled, rows = 6, className, id, ...aria },
  ref
) {
  const lastAppliedValueRef = useRef<string | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        strike: false,
        horizontalRule: false,
      }),
      TextAlign.configure({ types: ["paragraph", "listItem"] }),
    ],
    content: value || "",
    editable: !disabled,
    immediatelyRender: false,
    // TipTap v3 no longer re-renders on every transaction by default — the toolbar's
    // isActive() checks (bold/list/alignment) need this to reflect the live cursor state.
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    onBlur: () => onBlur?.(),
    editorProps: {
      attributes: {
        class: "rte-content focus-visible:outline-none",
        ...(id ? { id } : {}),
        ...(aria["aria-describedby"] ? { "aria-describedby": aria["aria-describedby"] } : {}),
        ...(aria["aria-invalid"] !== undefined ? { "aria-invalid": String(aria["aria-invalid"]) } : {}),
        ...(aria["aria-label"] ? { "aria-label": aria["aria-label"] } : {}),
      },
    },
  });

  useEffect(() => {
    if (!editor) return;

    const nextValue = value || "";
    const currentValue = editor.getHTML();

    if (currentValue === nextValue) {
      lastAppliedValueRef.current = nextValue;
      return;
    }

    if (nextValue !== lastAppliedValueRef.current) {
      editor.commands.setContent(nextValue, { emitUpdate: false });
      lastAppliedValueRef.current = nextValue;
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "overflow-hidden rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <Toolbar editor={editor} disabled={disabled} />
      <EditorContent
        editor={editor}
        className="px-3 py-2"
        style={{ minHeight: `${rows * 1.5}rem` }}
      />
    </div>
  );
});
