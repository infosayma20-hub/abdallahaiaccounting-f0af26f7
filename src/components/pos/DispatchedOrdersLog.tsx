import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClipboardList, Clock, CheckCircle2, XCircle, Truck, ShoppingBag, Phone, User, RefreshCw, RotateCcw, Pencil, StickyNote, Users, Trash2, Utensils } from "lucide-react";
import { CreditCard, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import EditOrderDialog from "./EditOrderDialog";
import { extractBaseNote, deliveryBreakdown } from "@/lib/order-note-utils";
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
import { StockoutAlertsBanner } from "./StockoutAlerts";

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
  is_editing?: boolean | null;
  editing_by_name?: string | null;
  delivery_fee?: number | null;
  delivery_info?: any | null;
  cancelled_at?: string | null;
  cancelled_by_name?: string | null;
  cancel_reason?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  dataOwnerId: string;
  /** When true, exposes the admin-only "ملغاة" archive tab. */
  isAdmin?: boolean;
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
  cancelled_after_acceptance: { label: "أُلغيت بعد القبول", color: "bg-red-700", icon: XCircle },
};

/**
 * Business-day-aware range helpers (6 AM cutoff, local time).
 * `daysBack` = 0 → today's business day; 1 → yesterday; etc.
 */
const CUTOFF_HOUR = 6;
const MAX_DAYS = 7;

function businessDayBoundary(daysBack: number): Date {
  const now = new Date();
  const d = new Date(now);
  if (now.getHours() < CUTOFF_HOUR) d.setDate(d.getDate() - 1);
  d.setDate(d.getDate() - daysBack);
  d.setHours(CUTOFF_HOUR, 0, 0, 0);
  return d;
}

type RangePreset = "today" | "yesterday" | "last3" | "last7" | "custom";

function rangeFromPreset(preset: RangePreset, customFromDays?: number, customToDays?: number): { start: Date; end: Date } {
  if (preset === "today") {
    return { start: businessDayBoundary(0), end: businessDayBoundary(-1) };
  }
  if (preset === "yesterday") {
    return { start: businessDayBoundary(1), end: businessDayBoundary(0) };
  }
  if (preset === "last3") {
    return { start: businessDayBoundary(2), end: businessDayBoundary(-1) };
  }
  if (preset === "last7") {
    return { start: businessDayBoundary(6), end: businessDayBoundary(-1) };
  }
  // custom (clamped to 7 days by caller)
  return {
    start: businessDayBoundary(customFromDays ?? 0),
    end: businessDayBoundary((customToDays ?? 0) - 1),
  };
}

