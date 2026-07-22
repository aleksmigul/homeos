import { ArrowLeft, Bookmark, ExternalLink, Inbox, Loader2, Plus, Share2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { CaptureStream, CreateSavedItemInput, SavedAttachment, SavedItem } from "@homeos/shared";
import { createCaptureStream, createSavedItem, listCaptureStreams, listSavedItems } from "./api";
import { currentNavigation, pushNavigation } from "./navigation";

export interface SharedDraft { title: string; text: string; url: string; attachmentIds: string[]; error: string }

export function SavedModule({ sharedDraft, onSharedDraftDone }: { sharedDraft: SharedDraft | null; onSharedDraftDone: (saved: boolean) => void }) {
  const [streams, setStreams] = useState<CaptureStream[]>([]);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [activeStreamId, setActiveStreamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [newStreamName, setNewStreamName] = useState("");
  const [addingStream, setAddingStream] = useState(false);
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
      setOpenImage(id ? items.flatMap((item) => item.attachments).find((attachment) => attachment.id === id) ?? null : null);
    };
    syncImage();
    window.addEventListener("popstate", syncImage);
    return () => window.removeEventListener("popstate", syncImage);
  }, [items]);

  function viewImage(attachment: SavedAttachment) { pushNavigation({ module: "saved", imageId: attachment.id }); setOpenImage(attachment); }

  async function addStream(event: FormEvent) {
    event.preventDefault();
    if (!newStreamName.trim()) return;
    const { stream } = await createCaptureStream({ name: newStreamName });
    setStreams((current) => [...current, stream]); setItems([]); setNewStreamName(""); setAddingStream(false); setActiveStreamId(stream.id);
  }

  return <section className="workspace saved-workspace">
    <header className="topbar"><div><p className="eyebrow">Your library</p><h1>Saved</h1></div><button className="secondary-button" onClick={() => setAddingStream(true)}><Plus size={16} />New stream</button></header>
    <nav className="stream-tabs" aria-label="Saved streams">
      {streams.map((stream) => <button key={stream.id} className={stream.id === activeStreamId ? "active" : ""} onClick={() => { setActiveStreamId(stream.id); setLoading(true); void listSavedItems(stream.id).then(({ items: next }) => setItems(next)).finally(() => setLoading(false)); }}><Bookmark size={15} />{stream.name}<span>{stream.itemCount}</span></button>)}
    </nav>
    <div className="saved-content">
      {loading ? <div className="saved-empty"><Loader2 className="spin" /></div> : items.length ? <div className="saved-list">{items.map((item) => <article className="saved-card" key={item.id}>
        <div className="saved-card-head"><span><Share2 size={14} />{item.source === "share-target" ? "Shared" : "Saved"}</span><time>{new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time></div>
        {item.title ? <h2>{item.title}</h2> : null}{item.text ? <p>{item.text}</p> : null}
        {item.attachments.length ? <div className="saved-images">{item.attachments.map((attachment) => <button type="button" onClick={() => viewImage(attachment)} key={attachment.id}><img src={attachment.url} alt={attachment.name} loading="lazy" /></button>)}</div> : null}
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{displayUrl(item.url)}<ExternalLink size={14} /></a> : null}
      </article>)}</div> : <div className="saved-empty"><Inbox size={30} /><h2>Nothing here yet</h2><p>Share a link or message to The Annexation, then save it to this stream.</p></div>}
    </div>
    {addingStream ? <div className="modal-backdrop"><form className="compact-dialog" onSubmit={addStream}><button className="dialog-close" type="button" onClick={() => setAddingStream(false)} aria-label="Close"><X size={19} /></button><p className="eyebrow">New stream</p><h2>What are you collecting?</h2><label>Name<input autoFocus value={newStreamName} onChange={(event) => setNewStreamName(event.target.value)} placeholder="Recipes" /></label><button className="primary-button" type="submit">Create stream</button></form></div> : null}
    {sharedDraft ? <ShareCapture draft={sharedDraft} streams={streams} onCancel={() => onSharedDraftDone(false)} onSave={async (input) => { await createSavedItem(input); setActiveStreamId(input.streamId); await refresh(input.streamId); onSharedDraftDone(true); }} /> : null}
    {openImage ? <div className="image-viewer" role="dialog" aria-modal="true" aria-label={openImage.name}><header><button type="button" onClick={() => window.history.back()}><ArrowLeft size={21} />Back</button><span>{openImage.name}</span></header><div><img src={openImage.url} alt={openImage.name} /></div></div> : null}
  </section>;
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
    <label>Save to<select value={streamId} onChange={(event) => setStreamId(event.target.value)}>{streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select></label>
    <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional title" /></label>
    <label>Message<textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder="Shared text" /></label>
    <label>Link<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
    {draft.attachmentIds.length ? <div className="share-images">{draft.attachmentIds.map((id) => <img src={`/api/saved-attachments/${id}`} alt="Shared preview" key={id} />)}</div> : null}
    {draft.error || error ? <p className="form-error">{error || draft.error}</p> : null}<button className="primary-button share-save" disabled={saving || !streamId || !(title || text || url || draft.attachmentIds.length)}>{saving ? <Loader2 className="spin" size={17} /> : <Bookmark size={17} />}Save</button>
  </form></div>;
}

function displayUrl(value: string) { try { const url = new URL(value); return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`; } catch { return value; } }
