import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const config = {
  host: process.env.API_HOST ?? "127.0.0.1",
  port: Number(process.env.API_PORT ?? 4000),
  databasePath: path.resolve(repoRoot, process.env.DATABASE_PATH ?? "data/homeos.db"),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  allowedEmails: (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  sessionSecret: process.env.AUTH_SESSION_SECRET ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? "",
  travelInboxAddress: (process.env.TRAVEL_INBOX_ADDRESS ?? "travel@os.theannexation.fun").toLowerCase(),
  secureCookies: process.env.NODE_ENV === "production"
};
