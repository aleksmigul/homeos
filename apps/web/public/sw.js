const SHELL_CACHE = "homeos-shell-v3";
const DATA_CACHE = "homeos-private-data-v1";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/favicon.png", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("homeos-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_PRIVATE_DATA") event.waitUntil(caches.delete(DATA_CACHE));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method === "POST" && url.pathname === "/share") { event.respondWith(handleShare(event.request)); return; }
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) { event.respondWith(networkFirstApi(event.request)); return; }
  if (event.request.mode === "navigate") { event.respondWith(networkFirstNavigation(event.request)); return; }
  event.respondWith(cacheFirstAsset(event.request));
});

async function networkFirstApi(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response(JSON.stringify({ error: "This information has not been downloaded for offline use." }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put("/", response.clone()).catch(() => undefined);
    return response;
  } catch {
    return (await cache.match("/")) || new Response("HomeOS is unavailable offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
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
    const response = await fetch("/api/share-attachments", { method: "POST", credentials: "include", headers: { "Content-Type": image.type, "X-File-Name": encodeURIComponent(image.name) }, body: image });
    if (response.ok) { const { attachment } = await response.json(); destination.searchParams.append("attachment", attachment.id); }
    else destination.searchParams.set("shareError", response.status === 401 ? "Sign in, then share again." : "One of the images could not be received.");
  }
  return Response.redirect(destination.toString(), 303);
}
