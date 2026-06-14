/**
 * useIdleLogout — single source of truth for the inactivity auto-logout.
 *
 * Design goals (per the approved plan):
 *   1. Wall-clock based: tick every 15 s and compare Date.now() against the
 *      last-activity timestamp. Avoids setTimeout drift on tab-throttle,
 *      laptop sleep, and OS suspend.
 *   2. Cross-tab synchronised: every tab listens on the existing
 *      BroadcastChannel "malaky-sync". Activity in any tab refreshes every
 *      tab's last-activity. A timeout in any tab forces every tab to log
 *      out in lock-step.
 *   3. Per-user storage: the activity timestamp lives under a key keyed by
 *      user_id, so a different user signing in on the same browser cannot
 *      inherit the previous user's idle clock.
 *   4. Company-wide policy: timeout/warning come from the new RPC
 *      get_effective_session_policy(_uid) which walks the tenant tree, so
 *      the value set by the owner applies to every employee.
 *   5. Realtime policy updates: subscribes to public.companies for the
 *      current tenant; the owner changing the value propagates live to
 *      every open session without a reload.
 *
 * The hook returns the state needed to render a warning modal: whether
 * the warning is showing and how many seconds remain. It does NOT render
 * any UI itself — that is the caller's job (see IdleLogoutGuard).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { performSessionTimeout } from "@/lib/sessionLogout";

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

const CHECK_INTERVAL_MS = 15_000;
const ACTIVITY_BROADCAST_THROTTLE_MS = 5_000;
const STORAGE_KEY_PREFIX = "amwali_last_activity:";

function storageKeyFor(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function readActivity(userId: string): number {
  try {
    const v = localStorage.getItem(storageKeyFor(userId));
    const n = v ? Number(v) : 0;
    return Number.isFinite(n) && n > 0 ? n : Date.now();
  } catch {
    return Date.now();
  }
}

function writeActivity(userId: string, ts: number) {
  try {
    localStorage.setItem(storageKeyFor(userId), String(ts));
  } catch {
    /* private mode etc. — fall back to in-memory ref */
  }
}

/**
 * Clear last-activity keys for any OTHER user. Called on sign-in so a
 * fresh login on a shared browser cannot pick up a stale clock from the
 * previous occupant.
 */
function purgeOtherUsersActivity(currentUserId: string) {
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(STORAGE_KEY_PREFIX)) continue;
      if (k === storageKeyFor(currentUserId)) continue;
      drop.push(k);
    }
    drop.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* noop */
  }
}

interface SessionPolicy {
  timeoutMs: number; // 0 = disabled
  warningMs: number;
}

const DEFAULT_POLICY: SessionPolicy = {
  timeoutMs: 30 * 60_000,
  warningMs: 2 * 60_000,
};

export interface UseIdleLogoutResult {
  enabled: boolean;
  showWarning: boolean;
  remainingSec: number;
  /** Treat as fresh activity — used by the "Stay logged in" button. */
  bump: () => void;
}

