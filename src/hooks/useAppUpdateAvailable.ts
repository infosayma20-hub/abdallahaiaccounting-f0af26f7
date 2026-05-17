import { useEffect, useRef, useState } from "react";

declare const __APP_BUILD_TIME__: string;

const CHECK_INTERVAL = 60 * 1000;
const DISMISSED_KEY = "amwali_app_update_dismissed_sig";
const CURRENT_BUILD = __APP_BUILD_TIME__;

type AppVersion = { buildTime?: string };

async function clearBrowserAppCache() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}

  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister().catch(() => undefined)));
  } catch {}
}

function extractAssetSignature(html: string): string {
  // Match Vite hashed assets: /assets/index-XXXX.js|css and any /assets/*-hash.js|css
  const matches = html.match(/\/assets\/[A-Za-z0-9_\-./]+\.(?:js|css)/g) || [];
  return Array.from(new Set(matches)).sort().join("|");
}

function currentAssetSignature(): string {
  const htmlVersion = document.documentElement.getAttribute("data-app-build-time") || "";
  if (htmlVersion) return htmlVersion;

  const scripts = Array.from(document.querySelectorAll('script[src]'))
    .map((s) => s.getAttribute("src") || "")
    .filter((s) => s.includes("/assets/"));
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
    .map((l) => l.getAttribute("href") || "")
    .filter((s) => s.includes("/assets/"));
  return Array.from(new Set([...scripts, ...links])).sort().join("|");
}

async function fetchLatestSignature(): Promise<string> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
  } catch {}

  const versionRes = await fetch(`/app-version.json?__check=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  });

  if (versionRes.ok) {
    const version = (await versionRes.json()) as AppVersion;
    if (version.buildTime) return version.buildTime;
  }

  const res = await fetch(`/index.html?__check=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Accept: "text/html",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  });
  if (!res.ok) return "";
  const html = await res.text();
  return extractAssetSignature(html);
}

export function useAppUpdateAvailable() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newSignature, setNewSignature] = useState<string>("");
  const baseSig = useRef<string>("");
  const checking = useRef(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    // Skip inside iframe/preview
    try {
      if (window.self !== window.top) return;
    } catch {
      return;
    }
    const host = window.location.hostname;
    if (host.includes("id-preview--") || host.includes("lovableproject.com")) return;

    baseSig.current = CURRENT_BUILD || currentAssetSignature();
    console.log("[AppUpdate] base signature:", baseSig.current);

    const check = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        const newSig = await fetchLatestSignature();
        console.log("[AppUpdate] fetched signature:", newSig, "match:", newSig === baseSig.current);
        if (!newSig || !baseSig.current) return;
        if (newSig !== baseSig.current) {
          try {
            const dismissed = localStorage.getItem(DISMISSED_KEY);
            if (dismissed === newSig) return;
          } catch {}
          console.log("[AppUpdate] update detected, showing popup");
          setNewSignature(newSig);
          setUpdateAvailable(true);
        }
      } catch {
        // ignore network errors
      } finally {
        checking.current = false;
      }
    };

    const initial = setTimeout(check, 5 * 1000);
    const interval = setInterval(check, CHECK_INTERVAL);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const dismiss = () => {
    try {
      if (newSignature) localStorage.setItem(DISMISSED_KEY, newSignature);
    } catch {}
    setUpdateAvailable(false);
  };

  const refreshNow = async () => {
    await clearBrowserAppCache();
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("__refresh", Date.now().toString());
      window.location.href = url.toString();
    } catch {
      window.location.href = `${window.location.pathname}?__refresh=${Date.now()}`;
    }
  };

  return { updateAvailable, dismiss, refreshNow };
}
