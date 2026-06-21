/**
 * POS-level watcher for late branch-acceptance on dispatched call-center
 * orders. Runs as long as the call-center user is inside POS, regardless of
 * whether the "سجل الفواتير المحوّلة" side panel is open.
 *
 * Behavior:
 * - Polls `call_center_orders` for `pending` orders in the current business
 *   day (06:00 cutoff) every 15s, plus realtime invalidation.
 * - Marks an order "late" once it has been pending for more than 5 minutes
 *   (`isBranchAcceptanceDelayed`).
 * - Plays the long "تنبيه طلبية متأخرة" tone once per late order, then
 *   re-beeps every 60s while it stays late. Multiple late orders share a
 *   single beep per tick.
 * - When an order leaves the pending state (accepted / cancelled / removed)
 *   its alert state is cleared so it can re-alert if it returns to pending.
 *
 * The DispatchedOrdersLog component intentionally no longer plays audio —
 * it only renders the badge / details. This hook is the single source of
 * truth so opening or closing the side panel never starts a second watcher
 * and never duplicates the tone.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { installAudioUnlock, isAudioUnlocked, playLateOrderAlert, stopLateOrderAlert } from "@/lib/audio-unlock";
import { isBranchAcceptanceDelayed } from "@/lib/dispatch-lock";

interface Options {
  enabled: boolean;
  dataOwnerId: string | null | undefined;
}

interface PendingOrder {
  id: string;
  status: string;
  created_at: string;
  cancelled_at: string | null;
}

const REPEAT_MS = 60 * 1000;
const POLL_MS = 15 * 1000;

function businessDayStartIso(): string {
  const now = new Date();
  const d = new Date(now);
  if (now.getHours() < 6) d.setDate(d.getDate() - 1);
  d.setHours(6, 0, 0, 0);
  return d.toISOString();
}

export function useDelayedDispatchAlerts({ enabled, dataOwnerId }: Options) {
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [lateCount, setLateCount] = useState(0);
  const [audioReady, setAudioReady] = useState<boolean>(() => isAudioUnlocked());
  const lastBeepAtRef = useRef<Map<string, number>>(new Map());

  // Install the shared audio-unlock listeners once the watcher is active.
  useEffect(() => {
    if (!enabled) return;
    installAudioUnlock();
    const t = setInterval(() => {
      const ready = isAudioUnlocked();
      setAudioReady((prev) => (prev === ready ? prev : ready));
    }, 1000);
    return () => clearInterval(t);
  }, [enabled]);

  // Load + realtime invalidation of the small pending-orders slice we need.
  useEffect(() => {
    if (!enabled || !dataOwnerId) {
      setPending([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("call_center_orders" as any)
        .select("id,status,created_at,cancelled_at")
        .eq("user_id", dataOwnerId)
        .eq("status", "pending")
        .gte("created_at", businessDayStartIso())
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      setPending(((data as any) || []) as PendingOrder[]);
    };
    load();
    const ch = supabase
      .channel(`pos-late-dispatch-${dataOwnerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_center_orders", filter: `user_id=eq.${dataOwnerId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [enabled, dataOwnerId]);

  // Tick: compute late set, beep once per tick if any qualifies.
  useEffect(() => {
    if (!enabled) {
      setLateCount(0);
      lastBeepAtRef.current.clear();
      return;
    }
    const tick = () => {
      const now = Date.now();
      let lateNow = 0;
      let shouldBeep = false;
      const liveIds = new Set<string>();
      for (const o of pending) {
        liveIds.add(o.id);
        if (!isBranchAcceptanceDelayed(o, now)) continue;
        lateNow += 1;
        const last = lastBeepAtRef.current.get(o.id) ?? 0;
        if (now - last >= REPEAT_MS) {
          shouldBeep = true;
          lastBeepAtRef.current.set(o.id, now);
        }
      }
      // GC: drop ids that left the pending slice so re-pending re-alerts.
      for (const id of Array.from(lastBeepAtRef.current.keys())) {
        if (!liveIds.has(id)) lastBeepAtRef.current.delete(id);
      }
      setLateCount((prev) => (prev === lateNow ? prev : lateNow));
      if (shouldBeep) {
        const ok = playLateOrderAlert();
        setAudioReady(ok || isAudioUnlocked());
      }
      // If no late orders remain (cancelled / accepted / removed), hard-stop
      // any in-flight siren so the operator isn't punished with the tail of
      // a 6-second alarm after the cause is gone.
      if (lateNow === 0) {
        stopLateOrderAlert();
      }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [enabled, pending]);

  return { lateCount, audioReady };
}