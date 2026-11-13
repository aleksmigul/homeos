import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("deleting a travel plan also deletes its itinerary rows", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "homeos-travel-test-"));
  process.env.DATABASE_PATH = path.join(directory, "homeos.db");

  try {
    const { initializeDatabase, get } = await import("./db.js");
    const { createTravelPlan, deleteTravelPlan, getTravelPlan, listTravelPlans } = await import("./travelRepository.js");
    await initializeDatabase();

    const plan = createTravelPlan({ title: "Accidental trip", startDate: "2026-10-01", endDate: "2026-10-03" });
    assert.equal(plan.rows.length, 3);
    assert.equal(deleteTravelPlan(plan.id), true);
    assert.equal(getTravelPlan(plan.id), null);
    assert.deepEqual(listTravelPlans(), []);
    assert.equal(get("SELECT id FROM travel_rows WHERE plan_id = :id", { ":id": plan.id }), undefined);
    assert.equal(deleteTravelPlan(plan.id), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
