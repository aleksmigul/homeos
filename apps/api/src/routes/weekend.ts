import { Router } from "express";
import { z } from "zod";
import { isWeekendDay } from "@homeos/shared";
import { createWeekendChore, deleteWeekendChore, finishWeekendChore, listWeekendChores, moveWeekendChore } from "../weekendRepository.js";
export const weekendRouter = Router();
weekendRouter.get("/weekend-chores", (_req, res) => res.json({ chores: listWeekendChores() }));
weekendRouter.post("/weekend-chores", (req, res, next) => {
  try { const { text } = z.object({ text: z.string().trim().min(1).max(500) }).parse(req.body); res.status(201).json({ chores: createWeekendChore(text) }); } catch (error) { next(error); }
});
weekendRouter.patch("/weekend-chores/:id", (req, res, next) => {
  try {
    const input = z.discriminatedUnion("action", [z.object({ action: z.literal("done") }), z.object({ action: z.literal("move"), day: z.string().refine(isWeekendDay, "Choose a Saturday or Sunday").nullable(), beforeId: z.string().optional() })]).parse(req.body);
    const chores = input.action === "done" ? finishWeekendChore(req.params.id) : moveWeekendChore(req.params.id, input.day, input.beforeId);
    if (!chores) return res.status(404).json({ error: "Open activity not found" });
    res.json({ chores });
  } catch (error) { next(error); }
});
weekendRouter.delete("/weekend-chores/:id", (req, res) => {
  const chores = deleteWeekendChore(req.params.id);
  if (!chores) return res.status(404).json({ error: "Open activity not found" });
  res.json({ chores });
});
