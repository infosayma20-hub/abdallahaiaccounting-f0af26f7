/** شاشة تتبع الطلبيات — الرابط العام لكل فرع: /track/:slug */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import TrackingBoard, { type TrackOrder } from "@/components/pos-tracking/TrackingBoard";

export default function OrderTrackingPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [board, setBoard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    const { data } = await supabase.rpc("get_branch_tracking_board", { _slug: slug });
    setBoard(data);
    setLoading(false);
  }, [slug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const deliver = async (orderId: string, lineId?: string) => {
    if (!slug) return;
    setBoard((prev: any) => prev && ({
      ...prev,
      orders: (prev.orders || []).map((o: TrackOrder) => {
        if (lineId) {
          return { ...o, items: o.items.map(i => i.line_id === lineId ? { ...i, delivered_at: new Date().toISOString() } : i) };
        }
        return o.order_id === orderId
          ? { ...o, delivered_at: new Date().toISOString(), items: o.items.map(i => ({ ...i, delivered_at: i.delivered_at || new Date().toISOString() })) }
          : o;
      }),
    }));
    await supabase.rpc("mark_branch_tracking_delivered", {
      _slug: slug, _order_id: orderId, _line_id: lineId ?? null, _by_name: null,
    });
    load();
  };

  if (board?.error) {
    return <div dir="rtl" className="min-h-[100dvh] bg-[#0D1B2E] text-white flex items-center justify-center text-sm">
      الرابط غير صحيح أو الفرع غير موجود
    </div>;
  }

  return (
    <TrackingBoard
      orders={(board?.orders || []) as TrackOrder[]}
      loading={loading}
      onRefresh={load}
      branchName={board?.branch_name}
      companyName={board?.company_name}
      logoUrl={board?.logo_url}
      onDeliverOrder={(orderId) => deliver(orderId)}
      onDeliverItem={(lineId, orderId) => deliver(orderId, lineId)}
    />
  );
}
