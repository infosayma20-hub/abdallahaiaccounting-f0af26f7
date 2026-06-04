/**
 * Version-update utilities.
 *
 * Hard rules:
 *  - NEVER call localStorage.clear() or sessionStorage.clear().
 *  - NEVER touch Supabase auth tokens (`sb-*-auth-token`).
 *  - Only Cache Storage and Service Worker registrations may be wiped.
 *  - Single attempt per call; no retry loops.
 */

const RELOAD_SENTINEL = "amwali:vg:lastReloadTs";
const RELOAD_DEBOUNCE_MS = 30_000; // refuse to reload twice within 30s

export async function clearServiceWorkers(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* swallow — best-effort */
  }
}

export async function clearCacheStorage(): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* swallow */
  }
}

/**
 * Hard-refresh the page to the latest build with a debounce guard so a
 * faulty manifest cannot trigger an infinite reload loop.
 */
export async function hardRefreshToLatest(latestBuild: number | string): Promise<boolean> {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_SENTINEL) || "0");
    if (last && Date.now() - last < RELOAD_DEBOUNCE_MS) {
      // eslint-disable-next-line no-console
      console.warn("[version] reload skipped — debounced to prevent loop");
      return false;
    }
    sessionStorage.setItem(RELOAD_SENTINEL, String(Date.now()));
  } catch {
    /* sessionStorage unavailable — proceed but accept the risk once */
  }

  await clearServiceWorkers();
  await clearCacheStorage();

  const url = new URL(window.location.href);
  url.searchParams.set("v", String(latestBuild));
  url.searchParams.set("t", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}