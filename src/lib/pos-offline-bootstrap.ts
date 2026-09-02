/**
 * POS offline bootstrap snapshot.
 * ------------------------------------------------------------------
 * WHY THIS EXISTS
 * The POS sale path already works offline (IndexedDB queue + local print),
 * but the *boot* path was 100% network-dependent:
 *   1. `get_team_owner_id` RPC → without it `dataOwnerId` stays null and
 *      `initializePOS()` returns immediately.
 *   2. company / terminal / open shift / settings / categories / products
 *      were all read from the server with no local fallback.
 *
 * So the cashier could only sell offline if the tab had already been opened
 * while online AND was never refreshed. Any reload during an outage (which is
 * exactly what happens at the Expo booth) produced an empty screen — "POS
 * doesn't work offline".
 *
 * This module stores the last known-good boot state locally so the screen can
 * come up fully offline. It contains no credentials — only tenant reference
 * data the cashier already sees on screen.
 */
import { getOne, putOne } from "@/lib/pos-offline-db";

const STORE = "settings";
const KEY = "pos_bootstrap";

/** Boot snapshot expires after 7 days — stale prices must not be sold. */
export const BOOTSTRAP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface POSBootstrapSnapshot {
  key?: string;
  saved_at: string;
  user_id: string;
  data_owner_id: string;
  company: any | null;
  terminal: any | null;
  session: any | null;
  cashier_name: string;
  detected_branch_id: string | null;
  categories: any[];
  exchange_rates: Record<string, number>;
  exchange_rate_details: Record<string, any>;
  settings: {
    returnPolicy: { show: boolean; days: number };
    allowOrderTransfer: boolean;
    requireCashBox: boolean;
    autoPrint: boolean;
    cashierCancelWindowMin: number | null;
    cashierAmountVisibleMin: number | null;
  };
}

export async function savePOSBootstrap(
  snapshot: Omit<POSBootstrapSnapshot, "key" | "saved_at">,
): Promise<void> {
  try {
    await putOne(STORE, { ...snapshot, key: KEY, saved_at: new Date().toISOString() });
  } catch (e) {
    console.warn("[pos-bootstrap] save failed", e);
  }
}

/** Returns the snapshot only when it belongs to this user and is not stale. */
export async function loadPOSBootstrap(userId: string): Promise<POSBootstrapSnapshot | null> {
  try {
    const raw = await getOne<POSBootstrapSnapshot>(STORE, KEY);
    if (!raw || raw.user_id !== userId) return null;
    if (Date.now() - new Date(raw.saved_at).getTime() > BOOTSTRAP_MAX_AGE_MS) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Owner id cache so a reload while offline can still scope tenant reads. */
const OWNER_KEY_PREFIX = "pos_data_owner:";

export function readCachedPOSOwner(userId: string): string | null {
  try {
    return localStorage.getItem(OWNER_KEY_PREFIX + userId);
  } catch {
    return null;
  }
}

export function writeCachedPOSOwner(userId: string, ownerId: string): void {
  try {
    localStorage.setItem(OWNER_KEY_PREFIX + userId, ownerId);
  } catch {
    /* ignore */
  }
}
