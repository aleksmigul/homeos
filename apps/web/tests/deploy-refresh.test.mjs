import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/deployRefresh.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function fixture({ version = "current", online = true, unavailable = false } = {}) {
  const calls = [];
  const listeners = {};
  const caches = {
    keys: async () => ["homeos-shell-v4", "homeos-private-data-v1", "unrelated"],
    delete: async key => calls.push(key)
  };
  const window = {
    caches,
    location: { href: "https://homeos.example/", origin: "https://homeos.example", reload: () => calls.push("reload") },
    addEventListener: (type, handler) => { listeners[type] = handler; },
    fetch: async (input, options) => {
      if (String(input).startsWith("/api/version?")) {
        calls.push("check");
        assert.equal(options.cache, "no-store");
        if (unavailable) throw new Error("Offline");
        return { ok: true, json: async () => ({ version }) };
      }
      calls.push(input);
      return { ok: true };
    }
  };
  const context = { exports: {}, window, navigator: { onLine: online }, caches, URL, Request, AbortSignal };
  vm.runInNewContext(code, context);
  context.exports.installDeployRefresh("current");
  return { window, calls, listeners };
}

test("a changed release prevents a mutation and reloads while preserving offline files", async () => {
  const { window, calls } = fixture({ version: "new-release" });
  await assert.rejects(window.fetch("/api/todos", { method: "POST" }), /Refreshing/);
  assert.deepEqual(calls, ["check", "reload"]);
  await assert.rejects(window.fetch("/api/todos"));
  assert.equal(calls.filter(call => call === "reload").length, 1);
});

test("concurrent requests share a check and then continue on the current release", async () => {
  const { window, calls } = fixture();
  await Promise.all([window.fetch("/api/todos"), window.fetch("/api/shopping")]);
  assert.deepEqual(calls, ["check", "/api/todos", "/api/shopping"]);
});

for (const options of [{ online: false }, { unavailable: true }, { version: null }]) {
  test(`offline or unavailable version preserves existing behavior: ${JSON.stringify(options)}`, async () => {
    const { window, calls } = fixture(options);
    await window.fetch("/api/todos");
    assert.equal(calls.at(-1), "/api/todos");
    assert.ok(!calls.includes("reload"));
  });
}

test("client-only clicks check for updates without polling", async () => {
  const { calls, listeners } = fixture({ version: "next" });
  assert.deepEqual(calls, []);
  listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ["check", "reload"]);
});

test("third party requests are unaffected", async () => {
  const { window, calls } = fixture({ version: "next" });
  await window.fetch("https://other.example/resource");
  assert.deepEqual(calls, ["https://other.example/resource"]);
});
