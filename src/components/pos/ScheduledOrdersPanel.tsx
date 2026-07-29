import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Clock, Send, Trash2 } from "lucide-react";

interface ScheduledOrder {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_type: string | null;
  delivery_address: string | null;
  total: number | null;
  prepaid_amount: number | null;
  prep_minutes: number | null;
  scheduled_for: string | null;
  release_at: string | null;
  target_branch_name: string | null;
  dispatched_by_name: string | null;
  items: any;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataOwnerId: string;
  /** When set, only this branch's scheduled orders are listed (cashier view). */
  branchId?: string | null;
  isCallCenter?: boolean;
}

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ar-EG", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

const ScheduledOrdersPanel = ({ open, onOpenChange, dataOwnerId, branchId, isCallCenter }: Props) => {
  const [orders, setOrders] = useState<ScheduledOrder[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    let q = supabase
      .from("call_center_orders" as any)
      .select(
        "id, customer_name, customer_phone, delivery_type, delivery_address, total, prepaid_amount, prep_minutes, scheduled_for, release_at, target_branch_name, dispatched_by_name, items"
      )
      .eq("user_id", dataOwnerId)
      .eq("status", "scheduled")
      .order("scheduled_for", { ascending: true });
    if (!isCallCenter && branchId) q = q.eq("target_branch_id", branchId);
    const { data, error } = await q;
    if (error) {
      console.error("[ScheduledOrders] load failed:", error);
    }
    setOrders(((data as any) || []) as ScheduledOrder[]);
    setLoading(false);
  }, [dataOwnerId, branchId, isCallCenter]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const releaseNow = async (id: string) => {
    setBusy(id);
    try {
      const { error } = await supabase
        .from("call_center_orders" as any)
        .update({ status: "pending", release_at: new Date().toISOString() } as any)
        .eq("id", id)
        .eq("status", "scheduled");
      if (error) throw error;
      toast.success("تم إرسال الطلبية للفرع الآن");
      load();
    } catch (e: any) {
      toast.error("تعذّر الإرسال: " + (e?.message || ""));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (id: string) => {
    setBusy(id);
    try {
      const { error } = await supabase
        .from("call_center_orders" as any)
        .update({ status: "cancelled" } as any)
        .eq("id", id)
        .eq("status", "scheduled");
      if (error) throw error;
      toast.success("تم إلغاء الطلبية المجدولة");
      load();
    } catch (e: any) {
      toast.error("تعذّر الإلغاء: " + (e?.message || ""));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" />
            الطلبيات المجدولة
            <Badge variant="secondary">{orders.length}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
          {loading && <p className="text-xs text-muted-foreground">جارٍ التحميل...</p>}
          {!loading && orders.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">لا توجد طلبيات مجدولة</p>
          )}
          {orders.map((o) => {
            const items = Array.isArray(o.items) ? o.items : [];
            return (
              <div key={o.id} className="rounded-lg border p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold flex items-center gap-2">
                    <Clock className="h-3 w-3 text-primary" />
                    {fmt(o.scheduled_for)}
                    <Badge variant="outline">{o.delivery_type === "delivery" ? "توصيل" : "استلام"}</Badge>
                    {isCallCenter && o.target_branch_name && (
                      <Badge variant="secondary">{o.target_branch_name}</Badge>
                    )}
                  </div>
                  <span className="font-bold">₪{Number(o.total || 0).toFixed(2)}</span>
                </div>
                <div className="text-muted-foreground">
                  {o.customer_name || "—"} {o.customer_phone ? `• ${o.customer_phone}` : ""}
                  {o.delivery_address ? ` • ${o.delivery_address}` : ""}
                </div>
                <div className="text-muted-foreground">
                  {items.map((it: any, i: number) => (
                    <span key={i}>
                      {it.qty}× {it.name}
                      {i < items.length - 1 ? " • " : ""}
                    </span>
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  الإرسال للفرع: {fmt(o.release_at)} (تحضير {o.prep_minutes ?? 0} دقيقة)
                  {Number(o.prepaid_amount || 0) > 0 && ` • عربون: ₪${Number(o.prepaid_amount).toFixed(2)}`}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" disabled={busy === o.id} onClick={() => releaseNow(o.id)}>
                    <Send className="h-3 w-3 ml-1" /> إرسال الآن
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === o.id} onClick={() => cancel(o.id)}>
                    <Trash2 className="h-3 w-3 ml-1" /> إلغاء
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduledOrdersPanel;