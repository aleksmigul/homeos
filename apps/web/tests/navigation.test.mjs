import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/navigation.ts', import.meta.url), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { navigationFromPath, pathFromNavigation } = context.exports;
test('day editor has a refreshable URL, while itinerary has its own URL', () => {
  const path = '/travel/plans/trip/days/day-1';
  const state = navigationFromPath(path);
  assert.equal(state.travelPlanId, 'trip');
  assert.equal(state.travelRowId, 'day-1');
  assert.equal(pathFromNavigation(state), path);
  assert.equal(pathFromNavigation({ ...state, travelRowId: undefined }), '/travel/plans/trip');
  assert.equal(navigationFromPath(path + '/invalid'), null);
});

test('interactive Codex module has its own route alongside the existing Dev module', () => {
  assert.equal(navigationFromPath('/codex-terminal').module, 'codex-terminal');
  assert.equal(pathFromNavigation({ module: 'codex-terminal' }), '/codex-terminal');
  assert.equal(navigationFromPath('/dev').module, 'dev');
  assert.equal(pathFromNavigation({ module: 'dev' }), '/dev');
  assert.equal(navigationFromPath('/codex-terminal/invalid'), null);
});
