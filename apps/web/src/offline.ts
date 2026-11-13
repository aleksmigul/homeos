import type { TravelPlan, TravelPlanSummary, TravelRow } from "@homeos/shared";

const accountKey = "homeos-offline-account";
const dataCache = "homeos-private-data-v1";
const travelReadyKey = "/__offline/travel-ready";

export async function forceRefreshApp() {
  if (!navigator.onLine) throw new Error("Reconnect before refreshing the app.");
  // Verify the server is reachable before removing the offline snapshot.
  const response = await fetch(`/api/auth/me?refresh=${Date.now()}`, { cache: "no-store", headers: { "X-HomeOS-Require-Network": "1" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Could not refresh. Check your connection and sign-in, then try again.");
  const registration = await navigator.serviceWorker?.getRegistration();
  await registration?.update();
  // Versioned service workers replace app files only after the next shell has
  // downloaded successfully. Refreshing must preserve the usable offline copy.
  window.location.reload();
}

export async function configureOfflineAccount(email: string, user?: unknown) {
  if (!("caches" in window)) return;
  const previous = localStorage.getItem(accountKey);
  if (previous && previous !== email) await caches.delete(dataCache);
  localStorage.setItem(accountKey, email);
  if (user) {
    const cache = await caches.open(dataCache);
    await cache.put("/api/auth/me", jsonResponse({ user }));
  }
  await navigator.storage?.persist?.().catch(() => false);
}

export async function clearOfflineAccount() {
  localStorage.removeItem(accountKey);
  if ("caches" in window) await caches.delete(dataCache);
  // Cache Storage is shared with the worker; no delayed clear message can race
  // with the next account's download.
}

export function offlineAccountMatches(email: string) { return localStorage.getItem(accountKey) === email; }
export async function offlineDataCache() { return "caches" in window ? caches.open(dataCache) : null; }
export async function offlineTravelSavedAt(): Promise<string | null> {
  const response = await (await offlineDataCache())?.match(travelReadyKey);
  return response ? (await response.json()).savedAt : null;
}
export async function markTravelAvailableOffline(cache: Cache) {
  const savedAt = new Date().toISOString();
  await cache.put(travelReadyKey, jsonResponse({ savedAt }));
  return savedAt;
}
export async function markTravelDownloadStarted(cache: Cache) { await cache.delete(travelReadyKey); }
export async function waitForOfflineShell() {
  if (!("serviceWorker" in navigator)) throw new Error("Offline access is not supported in this browser.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("The app could not finish downloading for offline use. Reopen it online to retry.")), 20_000); }),
    ]);
  } finally { clearTimeout(timer); }
}
const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

export async function cacheTravelPlan(plan: TravelPlan) {
  const cache = await offlineDataCache();
  if (!cache || !localStorage.getItem(accountKey)) return;
  await cache.put(`/api/travel-plans/${encodeURIComponent(plan.id)}`, jsonResponse({ travelPlan: plan }));
  const response = await cache.match("/api/travel-plans");
  if (!response) return;
  const { travelPlans } = await response.json() as { travelPlans: TravelPlanSummary[] };
  const { rows: _rows, ...summary } = plan;
  const index = travelPlans.findIndex(item => item.id === plan.id);
  if (index < 0) travelPlans.unshift(summary); else travelPlans[index] = summary;
  await cache.put("/api/travel-plans", jsonResponse({ travelPlans }));
}
export async function cacheTravelRow(row: TravelRow) {
  const cache = await offlineDataCache();
  const response = await cache?.match(`/api/travel-plans/${encodeURIComponent(row.planId)}`);
  if (!response) return;
  const { travelPlan } = await response.json() as { travelPlan: TravelPlan };
  await cacheTravelPlan({ ...travelPlan, updatedAt: row.updatedAt, rows: travelPlan.rows.map(item => item.id === row.id ? row : item) });
}
export async function removeOfflineTravelPlan(id: string) {
  const cache = await offlineDataCache();
  if (!cache) return;
  await cache.delete(`/api/travel-plans/${encodeURIComponent(id)}`);
  await cache.delete(`/api/travel-plans/${encodeURIComponent(id)}/emails`);
  const response = await cache.match("/api/travel-plans");
  if (response) {
    const { travelPlans } = await response.json() as { travelPlans: TravelPlanSummary[] };
    await cache.put("/api/travel-plans", jsonResponse({ travelPlans: travelPlans.filter(item => item.id !== id) }));
  }
}

export async function storagePressure() {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  if (!quota) return null;
  return { usage, quota, ratio: usage / quota };
}
