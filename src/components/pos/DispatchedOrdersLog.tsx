import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClipboardList, Clock, CheckCircle2, XCircle, Truck, ShoppingBag, Phone, User, RefreshCw, RotateCcw, Pencil, StickyNote, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import EditOrderDialog from "./EditOrderDialog";

interface DispatchedOrder {
  id: string;
  source_app: string;
  target_branch_id: string | null;
  target_branch_name: string;
  customer_name: string;
  customer_phone: string;
  delivery_type: string;
  delivery_address: string | null;
  payment_method: string;
  items: any[];
  total: number;
  order_note: string | null;
  status: string;
  dispatched_by_name: string;
  created_at: string;
  accepted_at: string | null;
  delivered_at: string | null;
  delivered_to_device: string | null;
  pos_order_id: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  dataOwnerId: string;
  /**
   * Optional: when provided, the "تعديل الطلبية" button on a *pending* order
   * loads it back into the POS cart so the call-center user can edit items.
   * For accepted orders the legacy EditOrderDialog flow is kept.
   */
  onEditInCart?: (order: DispatchedOrder) => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "في الانتظار", color: "bg-amber-500", icon: Clock },
  accepted: { label: "مقبول", color: "bg-blue-500", icon: CheckCircle2 },
  completed: { label: "مكتمل", color: "bg-green-600", icon: CheckCircle2 },
  cancelled: { label: "ملغي", color: "bg-red-500", icon: XCircle },
};

function getBusinessDayStart(): string {
  const now = new Date();
  const cutoffHour = 6;
  const localHour = now.getHours();
  
  const businessDate = new Date(now);
  if (localHour < cutoffHour) {
    businessDate.setDate(businessDate.getDate() - 1);
  }
  businessDate.setHours(cutoffHour, 0, 0, 0);
  return businessDate.toISOString();
}

