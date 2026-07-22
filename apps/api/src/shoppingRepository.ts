import { randomUUID } from "node:crypto";
import type { ShoppingEditLock, ShoppingItem, ShoppingList, ShoppingListSummary } from "@homeos/shared";
import { all, get, run, writeTransaction } from "./db.js";

type ListRow = { id: string; title: string; status: "current" | "archived"; item_count: number; checked_count: number; created_at: string; archived_at: string | null };
type ItemRow = { id: string; list_id: string; label: string; is_checked: number; sort_order: number; added_by: string; checked_at: string | null };
type LockRow = { token: string; owner_email: string; owner_name: string; expires_at: string };

const mapSummary = (row: ListRow): ShoppingListSummary => ({ id: row.id, title: row.title, status: row.status, itemCount: Number(row.item_count), checkedCount: Number(row.checked_count), createdAt: row.created_at, archivedAt: row.archived_at });
const mapItem = (row: ItemRow): ShoppingItem => ({ id: row.id, listId: row.list_id, label: row.label, checked: Boolean(row.is_checked), sortOrder: Number(row.sort_order), addedBy: row.added_by, checkedAt: row.checked_at });
const listSelect = `SELECT l.*, COUNT(i.id) AS item_count, COALESCE(SUM(i.is_checked), 0) AS checked_count FROM shopping_lists l LEFT JOIN shopping_items i ON i.list_id = l.id`;

function ensureCurrent() {
  let current = get<ListRow>(`${listSelect} WHERE l.status = 'current' GROUP BY l.id`);
  if (current) return current;
  const now = new Date().toISOString(); const id = randomUUID();
  writeTransaction(() => run("INSERT INTO shopping_lists (id, title, status, created_at) VALUES ($id, 'Shopping list', 'current', $now)", { $id: id, $now: now }));
  current = get<ListRow>(`${listSelect} WHERE l.id = $id GROUP BY l.id`, { $id: id });
  return current!;
}

function getItems(listId: string) { return all<ItemRow>("SELECT id, list_id, label, is_checked, sort_order, added_by, checked_at FROM shopping_items WHERE list_id = $id ORDER BY sort_order", { $id: listId }).map(mapItem); }
function fullList(row: ListRow): ShoppingList { return { ...mapSummary(row), items: getItems(row.id) }; }

export function getShoppingOverview() {
  const current = fullList(ensureCurrent());
  const archived = all<ListRow>(`${listSelect} WHERE l.status = 'archived' GROUP BY l.id ORDER BY l.archived_at DESC`).map(mapSummary);
  return { current, archived };
}

export function getShoppingList(id: string) { const row = get<ListRow>(`${listSelect} WHERE l.id = $id GROUP BY l.id`, { $id: id }); return row ? fullList(row) : null; }

export function setShoppingItemChecked(id: string, checked: boolean) {
  const row = get<ItemRow>("SELECT i.* FROM shopping_items i JOIN shopping_lists l ON l.id = i.list_id WHERE i.id = $id AND l.status = 'current'", { $id: id });
  if (!row) return null;
  const checkedAt = checked ? new Date().toISOString() : null;
  writeTransaction(() => run("UPDATE shopping_items SET is_checked = $checked, checked_at = $checkedAt WHERE id = $id", { $checked: checked ? 1 : 0, $checkedAt: checkedAt, $id: id }));
  return mapItem({ ...row, is_checked: checked ? 1 : 0, checked_at: checkedAt });
}

export class ShoppingLockedError extends Error { constructor(public ownerName: string, public expiresAt: string) { super(`${ownerName} is editing this list`); } }
const lockExpiry = () => new Date(Date.now() + 2 * 60 * 1000).toISOString();
export function acquireShoppingLock(email: string, name: string): ShoppingEditLock {
  const list = ensureCurrent(); const now = new Date().toISOString();
  const existing = get<LockRow>("SELECT token, owner_email, owner_name, expires_at FROM shopping_edit_locks WHERE list_id = $id", { $id: list.id });
  if (existing && existing.expires_at > now && existing.owner_email !== email) throw new ShoppingLockedError(existing.owner_name, existing.expires_at);
  const token = randomUUID(); const expiresAt = lockExpiry();
  writeTransaction(() => run("INSERT OR REPLACE INTO shopping_edit_locks (list_id, owner_email, owner_name, token, expires_at) VALUES ($id, $email, $name, $token, $expires)", { $id: list.id, $email: email, $name: name, $token: token, $expires: expiresAt }));
  return { token, ownerEmail: email, ownerName: name, expiresAt };
}

