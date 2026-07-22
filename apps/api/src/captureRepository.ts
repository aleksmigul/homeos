import { randomUUID } from "node:crypto";
import type { CaptureStream, CreateSavedItemInput, SavedItem } from "@homeos/shared";
import { all, get, run, writeTransaction } from "./db.js";

type StreamRow = { id: string; name: string; item_count: number; created_at: string };
type ItemRow = { id: string; stream_id: string; title: string; text_content: string; url: string; source: string; created_at: string };

const mapStream = (row: StreamRow): CaptureStream => ({ id: row.id, name: row.name, itemCount: Number(row.item_count), createdAt: row.created_at });
const mapItem = (row: ItemRow): SavedItem => ({ id: row.id, streamId: row.stream_id, title: row.title, text: row.text_content, url: row.url, source: row.source, createdAt: row.created_at });

export function listCaptureStreams() {
  return all<StreamRow>(`SELECT s.id, s.name, s.created_at, COUNT(i.id) AS item_count
    FROM capture_streams s LEFT JOIN saved_items i ON i.stream_id = s.id
    GROUP BY s.id ORDER BY CASE WHEN s.id = 'bookmarks' THEN 0 ELSE 1 END, s.name COLLATE NOCASE`).map(mapStream);
}

export function createCaptureStream(name: string) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  writeTransaction(() => run("INSERT INTO capture_streams (id, name, created_at) VALUES ($id, $name, $createdAt)", { $id: id, $name: name, $createdAt: createdAt }));
  return mapStream({ id, name, item_count: 0, created_at: createdAt });
}

export function listSavedItems(streamId?: string) {
  const where = streamId ? "WHERE stream_id = $streamId" : "";
  return all<ItemRow>(`SELECT * FROM saved_items ${where} ORDER BY created_at DESC`, streamId ? { $streamId: streamId } : {}).map(mapItem);
}

export function createSavedItem(input: CreateSavedItemInput) {
  if (!get<{ id: string }>("SELECT id FROM capture_streams WHERE id = $id", { $id: input.streamId })) return null;
  const item: SavedItem = { id: randomUUID(), streamId: input.streamId, title: input.title ?? "", text: input.text ?? "", url: input.url ?? "", source: input.source ?? "manual", createdAt: new Date().toISOString() };
  writeTransaction(() => run(`INSERT INTO saved_items (id, stream_id, title, text_content, url, source, created_at)
    VALUES ($id, $streamId, $title, $text, $url, $source, $createdAt)`, { $id: item.id, $streamId: item.streamId, $title: item.title, $text: item.text, $url: item.url, $source: item.source, $createdAt: item.createdAt }));
  return item;
}