export default function DispatchedOrdersLog({ open, onClose, dataOwnerId, onEditInCart }: Props) {
  const [orders, setOrders] = useState<DispatchedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "accepted" | "completed">("all");
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<DispatchedOrder | null>(null);
  const [editsByOrder, setEditsByOrder] = useState<Record<string, { pending: number; lastStatus?: string }>>({});
  /** Filter by call-center agent (dispatched_by_name). `null` = الكل. */
  const [agentFilter, setAgentFilter] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);

    const businessStart = getBusinessDayStart();

    let query = supabase
      .from("call_center_orders" as any)
      .select("*")
      .eq("user_id", dataOwnerId)
      .gte("created_at", businessStart)
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query;
    setOrders((data as any as DispatchedOrder[]) || []);
    setLoading(false);
  }, [dataOwnerId, filter]);

  useEffect(() => {
    if (open) loadOrders();
  }, [open, loadOrders]);

  // Load edit proposals for these orders so we can show status badges.
  const loadEdits = useCallback(async () => {
    if (!dataOwnerId || orders.length === 0) { setEditsByOrder({}); return; }
    const ids = orders.map(o => o.id);
    const { data } = await supabase
      .from("call_center_order_edits" as any)
      .select("call_center_order_id, status")
      .in("call_center_order_id", ids);
    const map: Record<string, { pending: number; lastStatus?: string }> = {};
    for (const e of ((data as any[]) || [])) {
      const k = e.call_center_order_id;
      if (!map[k]) map[k] = { pending: 0 };
      if (e.status === "pending_review") map[k].pending += 1;
      map[k].lastStatus = e.status;
    }
    setEditsByOrder(map);
  }, [dataOwnerId, orders]);
  useEffect(() => { loadEdits(); }, [loadEdits]);

  useEffect(() => {
    if (!open || !dataOwnerId) return;

    const channel = supabase
      .channel(`dispatch-log-${dataOwnerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_center_orders",
          filter: `user_id=eq.${dataOwnerId}`,
        },
        () => loadOrders()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [open, dataOwnerId, loadOrders]);

  const handleResetToPending = async (orderId: string) => {
    setResettingId(orderId);
    const { error } = await supabase
      .from("call_center_orders" as any)
      .update({
        status: "pending",
        accepted_by: null,
        accepted_at: null,
        session_id: null,
        pos_order_id: null,
      } as any)
      .eq("id", orderId);

    if (error) {
      toast.error("فشل في إعادة الإرسال");
    } else {
      toast.success("تم إعادة الطلب لقائمة الانتظار");
    }
    setResettingId(null);
  };

  const pendingCount = orders.filter(o => o.status === "pending").length;
  const acceptedCount = orders.filter(o => o.status === "accepted").length;
  const completedCount = orders.filter(o => o.status === "completed").length;

  // Unique agent list for the per-employee filter chips.
  const agents = Array.from(
    new Set(orders.map(o => (o.dispatched_by_name || "").trim()).filter(Boolean))
  ).sort();

  // Apply both status + agent filters at render time. (Status is already
  // filtered at the query level when not "all".)
  const visibleOrders = orders.filter(o =>
    agentFilter ? (o.dispatched_by_name || "") === agentFilter : true
  );

  return (
    <>
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl lg:max-w-2xl p-0" dir="rtl">
        <SheetHeader className="p-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4 text-primary" />
            سجل الفواتير المحوّلة
            <Button variant="ghost" size="sm" onClick={loadOrders} className="h-6 w-6 p-0 mr-auto">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="flex gap-1.5 p-2 border-b border-border">
          {[
            { key: "all" as const, label: "الكل", count: orders.length },
            { key: "pending" as const, label: "معلّق", count: pendingCount },
            { key: "accepted" as const, label: "مقبول", count: acceptedCount },
            { key: "completed" as const, label: "مكتمل", count: completedCount },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                filter === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Per-agent filter — appears only when ≥2 different agents dispatched today. */}
        {agents.length >= 2 && (
          <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-border bg-muted/20">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
              <Users className="h-3 w-3" /> الموظفة:
            </span>
            <button
              onClick={() => setAgentFilter(null)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all ${
                agentFilter === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              الكل ({orders.length})
            </button>
            {agents.map(agent => {
              const count = orders.filter(o => (o.dispatched_by_name || "") === agent).length;
              return (
                <button
                  key={agent}
                  onClick={() => setAgentFilter(agent)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all ${
                    agentFilter === agent
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {agent} ({count})
                </button>
              );
            })}
          </div>
        )}

        <ScrollArea className="h-[calc(100vh-110px)]">
          <div className="p-3 space-y-2">
            {visibleOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد فواتير محوّلة اليوم</p>
              </div>
            ) : (
              visibleOrders.map((order) => {
                const cfg = statusConfig[order.status] || statusConfig.pending;
                const StatusIcon = cfg.icon;
                const itemsWithNotes = (order.items || []).filter((it: any) => it && it.note && String(it.note).trim());
                return (
                  <div
                    key={order.id}
                    className={`rounded-lg border p-2.5 space-y-1.5 ${
                      order.status === "pending"
                        ? "border-amber-500/40 bg-amber-500/5"
                        : order.status === "accepted"
                          ? "border-blue-500/30 bg-blue-500/5"
                          : order.status === "completed"
                            ? "border-green-500/20 bg-green-500/5"
                            : "border-border bg-muted/20 opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                          {order.source_app}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(order.created_at).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="text-[10px] text-muted-foreground">→</span>
                        <span className="text-[10px] font-semibold text-primary">🏪 {order.target_branch_name}</span>
                      </div>
                      <Badge className={`text-[10px] px-1.5 py-0 h-5 gap-0.5 ${cfg.color}`}>
                        <StatusIcon className="h-2.5 w-2.5" />
                        {cfg.label}
                      </Badge>
                    </div>

                    {/* Who dispatched this order — surface the call-center agent's name. */}
                    {order.dispatched_by_name && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Users className="h-2.5 w-2.5" />
                        <span>حوّلتها: <b className="text-foreground/80">{order.dispatched_by_name}</b></span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs font-bold">{order.customer_name}</span>
                        {order.customer_phone && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Phone className="h-2.5 w-2.5" />
                            <span dir="ltr">{order.customer_phone}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${order.delivery_type === "delivery" ? "text-orange-600" : "text-blue-600"}`}>
                          {order.delivery_type === "delivery" ? <Truck className="h-2.5 w-2.5" /> : <ShoppingBag className="h-2.5 w-2.5" />}
                        </Badge>
                        <span className="font-mono text-xs font-bold">₪{order.total.toFixed(0)}</span>
                      </div>
                    </div>

                    {/* Items list — show per-item notes (e.g. حار / عادي) explicitly. */}
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      {(order.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="flex flex-wrap items-baseline gap-x-1">
                          <span className="text-foreground/80">• {item.name}×{item.qty}</span>
                          {item.note && String(item.note).trim() && (
                            <span className="text-amber-700 dark:text-amber-400 font-medium">
                              — 🌶 {item.note}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Order-level note (الزبون/الطلبية). */}
                    {order.order_note && order.order_note.trim() && (
                      <div className="flex items-start gap-1 text-[10px] rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-1 text-amber-800 dark:text-amber-300">
                        <StickyNote className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span><b>ملاحظة الطلبية:</b> {order.order_note}</span>
                      </div>
                    )}

                    {order.status === "pending" && (
                      <div className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                        <Clock className="h-3 w-3 animate-pulse" />
                        بانتظار قبول الفرع — منذ {getTimeSince(order.created_at)}
                      </div>
                    )}
                    {/* Delivery ACK indicator */}
                    {order.status === "pending" && (
                      order.delivered_at ? (
                        <div className="flex items-center gap-1 text-[10px] text-blue-600 font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          وصلت لجهاز الفرع — {new Date(order.delivered_at).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      ) : (
                        getSecondsSince(order.created_at) > 10 ? (
                          <div className="flex items-center gap-1 text-[10px] text-red-600 font-bold bg-red-500/10 rounded px-1.5 py-0.5">
                            <XCircle className="h-3 w-3" />
                            لم تصل بعد — تحقق من اتصال الفرع
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            بانتظار وصول الفرع
                          </div>
                        )
                      )
                    )}
                    {order.accepted_at && (
                      <div className="text-[10px] text-muted-foreground">
                        تم القبول: {new Date(order.accepted_at).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}

                    {/* Reset button for accepted orders */}
                    {order.status === "accepted" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-[11px] gap-1.5 border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
                        onClick={() => handleResetToPending(order.id)}
                        disabled={resettingId === order.id}
                      >
                        <RotateCcw className={`h-3 w-3 ${resettingId === order.id ? "animate-spin" : ""}`} />
                        إعادة إرسال للفرع
                      </Button>
                    )}
                    {/* Edit proposal: only if not yet invoiced */}
                    {!order.pos_order_id && (order.status === "pending" || order.status === "accepted") && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-7 text-[11px] gap-1.5 border-blue-500/40 text-blue-700 hover:bg-blue-500/10"
                          onClick={() => {
                            // 🆕 Pending orders → open in POS cart (full item edit).
                            // Accepted orders → keep legacy proposal dialog.
                            if (order.status === "pending" && onEditInCart) {
                              onEditInCart(order);
                            } else {
                              setEditTarget(order);
                            }
                          }}
                          disabled={(editsByOrder[order.id]?.pending || 0) > 0}
                        >
                          <Pencil className="h-3 w-3" />
                          {(editsByOrder[order.id]?.pending || 0) > 0 ? "تعديل قيد المراجعة" : "تعديل الطلبية"}
                        </Button>
                        {editsByOrder[order.id]?.lastStatus === "rejected" && (
                          <Badge variant="outline" className="text-[9px] border-red-400/40 text-red-600">آخر تعديل: مرفوض</Badge>
                        )}
                        {editsByOrder[order.id]?.lastStatus === "accepted" && (
                          <Badge variant="outline" className="text-[9px] border-green-400/40 text-green-600">آخر تعديل: مقبول</Badge>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
    <EditOrderDialog
      open={!!editTarget}
      onOpenChange={(v) => { if (!v) setEditTarget(null); }}
      order={editTarget}
      dataOwnerId={dataOwnerId}
      onSubmitted={() => { loadOrders(); loadEdits(); }}
    />
    </>
  );
}

function getTimeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "أقل من دقيقة";
  if (mins < 60) return `${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  return `${hours} ساعة و ${mins % 60} دقيقة`;
}

function getSecondsSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
}