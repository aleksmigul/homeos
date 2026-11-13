import { randomUUID } from "node:crypto";
import type {
  Checklist,
  ChecklistItem,
  ChecklistRun,
  ChecklistRunItem,
  ChecklistRunSummary,
  ChecklistSummary,
  CreateChecklistInput,
  UpdateChecklistInput
} from "@homeos/shared";
import { all, get, run, writeTransaction } from "./db.js";

interface ChecklistRecord {
  id: string;
  title: string;
  description: string;
  item_count?: number;
  run_count?: number;
  last_run_at?: string | null;
  updated_at: string;
}

interface ChecklistItemRecord {
  id: string;
  checklist_id: string;
  label: string;
  sort_order: number;
}

interface RunRecord {
  id: string;
  checklist_id: string;
  checklist_title: string;
  started_at: string;
  completed_at: string | null;
  checked_count?: number;
  item_count?: number;
}

interface RunItemRecord {
  id: string;
  run_id: string;
  label: string;
  is_checked: number;
  sort_order: number;
  checked_at: string | null;
}

const checklistSummarySql = `
  SELECT c.id, c.title, c.description, c.updated_at,
    COUNT(DISTINCT i.id) AS item_count,
    COUNT(DISTINCT r.id) AS run_count,
    MAX(r.started_at) AS last_run_at
  FROM checklists c
  LEFT JOIN checklist_items i ON i.checklist_id = c.id
  LEFT JOIN checklist_runs r ON r.checklist_id = c.id
`;

const runSummarySql = `
  SELECT r.id, r.checklist_id, r.checklist_title, r.started_at, r.completed_at,
    COUNT(i.id) AS item_count,
    SUM(CASE WHEN i.is_checked = 1 THEN 1 ELSE 0 END) AS checked_count
  FROM checklist_runs r
  LEFT JOIN checklist_run_items i ON i.run_id = r.id
`;

export class ChecklistRunCompletedError extends Error {}

export function listChecklists(): ChecklistSummary[] {
  return all<ChecklistRecord>(`${checklistSummarySql} GROUP BY c.id ORDER BY c.updated_at DESC`).map(mapChecklistSummary);
}

export function getChecklist(id: string): Checklist | null {
  const record = get<ChecklistRecord>(`${checklistSummarySql} WHERE c.id = :id GROUP BY c.id`, { ":id": id });
  if (!record) return null;

  const items = all<ChecklistItemRecord>(
    "SELECT * FROM checklist_items WHERE checklist_id = :id ORDER BY sort_order",
    { ":id": id }
  ).map(mapChecklistItem);
  const runs = all<RunRecord>(
    `${runSummarySql} WHERE r.checklist_id = :id GROUP BY r.id ORDER BY r.completed_at DESC, r.started_at DESC`,
    { ":id": id }
  ).map(mapRunSummary);

  return { ...mapChecklistSummary(record), items, runs };
}

export function createChecklist(input: CreateChecklistInput): Checklist {
  const id = randomUUID();
  const now = new Date().toISOString();
  writeTransaction(() => {
    run(
      "INSERT INTO checklists (id, title, description, created_at, updated_at) VALUES (:id, :title, :description, :now, :now)",
      { ":id": id, ":title": input.title.trim(), ":description": input.description?.trim() ?? "", ":now": now }
    );
    insertItems(id, input.items, now);
  });
  return requireChecklist(id);
}

export function updateChecklist(id: string, input: UpdateChecklistInput): Checklist | null {
  if (!get<ChecklistRecord>("SELECT * FROM checklists WHERE id = :id", { ":id": id })) return null;
  const now = new Date().toISOString();
  writeTransaction(() => {
    run("UPDATE checklists SET title = :title, description = :description, updated_at = :now WHERE id = :id", {
      ":id": id,
      ":title": input.title.trim(),
      ":description": input.description?.trim() ?? "",
      ":now": now
    });
    run("DELETE FROM checklist_items WHERE checklist_id = :id", { ":id": id });
    insertItems(id, input.items, now);
  });
  return requireChecklist(id);
}

export function startChecklistRun(checklistId: string): ChecklistRun | null {
  const checklist = getChecklist(checklistId);
  if (!checklist) return null;
  const id = randomUUID();
  const now = new Date().toISOString();
  writeTransaction(() => {
    run(
      "INSERT INTO checklist_runs (id, checklist_id, checklist_title, started_at) VALUES (:id, :checklistId, :title, :now)",
      { ":id": id, ":checklistId": checklistId, ":title": checklist.title, ":now": now }
    );
    checklist.items.forEach((item, sortOrder) => {
      run(
        "INSERT INTO checklist_run_items (id, run_id, label, sort_order) VALUES (:id, :runId, :label, :sortOrder)",
        { ":id": randomUUID(), ":runId": id, ":label": item.label, ":sortOrder": sortOrder }
      );
    });
  });
  return requireRun(id);
}

