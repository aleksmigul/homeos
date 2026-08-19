import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const apiBase = "http://127.0.0.1:4000/api/internal/codex";
const token = process.env.CODEX_WORKER_TOKEN;
if (!token) process.exit(0);

const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function finishJob(id, response, error) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const result = await fetch(`${apiBase}/${id}/finish`, {
        method: "POST",
        headers,
        body: JSON.stringify({ response, error }),
      });
      if (!result.ok) throw new Error(`Finish request returned HTTP ${result.status}`);
      return;
    } catch (cause) {
      lastError = cause;
      await wait(1000);
    }
  }
  throw lastError;
}

let claimed;
for (let attempt = 0; attempt < 10 && !claimed; attempt += 1) {
  try {
    const result = await fetch(`${apiBase}/claim`, { method: "POST", headers });
    if (!result.ok) throw new Error(`Claim request returned HTTP ${result.status}`);
    claimed = await result.json();
  } catch {
    await wait(500);
  }
}
if (!claimed?.request) process.exit(0);

const job = claimed.request;
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "homeos-codex-"));
const output = path.join(dir, "response.txt");
let error = "";
let response = "";

try {
  response = await new Promise((resolve, reject) => {
    const deploy = job.kind === "deploy";
    const push = job.kind === "push";
    const child = spawn(
      deploy ? "/root/homeos/scripts/deploy-homeos.sh" : push ? "/root/homeos/scripts/push-homeos.sh" : "/root/.local/bin/codex",
      deploy || push ? [] : ["-a", "never", "exec", "-C", "/root/homeos", "-s", "workspace-write", "--output-last-message", output, "-"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", async (code) => code === 0
      ? resolve(deploy || push ? stdout : await fs.readFile(output, "utf8").catch(() => stdout))
      : reject(new Error(stderr || stdout || `Process exited ${code}`)));
    if (!deploy && !push) child.stdin.end(`${job.prompt}\n\nWork only in /root/homeos. Do not deploy, change system configuration, access secrets, or modify files outside the repository. Run relevant checks and summarize changes.`);
  });
} catch (cause) {
  error = cause instanceof Error ? cause.message : String(cause);
}

try {
  await finishJob(job.id, response, error);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
