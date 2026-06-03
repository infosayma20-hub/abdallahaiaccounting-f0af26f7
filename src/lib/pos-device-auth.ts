/**
 * POS Device Authorization Store
 * ──────────────────────────────
 * Single source of truth for whether the current device is authorized
 * to USE Point of Sale (sell, print, open drawer, open shift).
 *
 * A device is "authorized" iff a Print Bridge is reachable at one of
 * the local probe URLs. This is the same check we already use for
 * `hydrateConfigFromBridge` — nothing on the bridge itself changes.
 *
 * Admins/super_admins can still LOAD /pos when not authorized, but
 * `canSell` will be false (read-only / view-only mode).
 *
 * Cashiers cannot enter /pos at all when not authorized.
 */
import { withLocalNetworkAccess } from "@/lib/local-network-fetch";

const PROBE_URLS = [
  "http://127.0.0.1:3001/health",
  "http://localhost:3001/health",
];

// Per-tab cache key. Stays stable for the whole browser session so we
// don't re-probe on every navigation. The user-facing "Recheck" button
// always bypasses the cache.
const SESSION_CACHE_KEY = "pos-device-auth:v1";

type CacheRecord = {
  authorized: boolean;
  bridgeUrl: string | null;
  version: string | null;
  checkedAt: number;
};

const CACHE_TTL_MS = 60_000; // 60s — keeps navigation snappy, still catches Bridge restarts.

let canSell = false;
const listeners = new Set<() => void>();

function readCache(): CacheRecord | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheRecord;
    if (!parsed || typeof parsed.checkedAt !== "number") return null;
    if (Date.now() - parsed.checkedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(record: CacheRecord): void {
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(record));
  } catch {
    /* ignore */
  }
}

function clearCache(): void {
  try {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

async function probeOnce(url: string, timeoutMs: number): Promise<{ ok: boolean; data?: any }> {
  try {
    const res = await fetch(`${url}?t=${Date.now()}`, withLocalNetworkAccess({
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    }));
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => ({}));
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

export type BridgeAuthResult = {
  authorized: boolean;
  bridgeUrl: string | null;
  version: string | null;
  fromCache: boolean;
};

/**
 * Probe the Print Bridge. Returns authorized=true if /health responds OK
 * on either 127.0.0.1:3001 or localhost:3001.
 *
 * @param opts.force  bypass session cache (used by manual "Recheck" button).
 */
export async function checkBridgeAuthorized(
  opts: { force?: boolean; timeoutMs?: number } = {}
): Promise<BridgeAuthResult> {
  const force = !!opts.force;
  const timeoutMs = opts.timeoutMs ?? 2500;

  if (!force) {
    const cached = readCache();
    if (cached) {
      return {
        authorized: cached.authorized,
        bridgeUrl: cached.bridgeUrl,
        version: cached.version,
        fromCache: true,
      };
    }
  } else {
    clearCache();
  }

  for (const url of PROBE_URLS) {
    const { ok, data } = await probeOnce(url, timeoutMs);
    if (ok) {
      const base = url.replace(/\/health$/, "");
      const result: CacheRecord = {
        authorized: true,
        bridgeUrl: base,
        version: data?.version ?? null,
        checkedAt: Date.now(),
      };
      writeCache(result);
      return { ...result, fromCache: false };
    }
  }

  const result: CacheRecord = {
    authorized: false,
    bridgeUrl: null,
    version: null,
    checkedAt: Date.now(),
  };
  writeCache(result);
  return { ...result, fromCache: false };
}

// ── canSell store (consumed by POSPage.enforceDeviceGuard) ──────────

export function setCanSell(value: boolean): void {
  if (canSell === value) return;
  canSell = value;
  listeners.forEach((listener) => {
    try { listener(); } catch { /* ignore */ }
  });
}

export function getCanSell(): boolean {
  return canSell;
}

export function subscribeCanSell(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
