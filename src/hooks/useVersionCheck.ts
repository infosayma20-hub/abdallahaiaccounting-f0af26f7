import { useEffect, useState } from "react";
import { APP_BUILD } from "@/config/appVersion";

export interface VersionManifest {
  latestBuild: number;
  minSupportedBuild: number;
  forceUpdate: boolean;
  message?: string;
  updatedAt?: string;
}

export interface VersionCheckState {
  manifest: VersionManifest | null;
  isOutdated: boolean;       // soft — newer build available
  isHardBlocked: boolean;    // hard — APP_BUILD < minSupportedBuild OR forceUpdate set
  appBuild: number;
  lastCheckedAt: number | null;
}

const SESSION_KEY = "amwali:vg:manifest";
const SESSION_TTL_MS = 60_000; // 1 minute cache
const FETCH_TIMEOUT_MS = 2_000;
const INITIAL_DELAY_MS = 500;
const POLL_INTERVAL_MS = 5 * 60_000;

function readCache(): VersionManifest | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; m: VersionManifest };
    if (Date.now() - parsed.ts > SESSION_TTL_MS) return null;
    return parsed.m;
  } catch {
    return null;
  }
}

function writeCache(m: VersionManifest) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now(), m }));
  } catch {
    /* ignore */
  }
}

async function fetchManifest(): Promise<VersionManifest | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn("[version] server error", res.status);
      return null;
    }
    const j = (await res.json()) as Partial<VersionManifest>;
    if (typeof j.latestBuild !== "number") return null;
    const m: VersionManifest = {
      latestBuild: Number(j.latestBuild),
      minSupportedBuild: Number(j.minSupportedBuild ?? j.latestBuild),
      forceUpdate: Boolean(j.forceUpdate),
      message: j.message ? String(j.message) : undefined,
      updatedAt: j.updatedAt ? String(j.updatedAt) : undefined,
    };
    writeCache(m);
    return m;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[version] check failed", (err as Error)?.message);
    return null;
  }
}

function evaluate(m: VersionManifest | null): {
  isOutdated: boolean;
  isHardBlocked: boolean;
} {
  if (!m) return { isOutdated: false, isHardBlocked: false };
  const isOutdated = APP_BUILD < m.latestBuild;
  const belowMin = APP_BUILD < m.minSupportedBuild;
  const isHardBlocked = belowMin || (m.forceUpdate && APP_BUILD < m.latestBuild);
  return { isOutdated, isHardBlocked };
}

/**
 * Non-blocking version check.
 *  - First fetch is delayed by 500ms so the UI paints first.
 *  - Single fetch with 2s timeout; no retry loops.
 *  - sessionStorage caches the manifest for 1 minute.
 *  - Polls every 5 minutes, plus on focus and visibilitychange.
 */
export function useVersionCheck(): VersionCheckState {
  const cached = readCache();
  const initial = evaluate(cached);
  const [manifest, setManifest] = useState<VersionManifest | null>(cached);
  const [isOutdated, setIsOutdated] = useState(initial.isOutdated);
  const [isHardBlocked, setIsHardBlocked] = useState(initial.isHardBlocked);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(
    cached ? Date.now() : null,
  );

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const run = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      const m = await fetchManifest();
      inFlight = false;
      if (cancelled || !m) return;
      const { isOutdated, isHardBlocked } = evaluate(m);
      setManifest(m);
      setIsOutdated(isOutdated);
      setIsHardBlocked(isHardBlocked);
      setLastCheckedAt(Date.now());
      // eslint-disable-next-line no-console
      console.log("[version]", {
        appBuild: APP_BUILD,
        latest: m.latestBuild,
        min: m.minSupportedBuild,
        force: m.forceUpdate,
        isOutdated,
        isHardBlocked,
      });
    };

    // 1) Delayed first check so initial paint is unaffected.
    const firstTimer = setTimeout(run, INITIAL_DELAY_MS);
    // 2) Periodic check.
    const interval = setInterval(run, POLL_INTERVAL_MS);
    // 3) On focus / visibility.
    const onFocus = () => run();
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearTimeout(firstTimer);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return { manifest, isOutdated, isHardBlocked, appBuild: APP_BUILD, lastCheckedAt };
}