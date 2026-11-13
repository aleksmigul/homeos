import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { isWeekendDay, nextWeekendDay, weekendBuckets, type WeekendChore } from "@homeos/shared";

const chore = (day: string | null, completedAt: string | null = null): WeekendChore => ({ id: day ?? "list", day, completedAt, text: "Clean", position: 0, createdAt: "2026-10-15T12:00:00Z" });
test("weekend buckets include planned dates, unfinished past days, and exactly one trailing day", () => {
  const today = new Date("2026-10-15T12:00:00");
  assert.deepEqual(weekendBuckets([], today), ["2026-10-17"]);
  assert.deepEqual(weekendBuckets([chore("2026-10-17")], today), ["2026-10-17", "2026-10-18"]);
  assert.deepEqual(weekendBuckets([chore("2026-10-18"), chore("2026-10-25")], today), ["2026-10-17", "2026-10-18", "2026-10-24", "2026-10-25", "2026-10-31"]);
  assert.deepEqual(weekendBuckets([chore("2026-10-10"), chore("2026-11-01", "2026-10-15T12:00:00Z")], today), ["2026-10-10", "2026-10-17"]);
  assert.deepEqual(weekendBuckets([], new Date("2026-10-18T12:00:00")), ["2026-10-18"]);
  assert.equal(nextWeekendDay("2026-10-18"), "2026-10-24");
  assert.equal(nextWeekendDay("2028-12-31"), "2029-01-06");
  assert.equal(isWeekendDay("2026-10-17"), true);
  assert.equal(isWeekendDay("2026-10-16"), false);
  assert.equal(isWeekendDay("2026-02-30"), false);
  assert.equal(isWeekendDay("garbage"), false);
});

test("chores persist ordering, moves, immutable completion history, and deletion", async () => {
  const directory = await fs.mkdtemp(path.resolve(".weekend-test-"));
  process.env.DATABASE_PATH = path.join(directory, "homeos.db");
  try {
    const { initializeDatabase } = await import("./db.js");
    const repo = await import("./weekendRepository.js");
    await initializeDatabase();
    const a = repo.createWeekendChore("Clean kitchen")[0];
    const b = repo.createWeekendChore("Mow lawn").find(c => c.id !== a.id)!;
    repo.moveWeekendChore(b.id, null, a.id);
    assert.deepEqual(repo.listWeekendChores().map(c => c.id), [b.id, a.id]);
    repo.moveWeekendChore(a.id, "2026-10-17");
    repo.moveWeekendChore(b.id, "2026-10-17", a.id);
    assert.deepEqual(repo.listWeekendChores().filter(c => c.day === "2026-10-17").map(c => c.id), [b.id, a.id]);
    repo.moveWeekendChore(b.id, "2026-10-18");
    assert.equal(repo.listWeekendChores().find(c => c.id === b.id)!.day, "2026-10-18");
    assert.throws(() => repo.moveWeekendChore(b.id, null, "missing"));
    const done = repo.finishWeekendChore(a.id)!.find(c => c.id === a.id)!;
    assert.ok(done.completedAt);
    assert.equal(done.day, "2026-10-17");
    assert.equal(repo.finishWeekendChore(a.id), null);
    assert.equal(repo.moveWeekendChore(a.id, null), null);
    assert.equal(repo.deleteWeekendChore(a.id), null);
    await initializeDatabase();
    assert.equal(repo.listWeekendChores().find(c => c.id === a.id)!.completedAt, done.completedAt);
    repo.deleteWeekendChore(b.id);
    assert.deepEqual(repo.listWeekendChores().map(c => c.id), [a.id]);
    assert.equal(repo.moveWeekendChore("missing", null), null);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
