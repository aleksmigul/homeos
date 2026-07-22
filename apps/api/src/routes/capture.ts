import { Router } from "express";
import { z } from "zod";
import { createCaptureStream, createSavedItem, listCaptureStreams, listSavedItems } from "../captureRepository.js";

export const captureRouter = Router();

captureRouter.get("/capture-streams", (_req, res) => res.json({ streams: listCaptureStreams() }));
captureRouter.post("/capture-streams", (req, res, next) => {
  try { res.status(201).json({ stream: createCaptureStream(z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body).name) }); }
  catch (error) { next(error); }
});
captureRouter.get("/saved-items", (req, res, next) => {
  try { const { streamId } = z.object({ streamId: z.string().optional() }).parse(req.query); res.json({ items: listSavedItems(streamId) }); }
  catch (error) { next(error); }
});
captureRouter.post("/saved-items", (req, res, next) => {
  try {
    const input = z.object({ streamId: z.string().min(1), title: z.string().trim().max(300).optional(), text: z.string().trim().max(20000).optional(), url: z.string().trim().max(4000).refine((value) => !value || /^https?:\/\//i.test(value), "Link must use HTTP or HTTPS").optional(), source: z.string().trim().max(80).optional() }).refine((value) => value.title || value.text || value.url, "Shared item is empty").parse(req.body);
    const item = createSavedItem(input);
    if (!item) return res.status(404).json({ error: "Stream not found" });
    res.status(201).json({ item });
  } catch (error) { next(error); }
});
