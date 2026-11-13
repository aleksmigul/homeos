import fs from "node:fs";
import { config } from "./config.js";
import { getVoiceNoteFile, pendingVoiceNotes, setTranscription } from "./voiceNoteRepository.js";

const active = new Set<string>();
export function queueTranscription(owner: string, id: string) {
  if (active.has(id)) return;
  active.add(id);
  void transcribe(owner, id).finally(() => active.delete(id));
}

async function transcribe(owner: string, id: string) {
  if (!config.openAiApiKey) { setTranscription(id, "pending", null, "Transcription is waiting for server configuration."); return; }
  const note = getVoiceNoteFile(owner, id); if (!note) return;
  setTranscription(id, "processing");
  try {
    const form = new FormData();
    form.set("model", config.transcriptionModel);
    form.set("file", new Blob([fs.readFileSync(note.path)], { type: note.mimeType }), `recording.${note.path.split(".").pop()}`);
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${config.openAiApiKey}` }, body: form });
    const body = await response.json() as { text?: string; error?: { message?: string } };
    if (!response.ok || typeof body.text !== "string") throw new Error(body.error?.message ?? `Transcription failed (${response.status})`);
    setTranscription(id, "complete", body.text.trim());
  } catch (error) { setTranscription(id, "failed", null, error instanceof Error ? error.message.slice(0, 500) : "Transcription failed"); }
}

export function resumeTranscriptions() { for (const note of pendingVoiceNotes()) queueTranscription(note.owner_email, note.id); }
