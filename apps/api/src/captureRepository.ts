import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CaptureStream, CreateSavedItemInput, SavedAttachment, SavedItem } from "@homeos/shared";
import { config } from "./config.js";
import { all, get, run, writeTransaction } from "./db.js";

type StreamRow = { id: string; name: string; item_count: number; created_at: string };
type ItemRow = { id: string; stream_id: string; title: string; text_content: string; url: string; source: string; created_at: string };
type AttachmentRow = { id: string; original_name: string; stored_name: string; mime_type: string; size: number };

const mapStream = (row: StreamRow): CaptureStream => ({ id: row.id, name: row.name, itemCount: Number(row.item_count), createdAt: row.created_at });
const mapAttachment = (row: AttachmentRow): SavedAttachment => ({ id: row.id, name: row.original_name, mimeType: row.mime_type, size: Number(row.size), url: `/api/saved-attachments/${row.id}` });

function ensureBookmarks() {
  const existing = get<{ id: string }>("SELECT id FROM capture_streams WHERE owner_email = '__shared__' LIMIT 1");
  if (existing) return existing.id;
  const id = randomUUID();
  writeTransaction(() => run("INSERT INTO capture_streams (id, owner_email, name, created_at) VALUES ($id, '__shared__', 'Bookmarks', $createdAt)", { $id: id, $createdAt: new Date().toISOString() }));
  return id;
}

function removeExpiredPendingAttachments(ownerEmail: string) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const expired = all<AttachmentRow>("SELECT id, original_name, stored_name, mime_type, size FROM saved_attachments WHERE owner_email = $owner AND item_id IS NULL AND created_at < $cutoff AND NOT EXISTS (SELECT 1 FROM travel_rows WHERE instr(notes, saved_attachments.id) > 0)", { $owner: ownerEmail, $cutoff: cutoff });
  if (!expired.length) return;
  for (const attachment of expired) {
    try { fs.unlinkSync(path.join(config.uploadsPath, attachment.stored_name)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  writeTransaction(() => { for (const attachment of expired) run("DELETE FROM saved_attachments WHERE id = $id AND owner_email = $owner AND item_id IS NULL", { $id: attachment.id, $owner: ownerEmail }); });
}

export function listCaptureStreams(ownerEmail: string) {
  removeExpiredPendingAttachments(ownerEmail);
  ensureBookmarks();
  return all<StreamRow>(`SELECT s.id, s.name, s.created_at, COUNT(i.id) AS item_count
    FROM capture_streams s LEFT JOIN saved_items i ON i.stream_id = s.id
    WHERE s.owner_email = '__shared__' GROUP BY s.id`, {}).map(mapStream);
}

function attachmentsForItems(itemIds: string[]) {
  const result = new Map<string, SavedAttachment[]>();
  for (const itemId of itemIds) {
    result.set(itemId, all<AttachmentRow>("SELECT id, original_name, stored_name, mime_type, size FROM saved_attachments WHERE item_id = $itemId", { $itemId: itemId }).map(mapAttachment));
  }
  return result;
}

export function listSavedItems() {
  const rows = all<ItemRow>("SELECT i.* FROM saved_items i JOIN capture_streams s ON s.id = i.stream_id WHERE s.owner_email = '__shared__' ORDER BY i.created_at DESC");
  const attachments = attachmentsForItems(rows.map((row) => row.id));
  return rows.map((row): SavedItem => ({ id: row.id, streamId: row.stream_id, title: row.title, text: row.text_content, url: row.url, source: row.source, createdAt: row.created_at, attachments: attachments.get(row.id) ?? [] }));
}

export function createSavedItem(ownerEmail: string, input: CreateSavedItemInput) {
  const streamId = ensureBookmarks();
  const attachmentIds = input.attachmentIds ?? [];
  if (attachmentIds.some((id) => !get("SELECT id FROM saved_attachments WHERE id = $id AND owner_email = $owner AND item_id IS NULL", { $id: id, $owner: ownerEmail }))) return null;
  const item: SavedItem = { id: randomUUID(), streamId, title: input.title ?? "", text: input.text ?? "", url: input.url ?? "", source: input.source ?? "manual", createdAt: new Date().toISOString(), attachments: [] };
  writeTransaction(() => {
    run(`INSERT INTO saved_items (id, stream_id, title, text_content, url, source, created_at) VALUES ($id, $streamId, $title, $text, $url, $source, $createdAt)`, { $id: item.id, $streamId: item.streamId, $title: item.title, $text: item.text, $url: item.url, $source: item.source, $createdAt: item.createdAt });
    for (const id of attachmentIds) run("UPDATE saved_attachments SET item_id = $itemId WHERE id = $id AND owner_email = $owner", { $itemId: item.id, $id: id, $owner: ownerEmail });
  });
  return { ...item, attachments: attachmentIds.map((id) => mapAttachment(get<AttachmentRow>("SELECT id, original_name, stored_name, mime_type, size FROM saved_attachments WHERE id = $id", { $id: id })!)) };
}

export function deleteSavedItem(_ownerEmail: string, id: string) {
  const item = get<{ id: string }>("SELECT i.id FROM saved_items i JOIN capture_streams s ON s.id = i.stream_id WHERE i.id = $id AND s.owner_email = '__shared__'", { $id: id });
  if (!item) return false;
  const attachments = all<AttachmentRow>("SELECT id, original_name, stored_name, mime_type, size FROM saved_attachments WHERE item_id = $id", { $id: id });
  writeTransaction(() => run("DELETE FROM saved_items WHERE id = $id", { $id: id }));
  for (const attachment of attachments) {
    try { fs.unlinkSync(path.join(config.uploadsPath, attachment.stored_name)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("Could not remove saved attachment", attachment.stored_name, error); }
  }
  return true;
}

export function savePendingAttachment(ownerEmail: string, originalName: string, mimeType: string, bytes: Buffer) {
  mimeType = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mimeType) ? mimeType.toLowerCase() : "application/octet-stream";
  fs.mkdirSync(config.uploadsPath, { recursive: true, mode: 0o700 });
  const id = randomUUID(); const storedName = `${id}.bin`;
  fs.writeFileSync(path.join(config.uploadsPath, storedName), bytes, { mode: 0o600, flag: "wx" });
  writeTransaction(() => run("INSERT INTO saved_attachments (id, owner_email, item_id, original_name, stored_name, mime_type, size, created_at) VALUES ($id, $owner, NULL, $name, $stored, $mime, $size, $createdAt)", { $id: id, $owner: ownerEmail, $name: originalName.slice(0, 255), $stored: storedName, $mime: mimeType, $size: bytes.length, $createdAt: new Date().toISOString() }));
  return mapAttachment({ id, original_name: originalName, stored_name: storedName, mime_type: mimeType, size: bytes.length });
}

export function getAttachment(ownerEmail: string, id: string) {
  const row = get<AttachmentRow>(`SELECT a.id, a.original_name, a.stored_name, a.mime_type, a.size
    FROM saved_attachments a LEFT JOIN saved_items i ON i.id = a.item_id
    WHERE a.id = $id AND (a.owner_email = $owner OR i.id IS NOT NULL OR EXISTS (SELECT 1 FROM travel_rows WHERE instr(notes, a.id) > 0))`, { $id: id, $owner: ownerEmail });
  return row ? { ...mapAttachment(row), path: path.join(config.uploadsPath, row.stored_name) } : null;
}
