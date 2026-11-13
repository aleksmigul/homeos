import { ArrowLeft, Bookmark, BookmarkPlus, ClipboardPaste, ExternalLink, Inbox, Loader2, Share2, Trash2, X } from "lucide-react";
import { ClipboardEvent, FormEvent, useEffect, useState } from "react";
import type { CaptureStream, CreateSavedItemInput, SavedAttachment, SavedItem } from "@homeos/shared";
import { createSavedItem, deleteSavedItem, listCaptureStreams, listSavedItems, uploadSavedFile } from "./api";
import { currentNavigation, pushNavigation } from "./navigation";

export interface SharedDraft { title: string; text: string; url: string; attachmentIds: string[]; error: string }

export function BookmarksModule({ sharedDraft, onSharedDraftDone }: { sharedDraft: SharedDraft | null; onSharedDraftDone: (saved: boolean) => void }) {
  const [streams, setStreams] = useState<CaptureStream[]>([]);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [activeStreamId, setActiveStreamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [addingBookmark, setAddingBookmark] = useState(false);
  const [openImage, setOpenImage] = useState<SavedAttachment | null>(null);

  async function refresh(streamId = activeStreamId) {
    setLoading(true);
    try {
      const { streams: nextStreams } = await listCaptureStreams();
      const selectedId = streamId || nextStreams[0]?.id || "";
      setStreams(nextStreams); setActiveStreamId(selectedId);
      setItems(selectedId ? (await listSavedItems(selectedId)).items : []);
    } finally { setLoading(false); }
  }

  useEffect(() => { void refresh(""); }, []);
  useEffect(() => {
    const syncImage = () => {
      const id = currentNavigation().imageId;
      setOpenImage(id ? items.flatMap((item) => item.attachments).find((attachment) => attachment.id === id && isPreviewable(attachment)) ?? null : null);
    };
    syncImage();
    window.addEventListener("popstate", syncImage);
    return () => window.removeEventListener("popstate", syncImage);
  }, [items]);

  function viewImage(attachment: SavedAttachment) { pushNavigation({ module: "bookmarks", imageId: attachment.id }); setOpenImage(attachment); }
  async function removeItem(item: SavedItem) {
    if (!window.confirm(`Delete ${item.title ? `“${item.title}”` : "this saved item"}?`)) return;
    await deleteSavedItem(item.id);
    await refresh(activeStreamId);
  }

  return <section className="workspace saved-workspace">
    <header className="topbar"><div><p className="eyebrow">Shared household</p><h1>Bookmarks</h1></div><button className="primary-button add-action" onClick={() => setAddingBookmark(true)} aria-label="Add bookmark"><BookmarkPlus size={17} /><span>Add bookmark</span></button></header>
    <div className="saved-content">
      {loading ? <div className="saved-empty"><Loader2 className="spin" /></div> : items.length ? <div className="saved-list">{items.map((item) => <article className="saved-card" key={item.id}>
        <div className="saved-card-head"><span><Share2 size={14} />{item.source === "share-target" ? "Shared" : "Saved"}</span><div><time>{new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time><button type="button" onClick={() => void removeItem(item)} aria-label="Delete saved item"><Trash2 size={15} /></button></div></div>
        {item.title ? <h2>{item.title}</h2> : null}{item.text ? <p>{item.text}</p> : null}
        {item.attachments.length ? <div className="saved-images">{item.attachments.map((attachment) => isPreviewable(attachment) ? <button type="button" onClick={() => viewImage(attachment)} key={attachment.id}><img src={attachment.url} alt={attachment.name} loading="lazy" /></button> : <a className="saved-file" key={attachment.id} href={attachment.url} download={attachment.name}>{attachment.name} · {formatSize(attachment.size)}</a>)}</div> : null}
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{displayUrl(item.url)}<ExternalLink size={14} /></a> : null}
      </article>)}</div> : <div className="saved-empty"><Inbox size={30} /><h2>Nothing here yet</h2><p>Add a bookmark here, or share a link or message to The Annexation.</p><button className="primary-button add-action" type="button" onClick={() => setAddingBookmark(true)}><BookmarkPlus size={17} /><span>Add bookmark</span></button></div>}
    </div>
    {addingBookmark ? <ManualBookmarkDialog streams={streams} initialStreamId={activeStreamId} onCancel={() => setAddingBookmark(false)} onSave={async (input) => { await createSavedItem(input); setAddingBookmark(false); setActiveStreamId(input.streamId); await refresh(input.streamId); }} /> : null}
    {sharedDraft ? <ShareCapture draft={sharedDraft} streams={streams} onCancel={() => onSharedDraftDone(false)} onSave={async (input) => { await createSavedItem(input); setActiveStreamId(input.streamId); await refresh(input.streamId); onSharedDraftDone(true); }} /> : null}
    {openImage ? <div className="image-viewer" role="dialog" aria-modal="true" aria-label={openImage.name}><header><button type="button" onClick={() => window.history.back()}><ArrowLeft size={21} />Back</button><span>{openImage.name}</span></header><div><img src={openImage.url} alt={openImage.name} /></div></div> : null}
  </section>;
}

function ManualBookmarkDialog({ streams, initialStreamId, onCancel, onSave }: { streams: CaptureStream[]; initialStreamId: string; onCancel: () => void; onSave: (input: CreateSavedItemInput) => Promise<void> }) {
  const [streamId, setStreamId] = useState(initialStreamId || streams[0]?.id || "");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [attachments, setAttachments] = useState<SavedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function uploadFiles(files: File[]) {
    if (!files.length || uploading || saving) return;
    if (attachments.length + files.length > 10) { setError("A bookmark can have up to 10 files."); return; }
    if (files.some((file) => file.size > 12 * 1024 * 1024)) { setError("Each file must be 12 MB or smaller."); return; }
    setUploading(true); setError("");
    try {
      for (const file of files) {
        const { attachment } = await uploadSavedFile(file);
        setAttachments((current) => [...current, attachment]);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload file"); }
    finally { setUploading(false); }
  }

  async function pasteFiles(event: ClipboardEvent<HTMLFormElement>) {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    event.preventDefault();
    await uploadFiles(files);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedUrl = normalizeUrl(url);
    if (!streamId || uploading || !(title.trim() || text.trim() || normalizedUrl || attachments.length)) return;
    setSaving(true); setError("");
    try { await onSave({ streamId, title, text, url: normalizedUrl, attachmentIds: attachments.map((attachment) => attachment.id), source: "manual" }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add bookmark"); setSaving(false); }
  }

  return <div className="modal-backdrop share-backdrop"><form className="share-dialog" onSubmit={submit} onPaste={(event) => void pasteFiles(event)}>
    <div className="share-dialog-head"><div><p className="eyebrow">Shared bookmarks</p><h2>Add a bookmark</h2></div><button type="button" onClick={onCancel} aria-label="Cancel"><X size={20} /></button></div>
    <label><span>Title <small className="optional">Optional</small></span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Something worth keeping" /></label>
    <label><span>Link <small className="optional">Optional</small></span><input inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="example.com/article" /></label>
    <label><span>Notes <small className="optional">Optional</small></span><textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder="Why are you saving this?" /></label>
    <label><span>Files <small className="optional">Up to 10 files, 12 MB each</small></span><input type="file" multiple disabled={uploading || saving} onChange={(event) => { void uploadFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></label>
    <div className="paste-images-hint"><ClipboardPaste size={17} /><span>{uploading ? "Uploading files…" : "You can also paste files anywhere in this window"}</span></div>
    {attachments.length ? <div className="share-images pasted-images">{attachments.map((attachment) => <div key={attachment.id}>{isPreviewable(attachment) ? <img src={attachment.url} alt={attachment.name} /> : <span className="saved-file">{attachment.name} · {formatSize(attachment.size)}</span>}<button type="button" onClick={() => setAttachments((current) => current.filter(({ id }) => id !== attachment.id))} aria-label={`Remove ${attachment.name}`}><X size={15} /></button></div>)}</div> : null}
    {error ? <p className="form-error">{error}</p> : null}
    <button className="primary-button share-save" disabled={saving || uploading || !streamId || !(title.trim() || text.trim() || url.trim() || attachments.length)}>{saving || uploading ? <Loader2 className="spin" size={17} /> : <BookmarkPlus size={17} />}Add bookmark</button>
  </form></div>;
}

function ShareCapture({ draft, streams, onCancel, onSave }: { draft: SharedDraft; streams: CaptureStream[]; onCancel: () => void; onSave: (input: CreateSavedItemInput) => Promise<void> }) {
  const [streamId, setStreamId] = useState("");
  const [title, setTitle] = useState(draft.title);
  const [text, setText] = useState(draft.text);
  const [url, setUrl] = useState(draft.url);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!streamId && streams[0]) setStreamId(streams[0].id); }, [streams, streamId]);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { await onSave({ streamId, title, text, url, attachmentIds: draft.attachmentIds, source: "share-target" }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save"); setSaving(false); } }
  return <div className="modal-backdrop share-backdrop"><form className="share-dialog" onSubmit={submit}>
    <div className="share-dialog-head"><div><p className="eyebrow">Shared with The Annexation</p><h2>Save this for later</h2></div><button type="button" onClick={onCancel} aria-label="Cancel"><X size={20} /></button></div>
    <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional title" /></label>
    <label>Message<textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder="Shared text" /></label>
    <label>Link<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
    {draft.attachmentIds.length ? <div className="share-images">{draft.attachmentIds.map((id) => <a href={`/api/saved-attachments/${id}`} key={id}>Shared file {draft.attachmentIds.indexOf(id) + 1}</a>)}</div> : null}
    {draft.error || error ? <p className="form-error">{error || draft.error}</p> : null}<button className="primary-button share-save" disabled={saving || !streamId || !(title || text || url || draft.attachmentIds.length)}>{saving ? <Loader2 className="spin" size={17} /> : <Bookmark size={17} />}Save</button>
  </form></div>;
}

function displayUrl(value: string) { try { const url = new URL(value); return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`; } catch { return value; } }
function normalizeUrl(value: string) { const trimmed = value.trim(); return trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed; }
function isPreviewable(attachment: SavedAttachment) { return ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"].includes(attachment.mimeType); }
function formatSize(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
