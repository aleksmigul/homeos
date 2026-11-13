import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const config = {
  repoRoot,
  host: process.env.API_HOST ?? "127.0.0.1",
  port: Number(process.env.API_PORT ?? 4000),
  databasePath: path.resolve(repoRoot, process.env.DATABASE_PATH ?? "data/homeos.db"),
  uploadsPath: path.resolve(repoRoot, process.env.UPLOADS_PATH ?? "data/uploads"),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  allowedEmails: (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  sessionSecret: process.env.AUTH_SESSION_SECRET ?? "",
  devPanelEmail: (process.env.DEV_PANEL_EMAIL ?? "").trim().toLowerCase(),
  codexWorkerToken: process.env.CODEX_WORKER_TOKEN ?? "",
  codexTerminalSocket: process.env.CODEX_TERMINAL_SOCKET ?? "/run/homeos-codex/bridge.sock",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  transcriptionModel: process.env.TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe",
  travelInboxAddress: process.env.TRAVEL_INBOX_ADDRESS?.trim().toLowerCase() || "travel@os.theannexation.fun",
  travelMailPath: process.env.TRAVEL_MAIL_PATH?.trim() || "",
  secureCookies: process.env.NODE_ENV === "production"
};