function requireLock(email: string, token: string) {
  const current = ensureCurrent(); const lock = get<LockRow>("SELECT token, owner_email, owner_name, expires_at FROM shopping_edit_locks WHERE list_id = $id", { $id: current.id });
  if (!lock || lock.owner_email !== email || lock.token !== token || lock.expires_at <= new Date().toISOString()) throw new ShoppingLockedError(lock?.owner_name ?? "Someone else", lock?.expires_at ?? new Date().toISOString());
  return current;
}

export function renewShoppingLock(email: string, token: string) {
  const current = requireLock(email, token); const expiresAt = lockExpiry();
  writeTransaction(() => run("UPDATE shopping_edit_locks SET expires_at = $expires WHERE list_id = $id AND token = $token", { $expires: expiresAt, $id: current.id, $token: token }));
  return expiresAt;
}

export function releaseShoppingLock(email: string, token: string) { writeTransaction(() => run("DELETE FROM shopping_edit_locks WHERE owner_email = $email AND token = $token", { $email: email, $token: token })); }

export function updateCurrentShoppingList(email: string, token: string, title: string, labels: string[]) {
  const current = requireLock(email, token); const previous = getItems(current.id); const byLabel = new Map(previous.map((item) => [item.label.trim().toLocaleLowerCase(), item]));
  writeTransaction(() => {
    run("UPDATE shopping_lists SET title = $title WHERE id = $id", { $title: title, $id: current.id });
    run("DELETE FROM shopping_items WHERE list_id = $id", { $id: current.id });
    labels.forEach((label, index) => { const old = byLabel.get(label.toLocaleLowerCase()); run("INSERT INTO shopping_items (id, list_id, label, is_checked, sort_order, added_by, created_at, checked_at) VALUES ($itemId, $listId, $label, $checked, $order, $email, $now, $checkedAt)", { $itemId: randomUUID(), $listId: current.id, $label: label, $checked: old?.checked ? 1 : 0, $order: index, $email: old?.addedBy ?? email, $now: new Date().toISOString(), $checkedAt: old?.checkedAt ?? null }); });
  });
  return getShoppingList(current.id)!;
}

export function importShoppingItems(email: string, token: string, sourceId: string, mode: "all" | "unchecked") {
  const current = requireLock(email, token);
  const source = getShoppingList(sourceId); if (!source || source.status !== "archived") return null;
  const existing = getItems(current.id); const seen = new Set(existing.map((item) => item.label.trim().toLocaleLowerCase()));
  const additions = source.items.filter((item) => mode === "all" || !item.checked).filter((item) => { const key = item.label.trim().toLocaleLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
  writeTransaction(() => additions.forEach((item, offset) => run("INSERT INTO shopping_items (id, list_id, label, is_checked, sort_order, added_by, created_at) VALUES ($id, $listId, $label, 0, $order, $email, $now)", { $id: randomUUID(), $listId: current.id, $label: item.label, $order: existing.length + offset, $email: email, $now: new Date().toISOString() })));
  return { shoppingList: getShoppingList(current.id)!, addedCount: additions.length };
}

export function archiveCurrentShoppingList(email: string, token: string) {
  const current = requireLock(email, token); const now = new Date().toISOString(); const nextId = randomUUID();
  writeTransaction(() => { run("UPDATE shopping_lists SET status = 'archived', archived_at = $now WHERE id = $id", { $now: now, $id: current.id }); run("DELETE FROM shopping_edit_locks WHERE list_id = $id", { $id: current.id }); run("INSERT INTO shopping_lists (id, title, status, created_at) VALUES ($id, 'Shopping list', 'current', $now)", { $id: nextId, $now: now }); });
  return getShoppingList(nextId)!;
}
