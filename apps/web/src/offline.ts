const accountKey = "homeos-offline-account";
const dataCache = "homeos-private-data-v1";

export async function configureOfflineAccount(email: string) {
  await navigator.serviceWorker?.ready;
  const previous = localStorage.getItem(accountKey);
  if (previous && previous !== email) await caches.delete(dataCache);
  localStorage.setItem(accountKey, email);
  await navigator.storage?.persist?.().catch(() => false);
}

export async function clearOfflineAccount() {
  localStorage.removeItem(accountKey);
  await caches.delete(dataCache);
  navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_PRIVATE_DATA" });
}

export async function storagePressure() {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  if (!quota) return null;
  return { usage, quota, ratio: usage / quota };
}
