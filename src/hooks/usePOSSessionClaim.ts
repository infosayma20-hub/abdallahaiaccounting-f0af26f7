import { useCallback, useEffect, useRef, useState } from "react";
import {
  claimPOSSession,
  heartbeatPOSSession,
  type ClaimResult,
  type HeartbeatResult,
} from "@/lib/pos-session-claim";

/**
 * usePOSSessionClaim — single source of truth for "is THIS device the
 * authoritative owner of the open POS session?".
 *
 * Behaviour:
 *  • On `sessionId` change, attempts a soft claim (no force). If another
 *    device holds it live, exposes `conflict` so the UI can offer "take over".
 *  • While owned, sends a heartbeat every 15s. Three consecutive non-OK
 *    responses or a single explicit `revoked` flips `revoked` true.
 *  • Exposes `forceClaim()` to perform a takeover (the previous device will
 *    see `revoked` within its next heartbeat).
 *
 * Network-blip safe: heartbeat errors are tolerated 3x before revoking.
 */
export type SessionClaimState =
  | { status: "idle" }
  | { status: "claiming" }
  | { status: "owned" }
  | { status: "conflict"; otherLastSeen: string | null }
  | { status: "revoked"; reason: HeartbeatResult extends { reason: infer R } ? R : string };

const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_TRANSIENT_FAILURES = 3;

export function usePOSSessionClaim(sessionId: string | null | undefined) {
  const [state, setState] = useState<SessionClaimState>({ status: "idle" });
  const transientFailRef = useRef(0);
  const stateRef = useRef<SessionClaimState>(state);
  stateRef.current = state;

  const doClaim = useCallback(async (id: string, force: boolean) => {
    setState({ status: "claiming" });
    const r: ClaimResult = await claimPOSSession(id, { force });
    if (r.ok) {
      transientFailRef.current = 0;
      setState({ status: "owned" });
      return true;
    }
    if (r.error === "session_held_by_other_device") {
      setState({ status: "conflict", otherLastSeen: (r as any).last_seen ?? null });
      return false;
    }
    // Unrelated error (e.g. session_not_open) — treat as revoked so the page
    // falls back to its existing closed-session UI.
    setState({ status: "revoked", reason: r.error as any });
    return false;
  }, []);

  // Initial claim on session change.
  useEffect(() => {
    if (!sessionId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await doClaim(sessionId, false);
    })();
    return () => { cancelled = true; };
  }, [sessionId, doClaim]);

  // Heartbeat while owned.
  useEffect(() => {
    if (!sessionId || state.status !== "owned") return;
    let cancelled = false;

    const tick = async () => {
      const r = await heartbeatPOSSession(sessionId);
      if (cancelled) return;
      if (r.ok && !r.revoked) {
        transientFailRef.current = 0;
        return;
      }
      if (r.revoked) {
        // Explicit revoke from server — flip immediately.
        setState({ status: "revoked", reason: r.reason });
        return;
      }
      // Soft failure (network blip).
      transientFailRef.current += 1;
      if (transientFailRef.current >= MAX_TRANSIENT_FAILURES) {
        // Stay owned but the next call will retry; we don't kick the cashier
        // out on transient network — POSPage already has a separate
        // "ShiftClosedElsewhereDialog" for the canonical closed-elsewhere case.
        transientFailRef.current = 0;
      }
    };

    // First heartbeat right away so an early conflict surfaces fast.
    void tick();
    const interval = setInterval(tick, HEARTBEAT_INTERVAL_MS);

    // Heartbeat on tab visibility regain (the laptop may have been asleep).
    const onVis = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [sessionId, state.status]);

  const forceClaim = useCallback(async () => {
    if (!sessionId) return false;
    return doClaim(sessionId, true);
  }, [sessionId, doClaim]);

  const retryClaim = useCallback(async () => {
    if (!sessionId) return false;
    return doClaim(sessionId, false);
  }, [sessionId, doClaim]);

  return { state, forceClaim, retryClaim };
}