export default function DispatchedOrdersLog({ open, onClose, dataOwnerId, isAdmin, onEditInCart }: Props) {
  const [orders, setOrders] = useState<DispatchedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "accepted" | "completed" | "cancelled">("all");
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<DispatchedOrder | null>(null);
  const [editsByOrder, setEditsByOrder] = useState<Record<string, { pending: number; lastStatus?: string }>>({});
  /** Filter by call-center agent (dispatched_by_name). `null` = الكل. */
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  /** Date-range preset for the history view. Default = today. */
  const [rangePreset, setRangePreset] = useState<RangePreset>("today");
  /** Custom range — `fromDate`/`toDate` as local YYYY-MM-DD strings. */
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  /** Cancel-confirmation dialog state. */
  const [cancelTarget, setCancelTarget] = useState<DispatchedOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  /** Close-confirmation dialog state (item 10). */
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  /** Late-acceptance alert tracking (item 6): orders we've already beeped for. */
  const beepedRef = useRef<Set<string>>(new Set());
  const [lateIds, setLateIds] = useState<Set<string>>(new Set());

  const loadOrders = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);

    // Resolve the active date range.
    let start: Date;
    let end: Date;
    if (rangePreset === "custom" && customFrom && customTo) {
      const from = new Date(customFrom + "T00:00:00");
      const to = new Date(customTo + "T23:59:59.999");
      // Clamp to MAX_DAYS (inclusive) so a user can't pull a giant window.
      const diffDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
      if (diffDays > MAX_DAYS) {
        toast.warning(`الحد الأقصى ${MAX_DAYS} أيام — تم تقليص النطاق تلقائياً`);
        from.setDate(to.getDate() - (MAX_DAYS - 1));
        from.setHours(0, 0, 0, 0);
        setCustomFrom(from.toISOString().slice(0, 10));
      }
      // Apply the 6 AM cutoff at the lower bound so the result aligns with
      // the business-day model used elsewhere in POS reporting.
      from.setHours(CUTOFF_HOUR, 0, 0, 0);
      start = from;
      end = to;
    } else {
      const r = rangeFromPreset(rangePreset === "custom" ? "today" : rangePreset);
      start = r.start;
      end = r.end;
    }

    let query = supabase
      .from("call_center_orders" as any)
      .select("*")
      .eq("user_id", dataOwnerId)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .limit(200);

    if (filter === "cancelled") {
      // Admin-only archive view — show ONLY cancelled orders
      // (both pre-acceptance cancellations and post-acceptance cash invoice voids).
      query = query.in("status", ["cancelled", "cancelled_after_acceptance"]);
    } else if (filter !== "all") {
      query = query.eq("status", filter);
    } else {
      // Default "all" view hides any kind of cancelled order from staff and
      // from counters — they live in the admin-only archive tab.
      query = query.not("status", "in", "(cancelled,cancelled_after_acceptance)");
    }

    const { data } = await query;
    setOrders((data as any as DispatchedOrder[]) || []);
    setLoading(false);
  }, [dataOwnerId, filter, rangePreset, customFrom, customTo]);

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

  /* ─────────────────────────── Late-acceptance alert (item 6) ───────────────────────────
   * If a dispatched order is still `pending` (not accepted / not cancelled / not being
   * edited) after 5 minutes, beep ONCE for that order and surface a "تأخر القبول"
   * indicator. We never beep twice for the same order id within the session. */
  const FIVE_MIN = 5 * 60 * 1000;
  const playBeep = useCallback(() => {
    try {
      const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.55);
      // Second short beep so it's noticeable but not loopy.
      setTimeout(() => {
        try {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.type = "sine"; o2.frequency.value = 1100;
          g2.gain.setValueAtTime(0.0001, ctx.currentTime);
          g2.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
          g2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
          o2.connect(g2).connect(ctx.destination);
          o2.start();
          o2.stop(ctx.currentTime + 0.45);
          setTimeout(() => { try { ctx.close(); } catch {} }, 800);
        } catch {}
      }, 250);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    const tick = () => {
      const now = Date.now();
      const newLate = new Set<string>();
      let triggered = false;
      for (const o of orders) {
        if (o.status !== "pending") continue;
        if (o.cancelled_at) continue;
        if (o.is_editing) continue;
        const age = now - new Date(o.created_at).getTime();
        if (age >= FIVE_MIN) {
          newLate.add(o.id);
          if (!beepedRef.current.has(o.id)) {
            beepedRef.current.add(o.id);
            triggered = true;
          }
        }
      }
      // Drop ids that are no longer pending so a future re-pending order would re-beep.
      const livePending = new Set(orders.filter(o => o.status === "pending").map(o => o.id));
      for (const id of Array.from(beepedRef.current)) {
        if (!livePending.has(id)) beepedRef.current.delete(id);
      }
      setLateIds(newLate);
      if (triggered) playBeep();
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [open, orders, playBeep]);

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

  /** Soft-cancel a still-pending dispatched order. Permission + race-safety
      enforced server-side by `cancel_dispatched_call_center_order`. */
  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (reason.length < 2) {
      toast.error("الرجاء كتابة سبب الإلغاء");
      return;
    }
    setCancelling(true);
    const { data, error } = await supabase.rpc(
      "cancel_dispatched_call_center_order" as any,
      { p_order_id: cancelTarget.id, p_reason: reason } as any,
    );
    setCancelling(false);
    if (error) {
      toast.error("تعذّر الإلغاء: " + (error.message || ""));
      return;
    }
    const res = (data as any) || {};
    if (!res.ok) {
      const r = res.reason || "";
      if (r === "already_accepted") {
        toast.error("لا يمكن إلغاء الطلبية لأنها قُبلت من الفرع");
      } else if (r === "not_owner") {
        toast.error("يمكن للموظفة التي حوّلت الطلبية أو للأدمن فقط إلغاؤها");
      } else if (r === "reason_required") {
        toast.error("سبب الإلغاء مطلوب");
      } else if (r === "not_found") {
        toast.error("الطلبية لم تعد موجودة");
      } else {
        toast.error("تعذّر الإلغاء: " + r);
      }
      loadOrders();
      return;
    }
    toast.success("تم إلغاء الطلبية وإخفاؤها من جميع الشاشات");
    setCancelTarget(null);
    setCancelReason("");
    loadOrders();
  };

  const pendingCount = orders.filter(o => o.status === "pending").length;
  const acceptedCount = orders.filter(o => o.status === "accepted").length;
  const completedCount = orders.filter(o => o.status === "completed").length;
  const cancelledCount = orders.filter(
    o => o.status === "cancelled" || o.status === "cancelled_after_acceptance"
  ).length;

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
            { key: "all" as const, label: "الكل", count: orders.filter(o => o.status !== "cancelled" && o.status !== "cancelled_after_acceptance").length },
            { key: "pending" as const, label: "معلّق", count: pendingCount },
            { key: "accepted" as const, label: "مقبول", count: acceptedCount },
            { key: "completed" as const, label: "مكتمل", count: completedCount },
            ...(isAdmin
              ? [{ key: "cancelled" as const, label: "ملغاة", count: cancelledCount }]
              : []),
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                filter === tab.key
                  ? (tab.key === "cancelled" ? "bg-red-600 text-white" : "bg-primary text-primary-foreground")
                  : "bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Date-range filter — defaults to today; max 7 days. */}
        <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-border bg-muted/10">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
            <CalendarDays className="h-3 w-3" /> الفترة:
          </span>
          {([
            { key: "today" as const, label: "اليوم" },
            { key: "yesterday" as const, label: "أمس" },
            { key: "last3" as const, label: "آخر 3 أيام" },
            { key: "last7" as const, label: "آخر 7 أيام" },
            { key: "custom" as const, label: "مخصّص" },
          ]).map(opt => (
            <button
              key={opt.key}
              onClick={() => setRangePreset(opt.key)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all ${
                rangePreset === opt.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {rangePreset === "custom" && (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomFrom(v);
                  if (v && customTo) {
                    const diff = Math.floor(
                      (new Date(customTo).getTime() - new Date(v).getTime()) / 86_400_000
                    ) + 1;
                    if (diff > MAX_DAYS) {
                      toast.warning(`الحد الأقصى ${MAX_DAYS} أيام`);
                    }
                  }
                }}
                className="h-6 rounded border border-border bg-background text-[10px] px-1"
              />
              <span className="text-[10px] text-muted-foreground">→</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-6 rounded border border-border bg-background text-[10px] px-1"
              />
            </div>
          )}
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
                <p className="text-sm">لا توجد فواتير محوّلة ضمن الفترة المحددة</p>
              </div>
            ) : (
              visibleOrders.map((order) => {
                const cfg = statusConfig[order.status] || statusConfig.pending;
                const StatusIcon = cfg.icon;
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
                          {rangePreset === "today"
                            ? new Date(order.created_at).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })
                            : new Date(order.created_at).toLocaleString("ar-PS", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="text-[10px] text-muted-foreground">→</span>
                        <span className="text-[10px] font-semibold text-primary">{order.target_branch_name}</span>
                      </div>
                      <Badge className={`text-[10px] px-1.5 py-0 h-5 gap-0.5 ${cfg.color}`}>
                        <StatusIcon className="h-2.5 w-2.5" />
                        {cfg.label}
                      </Badge>
                    </div>

                    {order.is_editing && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-500/15 border border-amber-500/40 rounded px-1.5 py-0.5">
                        <Pencil className="h-3 w-3" />
                        قيد التعديل من {order.editing_by_name || "الكول سنتر"} — مخفية عن الفرع
                      </div>
                    )}

                    {/* Admin-only cancellation archive details */}
                    {(order.status === "cancelled" || order.status === "cancelled_after_acceptance") && (
                      <div className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-[10px] text-red-800 dark:text-red-300 space-y-0.5">
                        <div className="flex items-center gap-1 font-bold">
                          <XCircle className="h-3 w-3" />
                          {order.status === "cancelled_after_acceptance"
                            ? "أُلغيت بعد قبولها من الكاش"
                            : "تم الإلغاء قبل القبول"}
                          {order.cancelled_at && (
                            <span className="font-normal opacity-80">
                              — {new Date(order.cancelled_at).toLocaleString("ar-PS", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        {order.cancelled_by_name && (
                          <div>ألغاها: <b>{order.cancelled_by_name}</b></div>
                        )}
                        {order.cancel_reason && (
                          <div>السبب: <b>{order.cancel_reason}</b></div>
                        )}
                      </div>
                    )}

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
                        {(() => {
                          const dt = String(order.delivery_type || "").toLowerCase();
                          const isDelivery = dt === "delivery";
                          const isDineIn = dt === "dine_in" || dt === "table";
                          const Icon = isDelivery ? Truck : isDineIn ? Utensils : ShoppingBag;
                          const label = isDelivery ? "توصيل" : isDineIn ? "طاولة" : "استلام";
                          const cls = isDelivery
                            ? "border-orange-500/40 text-orange-700 bg-orange-500/5"
                            : isDineIn
                              ? "border-emerald-500/40 text-emerald-700 bg-emerald-500/5"
                              : "border-blue-500/40 text-blue-700 bg-blue-500/5";
                          return (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 gap-1 ${cls}`}>
                              <Icon className="h-2.5 w-2.5" />
                              {label}
                            </Badge>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Payment method — explicit chip so the call-center user
                        can see how each dispatched order will be collected
                        without having to open the edit dialog. Cash vs. Visa
                        comes from `payment_method`; the specific visa-via-app
                        label (Wheels App Visa, Yummy …) is carried by
                        `source_app`, so we surface both when relevant. */}
                    {(() => {
                      const pm = String(order.payment_method || "").toLowerCase();
                      const isVisa = pm.startsWith("visa");
                      const src = String(order.source_app || "").trim();
                      const isVisaApp = isVisa && src && src !== "طلب مباشر";
                      const label = !isVisa
                        ? "نقدي"
                        : isVisaApp
                          ? `فيزا — ${src}`
                          : "فيزا";
                      return (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">طريقة الدفع:</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 h-5 gap-1 ${
                              isVisa
                                ? "border-purple-500/40 text-purple-700 bg-purple-500/5"
                                : "border-green-500/40 text-green-700 bg-green-500/5"
                            }`}
                          >
                            {isVisa ? <CreditCard className="h-2.5 w-2.5" /> : <Banknote className="h-2.5 w-2.5" />}
                            {label}
                          </Badge>
                        </div>
                      );
                    })()}

                    {/* Items list — show per-item notes (e.g. حار / عادي) explicitly. */}
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      {(order.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="space-y-0.5">
                          <div className="flex flex-wrap items-baseline gap-x-1">
                            <span className="text-foreground/80">{item.name} × {item.qty}</span>
                            {item.note && String(item.note).trim() && (
                              <span className="text-amber-700 dark:text-amber-400 font-medium">
                                — ملاحظة: {item.note}
                              </span>
                            )}
                          </div>
                          {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                            <ul className="pr-3 space-y-0.5">
                              {item.modifiers.map((m: any, mi: number) => (
                                <li key={mi} className="flex items-baseline gap-1 text-[10px] text-foreground/70">
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
                    </div>

                    {/* Price breakdown — explicitly split items vs. delivery so
                        the cashier knows what's restaurant sales and what's
                        collected on behalf of the delivery company. The big
                        number stays the customer total (المطلوب تحصيله). */}
                    {(() => {
                      const fee = Number((order as any).delivery_fee || 0);
                      const { items, delivery, total } = deliveryBreakdown({
                        total: Number(order.total) || 0,
                        deliveryFee: fee,
                      });
                      return (
                        <div className="rounded border border-border bg-muted/30 px-2 py-1.5 space-y-0.5 text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">سعر الطلبية</span>
                            <span className="font-mono">₪{items.toFixed(2)}</span>
                          </div>
                          {delivery > 0 && (
                            <div className="flex justify-between text-orange-700 dark:text-orange-400">
                              <span>رسوم التوصيل{(order as any).delivery_info?.area ? ` (${(order as any).delivery_info.area})` : ""}</span>
                              <span className="font-mono">₪{delivery.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-xs border-t border-border pt-1 mt-0.5">
                            <span>الإجمالي للتحصيل</span>
                            <span className="font-mono">₪{total.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Customer-side free-text note only — auto-composed
                        delivery/customer/phone fields are stripped to avoid
                        the long duplicated block we used to render. */}
                    {(() => {
                      const clean = extractBaseNote(order.order_note);
                      if (!clean) return null;
                      return (
                        <div className="flex items-start gap-1 text-[10px] rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-1 text-amber-800 dark:text-amber-300">
                          <StickyNote className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span><b>ملاحظة الطلبية:</b> {clean}</span>
                        </div>
                      );
                    })()}

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
                          onClick={async () => {
                            // Pending orders → acquire the atomic edit lock via RPC,
                            // then open in POS cart for full item-level edit.
                            // Accepted orders → keep legacy proposal dialog.
                            if (order.status === "pending" && onEditInCart) {
                              const { data, error } = await supabase.rpc(
                                "start_editing_call_center_order" as any,
                                { p_order_id: order.id } as any
                              );
                              if (error) {
                                toast.error("تعذّر بدء التعديل: " + (error.message || ""));
                                return;
                              }
                              const res = (data as any) || {};
                              if (!res.ok) {
                                const reason = res.reason || "";
                                if (reason === "already_accepted") {
                                  toast.error("لا يمكن التعديل — الطلبية تم قبولها من الفرع");
                                } else if (reason === "locked_by_other") {
                                  toast.error(`الطلبية قيد التعديل حالياً من ${res.editing_by_name || "موظفة أخرى"}`);
                                } else if (reason === "not_found") {
                                  toast.error("الطلبية لم تعد موجودة");
                                } else {
                                  toast.error("تعذّر بدء التعديل: " + reason);
                                }
                                loadOrders();
                                return;
                              }
                              onEditInCart(order);
                            } else {
                              setEditTarget(order);
                            }
                          }}
                          disabled={
                            (editsByOrder[order.id]?.pending || 0) > 0 ||
                            (order.is_editing === true)
                          }
                        >
                          <Pencil className="h-3 w-3" />
                          {(editsByOrder[order.id]?.pending || 0) > 0
                            ? "تعديل قيد المراجعة"
                            : order.is_editing
                              ? "قيد التعديل"
                              : "تعديل الطلبية"}
                        </Button>
                        {/* Cancel — only for pending, not-yet-accepted, not-invoiced orders.
                            Server-side RPC enforces "dispatcher OR admin" + race safety. */}
                        {order.status === "pending" && !order.pos_order_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] gap-1.5 border-red-500/40 text-red-700 hover:bg-red-500/10"
                            onClick={() => { setCancelReason(""); setCancelTarget(order); }}
                            disabled={(editsByOrder[order.id]?.pending || 0) > 0}
                          >
                            <Trash2 className="h-3 w-3" />
                            إلغاء
                          </Button>
                        )}
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
    <AlertDialog
      open={!!cancelTarget}
      onOpenChange={(v) => { if (!v && !cancelling) { setCancelTarget(null); setCancelReason(""); } }}
    >
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>إلغاء الطلبية المحوّلة</AlertDialogTitle>
          <AlertDialogDescription>
            هل أنت متأكد من إلغاء هذه الطلبية؟ سيتم إخفاؤها من الكاش والسجل والتقارير ولا يمكن قبولها من الفرع.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">
            سبب الإلغاء <span className="text-red-600">*</span>
          </label>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="مثال: طلبية اختبار، زبون ألغى، خطأ في التحويل…"
            rows={3}
            disabled={cancelling}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelling}>تراجع</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirmCancel(); }}
            disabled={cancelling || cancelReason.trim().length < 2}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {cancelling ? "جاري الإلغاء…" : "تأكيد الإلغاء"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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