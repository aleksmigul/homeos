import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { config } from "./config.js";
import { optionalPasswordGate } from "./auth.js";
import { migrate } from "./db.js";
import { travelRouter } from "./routes/travel.js";

migrate();

const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", optionalPasswordGate, travelRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: error.flatten() });
    return;
  }

  if (error instanceof Error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Unexpected server error" });
});

app.listen(config.port, () => {
  console.log(`homeOS API listening on http://localhost:${config.port}`);
});
