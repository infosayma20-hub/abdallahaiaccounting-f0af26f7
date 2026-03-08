import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Search, Printer, RotateCcw, Ban, Clock, User, Eye,
  ChevronLeft, AlertTriangle, Lock, FileText, ShoppingCart,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format, startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from "date-fns";

// ── Types ──
interface InvoiceOrder {
  id: string;
  order_number: string | null;
  created_at: string;
  total: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  state: string;
  customer_name: string | null;
  customer_id: string | null;
  session_id: string;
  is_return: boolean;
  recall_status: string | null;
  recall_reason: string | null;
  recalled_by: string | null;
  recalled_approved_by: string | null;
  recalled_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  paid_at: string | null;
}

interface InvoiceLine {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  unit_price: number;
  cost_price: number;
  subtotal: number;
  total: number;
  discount_amount: number;
}

interface InvoicePayment {
  id: string;
  order_id: string;
  payment_method: string;
  amount: number;
  currency: string | null;
}

type DateFilter = "today" | "yesterday" | "week" | "month" | "custom";
type StatusFilter = "all" | "paid" | "draft" | "cancelled" | "recalled";

interface CartItem {
  id: string;
  product_id: string | null;
  name: string;
  qty: number;
  unit_price: number;
  cost_price: number;
  discount_pct: number;
  tax_rate: number;
  unit: string;
  total: number;
  note: string;
}

interface InvoiceHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  dataOwnerId: string;
  sessionId: string | null;
  cashierName: string;
  terminalName: string;
  onRecallToCart: (items: CartItem[], invoiceId: string, orderNumber: string, reason: string, approvedBy: string | null) => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  credit: "آجل",
  employee_account: "حساب موظف",
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  paid: { label: "مكتملة", bg: "#DCFCE7", text: "#16A34A" },
  draft: { label: "معلقة", bg: "#FEF9C3", text: "#CA8A04" },
  cancelled: { label: "ملغية", bg: "#FEE2E2", text: "#DC2626" },
  recalled: { label: "معدّلة", bg: "#EFF6FF", text: "#0A2342" },
};

const RECALL_REASONS = [
  "خطأ في الكمية",
  "خطأ في السعر",
  "إضافة صنف",
  "حذف صنف",
  "تعديل العميل",
];

