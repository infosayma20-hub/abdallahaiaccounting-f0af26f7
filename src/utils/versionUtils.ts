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
      await Promise.all(
        regs
          .filter((r) => {
            const scriptURL = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || "";
            return scriptURL.includes("/sw.js") || scriptURL.includes("/service-worker.js");
          })
          .map((r) => r.unregister().catch(() => false)),
      );
    }
  } catch {
    /* swallow — best-effort */
  }
}

export async function clearCacheStorage(): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(k) || k.includes("workbox") || k.startsWith("amwali-"))
          .map((k) => caches.delete(k).catch(() => false)),
      );
    }
  } catch {
    /* swallow */
  }
}

/**
 * Hard-refresh the page to the latest build with a debounce guard so a
 * faulty manifest cannot trigger an infinite reload loop.
 */
export async function hardRefreshToLatest(
  latestBuild: number | string,
  reason = "version",
): Promise<boolean> {
  // Debounce per reason: a chunk-404 recovery must not be swallowed just
  // because the version poller reloaded moments earlier (and vice-versa).
  const sentinelKey = `${RELOAD_SENTINEL}:${reason}`;
  try {
    const last = Number(sessionStorage.getItem(sentinelKey) || "0");
    if (last && Date.now() - last < RELOAD_DEBOUNCE_MS) {
      // eslint-disable-next-line no-console
      console.warn(`[version] reload skipped (${reason}) — debounced to prevent loop`);
      return false;
    }
    sessionStorage.setItem(sentinelKey, String(Date.now()));
  } catch {
    /* sessionStorage unavailable — proceed but accept the risk once */
  }

  await clearServiceWorkers();
  await clearCacheStorage();

  const url = new URL(window.location.href);
  url.searchParams.delete("__recover");
  url.searchParams.delete("__hard");
  url.searchParams.delete("__refresh");
  url.searchParams.delete("sw-cleanup");
  url.searchParams.set("v", String(latestBuild));
  url.searchParams.set("t", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}