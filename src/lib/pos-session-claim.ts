/**
 * POS Session Single-Device Claim Helpers
 * ───────────────────────────────────────
 * Wraps the three RPCs added in Phase 1 of the concurrent-sessions plan:
 *   • claim_pos_session       — take ownership of an open session on this device.
 *   • heartbeat_pos_session   — prove we still own it (every 15s).
 *   • increment_pos_session_totals — atomic delta for total_sales/total_orders
 *     (replaces the read-modify-write that caused Lost Updates).
 *
 * The fingerprint is the SHA-256 already returned by `getDeviceFingerprint()`.
 * `device_id` is generated once per browser and persisted in localStorage so
 * the same browser keeps the same id across reloads.
 */
import { supabase } from "@/integrations/supabase/client";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";

const DEVICE_ID_KEY = "pos_device_id_v1";

export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // Private mode / quota — fall back to a per-tab ephemeral id.
    return crypto.randomUUID();
  }
}

let cachedFingerprint: string | null = null;
export async function getCachedFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;
  cachedFingerprint = await getDeviceFingerprint();
  return cachedFingerprint;
}

export type ClaimResult =
  | { ok: true; claimed: true; transferred: boolean }
  | {
      ok: false;
      error: "session_held_by_other_device";
      other_device_id: string | null;
      other_fingerprint: string | null;
      last_seen: string | null;
    }
  | { ok: false; error: string };

export async function claimPOSSession(
  sessionId: string,
  opts: { force?: boolean } = {},
): Promise<ClaimResult> {
  const fingerprint = await getCachedFingerprint();
  const deviceId = getOrCreateDeviceId();
  const { data, error } = await supabase.rpc("claim_pos_session" as any, {
    p_session_id: sessionId,
    p_device_id: deviceId,
    p_fingerprint: fingerprint,
    p_force: !!opts.force,
  });
  if (error) return { ok: false, error: error.message };
  return data as ClaimResult;
}

export type HeartbeatResult =
  | { ok: true; revoked: false }
  | {
      ok: false;
      revoked: true;
      reason: "session_not_found" | "session_closed" | "device_replaced";
      closed_at?: string | null;
      active_device_fingerprint?: string | null;
      last_seen?: string | null;
    };

export async function heartbeatPOSSession(sessionId: string): Promise<HeartbeatResult> {
  const fingerprint = await getCachedFingerprint();
  const { data, error } = await supabase.rpc("heartbeat_pos_session" as any, {
    p_session_id: sessionId,
    p_fingerprint: fingerprint,
  });
  if (error) {
    // Network blips should NOT revoke — return a soft "ok" so the UI does not
    // bounce the cashier on transient errors. Three consecutive failures in
    // the hook will trigger a real revoke decision.
    return { ok: true, revoked: false };
  }
  return data as HeartbeatResult;
}

export async function incrementSessionTotals(
  sessionId: string,
  salesDelta: number,
  ordersDelta: number,
): Promise<{ total_sales: number; total_orders: number } | null> {
  const { data, error } = await supabase.rpc("increment_pos_session_totals" as any, {
    p_session_id: sessionId,
    p_sales_delta: salesDelta,
    p_orders_delta: ordersDelta,
  });
  if (error) {
    console.error("[pos-session-claim] increment failed:", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    total_sales: Number((row as any).total_sales) || 0,
    total_orders: Number((row as any).total_orders) || 0,
  };
}