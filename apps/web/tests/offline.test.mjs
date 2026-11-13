import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/offline.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function fixture({ online = true, reachable = true, worker = true } = {}) {
  const calls = [];
  const caches = {
    keys: async () => ["homeos-shell-v3", "homeos-private-data-v1", "unrelated"],
    delete: async key => { calls.push(key); return true; }
  };
  const context = {
    exports: {}, AbortSignal, caches,
    navigator: { onLine: online, ...(worker ? { serviceWorker: { getRegistration: async () => ({ update: async () => calls.push("update") }) } } : {}) },
    window: { caches, location: { reload: () => calls.push("reload") } },
    fetch: async (_url, options) => { assert.equal(options.cache, "no-store"); return { ok: reachable }; }
  };
  vm.runInNewContext(code, context);
  return { refresh: context.exports.forceRefreshApp, calls };
}

test("force refresh updates the worker and preserves the usable offline copy", async () => {
  const { refresh, calls } = fixture();
  await refresh();
  assert.deepEqual(calls, ["update", "reload"]);
});
test("force refresh works without service worker support", async () => {
  const { refresh, calls } = fixture({ worker: false });
  await refresh();
  assert.equal(calls.at(-1), "reload");
});
for (const options of [{ online: false }, { reachable: false }]) {
  test(`failed refresh preserves offline caches: ${JSON.stringify(options)}`, async () => {
    const { refresh, calls } = fixture(options);
    await assert.rejects(refresh());
    assert.deepEqual(calls, []);
  });
}
