import type { ISODateTime } from "./travel.js";

export interface ChecklistItem {
  id: string;
  checklistId: string;
  label: string;
  sortOrder: number;
}

export interface ChecklistSummary {
  id: string;
  title: string;
  description: string;
  itemCount: number;
  runCount: number;
  lastRunAt: ISODateTime | null;
  updatedAt: ISODateTime;
}

export interface Checklist extends ChecklistSummary {
  items: ChecklistItem[];
  runs: ChecklistRunSummary[];
}

export interface ChecklistRunItem {
  id: string;
  runId: string;
  label: string;
  checked: boolean;
  sortOrder: number;
  checkedAt: ISODateTime | null;
}

export interface ChecklistRunSummary {
  id: string;
  checklistId: string;
  checklistTitle: string;
  startedAt: ISODateTime;
  completedAt: ISODateTime | null;
  checkedCount: number;
  itemCount: number;
}

export interface ChecklistRun extends ChecklistRunSummary {
  items: ChecklistRunItem[];
}

export interface CreateChecklistInput {
  title: string;
  description?: string;
  items: string[];
}

export type UpdateChecklistInput = CreateChecklistInput;

export interface UpdateChecklistRunItemInput {
  checked: boolean;
}
