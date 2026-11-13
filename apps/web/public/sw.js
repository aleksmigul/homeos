const BUILD_VERSION = "__HOMEOS_BUILD_VERSION__";
const BUILD_ASSETS = /* __HOMEOS_BUILD_ASSETS__ */ [];
const SHELL_CACHE = `homeos-shell-${BUILD_VERSION}`;
const DATA_CACHE = "homeos-private-data-v1";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/favicon.png", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", ...BUILD_ASSETS];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then(async cache => {
    // Install HTML, CSS and every JS chunk together, including on the first
    // visit before this worker controls the page.
    await cache.addAll(SHELL_URLS.map(url => new Request(url, { cache: "reload" })));
    const html = await (await cache.match("/")).text();
    if (!matchesBuild(html)) throw new Error("The app changed during download; retry on the next visit.");
  }).then(() => self.skipWaiting()).catch(async error => { await caches.delete(SHELL_CACHE); throw error; }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("homeos-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_PRIVATE_DATA") event.waitUntil(caches.delete(DATA_CACHE));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    if (event.request.method === "GET" && event.request.destination === "image") event.respondWith(cacheFirstPrivateAsset(event.request));
    return;
  }
  if (event.request.method === "POST" && url.pathname === "/share") { event.respondWith(handleShare(event.request)); return; }
  if (event.request.method !== "GET") return;
  // A cached version must never make a stale client appear current.
  if (url.pathname === "/api/version" || url.pathname.startsWith("/api/dev/")) { event.respondWith(fetch(event.request, { cache: "no-store" })); return; }
  if (url.pathname.startsWith("/api/saved-attachments/")) { event.respondWith(cacheFirstPrivateAsset(event.request)); return; }
  if (url.pathname.startsWith("/api/")) { event.respondWith(networkFirstApi(event.request)); return; }
  if (event.request.mode === "navigate") { event.respondWith(networkFirstNavigation(event.request)); return; }
  event.respondWith(cacheFirstAsset(event.request));
});

async function networkFirstApi(request) {
  const cache = await caches.open(DATA_CACHE);
  const requireNetwork = request.headers.get("X-HomeOS-Require-Network") === "1";
  try {
    const response = await fetchWithTimeout(request);
    if (response.status >= 500 && !requireNetwork) {
      const cached = await cache.match(request);
      if (cached) return offlineResponse(cached);
    }
    if (response.ok) await cache.put(request, response.clone()).catch(() => undefined);
    if (response.status === 404) await cache.delete(request);
    return response;
  } catch {
    if (requireNetwork) return new Response("Network unavailable", { status: 503 });
    const cached = await cache.match(request);
    return cached ? offlineResponse(cached) : new Response(JSON.stringify({ error: "This information has not been downloaded for offline use. Open the app online first." }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
}

function offlineResponse(response) {
  const headers = new Headers(response.headers);
  // Fetch has already decoded a compressed network body.
  headers.delete("Content-Encoding");
  headers.delete("Content-Length");
  headers.set("X-HomeOS-Offline", "1");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function fetchWithTimeout(request) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) controller.abort();
  const timer = setTimeout(abort, 5_000);
  try { return await fetch(request, { cache: "no-store", signal: controller.signal }); }
  finally { clearTimeout(timer); request.signal.removeEventListener("abort", abort); }
}

function matchesBuild(html) { return BUILD_ASSETS.length === 0 || BUILD_ASSETS.some(path => path.endsWith(".js") && html.includes(path)); }

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetchWithTimeout(request);
    if (response.status >= 500) throw new Error("App unavailable");
    if (response.ok && matchesBuild(await response.clone().text())) await cache.put("/", response.clone()).catch(() => undefined);
    return response;
  } catch {
    return (await cache.match("/")) || new Response("HomeOS is unavailable offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function cacheFirstPrivateAsset(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") await cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch { return new Response("", { status: 504 }); }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    return new Response("", { status: 504 });
  }
}

async function handleShare(request) {
  const data = await request.formData();
  const destination = new URL("/share", self.location.origin);
  for (const field of ["title", "text", "url"]) {
    const value = data.get(field);
    if (typeof value === "string" && value) destination.searchParams.set(field, value);
  }
  for (const image of data.getAll("images")) {
    if (!(image instanceof File) || !image.size) continue;
    const response = await fetch("/api/share-attachments", { method: "POST", credentials: "include", headers: { "Content-Type": image.type || "application/octet-stream", "X-File-Name": encodeURIComponent(image.name) }, body: image });
    if (response.ok) { const { attachment } = await response.json(); destination.searchParams.append("attachment", attachment.id); }
    else destination.searchParams.set("shareError", response.status === 401 ? "Sign in, then share again." : "One of the files could not be received.");
  }
  return Response.redirect(destination.toString(), 303);
}
