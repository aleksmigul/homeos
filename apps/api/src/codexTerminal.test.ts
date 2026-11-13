import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import express from "express";
import { WebSocket } from "ws";

const fakeCodex = `import sys,tty,os,signal,fcntl,termios,struct
tty.setraw(0)
def size(*args):
    rows,cols,_,_=struct.unpack('HHHH',fcntl.ioctl(0,termios.TIOCGWINSZ,b' '*8))
    print('\\r\\nsize:%sx%s'%(cols,rows),flush=True)
signal.signal(signal.SIGWINCH,size)
print('CODEX-TEST-READY',flush=True)
while True:
    data=os.read(0,4096)
    if not data: break
    print('\\r\\nreceived:'+repr(data),flush=True)
`;
async function until(check: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 100; attempt++) { if (await check()) return; await delay(50); }
  assert.fail("Timed out waiting for terminal output");
}

test("real tmux terminal streams input, resize and reconnect, with developer and origin checks", { timeout: 30000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "homeos-terminal-"));
  const bridgeSocket = path.join(directory, "bridge.sock"), tmuxSocket = path.join(directory, "tmux.sock");
  process.env.CODEX_TERMINAL_SOCKET = bridgeSocket;
  process.env.AUTH_SESSION_SECRET = "terminal-test-secret";
  process.env.DEV_PANEL_EMAIL = "developer@example.com";
  const { createTerminalBridge } = await import("./codexTerminalBridge.js");
  const { codexTerminalRouter, installTerminalUpgrade } = await import("./routes/codexTerminal.js");
  const { codexRouter } = await import("./routes/codex.js");
  const { requireAuth } = await import("./auth.js");
  const options = { tmuxSocket, workspace: directory, command: ["python3", "-u", "-c", fakeCodex], maxSessions: 2 };
  let bridge = createTerminalBridge(options);
  bridge.server.listen(bridgeSocket);
  await once(bridge.server, "listening");
  const app = express(); app.use(express.json());
  app.use("/api", requireAuth, codexTerminalRouter, codexRouter);
  app.get("/api/checklists", (_req, res) => res.json({ checklists: [] }));
  const server = app.listen(0, "127.0.0.1");
  const wsServer = installTerminalUpgrade(server);
  await once(server, "listening");
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`, wsBase = base.replace("http", "ws");
  const cookie = (email: string) => {
    const payload = Buffer.from(JSON.stringify({ email, name: "Test", exp: Math.floor(Date.now() / 1000) + 1000 })).toString("base64url");
    return `homeos_session=${payload}.${createHmac("sha256", "terminal-test-secret").update(payload).digest("base64url")}`;
  };
  const devCookie = cookie("developer@example.com"), memberCookie = cookie("member@example.com");
  const clients: WebSocket[] = [];
  t.after(async () => {
    for (const client of clients) client.terminate();
    for (const client of wsServer.clients) client.terminate();
    for (const client of bridge.sockets.clients) client.terminate();
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => bridge.server.close(() => resolve()))]);
    await promisify(execFile)("tmux", ["-S", tmuxSocket, "kill-server"]).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  });
  const request = (method: string, endpoint = "/sessions", body?: unknown, supplied = devCookie, origin = base) => fetch(`${base}/api/dev/terminal${endpoint}`, {
    method, headers: { Cookie: supplied, Origin: origin, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined
  });
  assert.equal((await request("GET", "/sessions", undefined, "")).status, 401);
  assert.equal((await request("GET", "/sessions", undefined, memberCookie)).status, 404);
  assert.equal((await fetch(`${base}/api/checklists`, { headers: { Cookie: memberCookie } })).status, 200);
  assert.equal((await request("POST", "/sessions", { cols: 90, rows: 24 }, devCookie, "https://evil.example")).status, 403);
  const created = await request("POST", "/sessions", { cols: 90, rows: 24 });
  assert.equal(created.status, 201, await created.clone().text());
  const { session } = await created.json() as { session: { id: string } };
  assert.match(session.id, /^cx-/);
  const endpoint = `${wsBase}/api/dev/terminal/sessions/${session.id}/socket`;
  async function rejected(supplied: string, origin: string) {
    const ws = new WebSocket(endpoint, { headers: { Cookie: supplied, Origin: origin } }); clients.push(ws);
    ws.on("error", () => {});
    return new Promise<number>(resolve => ws.once("unexpected-response", (_request, response) => { resolve(response.statusCode!); response.destroy(); ws.terminate(); }));
  }
  assert.equal(await rejected(memberCookie, base), 401);
  assert.equal(await rejected(devCookie, "https://evil.example"), 403);
  async function connect() {
    const ws = new WebSocket(endpoint, { headers: { Cookie: devCookie, Origin: base } }); clients.push(ws);
    let output = "";
    ws.on("message", data => { output += data.toString(); });
    await once(ws, "open");
    return { ws, output: () => output, send: (value: unknown) => ws.send(JSON.stringify(value)) };
  }
  let terminal = await connect();
  await until(() => terminal.output().includes("CODEX-TEST-READY"));
  terminal.send({ type: "resize", cols: 92, rows: 18 });
  await until(() => terminal.output().includes("size:92x18"));
  terminal.send({ type: "input", data: "hello\r" });
  await until(() => terminal.output().includes("hello"));
  terminal.send({ type: "input", data: "\x03" });
  await until(() => terminal.output().includes("\\x03"));
  terminal.ws.close(); await once(terminal.ws, "close");
  assert.equal((await bridge.list()).length, 1, "disconnect must not terminate Codex");
  terminal = await connect();
  await until(() => terminal.output().includes("hello"));
  terminal.ws.close(); await once(terminal.ws, "close");

  // Replacing the bridge process must leave the tmux session intact.
  for (const client of bridge.sockets.clients) client.terminate();
  await new Promise<void>(resolve => bridge.server.close(() => resolve()));
  await unlink(bridgeSocket).catch(() => {});
  bridge = createTerminalBridge(options);
  bridge.server.listen(bridgeSocket); await once(bridge.server, "listening");
  assert.equal((await bridge.list())[0].id, session.id);
  terminal = await connect();
  terminal.send({ type: "input", data: "still-here" });
  await until(() => terminal.output().includes("still-here"));
  terminal.send({ type: "resize", cols: 0, rows: 999999 });
  const [closeCode] = await once(terminal.ws, "close");
  assert.equal(closeCode, 1008);
  assert.equal((await bridge.list()).length, 1);

  const results = await Promise.all([request("POST", "/sessions", { cols: 90, rows: 24 }), request("POST", "/sessions", { cols: 90, rows: 24 })]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  assert.equal((await request("DELETE", `/sessions/${session.id}`)).status, 200);
  assert.ok(!(await bridge.list()).some(item => item.id === session.id));
});
