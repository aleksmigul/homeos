import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { config } from "./config.js";

const googleClient = new OAuth2Client();
const cookieName = "homeos_session";
const sessionLifetimeSeconds = 60 * 60 * 24 * 14;

type SessionIdentity = { email: string; name: string; picture?: string };
type Session = SessionIdentity & { administrator?: SessionIdentity; exp: number };

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string) {
  return crypto.createHmac("sha256", config.sessionSecret).update(value).digest("base64url");
}

function createSession(user: Omit<Session, "exp">) {
  const payload = encode(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds }));
  return `${payload}.${sign(payload)}`;
}

function readSession(req: Request): Session | null {
  if (!config.sessionSecret) return null;

  const cookie = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === cookieName)?.[1];
  if (!cookie) return null;

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    return session.exp > Date.now() / 1000 ? session : null;
  } catch {
    return null;
  }
}

export function getAuthenticatedUser(req: Request) {
  const session = readSession(req);
  return session ? { email: session.email, name: session.name, picture: session.picture } : null;
}
export function isDeveloper(req: Request) {
  const session = readSession(req);
  return Boolean(config.devPanelEmail && (session?.administrator?.email ?? session?.email) === config.devPanelEmail);
}

function publicUser(session: Session) {
  return { email: session.email, name: session.name, picture: session.picture, developer: Boolean(config.devPanelEmail && (session.administrator?.email ?? session.email) === config.devPanelEmail) };
}

function sessionCookie(value: string, maxAge = sessionLifetimeSeconds) {
  return [
    `${cookieName}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    config.secureCookies ? "Secure" : "",
    `Max-Age=${maxAge}`
  ].filter(Boolean).join("; ");
}

export const authRouter = Router();

authRouter.get("/auth/config", (_req, res) => {
  res.json({ googleClientId: config.googleClientId });
});

authRouter.get("/auth/me", (req, res) => {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  res.json({ user: publicUser(user) });
});

authRouter.get("/auth/accounts", (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Authentication required" });
  if (!config.devPanelEmail || (session.administrator?.email ?? session.email) !== config.devPanelEmail) return res.status(403).json({ error: "Administrator access required" });
  res.json({ accounts: config.allowedEmails.map((email) => ({ email })) });
});

authRouter.post("/auth/switch-account", (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Authentication required" });
  const administrator = session.administrator ?? { email: session.email, name: session.name, picture: session.picture };
  if (!config.devPanelEmail || administrator.email !== config.devPanelEmail) return res.status(403).json({ error: "Administrator access required" });

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!config.allowedEmails.includes(email)) return res.status(400).json({ error: "Account is not configured" });
  const switched: Omit<Session, "exp"> = email === administrator.email
    ? administrator
    : { email, name: email, administrator };
  const nextSession = { ...switched, exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds };
  res.setHeader("Set-Cookie", sessionCookie(createSession(switched)));
  res.json({ user: publicUser(nextSession) });
});

authRouter.post("/auth/google", async (req, res) => {
  if (!config.googleClientId || !config.sessionSecret || config.allowedEmails.length === 0) {
    return res.status(503).json({ error: "Google authentication is not configured" });
  }

  const credential = typeof req.body?.credential === "string" ? req.body.credential : "";
  if (!credential) return res.status(400).json({ error: "Missing Google credential" });

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.googleClientId });
  } catch {
    return res.status(401).json({ error: "Invalid Google credential" });
  }
  const payload = ticket.getPayload();
  if (!payload) return res.status(401).json({ error: "Invalid Google credential" });
  const email = payload?.email?.toLowerCase();
  if (!email || !payload.email_verified || !config.allowedEmails.includes(email)) {
    return res.status(403).json({ error: "This Google account is not allowed" });
  }

  const user = { email, name: payload.name ?? email, picture: payload.picture };
  res.setHeader("Set-Cookie", sessionCookie(createSession(user)));
  res.json({ user: { ...user, developer: email === config.devPanelEmail } });
});

authRouter.post("/auth/logout", (_req, res) => {
  res.setHeader("Set-Cookie", sessionCookie("", 0));
  res.status(204).end();
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (readSession(req)) return next();

  res.status(401).json({ error: "Authentication required" });
}
