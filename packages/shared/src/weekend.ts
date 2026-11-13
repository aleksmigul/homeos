export type WeekendChore = { id: string; text: string; day: string | null; position: number; createdAt: string; completedAt: string | null };

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function nextWeekendDay(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + (date.getDay() === 6 ? 1 : 6));
  return dateKey(date);
}
export function isWeekendDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T12:00:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === day && [0, 6].includes(date.getDay());
}
/** Include every upcoming day through the final plan, then one empty day. */
export function weekendBuckets(chores: WeekendChore[], today = new Date()): string[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  while (![0, 6].includes(start.getDay())) start.setDate(start.getDate() + 1);
  const planned = chores.filter(c => !c.completedAt && c.day).map(c => c.day!).sort();
  const last = planned.at(-1);
  const days: string[] = [];
  let day = dateKey(start);
  while (last && day <= last) { days.push(day); day = nextWeekendDay(day); }
  days.push(day);
  return [...new Set([...planned.filter(d => d < dateKey(start)), ...days])];
}
