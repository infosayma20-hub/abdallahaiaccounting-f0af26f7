/**
 * Registration helper for the app-shell service worker.
 *
 * The worker makes the program open and navigate without internet.
 * It is intentionally skipped inside the Lovable preview iframe (where the
 * platform unregisters workers) and on localhost dev.
 */

const SW_URL = "/app-shell-sw.js";

function isPreviewOrIframe(): boolean {
  let inIframe = true;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  const host = window.location.hostname;
  const isPreviewHost = host.includes("id-preview--") || host.includes("lovableproject.com");
  return inIframe || isPreviewHost;
}

export function registerAppShellSW(): void {
  if (!("serviceWorker" in navigator)) return;
  if (isPreviewOrIframe()) return;
  if (import.meta.env.DEV) return;

  // Register immediately: waiting for `load` left a window where a slow first
  // visit could lose connectivity before any worker existed.
  void navigator.serviceWorker
    .register(SW_URL, { scope: "/" })
    .then(async (registration) => {
      const ready = await navigator.serviceWorker.ready;
      (ready.active || registration.active || registration.waiting)?.postMessage({ type: "CACHE_SHELL" });
    })
    .catch(() => {
      /* best-effort: offline shell is an enhancement, never a hard failure */
    });
}

/** Drop the cached shell/assets — called by the force-update path. */
export async function clearAppShellCache(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration(SW_URL);
    reg?.active?.postMessage({ type: "CLEAR_SHELL_CACHE" });
  } catch {
    /* ignore */
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("amwali-")).map((k) => caches.delete(k)));
  } catch {
    /* ignore */
  }
}
