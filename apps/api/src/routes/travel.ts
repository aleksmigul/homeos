import { Router } from "express";
import { z } from "zod";
import { createTravelPlan, getTravelPlan, listTravelPlans, updateTravelRow } from "../travelRepository.js";

export const travelRouter = Router();

const createTravelPlanSchema = z.object({
  title: z.string().trim().min(1).max(120),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const updateTravelRowSchema = z.object({
  theme: z.string().max(240).optional(),
  hotel: z.string().max(240).optional(),
  notes: z.string().max(20000).optional()
});

travelRouter.get("/travel-plans", (_req, res) => {
  res.json({ travelPlans: listTravelPlans() });
});

travelRouter.post("/travel-plans", (req, res, next) => {
  try {
    const input = createTravelPlanSchema.parse(req.body);
    const plan = createTravelPlan(input);
    res.status(201).json({ travelPlan: plan });
  } catch (error) {
    next(error);
  }
});

travelRouter.get("/travel-plans/:id", (req, res) => {
  const plan = getTravelPlan(req.params.id);
  if (!plan) {
    res.status(404).json({ error: "Travel plan not found" });
    return;
  }

  res.json({ travelPlan: plan });
});

travelRouter.patch("/travel-rows/:id", (req, res, next) => {
  try {
    const input = updateTravelRowSchema.parse(req.body);
    const row = updateTravelRow(req.params.id, input);
    if (!row) {
      res.status(404).json({ error: "Travel row not found" });
      return;
    }

    res.json({ travelRow: row });
  } catch (error) {
    next(error);
  }
});

