import { randomUUID } from "node:crypto";
import type { CreateSharedNoteInput, SharedNote, UpdateSharedNoteInput } from "@homeos/shared";
import { all, get, run, writeTransaction } from "./db.js";

type NoteRow = { id: string; title: string; content: string; created_at: string; updated_at: string; updated_by: string };
const mapNote = (row: NoteRow): SharedNote => ({ id: row.id, title: row.title, content: row.content, createdAt: row.created_at, updatedAt: row.updated_at, updatedBy: row.updated_by });

export function listNotes() {
  return all<NoteRow>("SELECT * FROM shared_notes ORDER BY updated_at DESC").map(mapNote);
}

export function getNote(id: string) {
  const row = get<NoteRow>("SELECT * FROM shared_notes WHERE id = $id", { $id: id });
  return row ? mapNote(row) : null;
}

export function createNote(input: CreateSharedNoteInput, updatedBy: string) {
  const now = new Date().toISOString();
  const note: SharedNote = { id: randomUUID(), title: input.title.trim(), content: input.content?.trim() ?? "", createdAt: now, updatedAt: now, updatedBy };
  writeTransaction(() => run("INSERT INTO shared_notes (id, title, content, created_at, updated_at, updated_by) VALUES ($id, $title, $content, $createdAt, $updatedAt, $updatedBy)", { $id: note.id, $title: note.title, $content: note.content, $createdAt: note.createdAt, $updatedAt: note.updatedAt, $updatedBy: note.updatedBy }));
  return note;
}

export function updateNote(id: string, input: UpdateSharedNoteInput, updatedBy: string) {
  const existing = get<NoteRow>("SELECT * FROM shared_notes WHERE id = $id", { $id: id });
  if (!existing) return { kind: "missing" as const };
  if (existing.updated_at !== input.expectedUpdatedAt) return { kind: "conflict" as const, note: mapNote(existing) };
  const updatedAt = new Date().toISOString();
  writeTransaction(() => run("UPDATE shared_notes SET title = $title, content = $content, updated_at = $updatedAt, updated_by = $updatedBy WHERE id = $id", { $id: id, $title: input.title.trim(), $content: input.content?.trim() ?? "", $updatedAt: updatedAt, $updatedBy: updatedBy }));
  return { kind: "updated" as const, note: getNote(id)! };
}

export function deleteNote(id: string) {
  if (!get("SELECT id FROM shared_notes WHERE id = $id", { $id: id })) return false;
  writeTransaction(() => run("DELETE FROM shared_notes WHERE id = $id", { $id: id }));
  return true;
}
