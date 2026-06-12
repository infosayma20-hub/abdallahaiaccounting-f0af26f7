/**
 * usePrintMuteRules — قواعد كتم طباعة التصنيفات على محطات المطبخ
 *
 * المنطق: إذا وُجد صف في pos_category_print_rules يطابق
 *   (category_id, station_id) ومع branch_id الحالي أو NULL (لكل الفروع)
 *   فالصنف لا يُرسل لتلك المحطة.
 *
 * يبقى وصل الزبون يُطبع دائماً — هذا الكتم يخص تذاكر المطبخ فقط.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PrintMuteRule {
  id: string;
  branch_id: string | null;
  category_id: string;
  station_id: string;
}

const CHANNEL = "malaky-sync";
const SYNC_EVENT = "pos_category_print_rules:changed";

let _cache: PrintMuteRule[] | null = null;
let _inflight: Promise<PrintMuteRule[]> | null = null;

async function fetchRules(): Promise<PrintMuteRule[]> {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    const { data, error } = await supabase
      .from("pos_category_print_rules" as any)
      .select("id, branch_id, category_id, station_id");
    if (error) {
      console.warn("[usePrintMuteRules] load failed:", error.message);
      return [];
    }
    _cache = (data as any[]) || [];
    return _cache;
  })();
  try {
    return await _inflight;
  } finally {
    _inflight = null;
  }
}

export function invalidatePrintMuteRulesCache() {
  _cache = null;
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ type: SYNC_EVENT });
    bc.close();
  } catch {
    /* ignore */
  }
}

/**
 * Fire-and-forget helper for callers outside React (e.g. POSPage payment flow).
 * Returns a function (categoryId, stationId) => boolean.
 */
export async function loadMuteChecker(branchId: string | null) {
  const rules = await fetchRules();
  return (categoryId: string | null | undefined, stationId: string) => {
    if (!categoryId) return false;
    return rules.some(
      (r) =>
        r.category_id === categoryId &&
        r.station_id === stationId &&
        (r.branch_id === null || r.branch_id === branchId),
    );
  };
}

export function usePrintMuteRules() {
  const [rules, setRules] = useState<PrintMuteRule[]>(_cache || []);
  const [loading, setLoading] = useState(!_cache);

  const reload = useCallback(async () => {
    setLoading(true);
    _cache = null;
    const fresh = await fetchRules();
    setRules(fresh);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchRules().then((r) => {
      if (alive) {
        setRules(r);
        setLoading(false);
      }
    });
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (ev) => {
        if (ev?.data?.type === SYNC_EVENT) {
          _cache = null;
          fetchRules().then((r) => {
            if (alive) setRules(r);
          });
        }
      };
    } catch {
      /* ignore */
    }
    return () => {
      alive = false;
      bc?.close();
    };
  }, []);

  const isMuted = useCallback(
    (branchId: string | null, categoryId: string | null | undefined, stationId: string) => {
      if (!categoryId) return false;
      return rules.some(
        (r) =>
          r.category_id === categoryId &&
          r.station_id === stationId &&
          (r.branch_id === null || r.branch_id === branchId),
      );
    },
    [rules],
  );

  return { rules, loading, isMuted, reload };
}