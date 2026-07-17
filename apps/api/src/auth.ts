import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";

export function optionalPasswordGate(req: Request, res: Response, next: NextFunction) {
  if (!config.homePassword) {
    next();
    return;
  }

  if (req.header("x-homeos-password") === config.homePassword) {
    next();
    return;
  }

  res.status(401).json({ error: "Authentication required" });
}
