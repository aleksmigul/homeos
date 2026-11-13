import fs from "node:fs";
import express, { Router } from "express";
import { z } from "zod";
import { getAuthenticatedUser } from "../auth.js";
import { createSavedItem, deleteSavedItem, getAttachment, listCaptureStreams, listSavedItems, savePendingAttachment } from "../captureRepository.js";

export const captureRouter = Router();
const userEmail = (req: express.Request) => getAuthenticatedUser(req)!.email;

captureRouter.get("/capture-streams", (req, res) => res.json({ streams: listCaptureStreams(userEmail(req)) }));
captureRouter.get("/saved-items", (req, res, next) => {
  try { z.object({ streamId: z.string().optional() }).parse(req.query); res.json({ items: listSavedItems() }); }
  catch (error) { next(error); }
});
captureRouter.post("/saved-items", (req, res, next) => {
  try {
    const input = z.object({ streamId: z.string().min(1), title: z.string().trim().max(300).optional(), text: z.string().trim().max(20000).optional(), url: z.string().trim().max(4000).refine((value) => !value || /^https?:\/\//i.test(value), "Link must use HTTP or HTTPS").optional(), source: z.string().trim().max(80).optional(), attachmentIds: z.array(z.string().uuid()).max(10).optional() }).refine((value) => value.title || value.text || value.url || value.attachmentIds?.length, "Shared item is empty").parse(req.body);
    const item = createSavedItem(userEmail(req), input);
    if (!item) return res.status(404).json({ error: "Attachment not found" });
    res.status(201).json({ item });
  } catch (error) { next(error); }
});

captureRouter.delete("/saved-items/:id", (req, res) => {
  if (!deleteSavedItem(userEmail(req), req.params.id)) return res.status(404).json({ error: "Saved item not found" });
  res.status(204).end();
});

captureRouter.post("/share-attachments", express.raw({ type: () => true, limit: "12mb" }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Missing file" });
  let originalName = String(req.headers["x-file-name"] ?? "shared-file");
  try { originalName = decodeURIComponent(originalName); } catch { originalName = "shared-file"; }
  const attachment = savePendingAttachment(userEmail(req), originalName.slice(0, 255), req.headers["content-type"]?.split(";")[0] ?? "", req.body);
  if (!attachment) return res.status(415).json({ error: "Unsupported file type" });
  res.status(201).json({ attachment });
});

captureRouter.get("/saved-attachments/:id", (req, res) => {
  const attachment = getAttachment(userEmail(req), req.params.id);
  if (!attachment || !fs.existsSync(attachment.path)) return res.status(404).json({ error: "Attachment not found" });
  const previewable = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"].includes(attachment.mimeType);
  res.attachment(attachment.name);
  if (previewable) res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Length", attachment.size);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(attachment.path);
});
