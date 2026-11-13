import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.js";
import { storeTravelEmail } from "./travelEmailRepository.js";

const receivedMail = z.object({
  providerId: z.string().regex(/^smtp:[a-f0-9]{64}$/),
  sender: z.string(),
  recipients: z.array(z.string()).min(1),
  subject: z.string(),
  text: z.string().nullable(),
  html: z.string().nullable(),
  receivedAt: z.iso.datetime(),
  attachments: z.array(z.object({
    id: z.string(), filename: z.string(), contentType: z.string(), size: z.number().int().nonnegative()
  }))
});

// The API is the sole database writer. Postfix leaves durable, atomic queue
// files; retries after a crash are safe because provider_id is unique.
export function importTravelMail(directory = config.travelMailPath) {
  const pending = path.join(directory, "new");
  for (const filename of fs.readdirSync(pending).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).slice(0, 50)) {
    const file = path.join(pending, filename);
    try {
      const email = receivedMail.parse(JSON.parse(fs.readFileSync(file, "utf8")));
      if (!email.recipients.some((recipient) => recipient.toLowerCase() === config.travelInboxAddress)) {
        throw new Error("Unexpected envelope recipient");
      }
      storeTravelEmail(email);
      fs.unlinkSync(file);
    } catch (error) {
      console.error(`Travel mail import failed for ${filename}; retained for retry`, error);
    }
  }
}

export function startTravelMailImport() {
  if (!config.travelMailPath) return;
  const poll = () => {
    try { importTravelMail(); }
    catch (error) { console.error("Travel mail queue unavailable", error); }
  };
  poll();
  setInterval(poll, 5_000).unref();
}
