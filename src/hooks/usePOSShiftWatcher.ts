import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Watches the currently-open POS session for being closed from another device.
 *
 * Returns `closedFromElsewhere=true` the moment Postgres reports the session
 * row flipped to state='closed' (or is_deleted=true). The POSPage uses this to
 * pop a blocking dialog and to short-circuit `enforceDeviceGuard`.
 *
 * Defensive design: also polls every 30s as a fallback in case Realtime is
 * down (bad Wi-Fi, proxy stripping WS). The poll is cheap (single row).
 */
export function usePOSShiftWatcher(sessionId: string | null | undefined) {
  const [closedFromElsewhere, setClosed] = useState(false);
  const [closedAt, setClosedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setClosed(false);
      setClosedAt(null);
      return;
    }

    let cancelled = false;

    const evaluate = (row: { state?: string | null; is_deleted?: boolean | null; closed_at?: string | null } | null) => {
      if (!row || cancelled) return;
      const isClosed = row.is_deleted === true || (row.state && row.state !== "open");
      if (isClosed) {
        setClosed(true);
        setClosedAt(row.closed_at ?? null);
      }
    };

    // Realtime
    const channel = supabase
      .channel(`pos_session_${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pos_sessions", filter: `id=eq.${sessionId}` },
        (payload) => evaluate(payload.new as any),
      )
      .subscribe();

    // Fallback poll
    const poll = async () => {
      const { data } = await supabase
        .from("pos_sessions")
        .select("state,is_deleted,closed_at")
        .eq("id", sessionId)
        .maybeSingle();
      evaluate(data as any);
    };
    void poll(); // initial
    const t = setInterval(poll, 30_000);

    return () => {
      cancelled = true;
      clearInterval(t);
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    };
  }, [sessionId]);

  return { closedFromElsewhere, closedAt };
}