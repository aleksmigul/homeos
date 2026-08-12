import { ArrowLeft, ChevronRight, FileText, Loader2, Pencil, Plus, StickyNote, Trash2, Users, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CreateSharedNoteInput, SharedNote } from "@homeos/shared";
import { createNote, deleteNote, getNote, listNotes, updateNote } from "./api";
import { MarkdownNotesEditor } from "./components/MarkdownNotesEditor";
import { currentNavigation, pushNavigation } from "./navigation";

export function NotesModule() {
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [selected, setSelected] = useState<SharedNote | null>(null);
  const [editing, setEditing] = useState<SharedNote | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void refresh();
    const initialId = currentNavigation().noteId; if (initialId) void open(initialId, false);
    const onPopState = () => { const id = currentNavigation().noteId; setEditing(null); if (id) void open(id, false); else { setSelected(null); void refresh(); } };
    window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function refresh() { setLoading(true); setError(""); try { setNotes((await listNotes()).notes); } catch (cause) { setError(message(cause)); } finally { setLoading(false); } }
  async function open(id: string, addHistory: boolean) { setLoading(true); setError(""); try { const { note } = await getNote(id); setSelected(note); if (addHistory) pushNavigation({ module: "notes", noteId: id }); } catch (cause) { setError(message(cause)); } finally { setLoading(false); } }
  async function save(input: CreateSharedNoteInput) {
    const response = editing === "new" ? await createNote(input) : await updateNote(editing!.id, { ...input, expectedUpdatedAt: editing!.updatedAt });
    setEditing(null); setSelected(response.note); await refresh();
    if (editing === "new") pushNavigation({ module: "notes", noteId: response.note.id });
  }
  async function remove() { if (!selected || !window.confirm(`Delete “${selected.title}”?`)) return; try { await deleteNote(selected.id); setSelected(null); window.history.back(); } catch (cause) { setError(message(cause)); } }

  if (selected) return <section className="workspace notes-workspace"><header className="topbar detail-topbar notes-detail-topbar"><button className="icon-button" type="button" onClick={() => window.history.back()} aria-label="Back to notes"><ArrowLeft size={20} /></button><div className="detail-title"><p className="eyebrow">Shared note</p><h1>{selected.title}</h1></div><button className="secondary-button touch-button" type="button" onClick={() => setEditing(selected)}><Pencil size={16} />Edit</button></header><article className="note-page"><div className="note-meta"><span><Users size={14} />Household</span><span>Updated {formatDateTime(selected.updatedAt)} by {selected.updatedBy}</span></div>{selected.content.trim() ? <div className="note-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content}</ReactMarkdown></div> : <div className="note-empty-body"><FileText size={28} /><p>This note is empty.</p></div>}<button className="note-delete" type="button" onClick={() => void remove()}><Trash2 size={16} />Delete note</button>{error ? <p className="inline-error">{error}</p> : null}</article>{editing ? <NoteEditor note={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={save} /> : null}</section>;

  return <section className="workspace notes-workspace"><header className="topbar notes-topbar"><div><p className="eyebrow">Shared household</p><h1>Notes</h1></div><button className="primary-button touch-button add-action" type="button" onClick={() => setEditing("new")}><Plus size={18} /><span>New note</span></button></header><div className="notes-library">{error ? <p className="inline-error">{error}</p> : null}{loading ? <div className="skeleton-card" /> : notes.length ? <div className="note-card-grid">{notes.map((note) => <button className="note-card" type="button" key={note.id} onClick={() => void open(note.id, true)}><span className="note-card-icon"><StickyNote size={20} /></span><span className="note-card-copy"><strong>{note.title}</strong><small>{preview(note.content)}</small><time>Updated {formatRelative(note.updatedAt)} by {note.updatedBy}</time></span><ChevronRight size={18} /></button>)}</div> : <div className="notes-empty"><StickyNote size={31} /><h2>No shared notes yet</h2><p>Keep household information, plans, references, and ideas where you can both find them.</p><button className="primary-button add-action" type="button" onClick={() => setEditing("new")}><Plus size={17} /><span>New note</span></button></div>}</div>{editing ? <NoteEditor note={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={save} /> : null}</section>;
}

function NoteEditor({ note, onClose, onSave }: { note: SharedNote | null; onClose: () => void; onSave: (input: CreateSharedNoteInput) => Promise<void> }) {
  const [title, setTitle] = useState(note?.title ?? ""); const [content, setContent] = useState(note?.content ?? ""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); if (!title.trim()) return; setSaving(true); setError(""); try { await onSave({ title, content }); } catch (cause) { setError(message(cause)); setSaving(false); } }
  return <div className="modal-backdrop note-editor-backdrop"><form className="note-editor-dialog" onSubmit={(event) => void submit(event)}><header><div><p className="eyebrow">Shared notes</p><h2>{note ? "Edit note" : "New note"}</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></header><label>Title<input autoFocus value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="Wi-Fi details" /></label><label>Note<MarkdownNotesEditor value={content} onChange={setContent} onCommit={() => undefined} /></label>{error ? <p className="form-error">{error}</p> : null}<footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || !title.trim()}>{saving ? <Loader2 className="spin" size={17} /> : null}Save note</button></footer></form></div>;
}

function preview(content: string) { return content.replace(/[#*_`>\[\]-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 110) || "Empty note"; }
function formatRelative(value: string) { const elapsed = Date.now() - new Date(value).getTime(); const minutes = Math.max(0, Math.floor(elapsed / 60000)); if (minutes < 1) return "just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; const days = Math.floor(hours / 24); return days < 7 ? `${days}d ago` : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function message(cause: unknown) { return cause instanceof Error ? cause.message : "Something went wrong"; }
