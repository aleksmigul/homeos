import { randomUUID } from "node:crypto";
import type { TravelEmail, TravelEmailAttachment } from "@homeos/shared";
import { all, run, writeTransaction } from "./db.js";

interface TravelEmailRecord {
  id: string;
  sender: string;
  recipients_json: string;
  subject: string;
  text_body: string | null;
  html_body: string | null;
  received_at: string;
  attachments_json: string;
}

export interface ReceivedTravelEmail {
  providerId: string;
  sender: string;
  recipients: string[];
  subject: string;
  text: string | null;
  html: string | null;
  receivedAt: string;
  attachments: TravelEmailAttachment[];
}

export function storeTravelEmail(email: ReceivedTravelEmail) {
  writeTransaction(() => {
    run(
      `INSERT OR IGNORE INTO travel_emails
       (id, provider_id, sender, recipients_json, subject, text_body, html_body, received_at, attachments_json, created_at)
       VALUES (:id, :providerId, :sender, :recipients, :subject, :text, :html, :receivedAt, :attachments, :now)`,
      {
        ":id": randomUUID(),
        ":providerId": email.providerId,
        ":sender": email.sender,
        ":recipients": JSON.stringify(email.recipients),
        ":subject": email.subject,
        ":text": email.text,
        ":html": email.html,
        ":receivedAt": email.receivedAt,
        ":attachments": JSON.stringify(email.attachments),
        ":now": new Date().toISOString()
      }
    );
  });
}

export function listTravelEmails(): TravelEmail[] {
  return all<TravelEmailRecord>("SELECT * FROM travel_emails ORDER BY received_at DESC").map((record) => ({
    id: record.id,
    sender: record.sender,
    recipients: JSON.parse(record.recipients_json) as string[],
    subject: record.subject,
    text: record.text_body,
    html: record.html_body,
    receivedAt: record.received_at,
    attachments: JSON.parse(record.attachments_json) as TravelEmailAttachment[]
  }));
}
