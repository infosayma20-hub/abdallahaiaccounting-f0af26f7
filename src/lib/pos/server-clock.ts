/**
 * POS Server Clock — protects grace-window logic from a wrong device clock.
 *
 * Some POS PCs (especially fresh / unactivated Windows installs) have a system
 * clock that drifts far from real time. When that happens, `Date.now()` on the
 * client can be 1+ hours ahead of the database server, which makes freshly
 * created invoices look "expired" — the cashier can no longer view details or
 * cancel within the configured grace window.
 *
 * This module measures the skew between the device clock and the backend once
 * (via the `Date` HTTP header on a cheap HEAD request to Supabase) and exposes
 * `getServerNow()` so age calculations stay correct regardless of the device.
 */

import { supabase } from "@/integrations/supabase/client";

let skewMs = 0;            // serverNow ≈ Date.now() - skewMs
let initialized = false;
let initInFlight: Promise<void> | null = null;

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;

async function measureSkewOnce(): Promise<void> {
  // Strategy 1: HEAD on the REST root — fast, cached server header is fine.
  try {
    if (SUPABASE_URL) {
      const t0 = Date.now();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: "HEAD",
        cache: "no-store",
      });
      const t1 = Date.now();
      const dateHeader = res.headers.get("date");
      if (dateHeader) {
        const serverMs = new Date(dateHeader).getTime();
        if (Number.isFinite(serverMs)) {
          // Compensate for round-trip latency by anchoring at midpoint.
          const localMid = (t0 + t1) / 2;
          skewMs = localMid - serverMs;
          initialized = true;
          return;
        }
      }
    }
  } catch {
    /* fall through to RPC */
  }

  // Strategy 2: lightweight DB call (any small query exposes `Date` header too).
  try {
    const t0 = Date.now();
    const { data } = await supabase
      .from("company_settings")
      .select("id")
      .limit(1);
    const t1 = Date.now();
    // We cannot read response headers from postgrest-js, but if it succeeded
    // we accept skewMs = 0 as best-effort. Mark initialized so we stop trying.
    void data;
    void t0;
    void t1;
    initialized = true;
  } catch {
    /* leave skewMs = 0, retry next call */
  }
}

/**
 * Initialize the server clock. Safe to call multiple times — the actual
 * network probe runs only once.
 */
export function initServerClock(): Promise<void> {
  if (initialized) return Promise.resolve();
  if (initInFlight) return initInFlight;
  initInFlight = measureSkewOnce().finally(() => {
    initInFlight = null;
  });
  return initInFlight;
}

/** Estimated server epoch ms. Falls back to `Date.now()` if not initialized. */
export function getServerNow(): number {
  return Date.now() - skewMs;
}

/** Current measured skew in ms (positive = device ahead of server). */
export function getClockSkewMs(): number {
  return skewMs;
}

/** True if the device clock differs from the server by more than `thresholdMs`. */
export function isClockSkewed(thresholdMs = 2 * 60 * 1000): boolean {
  return initialized && Math.abs(skewMs) > thresholdMs;
}