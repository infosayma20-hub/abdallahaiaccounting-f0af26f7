/**
 * Version Gate — forces stale clients to refresh before showing
 * any post-auth screen. The current build version is set at build
 * time via Vite's `define`; we compare against /api/version.json
 * (a tiny static JSON shipped with every deploy).
 */
const BUILD_VERSION =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof __BUILD_VERSION__ !== "undefined" ? (__BUILD_VERSION__ as string) : "dev");

declare const __BUILD_VERSION__: string;

let latest: string | null = null;

export function getBuildVersion(): string {
  return BUILD_VERSION;
}

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    latest = String(j.version || "");
    return latest;
  } catch {
    return null;
  }
}

export function isStale(currentLatest: string | null = latest): boolean {
  if (!currentLatest || currentLatest === "dev") return false;
  return currentLatest !== BUILD_VERSION;
}

export async function clearAppCachesAndReload(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    // Preserve auth tokens — only drop volatile UI caches.
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("amwali-open-tabs") || k.includes("lastVisitedRoute")) {
        localStorage.removeItem(k);
      }
    });
  } catch {
    /* best-effort */
  }
  window.location.reload();
}