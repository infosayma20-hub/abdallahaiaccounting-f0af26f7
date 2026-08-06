import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TrackOrder } from "@/components/pos-tracking/TrackingBoard";

/** Live tracking board data for authenticated users (branch optional). */
export function useOrderTracking(branchId: string | null) {
  const [orders, setOrders] = useState<TrackOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
      let q = supabase
        .from("pos_order_tracking")
        .select("order_id, branch_id, order_number, display_number, order_type, printed_at, delivered_at, target_minutes, elapsed_seconds, is_late")
        .eq("is_cancelled", false)
        .gte("printed_at", since)
        .order("printed_at", { ascending: true })
        .limit(200);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data: rows } = await q;

      const recent = (rows || []).filter(
        (r: any) => !r.delivered_at || new Date(r.delivered_at).getTime() > Date.now() - 30 * 60 * 1000
      );
      const ids = recent.map((r: any) => r.order_id);
      let items: any[] = [];
      if (ids.length) {
        const { data } = await supabase
          .from("pos_order_item_tracking")
          .select("order_line_id, order_id, product_name, qty, printed_at, delivered_at, target_minutes, elapsed_seconds, is_late")
          .in("order_id", ids)
          .order("created_at", { ascending: true });
        items = data || [];
      }

      const branchIds = Array.from(new Set(recent.map((r: any) => r.branch_id).filter(Boolean)));
      let branchNames: Record<string, string> = {};
      if (!branchId && branchIds.length) {
        const { data: bs } = await supabase.from("branches").select("id, name").in("id", branchIds);
        branchNames = Object.fromEntries((bs || []).map((b: any) => [b.id, b.name]));
      }

      setOrders(recent.map((r: any) => ({
        ...r,
        branch_name: branchId ? null : (branchNames[r.branch_id] || null),
        items: items
          .filter(i => i.order_id === r.order_id)
          .map(i => ({ ...i, line_id: i.order_line_id })),
      })) as TrackOrder[]);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("pos-order-tracking")
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_order_tracking" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_order_item_tracking" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const deliverOrder = useCallback(async (orderId: string, byName?: string) => {
    setOrders(prev => prev.map(o => o.order_id === orderId
      ? { ...o, delivered_at: new Date().toISOString(), items: o.items.map(i => ({ ...i, delivered_at: i.delivered_at || new Date().toISOString() })) }
      : o));
    await supabase.rpc("pos_mark_order_delivered", { _order_id: orderId, _by_name: byName ?? null });
    load();
  }, [load]);

  const deliverItem = useCallback(async (lineId: string, byName?: string) => {
    setOrders(prev => prev.map(o => ({
      ...o,
      items: o.items.map(i => i.line_id === lineId ? { ...i, delivered_at: new Date().toISOString() } : i),
    })));
    await supabase.rpc("pos_mark_item_delivered", { _line_id: lineId, _by_name: byName ?? null });
    load();
  }, [load]);

  return { orders, loading, refresh: load, deliverOrder, deliverItem };
}
