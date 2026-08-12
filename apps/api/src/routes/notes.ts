import { Router } from "express";
import { z } from "zod";
import { getAuthenticatedUser } from "../auth.js";
import { createNote, deleteNote, getNote, listNotes, updateNote } from "../noteRepository.js";

export const noteRouter = Router();
const noteSchema = z.object({ title: z.string().trim().min(1).max(200), content: z.string().max(100000).optional() });
const editor = (req: Parameters<typeof getAuthenticatedUser>[0]) => getAuthenticatedUser(req)!.name;

noteRouter.get("/notes", (_req, res) => res.json({ notes: listNotes() }));
noteRouter.post("/notes", (req, res, next) => { try { res.status(201).json({ note: createNote(noteSchema.parse(req.body), editor(req)) }); } catch (error) { next(error); } });
noteRouter.get("/notes/:id", (req, res) => { const note = getNote(req.params.id); if (!note) return res.status(404).json({ error: "Note not found" }); res.json({ note }); });
noteRouter.put("/notes/:id", (req, res, next) => {
  try {
    const input = noteSchema.extend({ expectedUpdatedAt: z.string().datetime() }).parse(req.body);
    const result = updateNote(req.params.id, input, editor(req));
    if (result.kind === "missing") return res.status(404).json({ error: "Note not found" });
    if (result.kind === "conflict") return res.status(409).json({ error: "This note changed since you opened it. Close the editor and try again.", note: result.note });
    res.json({ note: result.note });
  } catch (error) { next(error); }
});
noteRouter.delete("/notes/:id", (req, res) => { if (!deleteNote(req.params.id)) return res.status(404).json({ error: "Note not found" }); res.status(204).end(); });
