import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Bell, Phone, MapPin, Truck, ShoppingBag, CreditCard, Banknote,
  CheckCircle, Clock, User, X, ChevronDown, Pencil, XCircle,
} from "lucide-react";
import { extractBaseNote } from "@/lib/order-note-utils";
import { isEditLockActive } from "@/lib/dispatch-lock";

interface CallCenterOrder {
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
  delivery_fee?: number | null;
  delivery_info?: any | null;
  is_editing?: boolean | null;
  editing_started_at?: string | null;
  editing_heartbeat_at?: string | null;
}

interface OrderEdit {
  id: string;
  call_center_order_id: string;
  proposed_changes: Record<string, any>;
  edit_note: string | null;
  created_by_name: string | null;
  created_at: string;
  status: string;
}

interface Props {
  dataOwnerId: string;
  branchId: string | null;
  sessionId: string | null;
  enabled: boolean;
  onAcceptOrder: (order: CallCenterOrder) => void;
}

// Notification sound — preload AudioContext on first user interaction
let audioCtx: AudioContext | null = null;

const ensureAudioCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
};

// Preload on first click anywhere
if (typeof window !== "undefined") {
  const preload = () => { ensureAudioCtx(); window.removeEventListener("click", preload); };
  window.addEventListener("click", preload, { once: true });
}

const playNotificationSound = () => {
  try {
    const ctx = ensureAudioCtx();
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.8, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    playTone(880, 0, 0.15);
    playTone(1100, 0.18, 0.15);
    playTone(1320, 0.36, 0.2);
  } catch (e) {
    // Fallback: do nothing if AudioContext unavailable
  }
};

