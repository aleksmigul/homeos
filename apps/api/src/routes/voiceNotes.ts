import fs from "node:fs";
import express from "express";
import { z } from "zod";
import { getAuthenticatedUser } from "../auth.js";
import { deleteVoiceNote, getVoiceNoteFile, listVoiceNotes, saveVoiceNote } from "../voiceNoteRepository.js";
import { queueTranscription } from "../transcription.js";

export const voiceNotesRouter = express.Router();
const userEmail = (req: express.Request) => getAuthenticatedUser(req)!.email;
const audioTypes = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav"];
voiceNotesRouter.get("/voice-notes", (req, res) => res.json({ voiceNotes: listVoiceNotes(userEmail(req)) }));
voiceNotesRouter.post("/voice-notes", express.raw({ type: audioTypes, limit: "25mb" }), (req, res) => {
  const meta = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(300), createdAt: z.string().datetime(), durationSeconds: z.coerce.number().int().min(1).max(14400) }).parse({ id: req.header("X-Voice-Id"), title: decodeURIComponent(req.header("X-Voice-Title") ?? ""), createdAt: req.header("X-Voice-Created-At"), durationSeconds: req.header("X-Voice-Duration") });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "Audio is empty" });
  const owner = userEmail(req); const mimeType = req.headers["content-type"]?.split(";")[0] ?? "";
  const note = saveVoiceNote(owner, { ...meta, mimeType, bytes: req.body });
  if (!note) return res.status(415).json({ error: "Unsupported audio type" });
  queueTranscription(owner, note.id); res.status(201).json({ voiceNote: note });
});
voiceNotesRouter.get("/voice-notes/:id/audio", (req, res) => { const note = getVoiceNoteFile(userEmail(req), req.params.id); if (!note || !fs.existsSync(note.path)) return res.status(404).json({ error: "Recording not found" }); res.type(note.mimeType); res.setHeader("Content-Length", note.size); res.sendFile(note.path); });
voiceNotesRouter.delete("/voice-notes/:id", (req, res) => deleteVoiceNote(userEmail(req), req.params.id) ? res.status(204).end() : res.status(404).json({ error: "Recording not found" }));
