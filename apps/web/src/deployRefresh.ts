// No polling: check on interaction and before API requests (including uploads).
export function installDeployRefresh(buildVersion: string) {
  const originalFetch = window.fetch.bind(window);
  let pending: Promise<boolean> | undefined;
  let refreshing = false;

  async function checkVersion(): Promise<boolean> {
    if (refreshing) return false;
    if (!navigator.onLine) return true;
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await originalFetch(`/api/version?check=${Date.now()}`, {
          cache: "no-store", signal: AbortSignal.timeout(5_000)
        });
        if (!response.ok) return true;
        const { version } = await response.json();
        if (typeof version !== "string" || version === buildVersion) return true;
        refreshing = true;
        // The worker installs a complete, versioned shell before removing the
        // previous one. Keep the working offline copy during this reload.
        window.location.reload();
        return false;
      } catch {
        // A failed check must not disable offline access or existing actions.
        if (refreshing) {
          window.location.reload();
          return false;
        }
        return true;
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  }

  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith("/api/") && url.pathname !== "/api/version") {
      if (!await checkVersion()) throw new Error("The app has been updated. Refreshing…");
    }
    return originalFetch(input, init);
  };
  // Capture also catches navigation within the client that makes no API request.
  const onInteraction = () => { void checkVersion(); };
  window.addEventListener("click", onInteraction, true);
  window.addEventListener("submit", onInteraction, true);
}
