import cors from "cors";
import { readFileSync } from "node:fs";
import express from "express";
import { ZodError } from "zod";
import { config } from "./config.js";
import { authRouter, requireAuth } from "./auth.js";
import { initializeDatabase } from "./db.js";
import { checklistRouter } from "./routes/checklists.js";
import { captureRouter } from "./routes/capture.js";
import { travelInboxRouter } from "./routes/travelInbox.js";
import { travelRouter } from "./routes/travel.js";
import { shoppingRouter } from "./routes/shopping.js";
import { weekendRouter } from "./routes/weekend.js";
import { todoRouter } from "./routes/todos.js";
import { codexRouter, codexWorkerRouter } from "./routes/codex.js";
import { receiveResendWebhook } from "./resendWebhook.js";
import { startTravelMailImport } from "./travelMail.js";
import { voiceNotesRouter } from "./routes/voiceNotes.js";
import { resumeTranscriptions } from "./transcription.js";
import { automationRouter } from "./routes/automation.js";
import { codexTerminalRouter, installTerminalUpgrade } from "./routes/codexTerminal.js";


const app = express();

// Read once: the running API must identify its own release, even during deployment.
let clientVersion: string | null = null;
try {
  clientVersion = JSON.parse(readFileSync(new URL("../../web/dist/version.json", import.meta.url), "utf8")).version;
} catch {
  // Development and API-only builds do not have a bundled web client.
}

app.get("/api/version", (_req, res) => {
  res.set("Cache-Control", "no-store").json({ version: clientVersion });
});

app.use(cors({ origin: "http://localhost:5173" }));
app.post("/api/webhooks/resend", express.raw({ type: "application/json", limit: "2mb" }), receiveResendWebhook);
app.use(express.json({ limit: "1mb", type: (req) => req.url?.split("?")[0] !== "/api/share-attachments" && Boolean(req.headers["content-type"]?.includes("application/json")) }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", authRouter);
app.use("/api", codexWorkerRouter);
app.use("/api", automationRouter);
app.use("/api", requireAuth, codexTerminalRouter, codexRouter, voiceNotesRouter, captureRouter, checklistRouter, shoppingRouter, todoRouter, weekendRouter, travelInboxRouter, travelRouter);

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
    startTravelMailImport();
    resumeTranscriptions();
    const server = app.listen(config.port, config.host, () => {
      console.log(`The Annexation API listening on http://${config.host}:${config.port}`);
    });
    installTerminalUpgrade(server);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
