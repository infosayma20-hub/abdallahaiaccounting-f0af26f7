import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
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
  /** Open shift — required to refund a deposit collected in another shift. */
  sessionId?: string | null;
  cashierName?: string | null;
}

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ar-EG", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

const ScheduledOrdersPanel = ({
  open,
  onOpenChange,
  dataOwnerId,
  branchId,
  isCallCenter,
  sessionId,
  cashierName,
}: Props) => {
  const [orders, setOrders] = useState<ScheduledOrder[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ScheduledOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");

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

  /**
   * Cancel a scheduled order and unwind any deposit (عربون) taken for it.
   *
   * Deposit rules (cash drawer must always stay truthful):
   *  - Deposit collected in THIS still-open shift → mark it `cancelled` so it
   *    disappears from the shift's "عربون مقبوض" line; the cashier hands the
   *    cash back and the drawer nets to zero.
   *  - Deposit collected in ANOTHER (usually closed) shift → that shift really
   *    did receive the cash, so it must stay untouched. Instead we write a
   *    mirror NEGATIVE row into the current shift (status `refunded`) which the
   *    reconciliation RPC counts as received, reducing the expected cash here.
   *  - Card / non-cash deposits are never drawer money → flagged `refunded`
   *    with a warning to reverse them on the terminal.
   */
  const confirmCancel = async () => {
    const order = cancelTarget;
    if (!order) return;
    const reason = cancelReason.trim();
    if (!reason) {
      toast.error("يرجى كتابة سبب الإلغاء");
      return;
    }
    setBusy(order.id);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id || null;

      // 1) Held deposits for this order
      const { data: preRows, error: preErr } = await supabase
        .from("pos_prepayments" as any)
        .select("id, amount, currency, exchange_rate, foreign_amount, method, session_id, branch_id, visa_gl_account_code")
        .eq("call_center_order_id", order.id)
        .eq("status", "held");
      if (preErr) throw preErr;
      const deposits = (preRows as any[]) || [];

      // 2) Cancel the order itself (guarded on status to avoid racing a release)
      const { data: updated, error } = await supabase
        .from("call_center_orders" as any)
        .update({
          status: "cancelled",
          cancel_reason: reason,
          cancelled_at: new Date().toISOString(),
          cancelled_by: uid,
          cancelled_by_name: cashierName || null,
        } as any)
        .eq("id", order.id)
        .eq("status", "scheduled")
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) {
        toast.error("تعذّر الإلغاء: تم إرسال الطلبية للفرع أو تغيّرت حالتها");
        load();
        return;
      }

      // 3) Unwind deposits
      let cashBack = 0;
      let cardPending = 0;
      for (const d of deposits) {
        const isCash = String(d.method || "cash").toLowerCase() === "cash";
        const amount = Number(d.amount || 0);
        const sameOpenShift = isCash && sessionId && d.session_id === sessionId;

        if (sameOpenShift) {
          await supabase
            .from("pos_prepayments" as any)
            .update({ status: "cancelled", note: `إلغاء طلبية مجدولة: ${reason}` } as any)
            .eq("id", d.id);
          cashBack += amount;
        } else {
          await supabase
            .from("pos_prepayments" as any)
            .update({ status: "refunded", note: `إلغاء طلبية مجدولة: ${reason}` } as any)
            .eq("id", d.id);
          if (isCash) {
            cashBack += amount;
            if (sessionId) {
              // mirror negative line in the current shift
              await supabase.from("pos_prepayments" as any).insert({
                user_id: dataOwnerId,
                call_center_order_id: order.id,
                session_id: sessionId,
                branch_id: d.branch_id || branchId || null,
                cashier_name: cashierName || null,
                amount: -amount,
                currency: d.currency || "ILS",
                exchange_rate: d.exchange_rate || 1,
                foreign_amount: d.foreign_amount ? -Number(d.foreign_amount) : null,
                method: "cash",
                status: "refunded",
                tender_index: 0,
                created_by: uid,
                note: `إرجاع عربون طلبية ملغاة: ${reason}`,
              } as any);
            }
          } else {
            cardPending += amount;
          }
        }
      }

      toast.success("تم إلغاء الطلبية المجدولة", {
        description:
          cashBack > 0
            ? `أعِد للزبون عربوناً نقدياً بقيمة ₪${cashBack.toFixed(2)} — تم تعديل بنود الوردية`
            : undefined,
      });
      if (cardPending > 0) {
        toast.warning(`يوجد عربون بالبطاقة ₪${cardPending.toFixed(2)} — يجب استرجاعه من جهاز الفيزا وإبلاغ المحاسب`, {
          duration: 10000,
        });
      }
      if (cashBack > 0 && !sessionId) {
        toast.warning("لا توجد وردية مفتوحة — سُجّل إرجاع العربون بدون ربطه بعهدة، راجع المحاسب", { duration: 10000 });
      }
      setCancelTarget(null);
      setCancelReason("");
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy === o.id}
                    onClick={() => {
                      setCancelReason("");
                      setCancelTarget(o);
                    }}
                  >
                    <Trash2 className="h-3 w-3 ml-1" /> إلغاء
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>

      <AlertDialog open={!!cancelTarget} onOpenChange={(v) => !v && setCancelTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الطلبية المجدولة؟</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span className="block">
                {cancelTarget?.customer_name || "زبون"} • ₪{Number(cancelTarget?.total || 0).toFixed(2)} •{" "}
                {fmt(cancelTarget?.scheduled_for)}
              </span>
              {Number(cancelTarget?.prepaid_amount || 0) > 0 && (
                <span className="block text-destructive font-semibold">
                  يوجد عربون مقبوض ₪{Number(cancelTarget?.prepaid_amount).toFixed(2)} — سيتم إرجاعه وتعديل بنود الوردية.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="سبب الإلغاء (إلزامي)"
            className="text-sm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!cancelReason.trim() || busy === cancelTarget?.id}
              onClick={(e) => {
                e.preventDefault();
                confirmCancel();
              }}
            >
              تأكيد الإلغاء
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

export default ScheduledOrdersPanel;