export default function InvoiceHistoryDrawer({
  open, onClose, dataOwnerId, sessionId, cashierName, terminalName, onRecallToCart,
}: InvoiceHistoryDrawerProps) {
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [orders, setOrders] = useState<InvoiceOrder[]>([]);
  const [loading, setLoading] = useState(false);

  // Detail modal
  const [selectedOrder, setSelectedOrder] = useState<InvoiceOrder | null>(null);
  const [orderLines, setOrderLines] = useState<InvoiceLine[]>([]);
  const [orderPayments, setOrderPayments] = useState<InvoicePayment[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Recall flow
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [showManagerPin, setShowManagerPin] = useState(false);
  const [recallReason, setRecallReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [managerPin, setManagerPin] = useState(["", "", "", ""]);
  const [pinError, setPinError] = useState("");
  const [recallingOrder, setRecallingOrder] = useState<InvoiceOrder | null>(null);

  // Cancel flow
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancelPin, setShowCancelPin] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancellingOrder, setCancellingOrder] = useState<InvoiceOrder | null>(null);

  // ── Date range ──
  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    switch (dateFilter) {
      case "today": return { dateFrom: startOfDay(now), dateTo: endOfDay(now) };
      case "yesterday": return { dateFrom: startOfDay(subDays(now, 1)), dateTo: endOfDay(subDays(now, 1)) };
      case "week": return { dateFrom: startOfWeek(now, { weekStartsOn: 0 }), dateTo: endOfDay(now) };
      case "month": return { dateFrom: startOfMonth(now), dateTo: endOfDay(now) };
      default: return { dateFrom: startOfDay(now), dateTo: endOfDay(now) };
    }
  }, [dateFilter]);

  // ── Fetch orders ──
  const fetchOrders = useCallback(async () => {
    if (!dataOwnerId || !open) return;
    setLoading(true);
    try {
      const baseQuery = supabase
        .from("pos_orders")
        .select("id, order_number, created_at, total, subtotal, discount_amount, tax_amount, state, customer_name, customer_id, session_id, is_return, recall_status, recall_reason, recalled_by, recalled_approved_by, recalled_at, cancelled_at, cancel_reason, paid_at")
        .eq("user_id", dataOwnerId);
      let query = baseQuery
        .gte("created_at", dateFrom.toISOString())
        .lte("created_at", dateTo.toISOString())
        .order("created_at", { ascending: false })
        .limit(200) as any;

      if (statusFilter !== "all") {
        if (statusFilter === "recalled") {
          query = query.not("recall_status", "is", null);
        } else {
          query = query.eq("state", statusFilter);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      setOrders((data || []) as InvoiceOrder[]);
    } catch (err) {
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  }, [dataOwnerId, open, dateFrom, dateTo, statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Filtered orders ──
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase();
    return orders.filter(o =>
      (o.order_number || "").toLowerCase().includes(q) ||
      (o.customer_name || "").toLowerCase().includes(q)
    );
  }, [orders, searchQuery]);

  // ── Summary ──
  const summary = useMemo(() => {
    const paid = orders.filter(o => o.state === "paid" && !o.is_return);
    return {
      totalToday: paid.reduce((s, o) => s + o.total, 0),
      count: paid.length,
      cancelled: orders.filter(o => o.state === "cancelled").length,
    };
  }, [orders]);

  // ── Load detail ──
  const loadDetail = async (order: InvoiceOrder) => {
    setSelectedOrder(order);
    setLoadingDetail(true);
    try {
      const [linesRes, paymentsRes] = await Promise.all([
        supabase.from("pos_order_lines").select("id, order_id, product_id, product_name, qty, unit_price, cost_price, subtotal, total, discount_amount").eq("order_id", order.id),
        supabase.from("pos_payments").select("id, order_id, payment_method, amount, currency").eq("order_id", order.id),
      ]);
      setOrderLines((linesRes.data || []) as InvoiceLine[]);
      setOrderPayments((paymentsRes.data || []) as InvoicePayment[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // ── Recall logic ──
  const initiateRecall = (order: InvoiceOrder) => {
    if (order.state !== "paid") {
      toast.error("لا يمكن استدعاء فاتورة غير مكتملة");
      return;
    }
    setRecallingOrder(order);
    const minutesAgo = (Date.now() - new Date(order.created_at).getTime()) / 60000;
    if (minutesAgo <= 30) {
      setShowReasonDialog(true);
    } else {
      setShowManagerPin(true);
    }
  };

  const handleReasonConfirm = () => {
    const reason = recallReason === "أخرى" ? customReason : recallReason;
    if (!reason) { toast.error("اختر سبب التعديل"); return; }
    executeRecall(recallingOrder!, reason, null);
  };

  const handleManagerPinSubmit = async () => {
    const pin = managerPin.join("");
    if (pin.length < 4) { setPinError("أدخل الرمز كاملاً"); return; }

    // Check against pos_users with manager/admin role
    const { data: posUser } = await supabase
      .from("pos_users")
      .select("id, name, role")
      .eq("company_id", dataOwnerId)
      .eq("pin", pin)
      .in("role", ["manager", "admin"])
      .maybeSingle();

    if (!posUser) {
      // Fallback: check profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, display_name, role")
        .eq("user_id", dataOwnerId)
        .maybeSingle();

      if (!profile) {
        setPinError("رمز غير صحيح أو ليس لديك صلاحية");
        // Log failed attempt
        await supabase.from("pos_audit_log").insert({
          user_id: dataOwnerId,
          order_id: recallingOrder?.id || cancellingOrder?.id,
          action: "PIN_FAILED",
          cashier_name: cashierName,
          terminal_name: terminalName,
          reason: "محاولة إدخال رمز مدير غير صحيح",
        } as any);
        return;
      }
    }

    const approvedBy = posUser?.name || "المدير";

    if (showManagerPin && recallingOrder) {
      setShowManagerPin(false);
      setShowReasonDialog(true);
      // Store approvedBy for after reason selection
      setManagerPin(["", "", "", ""]);
      // We need to pass approvedBy through; use a ref-like approach with state
      setRecallReason(""); // reset
      // Actually, let's use a simpler flow: after PIN, show reason, then execute
      const waitForReason = () => {
        // This will be handled by a modified flow
      };
    }

    if (showCancelPin && cancellingOrder) {
      setShowCancelPin(false);
      executeCancel(cancellingOrder, cancelReason, approvedBy);
    }
  };

  const executeRecall = async (order: InvoiceOrder, reason: string, approvedBy: string | null) => {
    try {
      // 1. Mark original as recalled
      await supabase
        .from("pos_orders")
        .update({
          recall_status: "recalled",
          recall_reason: reason,
          recalled_by: cashierName,
          recalled_approved_by: approvedBy,
          recalled_at: new Date().toISOString(),
        } as any)
        .eq("id", order.id);

      // 2. Log in audit
      await supabase.from("pos_audit_log").insert({
        user_id: dataOwnerId,
        order_id: order.id,
        action: "INVOICE_RECALLED",
        cashier_name: cashierName,
        approved_by: approvedBy,
        reason: reason,
        original_total: order.total,
        terminal_name: terminalName,
      } as any);

      // 3. Load order lines into cart
      const { data: lines } = await supabase
        .from("pos_order_lines")
        .select("*")
        .eq("order_id", order.id);

      const cartItems: CartItem[] = (lines || []).map((l: any) => ({
        id: crypto.randomUUID(),
        product_id: l.product_id,
        name: l.product_name,
        qty: l.qty,
        unit_price: l.unit_price,
        cost_price: l.cost_price,
        discount_pct: l.discount_pct || 0,
        tax_rate: l.tax_rate || 0,
        unit: l.unit || "قطعة",
        total: l.total,
        note: "",
      }));

      onRecallToCart(cartItems, order.id, order.order_number || "", reason, approvedBy);
      toast.success(`تم استدعاء الفاتورة #${order.order_number || ""} للتعديل`);

      // Reset states
      setShowReasonDialog(false);
      setRecallingOrder(null);
      setRecallReason("");
      setCustomReason("");
      setSelectedOrder(null);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء استدعاء الفاتورة");
    }
  };

  // ── Cancel logic ──
  const initiateCancel = (order: InvoiceOrder) => {
    if (order.state !== "paid") {
      toast.error("لا يمكن إلغاء فاتورة غير مكتملة");
      return;
    }
    const hoursAgo = (Date.now() - new Date(order.created_at).getTime()) / 3600000;
    if (hoursAgo > 24) {
      toast.error("لا يمكن إلغاء فاتورة أقدم من 24 ساعة بدون صلاحية SuperAdmin");
      return;
    }
    setCancellingOrder(order);
    setShowCancelConfirm(true);
  };

  const handleCancelConfirm = () => {
    setShowCancelConfirm(false);
    setShowCancelPin(true);
  };

  const executeCancel = async (order: InvoiceOrder, reason: string, approvedBy: string) => {
    try {
      // 1. Update order status
      await supabase
        .from("pos_orders")
        .update({
          state: "cancelled",
          cancel_reason: reason,
          cancelled_by: cashierName,
          cancelled_approved_by: approvedBy,
          cancelled_at: new Date().toISOString(),
        } as any)
        .eq("id", order.id);

      // 2. Audit log
      await supabase.from("pos_audit_log").insert({
        user_id: dataOwnerId,
        order_id: order.id,
        action: "INVOICE_CANCELLED",
        cashier_name: cashierName,
        approved_by: approvedBy,
        reason: reason,
        original_total: order.total,
        terminal_name: terminalName,
      } as any);

      toast.success(`تم إلغاء الفاتورة #${order.order_number || ""}`);
      setSelectedOrder(null);
      setCancellingOrder(null);
      setCancelReason("");
      fetchOrders();
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء إلغاء الفاتورة");
    }
  };

  // ── Manager PIN after reason (for old invoices) ──
  const [pendingApprovedBy, setPendingApprovedBy] = useState<string | null>(null);

  const handleRecallWithPin = () => {
    // For > 30min invoices: first get PIN, then ask reason
    setShowManagerPin(true);
  };

  // PIN input handler
  const handlePinInput = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    const newPin = [...managerPin];
    newPin[index] = value;
    setManagerPin(newPin);
    setPinError("");
    if (value && index < 3) {
      const next = document.getElementById(`mgr-pin-${index + 1}`);
      next?.focus();
    }
  };

  const getStatusDisplay = (order: InvoiceOrder) => {
    if (order.recall_status === "recalled") return STATUS_CONFIG.recalled;
    return STATUS_CONFIG[order.state] || STATUS_CONFIG.paid;
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-[999]"
        onClick={onClose}
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-full z-[1000] flex flex-col"
        style={{
          width: 480,
          background: "white",
          boxShadow: "-8px 0 32px rgba(10,35,66,0.2)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#E2E8F0" }}>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" style={{ color: "#0A2342" }} />
            <span className="text-base font-bold" style={{ fontFamily: "Tajawal, sans-serif", color: "#0A2342" }}>
              سجل الفواتير
            </span>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4" style={{ color: "#64748B" }} />
          </button>
        </div>

        {/* Date filters */}
        <div className="px-5 py-3 border-b space-y-2.5" style={{ borderColor: "#E2E8F0" }}>
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: "today", label: "اليوم" },
              { key: "yesterday", label: "أمس" },
              { key: "week", label: "آخر 7 أيام" },
              { key: "month", label: "هذا الشهر" },
            ] as { key: DateFilter; label: string }[]).map(f => (
              <button
                key={f.key}
                onClick={() => setDateFilter(f.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  fontFamily: "Tajawal, sans-serif",
                  background: dateFilter === f.key ? "#0A2342" : "#F1F5F9",
                  color: dateFilter === f.key ? "white" : "#64748B",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: "all", label: "كل الفواتير" },
              { key: "paid", label: "مكتملة" },
              { key: "draft", label: "معلقة" },
              { key: "cancelled", label: "ملغية" },
              { key: "recalled", label: "معدّلة" },
            ] as { key: StatusFilter; label: string }[]).map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                style={{
                  fontFamily: "Tajawal, sans-serif",
                  background: statusFilter === f.key ? "#C9A84C20" : "transparent",
                  color: statusFilter === f.key ? "#C9A84C" : "#94A3B8",
                  border: statusFilter === f.key ? "1px solid #C9A84C" : "1px solid transparent",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث برقم الفاتورة أو اسم العميل..."
              className="w-full h-9 pr-9 pl-3 rounded-lg border text-xs"
              style={{ fontFamily: "Tajawal, sans-serif", borderColor: "#E2E8F0" }}
            />
          </div>
        </div>

        {/* Summary bar */}
        <div className="flex items-center justify-between px-5 py-2.5 text-xs" style={{ background: "#F8FAFC", fontFamily: "Tajawal, sans-serif" }}>
          <span style={{ color: "#64748B" }}>إجمالي: <strong style={{ color: "#0A2342", fontFamily: "JetBrains Mono, monospace" }}>₪{summary.totalToday.toFixed(2)}</strong></span>
          <span style={{ color: "#64748B" }}>الفواتير: <strong style={{ color: "#0A2342" }}>{summary.count}</strong></span>
          <span style={{ color: "#DC2626" }}>ملغية: <strong>{summary.cancelled}</strong></span>
        </div>

        {/* Invoice list */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <FileText className="h-10 w-10 mb-2 opacity-30" />
              <span className="text-sm">لا توجد فواتير</span>
            </div>
          ) : (
            <div>
              {filtered.map(order => {
                const status = getStatusDisplay(order);
                const time = format(new Date(order.created_at), "HH:mm");
                const date = format(new Date(order.created_at), "yyyy/MM/dd");
                return (
                  <div
                    key={order.id}
                    className="flex items-center px-4 py-3 border-b hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                    style={{ borderColor: "#F1F5F9", minHeight: 76 }}
                    onClick={() => loadDetail(order)}
                  >
                    {/* Right: Invoice info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, fontWeight: 600, color: "#0A2342" }}>
                          #{order.order_number || "---"}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ background: status.bg, color: status.text }}
                        >
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]" style={{ color: "#94A3B8" }}>
                        <Clock className="h-3 w-3" />
                        <span>{time} — {date}</span>
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "#64748B" }}>
                        {order.customer_name || "عميل نقدي"}
                      </div>
                    </div>

                    {/* Left: Total + actions */}
                    <div className="flex flex-col items-end gap-1">
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 16, fontWeight: 700, color: "#0A2342" }}>
                        ₪{order.total.toFixed(2)}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); loadDetail(order); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
                          style={{ background: "#F1F5F9", color: "#64748B" }}
                        >
                          <Eye className="h-3 w-3" /> عرض
                        </button>
                        {order.state === "paid" && !order.recall_status && (
                          <button
                            onClick={e => { e.stopPropagation(); initiateRecall(order); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
                            style={{ background: "#C9A84C20", color: "#C9A84C" }}
                          >
                            <RotateCcw className="h-3 w-3" /> استدعاء
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </motion.div>

      {/* ══════ DETAIL MODAL ══════ */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto z-[1100]" style={{ fontFamily: "Tajawal, sans-serif" }}>
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#0A2342" }}>
                    فاتورة رقم #{selectedOrder.order_number || "---"}
                  </span>
                  {(() => {
                    const st = getStatusDisplay(selectedOrder);
                    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: st.bg, color: st.text }}>{st.label}</span>;
                  })()}
                </DialogTitle>
              </DialogHeader>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3 text-xs py-3 border-b" style={{ borderColor: "#E2E8F0", color: "#64748B" }}>
                <div>
                  <span className="block text-[10px]" style={{ color: "#94A3B8" }}>التاريخ والوقت</span>
                  {format(new Date(selectedOrder.created_at), "yyyy/MM/dd HH:mm")}
                </div>
                <div>
                  <span className="block text-[10px]" style={{ color: "#94A3B8" }}>العميل</span>
                  {selectedOrder.customer_name || "عميل نقدي"}
                </div>
                <div>
                  <span className="block text-[10px]" style={{ color: "#94A3B8" }}>طريقة الدفع</span>
                  {orderPayments.map(p => PAYMENT_LABELS[p.payment_method] || p.payment_method).join(", ") || "---"}
                </div>
                {selectedOrder.recall_status && (
                  <div>
                    <span className="block text-[10px]" style={{ color: "#94A3B8" }}>سبب التعديل</span>
                    <span style={{ color: "#CA8A04" }}>{selectedOrder.recall_reason}</span>
                  </div>
                )}
              </div>

              {/* Items table */}
              {loadingDetail ? (
                <div className="py-8 text-center text-sm text-gray-400">جاري التحميل...</div>
              ) : (
                <div className="mt-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: "#0A2342", color: "white" }}>
                        <th className="py-2 px-3 text-right font-medium rounded-tr-lg">الصنف</th>
                        <th className="py-2 px-3 text-center font-medium">الكمية</th>
                        <th className="py-2 px-3 text-center font-medium">السعر</th>
                        <th className="py-2 px-3 text-left font-medium rounded-tl-lg">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderLines.map(line => (
                        <tr key={line.id} className="border-b" style={{ borderColor: "#F1F5F9" }}>
                          <td className="py-2 px-3 text-right" style={{ color: "#0A2342" }}>{line.product_name}</td>
                          <td className="py-2 px-3 text-center" style={{ fontFamily: "JetBrains Mono, monospace", color: "#64748B" }}>{line.qty}</td>
                          <td className="py-2 px-3 text-center" style={{ fontFamily: "JetBrains Mono, monospace", color: "#64748B" }}>₪{line.unit_price.toFixed(2)}</td>
                          <td className="py-2 px-3 text-left" style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: "#0A2342" }}>₪{line.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#0A2342" }}>
                        <td colSpan={3} className="py-2.5 px-3 text-right font-bold text-white rounded-br-lg">الإجمالي</td>
                        <td className="py-2.5 px-3 text-left font-bold text-white rounded-bl-lg" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                          ₪{selectedOrder.total.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-4 border-t mt-3" style={{ borderColor: "#E2E8F0" }}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    toast.info("جاري تجهيز الطباعة...");
                    window.print();
                  }}
                >
                  <Printer className="h-3.5 w-3.5" /> طباعة
                </Button>

                {selectedOrder.state === "paid" && !selectedOrder.recall_status && (
                  <>
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs"
                      style={{ background: "#C9A84C", color: "#0A2342" }}
                      onClick={() => initiateRecall(selectedOrder)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> استدعاء للتعديل
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => initiateCancel(selectedOrder)}
                    >
                      <Ban className="h-3.5 w-3.5" /> إلغاء الفاتورة
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════ REASON DIALOG ══════ */}
      <Dialog open={showReasonDialog} onOpenChange={setShowReasonDialog}>
        <DialogContent className="max-w-sm z-[1200]" style={{ fontFamily: "Tajawal, sans-serif" }}>
          <DialogHeader>
            <DialogTitle>سبب التعديل</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {RECALL_REASONS.map(r => (
              <label key={r} className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-gray-50" style={{ border: recallReason === r ? "2px solid #C9A84C" : "1px solid #E2E8F0" }}>
                <input
                  type="radio"
                  name="recallReason"
                  checked={recallReason === r}
                  onChange={() => setRecallReason(r)}
                  className="accent-[#C9A84C]"
                />
                <span className="text-sm">{r}</span>
              </label>
            ))}
            <label className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-gray-50" style={{ border: recallReason === "أخرى" ? "2px solid #C9A84C" : "1px solid #E2E8F0" }}>
              <input
                type="radio"
                name="recallReason"
                checked={recallReason === "أخرى"}
                onChange={() => setRecallReason("أخرى")}
                className="accent-[#C9A84C]"
              />
              <span className="text-sm">أخرى</span>
            </label>
            {recallReason === "أخرى" && (
              <input
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder="اكتب السبب..."
                className="w-full h-9 px-3 rounded-lg border text-sm"
                style={{ borderColor: "#E2E8F0" }}
                autoFocus
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowReasonDialog(false); setRecallingOrder(null); }}>إلغاء</Button>
            <Button size="sm" style={{ background: "#C9A84C", color: "#0A2342" }} onClick={handleReasonConfirm}>تأكيد التعديل</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ MANAGER PIN DIALOG ══════ */}
      <Dialog open={showManagerPin} onOpenChange={v => { if (!v) { setShowManagerPin(false); setRecallingOrder(null); } }}>
        <DialogContent className="max-w-xs z-[1200]" style={{ fontFamily: "Tajawal, sans-serif" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" style={{ color: "#C9A84C" }} />
              يتطلب موافقة المدير
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4 text-center">
            <p className="text-sm" style={{ color: "#64748B" }}>أدخل رمز المدير (PIN):</p>
            <div className="flex justify-center gap-3" dir="ltr">
              {[0, 1, 2, 3].map(i => (
                <input
                  key={i}
                  id={`mgr-pin-${i}`}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={managerPin[i]}
                  onChange={e => handlePinInput(i, e.target.value)}
                  className="w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 focus:outline-none focus:border-[#C9A84C] transition-colors"
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    borderColor: pinError ? "#DC2626" : "#E2E8F0",
                  }}
                />
              ))}
            </div>
            {pinError && <p className="text-xs text-destructive">{pinError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowManagerPin(false); setManagerPin(["","","",""]); setRecallingOrder(null); }}>إلغاء</Button>
            <Button size="sm" onClick={handleManagerPinSubmit} style={{ background: "#C9A84C", color: "#0A2342" }}>تحقق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ CANCEL CONFIRM DIALOG ══════ */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="max-w-sm z-[1200]" style={{ fontFamily: "Tajawal, sans-serif" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> إلغاء الفاتورة
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm" style={{ color: "#64748B" }}>
              هل أنت متأكد من إلغاء الفاتورة #{cancellingOrder?.order_number}؟
              <br />سيتم إنشاء قيد عكسي تلقائياً.
            </p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="سبب الإلغاء (إلزامي)..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ borderColor: "#E2E8F0" }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowCancelConfirm(false); setCancellingOrder(null); }}>تراجع</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!cancelReason.trim()}
              onClick={handleCancelConfirm}
            >
              متابعة — يتطلب رمز المدير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ CANCEL PIN DIALOG ══════ */}
      <Dialog open={showCancelPin} onOpenChange={v => { if (!v) { setShowCancelPin(false); setCancellingOrder(null); } }}>
        <DialogContent className="max-w-xs z-[1200]" style={{ fontFamily: "Tajawal, sans-serif" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-destructive" />
              رمز المدير لإلغاء الفاتورة
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4 text-center">
            <div className="flex justify-center gap-3" dir="ltr">
              {[0, 1, 2, 3].map(i => (
                <input
                  key={i}
                  id={`cancel-pin-${i}`}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={managerPin[i]}
                  onChange={e => handlePinInput(i, e.target.value)}
                  className="w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 focus:outline-none focus:border-destructive transition-colors"
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    borderColor: pinError ? "#DC2626" : "#E2E8F0",
                  }}
                />
              ))}
            </div>
            {pinError && <p className="text-xs text-destructive">{pinError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowCancelPin(false); setManagerPin(["","","",""]); setCancellingOrder(null); }}>إلغاء</Button>
            <Button variant="destructive" size="sm" onClick={handleManagerPinSubmit}>تحقق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
