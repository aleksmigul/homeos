import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("bookmarks retain arbitrary uploads and enforce pending attachment ownership", async () => {
  const directory = await fs.mkdtemp(path.join(process.cwd(), ".capture-test-"));
  process.env.DATABASE_PATH = path.join(directory, "test.db");
  process.env.UPLOADS_PATH = path.join(directory, "uploads");
  try {
    const db = await import("./db.js");
    const capture = await import("./captureRepository.js");
    await db.initializeDatabase();
    for (const [name, mimeType] of [["report.pdf", "application/pdf"], ["archive.zip", "application/zip"], ["unknown", ""], ["page.html", "text/html"], ["photo.png", "image/png"]]) {
      const bytes = Buffer.from(`contents of ${name}`);
      const attachment = capture.savePendingAttachment("alice", name, mimeType, bytes)!;
      assert.equal(attachment.name, name);
      assert.equal(attachment.mimeType, mimeType || "application/octet-stream");
      assert.equal(attachment.size, bytes.length);
      assert.equal(capture.getAttachment("bob", attachment.id), null);
      assert.equal(capture.createSavedItem("bob", { streamId: "bookmarks", attachmentIds: [attachment.id] }), null);
      const item = capture.createSavedItem("alice", { streamId: "bookmarks", attachmentIds: [attachment.id] })!;
      assert.equal(item.attachments[0].id, attachment.id);
      const stored = capture.getAttachment("bob", attachment.id)!;
      assert.deepEqual(await fs.readFile(stored.path), bytes);
      assert.equal(capture.deleteSavedItem("alice", item.id), true);
      assert.equal(capture.listSavedItems().some((saved) => saved.id === item.id), false);
      await assert.rejects(fs.access(stored.path));
    }
    const travel = await import("./travelRepository.js");
    const trip = travel.createTravelPlan({ title: "Attachments", startDate: "2026-11-11", endDate: "2026-11-11" });
    const image = capture.savePendingAttachment("alice", "trip.png", "image/png", Buffer.from("image"))!;
    const abandoned = capture.savePendingAttachment("alice", "unused.png", "image/png", Buffer.from("image"))!;
    travel.updateTravelRow(trip.rows[0].id, { notes: `<!--homeos-rich-text--><p><img src="${image.url}"></p>` });
    db.run("UPDATE saved_attachments SET created_at = '2020-01-01'");
    capture.listCaptureStreams("alice");
    assert.ok(capture.getAttachment("bob", image.id), "Travel attachments remain shared and survive pending cleanup");
    assert.equal(capture.getAttachment("alice", abandoned.id), null, "Abandoned uploads still expire");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
