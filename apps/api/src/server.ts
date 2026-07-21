import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { config } from "./config.js";
import { authRouter, requireAuth } from "./auth.js";
import { initializeDatabase } from "./db.js";
import { travelRouter } from "./routes/travel.js";

const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", authRouter);
app.use("/api", requireAuth, travelRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: error.flatten() });
    return;
  }

  console.error("Unhandled request error", error);
  res.status(500).json({ error: "Unexpected server error" });
});

initializeDatabase()
  .then(() => {
    app.listen(config.port, config.host, () => {
      console.log(`The Annexation API listening on http://${config.host}:${config.port}`);
    });
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
