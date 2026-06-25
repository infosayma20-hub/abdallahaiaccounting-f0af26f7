/**
 * Short-lived "manager unlock" mode for the InvoiceHistoryDrawer.
 *
 * When a branch-manager / admin authenticates from inside the drawer, the
 * cashier's UI keeps running but full invoice details (amounts, items, payment
 * method, customer info) become visible for a short window (default 15 min).
 *
 * Scope:
 *  - The unlock token is keyed by the current POS session, so closing/changing
 *    sessions invalidates it.
 *  - Stored in sessionStorage so it disappears when the tab closes.
 *  - Never auto-renews; user must re-authenticate after expiry.
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "pos.manager_mode.v1.";
const DEFAULT_TTL_MIN = 15;

export interface ManagerModeState {
  active: boolean;
  managerUserId: string | null;
  managerName: string | null;
  expiresAt: number | null; // epoch ms
  remainingMs: number;
}

function readUnlock(sessionId: string | null): { managerUserId: string; managerName: string; expiresAt: number } | null {
  if (!sessionId) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + sessionId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.expiresAt || Date.now() >= parsed.expiresAt) {
      sessionStorage.removeItem(STORAGE_PREFIX + sessionId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function usePOSManagerMode(sessionId: string | null, ttlMinutes: number = DEFAULT_TTL_MIN) {
  const [tick, setTick] = useState(0);

  // Re-evaluate every 5s while mounted so the "remaining time" stays fresh
  // and the UI auto-locks when the window expires.
  useEffect(() => {
    const i = window.setInterval(() => setTick(t => t + 1), 5000);
    return () => window.clearInterval(i);
  }, []);

  const stored = readUnlock(sessionId);
  const state: ManagerModeState = stored
    ? {
        active: true,
        managerUserId: stored.managerUserId,
        managerName: stored.managerName,
        expiresAt: stored.expiresAt,
        remainingMs: Math.max(0, stored.expiresAt - Date.now()),
      }
    : { active: false, managerUserId: null, managerName: null, expiresAt: null, remainingMs: 0 };

  const unlock = useCallback(
    (managerUserId: string, managerName: string) => {
      if (!sessionId) return;
      const expiresAt = Date.now() + ttlMinutes * 60_000;
      sessionStorage.setItem(
        STORAGE_PREFIX + sessionId,
        JSON.stringify({ managerUserId, managerName, expiresAt }),
      );
      setTick(t => t + 1);
    },
    [sessionId, ttlMinutes],
  );

  const lock = useCallback(() => {
    if (!sessionId) return;
    sessionStorage.removeItem(STORAGE_PREFIX + sessionId);
    setTick(t => t + 1);
  }, [sessionId]);

  // tick is referenced so React keeps the closure fresh
  void tick;

  return { ...state, unlock, lock };
}