export function useIdleLogout(active: boolean): UseIdleLogoutResult {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [policy, setPolicy] = useState<SessionPolicy>(DEFAULT_POLICY);
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSec, setRemainingSec] = useState(0);

  const lastActivityRef = useRef<number>(Date.now());
  const lastBroadcastRef = useRef<number>(0);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─────────────────────────────────────────────────────────────
  // 1) Load company policy via RPC + subscribe to Realtime updates.
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !userId) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase.rpc(
        "get_effective_session_policy",
        { _uid: userId },
      );
      if (cancelled) return;
      if (error || !Array.isArray(data) || data.length === 0) {
        setPolicy(DEFAULT_POLICY);
        return;
      }
      const row = data[0] as { timeout_minutes: number; warning_minutes: number };
      setPolicy({
        timeoutMs: Math.max(0, (row.timeout_minutes ?? 30)) * 60_000,
        warningMs: Math.max(0, (row.warning_minutes ?? 2)) * 60_000,
      });
    };
    void load();

    // Realtime: any change to companies for this tenant ⟶ reload policy.
    const channel = supabase
      .channel(`session-policy:${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "companies" },
        () => { void load(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      try { supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [active, userId]);

  // ─────────────────────────────────────────────────────────────
  // 2) On user change, purge other users' activity keys, seed the
  //    timestamp to "now".
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !userId) return;
    purgeOtherUsersActivity(userId);
    const now = Date.now();
    writeActivity(userId, now);
    lastActivityRef.current = now;
    setShowWarning(false);
  }, [active, userId]);

  // ─────────────────────────────────────────────────────────────
  // 3) Local activity events + cross-tab broadcast.
  // ─────────────────────────────────────────────────────────────
  const recordActivity = useCallback(
    (broadcast: boolean) => {
      if (!userId) return;
      const now = Date.now();
      lastActivityRef.current = now;
      writeActivity(userId, now);
      // Closing the warning is the caller's decision once we tick again,
      // but we also flip it immediately so the modal hides on the very
      // next render (no flicker waiting for the 15 s tick).
      setShowWarning(false);
      if (broadcast && bcRef.current) {
        if (now - lastBroadcastRef.current >= ACTIVITY_BROADCAST_THROTTLE_MS) {
          lastBroadcastRef.current = now;
          try {
            bcRef.current.postMessage({
              type: "session_activity",
              userId,
              ts: now,
            });
          } catch {
            /* channel closed */
          }
        }
      }
    },
    [userId],
  );

  useEffect(() => {
    if (!active || !userId || policy.timeoutMs === 0) return;

    // BroadcastChannel
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("malaky-sync");
      bcRef.current = bc;
      bc.onmessage = (ev) => {
        const m = ev?.data;
        if (!m || typeof m !== "object") return;
        if (m.userId && m.userId !== userId) return;
        if (m.type === "session_activity" && typeof m.ts === "number") {
          // Peer is alive — push our local clock forward.
          if (m.ts > lastActivityRef.current) {
            lastActivityRef.current = m.ts;
            writeActivity(userId, m.ts);
            setShowWarning(false);
          }
        } else if (m.type === "session_force_logout") {
          // Peer already kicked the audit + storage cleanup; we just
          // need to tear down this tab in silent mode.
          void performSessionTimeout(
            {
              id: userId,
              email: user?.email ?? null,
              full_name:
                (user?.user_metadata as { full_name?: string })?.full_name ??
                null,
            },
            { silent: true },
          );
        }
      };
    } catch {
      bcRef.current = null;
    }

    const handler = () => recordActivity(true);
    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, handler, { passive: true }),
    );

    // Visibility/focus: treat tab-resume as a fresh check, NOT as activity.
    // We just re-run the tick so a long sleep triggers logout immediately.
    const wakeCheck = () => { /* tick() runs from interval; nothing here */ };
    document.addEventListener("visibilitychange", wakeCheck);
    window.addEventListener("focus", wakeCheck);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) =>
        window.removeEventListener(ev, handler),
      );
      document.removeEventListener("visibilitychange", wakeCheck);
      window.removeEventListener("focus", wakeCheck);
      if (bc) {
        try { bc.close(); } catch { /* noop */ }
      }
      bcRef.current = null;
    };
  }, [active, userId, policy.timeoutMs, recordActivity, user?.email, user?.user_metadata]);

  // ─────────────────────────────────────────────────────────────
  // 4) Wall-clock ticker (15 s). The single source of timeout decisions.
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !userId || policy.timeoutMs === 0) {
      setShowWarning(false);
      setRemainingSec(0);
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }

    const tick = () => {
      // Always read from storage so cross-tab updates we missed (e.g.
      // BroadcastChannel unsupported in some embedded webviews) still
      // reach us via the shared localStorage value.
      const stored = readActivity(userId);
      if (stored > lastActivityRef.current) {
        lastActivityRef.current = stored;
      }
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = policy.timeoutMs - elapsed;

      if (remaining <= 0) {
        // FIRE.
        if (tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
        setShowWarning(false);
        void performSessionTimeout({
          id: userId,
          email: user?.email ?? null,
          full_name:
            (user?.user_metadata as { full_name?: string })?.full_name ?? null,
        });
        return;
      }

      if (policy.warningMs > 0 && remaining <= policy.warningMs) {
        setShowWarning(true);
        setRemainingSec(Math.max(1, Math.ceil(remaining / 1000)));
      } else {
        setShowWarning(false);
        setRemainingSec(0);
      }
    };

    tick(); // immediate first check
    tickRef.current = setInterval(tick, CHECK_INTERVAL_MS);

    // Also tick on resume so a long sleep doesn't wait up to 15s.
    const onResume = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);

    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
    };
  }, [active, userId, policy.timeoutMs, policy.warningMs, user?.email, user?.user_metadata]);

  // Live countdown inside the warning window (1 s resolution, only when
  // visible — costs nothing the rest of the time).
  useEffect(() => {
    if (!showWarning) return;
    const id = setInterval(() => {
      setRemainingSec((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);
    return () => clearInterval(id);
  }, [showWarning]);

  const bump = useCallback(() => recordActivity(true), [recordActivity]);

  return {
    enabled: !!active && !!userId && policy.timeoutMs > 0,
    showWarning,
    remainingSec,
    bump,
  };
}
