import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { chmodSync, existsSync, lstatSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";

const exec = promisify(execFile);
export const terminalId = /^cx-[a-f0-9-]{36}$/;
export const terminalSize = z.object({ cols: z.number().int().min(20).max(400), rows: z.number().int().min(5).max(200) });
export type TerminalSession = { id: string; createdAt: string; ended: boolean };

// The helper only attaches a tmux client. Closing it detaches, leaving Codex alive.
const ptyHelper = String.raw`
import os, pty, sys, select, json, fcntl, termios, struct, signal
pid, fd = pty.fork()
if pid == 0:
    os.execvp('tmux', ['tmux', '-S', sys.argv[1], 'attach-session', '-t', sys.argv[2]])
def resize(cols, rows):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
def stop(*args):
    raise SystemExit()
signal.signal(signal.SIGTERM, stop)
resize(int(sys.argv[3]), int(sys.argv[4]))
buffer = b''
try:
    while True:
        ready, _, _ = select.select([fd, 0], [], [])
        if fd in ready:
            try:
                data = os.read(fd, 65536)
            except OSError:
                break
            if not data: break
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()
        if 0 in ready:
            data = os.read(0, 65536)
            if not data: break
            buffer += data
            while b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                command = json.loads(line)
                if command['type'] == 'resize':
                    resize(command['cols'], command['rows'])
                elif command['type'] == 'input':
                    pending = command['data'].encode('utf-8')
                    while pending:
                        written = os.write(fd, pending)
                        pending = pending[written:]
finally:
    os.close(fd)
    try: os.kill(pid, signal.SIGHUP)
    except ProcessLookupError: pass
    os.waitpid(pid, 0)
`;

export function createTerminalBridge(options: { tmuxSocket: string; workspace: string; command: string[]; maxSessions?: number }) {
  const tmux = async (...args: string[]) => (await exec("tmux", ["-S", options.tmuxSocket, "-f", "/dev/null", ...args], { timeout: 5000, maxBuffer: 1024 * 1024 })).stdout;
  async function list(): Promise<TerminalSession[]> {
    if (!existsSync(options.tmuxSocket)) return [];
    let output: string;
    try { output = await tmux("list-sessions", "-F", "#{session_name}\t#{session_created}\t#{pane_dead}"); }
    catch (error) {
      if (/no server running|error connecting|no such file/i.test(String((error as { stderr?: string }).stderr))) return [];
      throw error;
    }
    return output.trim().split("\n").filter(Boolean).map(line => {
      const [id, created, dead] = line.split("\t");
      return { id, createdAt: new Date(Number(created) * 1000).toISOString(), ended: dead === "1" };
    }).filter(session => terminalId.test(session.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  // Serialize creation so concurrent browser tabs cannot exceed the session limit.
  let creating: Promise<unknown> = Promise.resolve();
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const respond = (status: number, value: unknown) => { res.writeHead(status); res.end(JSON.stringify(value)); };
    try {
      if (req.method === "GET" && req.url === "/sessions") return respond(200, { sessions: await list() });
      if (req.method === "POST" && req.url === "/sessions") {
        let body = "";
        for await (const chunk of req) { body += chunk; if (body.length > 2048) return respond(413, { error: "Request too large" }); }
        const size = terminalSize.parse(JSON.parse(body || '{"cols":100,"rows":30}'));
        const previous = creating;
        let release!: () => void;
        creating = new Promise(resolve => { release = () => resolve(undefined); });
        await previous;
        try {
          if ((await list()).length >= (options.maxSessions ?? 4)) return respond(409, { error: "End an existing session before creating another (maximum 4)." });
          const id = `cx-${randomUUID()}`;
          // tmux accepts argv directly: neither the browser nor a shell supplies the command.
          await tmux("new-session", "-d", "-s", id, "-c", options.workspace, "-x", String(size.cols), "-y", String(size.rows), ...options.command);
          chmodSync(options.tmuxSocket, 0o600);
          await tmux("set-option", "-t", id, "status", "off");
          await tmux("set-window-option", "-t", id, "remain-on-exit", "on");
          await tmux("set-window-option", "-t", id, "history-limit", "20000");
          return respond(201, { session: (await list()).find(session => session.id === id) });
        } finally { release(); }
      }
      const match = req.url?.match(/^\/sessions\/(cx-[a-f0-9-]{36})$/);
      if (req.method === "DELETE" && match) {
        if (!(await list()).some(session => session.id === match[1])) return respond(404, { error: "Session not found" });
        await tmux("kill-session", "-t", match[1]);
        return respond(200, { ended: true });
      }
      respond(404, { error: "Not found" });
    } catch (error) {
      console.error("Terminal bridge request failed", error instanceof Error ? error.message : error);
      respond(error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503, { error: "Could not access Codex Terminal. Check the bridge service." });
    }
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  const message = z.discriminatedUnion("type", [
    z.object({ type: z.literal("input"), data: z.string().max(64000) }),
    terminalSize.extend({ type: z.literal("resize") })
  ]);
  server.on("upgrade", async (req, socket, head) => {
    socket.on("error", () => {});
    const match = req.url?.match(/^\/sessions\/(cx-[a-f0-9-]{36})\/socket$/);
    try {
      if (!match || !(await list()).some(session => session.id === match[1])) { socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"); return; }
      sockets.handleUpgrade(req, socket, head, ws => {
        const child = spawn("python3", ["-u", "-c", ptyHelper, options.tmuxSocket, match[1], "100", "30"], {
          env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" }, stdio: ["pipe", "pipe", "pipe"]
        });
        child.stdin.on("error", () => {});
        child.stdout.on("data", data => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (ws.bufferedAmount > 1024 * 1024) ws.close(1013, "Reconnect to refresh the terminal");
          else ws.send(data, { binary: true });
        });
        child.stderr.on("data", () => {});
        child.on("error", () => ws.close(1011, "Could not attach terminal"));
        child.on("exit", () => ws.close(1000, "Terminal detached"));
        ws.on("message", (data, binary) => {
          if (binary) { ws.close(1008, "Expected terminal message"); return; }
          try {
            const command = message.parse(JSON.parse(data.toString()));
            if (child.stdin.writableLength > 1024 * 1024) { ws.close(1013, "Input buffer full"); return; }
            child.stdin.write(JSON.stringify(command) + "\n");
          } catch { ws.close(1008, "Invalid terminal message"); }
        });
        ws.on("error", () => {});
        ws.on("close", () => {
          child.stdin.end();
          const timer = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 2000);
          timer.unref();
          child.once("exit", () => clearTimeout(timer));
        });
      });
    } catch { socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n"); }
  });
  return { server, sockets, list };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const socket = process.env.CODEX_TERMINAL_SOCKET ?? "/run/homeos-codex/bridge.sock";
  if (existsSync(socket)) {
    if (!lstatSync(socket).isSocket()) throw new Error("Bridge path is not a socket");
    unlinkSync(socket);
  }
  const workspace = process.env.CODEX_TERMINAL_WORKSPACE ?? "/root/homeos";
  const bridge = createTerminalBridge({
    tmuxSocket: process.env.CODEX_TERMINAL_TMUX_SOCKET ?? "/run/homeos-codex/tmux.sock", workspace,
    command: [process.env.CODEX_TERMINAL_CODEX ?? "/root/.local/bin/codex", "-C", workspace, "-s", "workspace-write", "-a", "on-request", "--no-alt-screen", "--no-daemon"]
  });
  bridge.server.listen(socket, () => { chmodSync(socket, 0o660); console.log("Codex Terminal bridge ready"); });
  const shutdown = () => { for (const client of bridge.sockets.clients) client.terminate(); bridge.server.close(() => process.exit(0)); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
