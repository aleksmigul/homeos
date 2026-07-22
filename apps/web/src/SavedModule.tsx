import { Bookmark, ExternalLink, Inbox, Loader2, Plus, Share2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { CaptureStream, CreateSavedItemInput, SavedItem } from "@homeos/shared";
import { createCaptureStream, createSavedItem, listCaptureStreams, listSavedItems } from "./api";

export interface SharedDraft { title: string; text: string; url: string }

export function SavedModule({ sharedDraft, onSharedDraftDone }: { sharedDraft: SharedDraft | null; onSharedDraftDone: (saved: boolean) => void }) {
  const [streams, setStreams] = useState<CaptureStream[]>([]);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [activeStreamId, setActiveStreamId] = useState("bookmarks");
  const [loading, setLoading] = useState(true);
  const [newStreamName, setNewStreamName] = useState("");
  const [addingStream, setAddingStream] = useState(false);

  async function refresh(streamId = activeStreamId) {
    setLoading(true);
    try {
      const [{ streams: nextStreams }, { items: nextItems }] = await Promise.all([listCaptureStreams(), listSavedItems(streamId)]);
      setStreams(nextStreams); setItems(nextItems);
    } finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [activeStreamId]);

  async function addStream(event: FormEvent) {
    event.preventDefault();
    if (!newStreamName.trim()) return;
    const { stream } = await createCaptureStream({ name: newStreamName });
    setStreams((current) => [...current, stream]); setNewStreamName(""); setAddingStream(false); setActiveStreamId(stream.id);
  }

  return <section className="workspace saved-workspace">
    <header className="topbar"><div><p className="eyebrow">Your library</p><h1>Saved</h1></div><button className="secondary-button" onClick={() => setAddingStream(true)}><Plus size={16} />New stream</button></header>
    <nav className="stream-tabs" aria-label="Saved streams">
      {streams.map((stream) => <button key={stream.id} className={stream.id === activeStreamId ? "active" : ""} onClick={() => setActiveStreamId(stream.id)}><Bookmark size={15} />{stream.name}<span>{stream.itemCount}</span></button>)}
    </nav>
    <div className="saved-content">
      {loading ? <div className="saved-empty"><Loader2 className="spin" /></div> : items.length ? <div className="saved-list">{items.map((item) => <article className="saved-card" key={item.id}>
        <div className="saved-card-head"><span><Share2 size={14} />{item.source === "share-target" ? "Shared" : "Saved"}</span><time>{new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time></div>
        {item.title ? <h2>{item.title}</h2> : null}{item.text ? <p>{item.text}</p> : null}
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{displayUrl(item.url)}<ExternalLink size={14} /></a> : null}
      </article>)}</div> : <div className="saved-empty"><Inbox size={30} /><h2>Nothing here yet</h2><p>Share a link or message to The Annexation, then save it to this stream.</p></div>}
    </div>
    {addingStream ? <div className="modal-backdrop"><form className="compact-dialog" onSubmit={addStream}><button className="dialog-close" type="button" onClick={() => setAddingStream(false)} aria-label="Close"><X size={19} /></button><p className="eyebrow">New stream</p><h2>What are you collecting?</h2><label>Name<input autoFocus value={newStreamName} onChange={(event) => setNewStreamName(event.target.value)} placeholder="Recipes" /></label><button className="primary-button" type="submit">Create stream</button></form></div> : null}
    {sharedDraft ? <ShareCapture draft={sharedDraft} streams={streams} onCancel={() => onSharedDraftDone(false)} onSave={async (input) => { await createSavedItem(input); setActiveStreamId(input.streamId); await refresh(input.streamId); onSharedDraftDone(true); }} /> : null}
  </section>;
}

function ShareCapture({ draft, streams, onCancel, onSave }: { draft: SharedDraft; streams: CaptureStream[]; onCancel: () => void; onSave: (input: CreateSavedItemInput) => Promise<void> }) {
  const [streamId, setStreamId] = useState("bookmarks");
  const [title, setTitle] = useState(draft.title);
  const [text, setText] = useState(draft.text);
  const [url, setUrl] = useState(draft.url);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { await onSave({ streamId, title, text, url, source: "share-target" }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save"); setSaving(false); } }
  return <div className="modal-backdrop share-backdrop"><form className="share-dialog" onSubmit={submit}>
    <div className="share-dialog-head"><div><p className="eyebrow">Shared with The Annexation</p><h2>Save this for later</h2></div><button type="button" onClick={onCancel} aria-label="Cancel"><X size={20} /></button></div>
    <label>Save to<select value={streamId} onChange={(event) => setStreamId(event.target.value)}>{streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select></label>
    <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional title" /></label>
    <label>Message<textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder="Shared text" /></label>
    <label>Link<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
    {error ? <p className="form-error">{error}</p> : null}<button className="primary-button share-save" disabled={saving || !streamId || !(title || text || url)}>{saving ? <Loader2 className="spin" size={17} /> : <Bookmark size={17} />}Save</button>
  </form></div>;
}

function displayUrl(value: string) { try { const url = new URL(value); return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`; } catch { return value; } }
