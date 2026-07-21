import type { Request, Response } from "express";
import { Resend } from "resend";
import { config } from "./config.js";
import { storeTravelEmail } from "./travelEmailRepository.js";

export async function receiveResendWebhook(req: Request, res: Response) {
  if (!config.resendApiKey || !config.resendWebhookSecret) {
    return res.status(503).json({ error: "Inbound email is not configured" });
  }

  const resend = new Resend(config.resendApiKey);
  const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  try {
    const event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.header("svix-id") ?? "",
        timestamp: req.header("svix-timestamp") ?? "",
        signature: req.header("svix-signature") ?? ""
      },
      webhookSecret: config.resendWebhookSecret
    });

    if (event.type !== "email.received") return res.status(204).end();
    if (!event.data.to.some((recipient) => recipient.toLowerCase() === config.travelInboxAddress)) {
      return res.status(204).end();
    }

    const { data, error } = await resend.emails.receiving.get(event.data.email_id, { html_format: "cid" });
    if (error || !data) throw new Error(error?.message ?? "Could not retrieve received email");

    storeTravelEmail({
      providerId: data.id,
      sender: data.from,
      recipients: data.to,
      subject: data.subject || "(No subject)",
      text: data.text,
      html: data.html,
      receivedAt: data.created_at,
      attachments: data.attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename ?? "Attachment",
        contentType: attachment.content_type,
        size: attachment.size
      }))
    });
    return res.status(204).end();
  } catch (error) {
    console.error("Inbound email webhook failed", error);
    return res.status(400).json({ error: "Invalid or incomplete webhook" });
  }
}
