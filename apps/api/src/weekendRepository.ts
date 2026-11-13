import { randomUUID } from "node:crypto";
import type { WeekendChore } from "@homeos/shared";
import { all, get, run, writeTransaction } from "./db.js";

export const listWeekendChores = () => all<WeekendChore>(`SELECT id, text, day, position, created_at AS createdAt, completed_at AS completedAt FROM weekend_chores ORDER BY position, id`);
export function createWeekendChore(text: string) {
  writeTransaction(() => run(`INSERT INTO weekend_chores (id, text, position, created_at) VALUES ($id, $text, (SELECT COALESCE(MAX(position), -1) + 1 FROM weekend_chores), $now)`, { $id: randomUUID(), $text: text, $now: new Date().toISOString() }));
  return listWeekendChores();
}
export function moveWeekendChore(id: string, day: string | null, beforeId?: string) {
  const chores = listWeekendChores();
  if (!chores.some(c => c.id === id && !c.completedAt)) return null;
  const target = chores.filter(c => c.id !== id && !c.completedAt && c.day === day);
  const before = beforeId ? target.findIndex(c => c.id === beforeId) : target.length;
  if (before < 0) throw new Error("The destination chore has moved. Refresh and try again.");
  target.splice(before, 0, chores.find(c => c.id === id)!);
  writeTransaction(() => {
    target.forEach((c, position) => run("UPDATE weekend_chores SET day = $day, position = $position WHERE id = $id", { $day: day, $position: position, $id: c.id }));
  });
  return listWeekendChores();
}
export function finishWeekendChore(id: string) {
  if (!get("SELECT id FROM weekend_chores WHERE id = $id AND completed_at IS NULL", { $id: id })) return null;
  writeTransaction(() => run("UPDATE weekend_chores SET completed_at = $now WHERE id = $id", { $id: id, $now: new Date().toISOString() }));
  return listWeekendChores();
}
export function deleteWeekendChore(id: string) {
  if (!get("SELECT id FROM weekend_chores WHERE id = $id AND completed_at IS NULL", { $id: id })) return null;
  writeTransaction(() => run("DELETE FROM weekend_chores WHERE id = $id", { $id: id }));
  return listWeekendChores();
}
