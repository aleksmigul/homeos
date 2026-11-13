import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import test from "node:test";
import express from "express";

test("trip email API matches existing mail, supports overlapping trips, and leaves the inbox intact", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "homeos-trip-emails-"));
  process.env.DATABASE_PATH = path.join(directory, "test.db");
  const { initializeDatabase } = await import("./db.js");
  const { travelRouter } = await import("./routes/travel.js");
  const { createTravelPlan } = await import("./travelRepository.js");
  const { storeTravelEmail, listTravelEmails } = await import("./travelEmailRepository.js");
  await initializeDatabase();
  const app = express();
  app.use(express.json(), travelRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const receivedAt = "2026-01-01T00:00:00Z";
    storeTravelEmail({ providerId: "booking", sender: "airline@example.com", recipients: [], subject: "Flight October 12, 2026", text: "Confirmation", html: null, receivedAt, attachments: [] });
    storeTravelEmail({ providerId: "unmatched", sender: "airline@example.com", recipients: [], subject: "Other flight", text: "November 1, 2026", html: null, receivedAt, attachments: [] });
    const first = createTravelPlan({ title: "Trip", startDate: "2026-10-10", endDate: "2026-10-15" });
    const overlap = createTravelPlan({ title: "Overlapping trip", startDate: "2026-10-12", endDate: "2026-10-12" });
    for (const plan of [first, overlap]) {
      const response = await fetch(`${base}/travel-plans/${plan.id}/emails`);
      assert.equal(response.status, 200);
      const { emails } = await response.json() as { emails: Array<{ subject: string }> };
      assert.deepEqual(emails.map((email) => email.subject), ["Flight October 12, 2026"]);
    }
    assert.equal((await fetch(`${base}/travel-plans/missing/emails`)).status, 404);
    assert.equal((await fetch(`${base}/travel-plans/${first.id}`, { method: "DELETE" })).status, 204);
    assert.equal(listTravelEmails().length, 2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
