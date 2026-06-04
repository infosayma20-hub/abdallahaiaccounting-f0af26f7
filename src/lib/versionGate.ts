/**
 * Version Gate — forces stale clients to refresh before showing
 * any post-auth screen. The current build version is set at build
 * time via Vite's `define`; we compare against /api/version.json
 * (a tiny static JSON shipped with every deploy).
 */
// Build version: read from Vite env; falls back to "dev".
const BUILD_VERSION =
  (import.meta as unknown as { env?: { VITE_BUILD_VERSION?: string } })?.env
    ?.VITE_BUILD_VERSION || "dev";

export interface VersionManifest {
  version: string;
  minSupportedBuild?: string;
  forceUpdate?: boolean;
  message?: string;
}

let latestManifest: VersionManifest | null = null;

export function getBuildVersion(): string {
  return BUILD_VERSION;
}

export function getLatestManifest(): VersionManifest | null {
  return latestManifest;
}

export async function fetchLatestVersion(): Promise<VersionManifest | null> {
  try {
    const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as VersionManifest;
    latestManifest = {
      version: String(j.version || ""),
      minSupportedBuild: j.minSupportedBuild ? String(j.minSupportedBuild) : undefined,
      forceUpdate: Boolean(j.forceUpdate),
      message: j.message ? String(j.message) : undefined,
    };
    return latestManifest;
  } catch {
    return null;
  }
}

/** Soft staleness: a newer version is available — show a banner only. */
export function isStale(m: VersionManifest | null = latestManifest): boolean {
  if (!m || !m.version || m.version === "dev" || BUILD_VERSION === "dev") return false;
  return m.version !== BUILD_VERSION;
}

/** Compare semver-ish strings ("1.2.3"). Missing parts treated as 0. */
function cmpSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Hard block: app MUST be replaced before any post-auth screen renders.
 * Triggers when either:
 *   - manifest.forceUpdate === true AND build differs from latest, OR
 *   - manifest.minSupportedBuild is set AND BUILD_VERSION < minSupportedBuild.
 * Always false in dev (BUILD_VERSION === "dev") to keep local work usable.
 */
export function isHardBlocked(m: VersionManifest | null = latestManifest): boolean {
  if (!m || BUILD_VERSION === "dev") return false;
  if (m.forceUpdate && m.version && m.version !== BUILD_VERSION) return true;
  if (m.minSupportedBuild && cmpSemver(BUILD_VERSION, m.minSupportedBuild) < 0) return true;
  return false;
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