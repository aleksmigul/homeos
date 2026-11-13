import { Router, type Request } from "express";
import { request as httpRequest, type IncomingMessage, type Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { isDeveloper, getAuthenticatedUser } from "../auth.js";
import { config } from "../config.js";
import { terminalId, terminalSize } from "../codexTerminalBridge.js";

export function terminalSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return req.headers["sec-fetch-site"] !== "cross-site";
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export function terminalBridgeRequest(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ socketPath: config.codexTerminalSocket, path, method, headers: { "Content-Type": "application/json" }, timeout: 10000 }, response => {
      let text = "";
      response.on("data", chunk => { text += chunk; if (text.length > 1024 * 1024) request.destroy(new Error("Bridge response too large")); });
      response.on("end", () => {
        try { resolve({ status: response.statusCode ?? 503, body: JSON.parse(text) }); } catch { reject(new Error("Invalid bridge response")); }
      });
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Terminal bridge timed out")));
    request.on("error", reject);
    request.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

export const codexTerminalRouter = Router();
codexTerminalRouter.use("/dev/terminal", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!isDeveloper(req)) return res.status(404).json({ error: "Not found" });
  if (!terminalSameOrigin(req)) return res.status(403).json({ error: "Same-origin request required" });
  next();
});
codexTerminalRouter.all(["/dev/terminal/sessions", "/dev/terminal/sessions/:id"], async (req, res, next) => {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : undefined;
    if (id && !terminalId.test(id)) return res.status(404).json({ error: "Session not found" });
    if ((!id && !["GET", "POST"].includes(req.method)) || (id && req.method !== "DELETE")) return res.status(405).json({ error: "Method not allowed" });
    const body = req.method === "POST" ? terminalSize.parse(req.body) : undefined;
    const result = await terminalBridgeRequest(req.method, id ? `/sessions/${id}` : "/sessions", body);
    res.status(result.status).json(result.body);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code || (error instanceof Error && /bridge/i.test(error.message))) {
      return res.status(503).json({ error: "Codex Terminal is unavailable. Check the terminal bridge service." });
    }
    next(error);
  }
});

export function installTerminalUpgrade(server: Server) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => {});
    const reject = (status: string) => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    const match = req.url?.match(/^\/api\/dev\/terminal\/sessions\/(cx-[a-f0-9-]{36})\/socket$/);
    if (!match) { reject("404 Not Found"); return; }
    if (!getAuthenticatedUser(req as Request) || !isDeveloper(req as Request)) { reject("401 Unauthorized"); return; }
    if (!req.headers.origin || !terminalSameOrigin(req)) { reject("403 Forbidden"); return; }
    const upstream = new WebSocket(`ws+unix://${config.codexTerminalSocket}:/sessions/${match[1]}/socket`, { handshakeTimeout: 5000, maxPayload: 1024 * 1024 });
    let accepted = false;
    upstream.once("open", () => {
      if (socket.destroyed) { upstream.close(); return; }
      accepted = true;
      sockets.handleUpgrade(req, socket, head, client => {
        const relay = (from: WebSocket, to: WebSocket) => from.on("message", (data, binary) => {
          if (to.readyState !== WebSocket.OPEN) return;
          if (to.bufferedAmount > 1024 * 1024) { client.close(1013, "Reconnect to refresh terminal"); upstream.close(); return; }
          to.send(data, { binary });
        });
        relay(client, upstream);
        relay(upstream, client);
        client.on("close", () => upstream.close());
        upstream.on("close", (code, reason) => { if (client.readyState === WebSocket.OPEN) client.close([1005, 1006, 1015].includes(code) ? 1011 : code, reason.toString().slice(0, 100)); });
        client.on("error", () => upstream.close());
        upstream.on("error", () => client.close(1011, "Terminal connection failed"));
        let alive = true;
        client.on("pong", () => { alive = true; });
        const timer = setInterval(() => {
          if (!alive || !isDeveloper(req as Request) || !getAuthenticatedUser(req as Request)) { client.terminate(); upstream.close(); return; }
          alive = false;
          client.ping();
        }, 25000);
        timer.unref();
        client.on("close", () => clearInterval(timer));
      });
    });
    upstream.on("error", () => { if (!accepted) reject("503 Service Unavailable"); });
    socket.once("close", () => upstream.close());
  });
  return sockets;
}
