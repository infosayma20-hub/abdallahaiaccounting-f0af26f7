import { useEffect, useRef, useState } from "react";

const CHECK_INTERVAL = 60 * 1000;
const DISMISSED_KEY = "amwali_app_update_dismissed_sig";

function extractAssetSignature(html: string): string {
  // Match Vite hashed assets: /assets/index-XXXX.js|css and any /assets/*-hash.js|css
  const matches = html.match(/\/assets\/[A-Za-z0-9_\-./]+\.(?:js|css)/g) || [];
  return Array.from(new Set(matches)).sort().join("|");
}

function currentAssetSignature(): string {
  const scripts = Array.from(document.querySelectorAll('script[src]'))
    .map((s) => s.getAttribute("src") || "")
    .filter((s) => s.includes("/assets/"));
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
    .map((l) => l.getAttribute("href") || "")
    .filter((s) => s.includes("/assets/"));
  return Array.from(new Set([...scripts, ...links])).sort().join("|");
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

    baseSig.current = currentAssetSignature();

    const check = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        const res = await fetch(`/index.html?__check=${Date.now()}`, {
          cache: "no-store",
          headers: { Accept: "text/html" },
        });
        if (!res.ok) return;
        const html = await res.text();
        const newSig = extractAssetSignature(html);
        if (!newSig || !baseSig.current) return;
        if (newSig !== baseSig.current) {
          try {
            const dismissed = localStorage.getItem(DISMISSED_KEY);
            if (dismissed === newSig) return;
          } catch {}
          setNewSignature(newSig);
          setUpdateAvailable(true);
        }
      } catch {
        // ignore network errors
      } finally {
        checking.current = false;
      }
    };

    const initial = setTimeout(check, 15 * 1000);
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
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
    } catch {}
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("__refresh", Date.now().toString());
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  };

  return { updateAvailable, dismiss, refreshNow };
}
