import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { all, get, run, writeTransaction } from "./db.js";

export type VoiceNoteStatus = "pending" | "processing" | "complete" | "failed";
export interface VoiceNoteRecord { id: string; title: string; createdAt: string; durationSeconds: number; mimeType: string; size: number; transcriptionStatus: VoiceNoteStatus; transcript: string | null; transcriptionError: string | null; audioUrl: string; }
interface VoiceNoteRow { id: string; owner_email: string; title: string; created_at: string; duration_seconds: number; mime_type: string; stored_name: string; size: number; transcription_status: VoiceNoteStatus; transcript: string | null; transcription_error: string | null; }

const extensions: Record<string, string> = { "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav" };
const mapNote = (row: VoiceNoteRow): VoiceNoteRecord => ({ id: row.id, title: row.title, createdAt: row.created_at, durationSeconds: Number(row.duration_seconds), mimeType: row.mime_type, size: Number(row.size), transcriptionStatus: row.transcription_status, transcript: row.transcript, transcriptionError: row.transcription_error, audioUrl: `/api/voice-notes/${row.id}/audio` });

export function listVoiceNotes(owner: string) { return all<VoiceNoteRow>("SELECT * FROM voice_notes WHERE owner_email = $owner ORDER BY created_at DESC", { $owner: owner }).map(mapNote); }
export function getVoiceNote(owner: string, id: string) { const row = get<VoiceNoteRow>("SELECT * FROM voice_notes WHERE owner_email = $owner AND id = $id", { $owner: owner, $id: id }); return row ? mapNote(row) : null; }
export function getVoiceNoteFile(owner: string, id: string) { const row = get<VoiceNoteRow>("SELECT * FROM voice_notes WHERE owner_email = $owner AND id = $id", { $owner: owner, $id: id }); return row ? { ...mapNote(row), path: path.join(config.uploadsPath, row.stored_name) } : null; }

export function saveVoiceNote(owner: string, input: { id: string; title: string; createdAt: string; durationSeconds: number; mimeType: string; bytes: Buffer }) {
  const existing = getVoiceNote(owner, input.id); if (existing) return existing;
  const extension = extensions[input.mimeType]; if (!extension) return null;
  fs.mkdirSync(config.uploadsPath, { recursive: true, mode: 0o700 });
  const storedName = `voice-${crypto.randomUUID()}${extension}`;
  fs.writeFileSync(path.join(config.uploadsPath, storedName), input.bytes, { mode: 0o600, flag: "wx" });
  try { writeTransaction(() => run("INSERT INTO voice_notes (id, owner_email, title, created_at, duration_seconds, mime_type, stored_name, size, transcription_status) VALUES ($id, $owner, $title, $createdAt, $duration, $mime, $stored, $size, 'pending')", { $id: input.id, $owner: owner, $title: input.title, $createdAt: input.createdAt, $duration: input.durationSeconds, $mime: input.mimeType, $stored: storedName, $size: input.bytes.length })); }
  catch (error) { fs.unlinkSync(path.join(config.uploadsPath, storedName)); throw error; }
  return getVoiceNote(owner, input.id)!;
}

export function setTranscription(id: string, status: VoiceNoteStatus, transcript: string | null = null, error: string | null = null) { writeTransaction(() => run("UPDATE voice_notes SET transcription_status = $status, transcript = $transcript, transcription_error = $error WHERE id = $id", { $id: id, $status: status, $transcript: transcript, $error: error })); }
export function pendingVoiceNotes() { return all<VoiceNoteRow>("SELECT * FROM voice_notes WHERE transcription_status IN ('pending', 'processing') ORDER BY created_at"); }
export function deleteVoiceNote(owner: string, id: string) { const file = getVoiceNoteFile(owner, id); if (!file) return false; writeTransaction(() => run("DELETE FROM voice_notes WHERE owner_email = $owner AND id = $id", { $owner: owner, $id: id })); try { fs.unlinkSync(file.path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Could not delete voice note audio", error); } return true; }