const PendingOrdersPanel = ({ dataOwnerId, branchId, sessionId, enabled, onAcceptOrder }: Props) => {
  const [orders, setOrders] = useState<CallCenterOrder[]>([]);
  const [edits, setEdits] = useState<OrderEdit[]>([]);
  const [editsOrderMap, setEditsOrderMap] = useState<Record<string, CallCenterOrder>>({});
  const [deciding, setDeciding] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const prevCountRef = useRef(0);

  // Load pending orders for this branch
  const loadPendingOrders = useCallback(async () => {
    if (!dataOwnerId || !enabled) return;

    // If no branch detected from cash box name, don't show any orders
    // This prevents orders for other branches from appearing
    if (!branchId) {
      setOrders([]);
      return;
    }

    let query = supabase
      .from("call_center_orders" as any)
      .select("*")
      .eq("user_id", dataOwnerId)
      .eq("status", "pending")
      .eq("target_branch_id", branchId)
      .order("created_at", { ascending: false });

    const { data } = await query;
    // 🔒 Hide orders that the call-center is *actively* editing so the
    // cashier cannot accept a half-edited version. An expired/stale lock
    // (no heartbeat for > 3 min) must NOT keep the order hidden, otherwise
    // a crashed/closed call-center tab would orphan the order forever.
    const now = Date.now();
    const newOrders = ((data as any as CallCenterOrder[]) || []).filter(
      (o) => !isEditLockActive(o, now)
    );
    
    // Play sound if new orders appeared
    if (newOrders.length > prevCountRef.current && prevCountRef.current >= 0) {
      playNotificationSound();
      const newest = newOrders[0];
      if (newest && prevCountRef.current > 0) {
        toast.info(`📞 طلب جديد من الكول سنتر: ${newest.customer_name}`, {
          duration: 10000,
          description: `${newest.source_app} • ${newest.delivery_type === "delivery" ? "توصيل" : "استلام"} • ₪${newest.total}`,
          action: {
            label: "عرض",
            onClick: () => setOpen(true),
          },
        });
      }
    }
    prevCountRef.current = newOrders.length;
    setOrders(newOrders);
  }, [dataOwnerId, branchId, enabled]);

  // Load pending edit proposals for this branch (with their parent order snapshot for the diff UI).
  const loadEdits = useCallback(async () => {
    if (!dataOwnerId || !enabled || !branchId) { setEdits([]); setEditsOrderMap({}); return; }
    const { data: editRows } = await supabase
      .from("call_center_order_edits" as any)
      .select("id, call_center_order_id, proposed_changes, edit_note, created_by_name, created_at, status")
      .eq("user_id", dataOwnerId)
      .eq("target_branch_id", branchId)
      .eq("status", "pending_review")
      .order("created_at", { ascending: false });
    const list = ((editRows as any) || []) as OrderEdit[];
    setEdits(list);
    if (list.length === 0) { setEditsOrderMap({}); return; }
    const ids = list.map(e => e.call_center_order_id);
    const { data: orderRows } = await supabase
      .from("call_center_orders" as any)
      .select("*")
      .in("id", ids);
    const map: Record<string, CallCenterOrder> = {};
    for (const o of ((orderRows as any[]) || [])) map[o.id] = o as CallCenterOrder;
    setEditsOrderMap(map);
  }, [dataOwnerId, branchId, enabled]);

  useEffect(() => { if (enabled) loadEdits(); }, [enabled, loadEdits]);

  // Initial load
  useEffect(() => {
    if (enabled) loadPendingOrders();
  }, [enabled, loadPendingOrders]);

  // Realtime subscription
  useEffect(() => {
    if (!dataOwnerId || !enabled) return;

    // Also re-evaluate periodically so an expired edit lock (no heartbeat
    // for > 3 min) automatically reveals the order to the branch without
    // waiting for a realtime UPDATE event on the row.
    const refreshTimer = setInterval(() => { loadPendingOrders(); }, 60_000);

    const channel = supabase
      .channel(`call-center-orders-${dataOwnerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_center_orders",
          filter: `user_id=eq.${dataOwnerId}`,
        },
        (payload) => {
          // ACK: if this order targets our branch and hasn't been delivered yet,
          // call the secure RPC which verifies the caller has an OPEN pos_session
          // on the target branch and stamps delivered_at server-side (first-writer-wins).
          const newRow: any = payload.new;
          if (
            branchId &&
            newRow?.target_branch_id === branchId &&
            newRow?.status === "pending" &&
            !newRow?.is_editing &&
            !newRow?.delivered_at
          ) {
            const deviceTag =
              (typeof window !== "undefined" && (window as any).__deviceFingerprint) ||
              localStorage.getItem("pos_device_fingerprint") ||
              "unknown-device";
            supabase
              .rpc("ack_call_center_order" as any, {
                p_order_id: newRow.id,
                p_device_tag: deviceTag,
              })
              .then(() => { /* fire-and-forget */ });
          }
          loadPendingOrders();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_center_orders",
          filter: `user_id=eq.${dataOwnerId}`,
        },
        () => {
          loadPendingOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      clearInterval(refreshTimer);
    };
  }, [dataOwnerId, enabled, loadPendingOrders]);

  // Realtime for edit proposals on this branch
  useEffect(() => {
    if (!dataOwnerId || !enabled) return;
    const channel = supabase
      .channel(`call-center-order-edits-${dataOwnerId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "call_center_order_edits",
        filter: `user_id=eq.${dataOwnerId}`,
      }, (payload) => {
        const row: any = payload.new || payload.old;
        if (row?.target_branch_id === branchId) {
          if (payload.eventType === "INSERT") {
            playNotificationSound();
            toast.info(`✏️ طلب تعديل من الكول سنتر`, {
              description: row.edit_note || "تعديل على طلبية محوّلة",
              action: { label: "عرض", onClick: () => setOpen(true) },
              duration: 10000,
            });
          }
          loadEdits();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dataOwnerId, enabled, branchId, loadEdits]);

  const handleAccept = async (order: CallCenterOrder) => {
    setAccepting(order.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Atomic update: only accept if still pending (prevents double-accept)
      const { data: updated, error } = await supabase
        .from("call_center_orders" as any)
        .update({
          status: "accepted",
          accepted_by: user?.id,
          accepted_at: new Date().toISOString(),
          session_id: sessionId,
        } as any)
        .eq("id", order.id)
        .eq("status", "pending") // Only if still pending
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!updated) {
        toast.warning("⚠️ هذا الطلب تم قبوله من كاشير آخر");
        // Remove from local list immediately
        setOrders(prev => prev.filter(o => o.id !== order.id));
        return;
      }

      // Remove from local list immediately so other cashiers see the update via realtime
      setOrders(prev => prev.filter(o => o.id !== order.id));
      onAcceptOrder(order);
      toast.success(`✅ تم قبول طلب ${order.customer_name}`);
    } catch (err: any) {
      toast.error("خطأ: " + (err.message || ""));
    } finally {
      setAccepting(null);
    }
  };

  const pendingCount = orders.length;
  const pendingEditsCount = edits.length;
  const totalBadge = pendingCount + pendingEditsCount;

  const handleAcceptEdit = async (edit: OrderEdit) => {
    setDeciding(edit.id);
    const { data, error } = await supabase.rpc("accept_order_edit" as any, { p_edit_id: edit.id });
    if (error || !data) {
      const msg = error?.message || "";
      if (msg.includes("cashier_session_required")) toast.error("يجب فتح وردية على هذا الفرع لقبول التعديل");
      else if (msg.includes("order_already_invoiced")) toast.error("لا يمكن تعديل طلبية بعد إصدار الفاتورة");
      else if (msg.includes("edit_already_decided")) toast.warning("التعديل عُولج مسبقاً");
      else toast.error("فشل قبول التعديل: " + msg);
    } else {
      toast.success("✅ تم تطبيق التعديل على الطلبية");
    }
    setDeciding(null);
    loadEdits();
    loadPendingOrders();
  };

  const handleRejectEdit = async (edit: OrderEdit) => {
    const reason = window.prompt("سبب الرفض (يُسجَّل للكول سنتر):", "");
    if (reason === null) return;
    setDeciding(edit.id);
    const { error } = await supabase.rpc("reject_order_edit" as any, { p_edit_id: edit.id, p_reason: reason || "" });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("cashier_session_required")) toast.error("يجب فتح وردية على هذا الفرع لرفض التعديل");
      else toast.error("فشل رفض التعديل: " + msg);
    } else {
      toast.success("تم رفض التعديل");
    }
    setDeciding(null);
    loadEdits();
  };

  const fieldLabels: Record<string, string> = {
    customer_name: "اسم الزبون",
    customer_phone: "رقم الهاتف",
    delivery_type: "نوع الطلب",
    delivery_address: "العنوان",
    payment_method: "طريقة الدفع",
    order_note: "ملاحظة الطلب",
    items: "الأصناف",
    total: "المجموع",
  };

  return (
    <>
      {/* Bell button in top bar */}
      <button
        onClick={() => setOpen(true)}
        className="relative h-8 w-8 shrink-0 rounded-lg flex items-center justify-center hover:bg-white/15 transition-all group overflow-visible"
        style={{ border: "1px solid rgba(255,255,255,0.15)" }}
        title="فواتير معلقة"
      >
        <Bell className={`h-4 w-4 ${totalBadge > 0 ? "text-amber-400 animate-pulse" : "text-white/70 group-hover:text-white"}`} />
        {totalBadge > 0 && (
          <span className="absolute -top-1 -left-1 w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center shadow-lg z-50 animate-pulse">
            {totalBadge}
          </span>
        )}
        <span className="absolute top-full mt-1.5 px-2 py-1 rounded text-[10px] font-medium bg-black/90 text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          فواتير وتعديلات معلّقة ({totalBadge})
        </span>
      </button>

      {/* Orders Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl lg:max-w-2xl p-0" dir="rtl">
          <SheetHeader className="p-3 border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4 text-amber-500" />
              فواتير معلقة من الكول سنتر
              {pendingCount > 0 && (
                <Badge variant="destructive" className="text-xs">{pendingCount}</Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-56px)]">
            <div className="p-3 space-y-2">
              {/* Pending edit proposals — shown above pending orders */}
              {edits.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-blue-700">
                    <Pencil className="h-3.5 w-3.5" />
                    تعديلات مقترحة على طلبيات محوّلة ({edits.length})
                  </div>
                  {edits.map(edit => {
                    const original = editsOrderMap[edit.call_center_order_id];
                    const changes = edit.proposed_changes || {};
                    return (
                      <div key={edit.id} className="rounded-lg border-2 border-blue-500/40 bg-blue-500/5 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge className="bg-blue-600 text-[10px]"><Pencil className="h-2.5 w-2.5 ml-0.5" /> طلب تعديل</Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(edit.created_at).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        {original && (
                          <div className="text-[11px] font-bold">
                            على طلبية: {original.customer_name} — ₪{original.total.toFixed(2)}
                          </div>
                        )}
                        <div className="bg-background/70 rounded p-2 space-y-1">
                          {Object.entries(changes).map(([key, newVal]) => {
                            const oldVal = (original as any)?.[key];
                            const label = fieldLabels[key] || key;
                            const fmt = (v: any) => {
                              if (v === null || v === undefined || v === "") return "—";
                              if (typeof v === "object") return JSON.stringify(v);
                              return String(v);
                            };
                            return (
                              <div key={key} className="text-[11px] grid grid-cols-[80px_1fr] gap-2 items-start">
                                <span className="font-semibold text-muted-foreground">{label}</span>
                                <div className="flex flex-wrap gap-1.5 items-center">
                                  <span className="line-through text-red-600/80 bg-red-500/10 px-1.5 rounded">{fmt(oldVal)}</span>
                                  <span className="text-muted-foreground">→</span>
                                  <span className="text-green-700 font-bold bg-green-500/10 px-1.5 rounded">{fmt(newVal)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {edit.edit_note && (
                          <div className="text-[10px] text-amber-800 bg-amber-500/10 rounded p-1.5">
                            📝 سبب التعديل: {edit.edit_note}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground">
                          من: {edit.created_by_name || "كول سنتر"}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleAcceptEdit(edit)}
                            disabled={deciding === edit.id}
                            className="flex-1 h-8 text-[11px] font-bold gap-1"
                            style={{ backgroundColor: "#16A34A" }}
                          >
                            <CheckCircle className="h-3.5 w-3.5" /> قبول التعديل
                          </Button>
                          <Button
                            onClick={() => handleRejectEdit(edit)}
                            disabled={deciding === edit.id}
                            variant="outline"
                            className="flex-1 h-8 text-[11px] gap-1 border-red-500/40 text-red-700 hover:bg-red-500/10"
                          >
                            <XCircle className="h-3.5 w-3.5" /> رفض
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {orders.length > 0 && <div className="border-t border-border my-2" />}
                </div>
              )}

              {orders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bell className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{edits.length > 0 ? "لا توجد طلبيات جديدة" : "لا توجد فواتير معلقة"}</p>
                </div>
              ) : (
                <AnimatePresence>
                  {orders.map((order) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 100 }}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2"
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-primary/10">
                            {order.source_app}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(order.created_at).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <Badge className={`text-[10px] px-1.5 py-0 h-5 ${order.delivery_type === "delivery" ? "bg-orange-500" : "bg-blue-500"}`}>
                          {order.delivery_type === "delivery" ? (
                            <><Truck className="h-2.5 w-2.5 ml-0.5" /> توصيل</>
                          ) : (
                            <><ShoppingBag className="h-2.5 w-2.5 ml-0.5" /> استلام</>
                          )}
                        </Badge>
                      </div>

                      {/* Customer + Branch inline */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <User className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span className="text-sm font-bold truncate">{order.customer_name}</span>
                        </div>
                        {order.target_branch_name && (
                          <span className="text-[10px] font-semibold text-primary flex items-center gap-0.5 flex-shrink-0">
                            <MapPin className="h-3 w-3" />
                            {order.target_branch_name}
                          </span>
                        )}
                      </div>

                      {/* Phone + Address compact */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {order.customer_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-2.5 w-2.5" />
                            <span dir="ltr">{order.customer_phone}</span>
                          </span>
                        )}
                        {order.delivery_address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-2.5 w-2.5" />
                            {order.delivery_address}
                          </span>
                        )}
                      </div>

                      {/* Items compact */}
                      <div className="bg-background/60 rounded p-2 space-y-0.5">
                        {(order.items || []).map((item: any, i: number) => (
                          <div key={i} className="text-[11px]">
                            <div className="flex justify-between">
                              <span>{item.name} × {item.qty}</span>
                              <span className="font-mono">₪{(item.total || 0).toFixed(2)}</span>
                            </div>
                            {item.note && String(item.note).trim() && (
                              <div className="text-amber-700 dark:text-amber-400 text-[10px] pr-2">
                                — ملاحظة: {item.note}
                              </div>
                            )}
                            {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                              <ul className="pr-3 text-[10px] text-foreground/70">
                                {item.modifiers.map((m: any, mi: number) => (
                                  <li key={mi} className="flex items-baseline gap-1">
                                    <span className="text-muted-foreground">+</span>
                                    <span>{m.option_name}</span>
                                    {Number(m.extra_price) > 0 && (
                                      <span className="text-muted-foreground">(₪{Number(m.extra_price).toFixed(2)})</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                        {Number(order.delivery_fee || 0) > 0 && (
                          <div className="flex justify-between text-[11px] text-orange-700 font-semibold">
                            <span>توصيل {order.delivery_info?.area ? `(${order.delivery_info.area})` : ""}</span>
                            <span className="font-mono">₪{Number(order.delivery_fee).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-xs border-t border-border pt-1 mt-1">
                          <span>المجموع</span>
                          <span className="font-mono">₪{order.total.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Payment + dispatcher inline */}
                      <div className="flex items-center justify-between text-[10px]">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${order.payment_method.startsWith("visa") ? "border-purple-500/30 text-purple-600" : "border-green-500/30 text-green-600"}`}>
                          {order.payment_method === "cash" ? (
                            <><Banknote className="h-2.5 w-2.5 ml-0.5" /> نقدي</>
                          ) : order.payment_method === "visa" ? (
                            <><CreditCard className="h-2.5 w-2.5 ml-0.5" /> فيزا</>
                          ) : (
                            <><CreditCard className="h-2.5 w-2.5 ml-0.5" /> {order.payment_method.replace("visa_", "فيزا ").replace(/_/g, " ")}</>
                          )}
                        </Badge>
                        <span className="text-muted-foreground">بواسطة: {order.dispatched_by_name}</span>
                      </div>

                      {(() => {
                        const clean = extractBaseNote(order.order_note);
                        if (!clean) return null;
                        return (
                          <p className="text-[10px] text-muted-foreground bg-muted/30 rounded p-1.5">📝 {clean}</p>
                        );
                      })()}

                      {/* Accept Button */}
                      <Button
                        onClick={() => handleAccept(order)}
                        disabled={accepting === order.id}
                        className="w-full h-9 text-xs font-bold gap-1.5 rounded-lg"
                        style={{ backgroundColor: "#16A34A" }}
                      >
                        {accepting === order.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <CheckCircle className="h-3.5 w-3.5" />
                        )}
                        قبول ومعالجة الطلب
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default PendingOrdersPanel;
