import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Heading1, Heading2, List, Link, ImagePlus, Columns2, Save, Loader2, Undo2, Redo2 } from "lucide-react";
import { uploadSavedFile } from "../api";
import { notesMarkdown, RichNotes } from "./RichNotes";
import { MarkdownSource, type SourceEditor } from "./MarkdownSource";
import { formattingAt, formattingRegions, toggleFormatting, type FormattingRegion, type NoteFormat } from "./markdownFormatting";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageSize = 12 * 1024 * 1024;

export function StackEditNotesEditor({ value, onChange, onCommit, onBusyChange }: {
  value: string; onChange: (value: string) => void; onCommit: (value: string) => void | Promise<void>; onBusyChange: (busy: boolean) => void;
}) {
  const [initial] = useState(() => notesMarkdown(value));
  const [draft, setDraft] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [error, setError] = useState("");
  const [split, setSplit] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Partial<Record<NoteFormat, boolean>>>({});
  const formatting = useRef<{ content: string; regions: FormattingRegion[] }>({ content: "", regions: [] });
  const editor = useRef<SourceEditor | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const currentDraft = useRef(initial);
  const saved = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saving = useRef<Promise<boolean> | null>(null);
  const uploadInFlight = useRef(false);
  const callbacks = useRef({ onChange, onCommit, onBusyChange });
  callbacks.current = { onChange, onCommit, onBusyChange };

  useEffect(() => {
    if (initial !== saved.current) update(initial);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (currentDraft.current !== saved.current || uploadInFlight.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("beforeunload", beforeUnload);
      if (currentDraft.current !== saved.current) void flush();
    };
  }, []);

  useEffect(() => {
    callbacks.current.onBusyChange(uploading || currentDraft.current !== saved.current);
  }, [uploading, draft, saveStatus]);
  useEffect(() => () => callbacks.current.onBusyChange(false), []);

  async function flush(): Promise<boolean> {
    clearTimeout(timer.current);
    if (saving.current) {
      if (!await saving.current) return false;
      return flush();
    }
    if (currentDraft.current === saved.current) return true;
    const text = currentDraft.current;
    setSaveStatus("Saving…");
    const commit = callbacks.current.onCommit;
    saving.current = Promise.resolve().then(() => commit(text)).then(() => {
      saved.current = text;
      setError("");
      return true;
    }).catch(() => {
      setError("Could not save notes. Your draft is still here. Retry before leaving.");
      setSaveStatus("Not saved");
      return false;
    });
    const ok = await saving.current;
    saving.current = null;
    if (!ok) return false;
    if (currentDraft.current !== saved.current) return flush();
    setSaveStatus("Saved");
    return true;
  }

  function update(text: string) {
    currentDraft.current = text;
    setDraft(text);
    callbacks.current.onChange(text);
    setSaveStatus("Unsaved changes");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  }

  function regionsFor(content: string) {
    if (formatting.current.content !== content) formatting.current = { content, regions: formattingRegions(content) };
    return formatting.current.regions;
  }

  function selectionChanged() {
    const input = editor.current;
    if (!input) return;
    const active = formattingAt(regionsFor(input.getContent()), input.selectionMgr.selectionStart, input.selectionMgr.selectionEnd);
    const formats: NoteFormat[] = ["bold", "italic", "heading1", "heading2", "list", "link"];
    setActiveFormats(previous => formats.every(format => !!previous[format] === !!active[format]) ? previous
      : Object.fromEntries(formats.map(format => [format, !!active[format]])));
  }

  function toggle(format: NoteFormat) {
    const input = editor.current;
    if (!input) return;
    const content = input.getContent();
    const edit = toggleFormatting(content, input.selectionMgr.selectionStart, input.selectionMgr.selectionEnd, format, regionsFor(content));
    input.replace(edit.start, edit.end, edit.text);
    input.setSelection(edit.selectionStart, edit.selectionEnd);
    input.focus();
    update(input.getContent());
    selectionChanged();
  }

  async function addImages(files: File[]) {
    if (uploadInFlight.current || !files.length) return;
    if (files.some(file => !imageTypes.has(file.type) || file.size > maxImageSize)) {
      setError("Choose PNG, JPEG, WebP or GIF images up to 12 MB each.");
      return;
    }
    const input = editor.current;
    if (!input) { setError("Editor is not ready. Please try again."); return; }
    const bookmark = input.bookmarkSelection();
    uploadInFlight.current = true;
    setUploading(true);
    setError("");
    try {
      const images: string[] = [];
      try {
        for (const file of files) {
          const { attachment } = await uploadSavedFile(file);
          if (!/^\/api\/saved-attachments\/[a-zA-Z0-9-]+$/.test(attachment.url)) throw new Error("Invalid image attachment URL");
          images.push(`![Image](${attachment.url})`);
        }
      } finally {
        // Insert completed uploads at the original selection, following edits
        // made during upload and preserving the user's current cursor.
        if (images.length && editor.current === input) {
          const content = input.getContent();
          const { start, end } = bookmark.getRange();
          const before = content.slice(0, start);
          const after = content.slice(end);
          const prefix = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
          const suffix = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
          const text = prefix + images.join("\n\n") + suffix;
          input.selectionMgr.saveSelectionState();
          const { selectionStart, selectionEnd } = input.selectionMgr;
          const position = (offset: number) => offset < start ? offset : offset >= end ? offset + text.length - (end - start) : start + text.length;
          input.replace(start, end, text);
          input.setSelection(position(selectionStart), position(selectionEnd));
          update(input.getContent());
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload image. Try again.");
    } finally { bookmark.release(); uploadInFlight.current = false; setUploading(false); }
  }

  function saveNow() {
    const content = editor.current?.getContent();
    if (content !== undefined && content !== currentDraft.current) update(content);
    void flush();
  }

  return <section className={`stackedit-notes ${split ? "notes-split" : "notes-single"}`} aria-label="Day notes editor" onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && ["b", "i", "s"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.key.toLowerCase() === "s") saveNow();
      else if (event.key.toLowerCase() === "b") toggle("bold");
      else toggle("italic");
    }
  }}>
    <div className="local-notes-toolbar" role="toolbar" aria-label="Notes formatting" onPointerDown={event => { if ((event.target as Element).closest("button")) event.preventDefault(); }}>
      <button type="button" aria-label="Bold" title="Bold (Ctrl/⌘ B)" aria-pressed={!!activeFormats.bold} onClick={() => toggle("bold")}><Bold size={18} /></button>
      <button type="button" aria-label="Italic" title="Italic (Ctrl/⌘ I)" aria-pressed={!!activeFormats.italic} onClick={() => toggle("italic")}><Italic size={18} /></button>
      <button type="button" aria-label="Heading 1" title="Heading 1" aria-pressed={!!activeFormats.heading1} onClick={() => toggle("heading1")}><Heading1 size={18} /></button>
      <button type="button" aria-label="Heading 2" title="Heading 2" aria-pressed={!!activeFormats.heading2} onClick={() => toggle("heading2")}><Heading2 size={18} /></button>
      <button type="button" aria-label="List" title="Bulleted list" aria-pressed={!!activeFormats.list} onClick={() => toggle("list")}><List size={18} /></button>
      <button type="button" aria-label="Link" title="Insert link" aria-pressed={!!activeFormats.link} onClick={() => toggle("link")}><Link size={18} /></button>
      <span className="notes-toolbar-separator" aria-hidden="true" />
      <button type="button" aria-label={uploading ? "Uploading image" : "Add image"} title={uploading ? "Uploading image…" : "Add image (or paste / drop)"} disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? <Loader2 size={18} className="spin" /> : <ImagePlus size={18} />}</button>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={event => {
        void addImages(Array.from(event.target.files ?? []));
        event.target.value = "";
      }} />
      <button type="button" aria-label="Undo" title="Undo (Ctrl/⌘ Z)" onClick={() => { editor.current?.undoMgr.undo(); editor.current?.focus(); }}><Undo2 size={18} /></button>
      <button type="button" aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)" onClick={() => { editor.current?.undoMgr.redo(); editor.current?.focus(); }}><Redo2 size={18} /></button>
      <span className="notes-toolbar-spacer" />
      <button type="button" aria-label="Split view" title={split ? "Hide preview" : "Show preview alongside editor"} aria-pressed={split} onClick={() => setSplit(!split)}><Columns2 size={18} /></button>
      <button type="button" aria-label="Save notes" title="Save notes (Ctrl/⌘ S)" disabled={uploading} onClick={saveNow}><Save size={18} /></button>
      <small role="status" className="notes-save-status">{saveStatus}</small>
    </div>
    {error && <div className="notes-error" role="alert">{error} {saveStatus === "Not saved" && <button type="button" onClick={saveNow}>Retry save</button>}</div>}
    <div className="local-notes-panes">
      <section className="local-notes-source" aria-label="Write notes">
        <MarkdownSource initial={initial} editorRef={editor} onChange={update} onSelectionChange={selectionChanged} onFiles={files => void addImages(files)} onError={setError} />
      </section>
      {split && <section className="local-notes-preview" aria-label="Notes preview"><RichNotes value={draft} /></section>}
    </div>
  </section>;
}
