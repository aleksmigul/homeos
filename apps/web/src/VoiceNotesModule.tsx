import { AudioLines, Download, Mic, MicOff, Pencil, Play, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface StoredVoiceNote { id: string; title: string; createdAt: string; durationSeconds: number; mimeType: string; audio: Blob; }
interface VoiceNote extends StoredVoiceNote { url: string; }
const databaseName = "homeos-voice-notes";
const storeName = "voice-notes";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readNotes() {
  const database = await openDatabase();
  return new Promise<StoredVoiceNote[]>((resolve, reject) => {
    const transaction = database.transaction(storeName);
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function writeNote(note: StoredVoiceNote) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(note);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function removeNote(id: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
}

function formatDuration(totalSeconds: number) {
  return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
}
function extensionFor(mimeType: string) { return mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm"; }

export function VoiceNotesModule() {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startedAt = useRef(0);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    let active = true;
    readNotes().then((stored) => { if (active) setNotes(stored.map((note) => ({ ...note, url: URL.createObjectURL(note.audio) }))); })
      .catch(() => setError("Saved recordings could not be opened on this device."));
    return () => { active = false; stream.current?.getTracks().forEach((track) => track.stop()); };
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  async function startRecording() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Audio recording is not supported by this browser."); return; }
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const nextRecorder = new MediaRecorder(audioStream);
      stream.current = audioStream; recorder.current = nextRecorder; chunks.current = []; startedAt.current = Date.now(); setElapsed(0);
      nextRecorder.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      nextRecorder.onstop = () => void saveRecording(nextRecorder.mimeType);
      nextRecorder.start(); setIsRecording(true);
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "Microphone access was denied. Allow it in your browser settings and try again." : "The microphone could not be started.");
    }
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; setIsRecording(false);
  }

  async function saveRecording(mimeType: string) {
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    const audio = new Blob(chunks.current, { type: mimeType || "audio/webm" });
    const createdAt = new Date().toISOString();
    const note: StoredVoiceNote = { id: crypto.randomUUID(), title: `Voice note · ${new Date(createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`, createdAt, durationSeconds, mimeType: audio.type, audio };
    try { await writeNote(note); setNotes((items) => [{ ...note, url: URL.createObjectURL(audio) }, ...items]); }
    catch { setError("The recording finished, but could not be saved on this device."); }
  }

  async function renameNote(note: VoiceNote) {
    const title = window.prompt("Voice note title", note.title)?.trim(); if (!title || title === note.title) return;
    const updated = { ...note, title }; await writeNote(updated); setNotes((items) => items.map((item) => item.id === note.id ? updated : item));
  }
  async function deleteNote(note: VoiceNote) {
    if (!window.confirm(`Delete “${note.title}”? This recording is stored only on this device.`)) return;
    await removeNote(note.id); URL.revokeObjectURL(note.url); setNotes((items) => items.filter((item) => item.id !== note.id));
  }

  return <section className="workspace voice-workspace">
    <header className="topbar voice-topbar"><div><p className="eyebrow">Capture now, process later</p><h1>Voice notes</h1></div><span className="voice-local-badge">Stored on this device</span></header>
    <div className="voice-layout">
      <section className={isRecording ? "voice-recorder recording" : "voice-recorder"}>
        <div className="voice-orb">{isRecording ? <AudioLines size={34} /> : <Mic size={34} />}</div>
        <div className="voice-recorder-copy"><h2>{isRecording ? "Recording…" : "Record a voice memo"}</h2><p>{isRecording ? formatDuration(elapsed) : "Your browser will ask for microphone access the first time."}</p></div>
        <button className={isRecording ? "voice-stop" : "primary-button voice-start"} type="button" onClick={isRecording ? stopRecording : () => void startRecording()}>{isRecording ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}<span>{isRecording ? "Stop & save" : "Start recording"}</span></button>
      </section>
      {error ? <p className="inline-error voice-error">{error}</p> : null}
      <div className="voice-roadmap"><MicOff size={18} /><span><strong>Transcription is not connected yet.</strong> Recordings stay in this browser and are not uploaded. A backend transcription queue can be added next.</span></div>
      <section className="voice-library">
        <div className="voice-section-heading"><div><p className="eyebrow">Library</p><h2>Recordings</h2></div><span>{notes.length} {notes.length === 1 ? "note" : "notes"}</span></div>
        {notes.length ? <div className="voice-list">{notes.map((note) => <article className="voice-card" key={note.id}>
          <span className="voice-card-icon"><Play size={18} fill="currentColor" /></span>
          <div className="voice-card-copy"><strong>{note.title}</strong><small>{new Date(note.createdAt).toLocaleString()} · {formatDuration(note.durationSeconds)}</small><audio controls preload="metadata" src={note.url}>Your browser does not support audio playback.</audio></div>
          <div className="voice-card-actions"><button type="button" title="Rename" aria-label={`Rename ${note.title}`} onClick={() => void renameNote(note)}><Pencil size={16} /></button><a href={note.url} download={`${note.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${extensionFor(note.mimeType)}`} title="Download" aria-label={`Download ${note.title}`}><Download size={16} /></a><button className="danger" type="button" title="Delete" aria-label={`Delete ${note.title}`} onClick={() => void deleteNote(note)}><Trash2 size={16} /></button></div>
        </article>)}</div> : <div className="todo-empty voice-empty"><Mic size={30} /><h2>No voice notes yet</h2><p>Your recordings will appear here after you stop and save them.</p></div>}
      </section>
    </div>
  </section>;
}
