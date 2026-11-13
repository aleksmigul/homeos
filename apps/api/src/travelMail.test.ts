import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("local MIME delivery imports bodies and attachments once and preserves raw mail", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "homeos-mail-"));
  process.env.DATABASE_PATH = path.join(directory, "test.db");
  process.env.TRAVEL_INBOX_ADDRESS = "travel@os.theannexation.fun";
  const script = fileURLToPath(new URL("../../../ops/receive-travel-mail.py", import.meta.url));
  const mime = [
    "From: Airline <booking@example.com>",
    "To: original@example.com", // Forwarding/Bcc uses the envelope, not this header.
    "Subject: =?UTF-8?B?VHJpcCDinIg=?=",
    "MIME-Version: 1.0",
    "Content-Type: multipart/mixed; boundary=booking",
    "", "--booking", "Content-Type: text/plain; charset=utf-8", "",
    "Flight confirmation", "--booking", "Content-Type: text/html; charset=utf-8", "",
    "<p>Flight confirmation</p>", "--booking", "Content-Type: application/pdf",
    'Content-Disposition: attachment; filename="ticket.pdf"', "Content-Transfer-Encoding: base64",
    "", "dGlja2V0", "--booking--", ""
  ].join("\r\n");
  try {
    await fs.mkdir(path.join(directory, "new"));
    await fs.mkdir(path.join(directory, "raw"));
    const { initializeDatabase } = await import("./db.js");
    const { importTravelMail } = await import("./travelMail.js");
    const { listTravelEmails } = await import("./travelEmailRepository.js");
    await initializeDatabase();
    const deliver = () => {
      const result = spawnSync("python3", [script, directory, "travel@os.theannexation.fun"], { input: mime, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    };
    deliver();
    importTravelMail(directory);
    const [email] = listTravelEmails();
    assert.equal(email.subject, "Trip ✈");
    assert.match(email.text!, /Flight confirmation/);
    assert.match(email.html!, /<p>Flight confirmation<\/p>/);
    assert.deepEqual(email.recipients, ["travel@os.theannexation.fun"]);
    assert.equal(email.attachments[0].filename, "ticket.pdf");
    assert.equal(email.attachments[0].size, 6);
    assert.deepEqual(await fs.readdir(path.join(directory, "new")), []);
    const raw = await fs.readdir(path.join(directory, "raw"));
    assert.equal(raw.length, 1);
    assert.equal(await fs.readFile(path.join(directory, "raw", raw[0]), "utf8"), mime);
    deliver();
    importTravelMail(directory);
    assert.equal(listTravelEmails().length, 1);
    const invalid = path.join(directory, "new", "a".repeat(64) + ".json");
    await fs.writeFile(invalid, '{"broken":true}');
    importTravelMail(directory);
    assert.equal(listTravelEmails().length, 1);
    assert.equal((await fs.readdir(path.join(directory, "new"))).length, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
