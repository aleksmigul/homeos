self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share") return;
  event.respondWith(handleShare(event.request));
});

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
    if (response.ok) {
      const { attachment } = await response.json();
      destination.searchParams.append("attachment", attachment.id);
    } else {
      destination.searchParams.set("shareError", response.status === 401 ? "Sign in, then share again." : "One of the images could not be received.");
    }
  }
  return Response.redirect(destination.toString(), 303);
}
