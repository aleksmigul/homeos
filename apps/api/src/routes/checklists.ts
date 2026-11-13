import { Router } from "express";
import { z } from "zod";
import {
  ChecklistRunCompletedError,
  deleteChecklist, deleteChecklistItem, deleteChecklistRun,
  completeChecklistRun,
  createChecklist,
  getChecklist,
  getChecklistRun,
  listChecklists,
  startChecklistRun,
  updateChecklist,
  updateRunItem
} from "../checklistRepository.js";

export const checklistRouter = Router();

const checklistSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  items: z.array(z.string().trim().min(1).max(300)).min(1).max(200)
});

checklistRouter.get("/checklists", (_req, res) => res.json({ checklists: listChecklists() }));

checklistRouter.post("/checklists", (req, res, next) => {
  try {
    res.status(201).json({ checklist: createChecklist(checklistSchema.parse(req.body)) });
  } catch (error) {
    next(error);
  }
});

checklistRouter.get("/checklists/:id", (req, res) => {
  const checklist = getChecklist(req.params.id);
  if (!checklist) return res.status(404).json({ error: "Checklist not found" });
  res.json({ checklist });
});

checklistRouter.put("/checklists/:id", (req, res, next) => {
  try {
    const checklist = updateChecklist(req.params.id, checklistSchema.parse(req.body));
    if (!checklist) return res.status(404).json({ error: "Checklist not found" });
    res.json({ checklist });
  } catch (error) {
    next(error);
  }
});

checklistRouter.post("/checklists/:id/runs", (req, res) => {
  const checklistRun = startChecklistRun(req.params.id);
  if (!checklistRun) return res.status(404).json({ error: "Checklist not found" });
  res.status(201).json({ checklistRun });
});

checklistRouter.get("/checklist-runs/:id", (req, res) => {
  const checklistRun = getChecklistRun(req.params.id);
  if (!checklistRun) return res.status(404).json({ error: "Checklist run not found" });
  res.json({ checklistRun });
});

checklistRouter.patch("/checklist-run-items/:id", (req, res, next) => {
  try {
    const { checked } = z.object({ checked: z.boolean() }).parse(req.body);
    const item = updateRunItem(req.params.id, checked);
    if (!item) return res.status(404).json({ error: "Checklist item not found" });
    res.json({ item });
  } catch (error) {
    if (error instanceof ChecklistRunCompletedError) {
      return res.status(409).json({ error: error.message });
    }
    next(error);
  }
});

checklistRouter.post("/checklist-runs/:id/complete", (req, res) => {
  const checklistRun = completeChecklistRun(req.params.id);
  if (!checklistRun) return res.status(404).json({ error: "Checklist run not found" });
  res.json({ checklistRun });
});

checklistRouter.delete("/checklists/:id", (req, res) => {
  if (!deleteChecklist(req.params.id)) return res.status(404).json({ error: "Checklist not found" });
  res.json({ deleted: true });
});
checklistRouter.delete("/checklist-items/:id", (req, res) => {
  const checklist = deleteChecklistItem(req.params.id);
  if (!checklist) return res.status(404).json({ error: "Checklist item not found" });
  res.json({ checklist });
});
checklistRouter.delete("/checklist-runs/:id", (req, res) => {
  if (!deleteChecklistRun(req.params.id)) return res.status(404).json({ error: "Checklist run not found" });
  res.json({ deleted: true });
});
