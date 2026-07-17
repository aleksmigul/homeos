import { Bold, Eye, Heading1, Italic, Link, List, ListChecks, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownNotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}

type EditorMode = "write" | "preview";

export function MarkdownNotesEditor({ value, onChange, onCommit }: MarkdownNotesEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<EditorMode>("write");

  function insertMarkdown(format: "bold" | "italic" | "heading" | "list" | "task" | "link") {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const replacement = getReplacement(format, selected);
    const nextValue = `${value.slice(0, start)}${replacement.text}${value.slice(end)}`;

    onChange(nextValue);
    textarea.focus();

    window.setTimeout(() => {
      textarea.setSelectionRange(start + replacement.selectionStart, start + replacement.selectionEnd);
    }, 0);
  }

  return (
    <section
      className="markdown-editor"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onCommit(value);
        }
      }}
    >
      <div className="markdown-toolbar" aria-label="Markdown formatting">
        <button type="button" title="Bold" aria-label="Bold" onClick={() => insertMarkdown("bold")}>
          <Bold size={15} />
        </button>
        <button type="button" title="Italic" aria-label="Italic" onClick={() => insertMarkdown("italic")}>
          <Italic size={15} />
        </button>
        <button type="button" title="Heading" aria-label="Heading" onClick={() => insertMarkdown("heading")}>
          <Heading1 size={15} />
        </button>
        <button type="button" title="Bulleted list" aria-label="Bulleted list" onClick={() => insertMarkdown("list")}>
          <List size={15} />
        </button>
        <button type="button" title="Checklist" aria-label="Checklist" onClick={() => insertMarkdown("task")}>
          <ListChecks size={15} />
        </button>
        <button type="button" title="Link" aria-label="Link" onClick={() => insertMarkdown("link")}>
          <Link size={15} />
        </button>
        <div className="editor-mode-toggle" role="group" aria-label="Editor mode">
          <button
            className={mode === "write" ? "active" : ""}
            type="button"
            title="Write"
            aria-label="Write"
            onClick={() => setMode("write")}
          >
            <Pencil size={15} />
          </button>
          <button
            className={mode === "preview" ? "active" : ""}
            type="button"
            title="Preview"
            aria-label="Preview"
            onClick={() => {
              onCommit(value);
              setMode("preview");
            }}
          >
            <Eye size={15} />
          </button>
        </div>
      </div>

      {mode === "write" ? (
        <textarea
          ref={textareaRef}
          value={value}
          placeholder="# Ideas&#10;- Dinner reservation&#10;- Transit notes"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className="markdown-preview">
          {value.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown> : <p>No notes yet.</p>}
        </div>
      )}
    </section>
  );
}

function getReplacement(format: "bold" | "italic" | "heading" | "list" | "task" | "link", selected: string) {
  const fallback = selected || fallbackText[format];

  if (format === "bold") {
    return wrap("**", fallback);
  }

  if (format === "italic") {
    return wrap("_", fallback);
  }

  if (format === "heading") {
    const text = selected ? prefixLines(selected, "## ") : "## Heading";
    return { text, selectionStart: selected ? text.length : 3, selectionEnd: text.length };
  }

  if (format === "list") {
    const text = selected ? prefixLines(selected, "- ") : "- List item";
    return { text, selectionStart: selected ? text.length : 2, selectionEnd: text.length };
  }

  if (format === "task") {
    const text = selected ? prefixLines(selected, "- [ ] ") : "- [ ] Task";
    return { text, selectionStart: selected ? text.length : 6, selectionEnd: text.length };
  }

  const linkText = selected || "Link text";
  const text = `[${linkText}](https://)`;
  return {
    text,
    selectionStart: linkText.length + 3,
    selectionEnd: text.length - 1
  };
}

function wrap(marker: string, text: string) {
  return {
    text: `${marker}${text}${marker}`,
    selectionStart: marker.length,
    selectionEnd: marker.length + text.length
  };
}

function prefixLines(text: string, prefix: string) {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

const fallbackText = {
  bold: "bold text",
  italic: "italic text",
  heading: "Heading",
  list: "List item",
  task: "Task",
  link: "Link text"
};