export function getChecklistRun(id: string): ChecklistRun | null {
  const record = get<RunRecord>(`${runSummarySql} WHERE r.id = :id GROUP BY r.id`, { ":id": id });
  if (!record) return null;
  const items = all<RunItemRecord>(
    "SELECT * FROM checklist_run_items WHERE run_id = :id ORDER BY sort_order",
    { ":id": id }
  ).map(mapRunItem);
  return { ...mapRunSummary(record), items };
}

export function updateRunItem(id: string, checked: boolean): ChecklistRunItem | null {
  const item = get<RunItemRecord & { completed_at: string | null }>(
    `SELECT i.*, r.completed_at
     FROM checklist_run_items i
     JOIN checklist_runs r ON r.id = i.run_id
     WHERE i.id = :id`,
    { ":id": id }
  );
  if (!item) return null;
  if (item.completed_at) throw new ChecklistRunCompletedError("Completed checklist runs cannot be changed");
  const checkedAt = checked ? new Date().toISOString() : null;
  writeTransaction(() => {
    run("UPDATE checklist_run_items SET is_checked = :checked, checked_at = :checkedAt WHERE id = :id", {
      ":id": id,
      ":checked": checked ? 1 : 0,
      ":checkedAt": checkedAt
    });
  });
  return mapRunItem({ ...item, is_checked: checked ? 1 : 0, checked_at: checkedAt });
}

export function completeChecklistRun(id: string): ChecklistRun | null {
  const existing = getChecklistRun(id);
  if (!existing) return null;
  if (!existing.completedAt) {
    writeTransaction(() => {
      run("UPDATE checklist_runs SET completed_at = :now WHERE id = :id", { ":id": id, ":now": new Date().toISOString() });
    });
  }
  return requireRun(id);
}

function insertItems(checklistId: string, items: string[], now: string) {
  items.forEach((label, sortOrder) => {
    run(
      "INSERT INTO checklist_items (id, checklist_id, label, sort_order, created_at) VALUES (:id, :checklistId, :label, :sortOrder, :now)",
      { ":id": randomUUID(), ":checklistId": checklistId, ":label": label.trim(), ":sortOrder": sortOrder, ":now": now }
    );
  });
}

function requireChecklist(id: string) {
  const checklist = getChecklist(id);
  if (!checklist) throw new Error("Checklist was not saved");
  return checklist;
}

function requireRun(id: string) {
  const checklistRun = getChecklistRun(id);
  if (!checklistRun) throw new Error("Checklist run was not saved");
  return checklistRun;
}

function mapChecklistSummary(record: ChecklistRecord): ChecklistSummary {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    itemCount: Number(record.item_count ?? 0),
    runCount: Number(record.run_count ?? 0),
    lastRunAt: record.last_run_at ?? null,
    updatedAt: record.updated_at
  };
}

function mapChecklistItem(record: ChecklistItemRecord): ChecklistItem {
  return { id: record.id, checklistId: record.checklist_id, label: record.label, sortOrder: record.sort_order };
}

function mapRunSummary(record: RunRecord): ChecklistRunSummary {
  return {
    id: record.id,
    checklistId: record.checklist_id,
    checklistTitle: record.checklist_title,
    startedAt: record.started_at,
    completedAt: record.completed_at,
    checkedCount: Number(record.checked_count ?? 0),
    itemCount: Number(record.item_count ?? 0)
  };
}

function mapRunItem(record: RunItemRecord): ChecklistRunItem {
  return {
    id: record.id,
    runId: record.run_id,
    label: record.label,
    checked: Boolean(record.is_checked),
    sortOrder: record.sort_order,
    checkedAt: record.checked_at
  };
}

export function deleteChecklist(id: string): boolean {
  if (!getChecklist(id)) return false;
  writeTransaction(() => {
    run("DELETE FROM checklist_run_items WHERE run_id IN (SELECT id FROM checklist_runs WHERE checklist_id = :id)", { ":id": id });
    run("DELETE FROM checklist_items WHERE checklist_id = :id", { ":id": id });
    run("DELETE FROM checklist_runs WHERE checklist_id = :id", { ":id": id });
    run("DELETE FROM checklists WHERE id = :id", { ":id": id });
  });
  return true;
}

export function deleteChecklistItem(id: string): Checklist | null {
  const item = get<ChecklistItemRecord>("SELECT * FROM checklist_items WHERE id = :id", { ":id": id });
  if (!item) return null;
  writeTransaction(() => {
    run("DELETE FROM checklist_items WHERE id = :id", { ":id": id });
    run("UPDATE checklists SET updated_at = :now WHERE id = :id", { ":id": item.checklist_id, ":now": new Date().toISOString() });
  });
  return requireChecklist(item.checklist_id);
}

export function deleteChecklistRun(id: string): boolean {
  if (!getChecklistRun(id)) return false;
  writeTransaction(() => {
    run("DELETE FROM checklist_run_items WHERE run_id = :id", { ":id": id });
    run("DELETE FROM checklist_runs WHERE id = :id", { ":id": id });
  });
  return true;
}
