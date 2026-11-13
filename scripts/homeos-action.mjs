const [command, moduleId, actionId, inputJson] = process.argv.slice(2);
const token = process.env.CODEX_WORKER_TOKEN;
const apiBase = process.env.HOMEOS_API_URL ?? "http://127.0.0.1:4000/api";
const user = process.env.HOMEOS_USER ?? "";

if (!token) {
  console.error("CODEX_WORKER_TOKEN is not configured");
  process.exit(1);
}

const usage = `Usage:
  node scripts/homeos-action.mjs modules
  node scripts/homeos-action.mjs describe <module>
  node scripts/homeos-action.mjs content <module>
  node scripts/homeos-action.mjs act <module> <action> ['{"field":"value"}']`;

let path;
let method = "GET";
let body;

if (command === "modules" && !moduleId) {
  path = "/internal/modules";
} else if (command === "describe" && moduleId && !actionId) {
  path = `/internal/modules/${encodeURIComponent(moduleId)}`;
} else if (command === "content" && moduleId && !actionId) {
  path = `/internal/modules/${encodeURIComponent(moduleId)}/content`;
} else if (command === "act" && moduleId && actionId) {
  path = `/internal/modules/${encodeURIComponent(moduleId)}/actions/${encodeURIComponent(actionId)}`;
  method = "POST";
  try {
    body = JSON.stringify(inputJson ? JSON.parse(inputJson) : {});
  } catch {
    console.error("Action input must be a valid JSON object");
    process.exit(2);
  }
} else {
  console.error(usage);
  process.exit(2);
}

const response = await fetch(`${apiBase}${path}`, {
  method,
  headers: {
    Authorization: `Bearer ${token}`,
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(user ? { "X-HomeOS-User": user } : {})
  },
  body
});

const responseBody = await response.text();
if (!response.ok) {
  console.error(`HomeOS API failed (HTTP ${response.status}): ${responseBody}`);
  process.exit(1);
}

try {
  console.log(JSON.stringify(JSON.parse(responseBody), null, 2));
} catch {
  console.log(responseBody);
}
