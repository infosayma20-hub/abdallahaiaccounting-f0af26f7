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
import ManagerOverrideDialog from "./ManagerOverrideDialog";

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
  canEditInvoices?: boolean;
  requireManagerForInvoices?: boolean;
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
  open, onClose, dataOwnerId, sessionId, cashierName, terminalName, canEditInvoices = true, requireManagerForInvoices = true, onRecallToCart,
}: InvoiceHistoryDrawerProps) {
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
  const [showManagerOverride, setShowManagerOverride] = useState(false);
  const [managerOverrideVariant, setManagerOverrideVariant] = useState<"default" | "destructive">("default");
  const [managerOverrideTitle, setManagerOverrideTitle] = useState("");
  const [managerOverrideDesc, setManagerOverrideDesc] = useState("");
  const [recallReason, setRecallReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [recallingOrder, setRecallingOrder] = useState<InvoiceOrder | null>(null);
  const [pendingManagerAction, setPendingManagerAction] = useState<"recall" | "cancel" | null>(null);

  // Cancel flow
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancellingOrder, setCancellingOrder] = useState<InvoiceOrder | null>(null);

  // ── Fetch orders ──
  const fetchOrders = useCallback(async () => {
    if (!dataOwnerId || !open) return;
    setLoading(true);
    try {
      let query = supabase
        .from("pos_orders")
        .select("id, order_number, created_at, total, subtotal, discount_amount, tax_amount, state, customer_name, customer_id, session_id, is_return, recall_status, recall_reason, recalled_by, recalled_approved_by, recalled_at, cancelled_at, cancel_reason, paid_at")
        .eq("user_id", dataOwnerId);

      if (sessionId) {
        query = query.eq("session_id", sessionId);
      } else {
        setOrders([]);
        setLoading(false);
        return;
      }

      query = query.order("created_at", { ascending: false }).limit(200) as any;

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
  }, [dataOwnerId, open, sessionId, statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase();
    return orders.filter(o =>
      (o.order_number || "").toLowerCase().includes(q) ||
      (o.customer_name || "").toLowerCase().includes(q)
    );
  }, [orders, searchQuery]);

  const summary = useMemo(() => {
    const paid = orders.filter(o => o.state === "paid" && !o.is_return);
    return {
      totalToday: paid.reduce((s, o) => s + o.total, 0),
      count: paid.length,
      cancelled: orders.filter(o => o.state === "cancelled").length,
    };
  }, [orders]);

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

  // ── Recall: require manager based on permission ──
  const initiateRecall = (order: InvoiceOrder) => {
    if (!canEditInvoices) {
      toast.error("ليس لديك صلاحية تعديل الفواتير");
      return;
    }
    if (order.state !== "paid") {
      toast.error("لا يمكن استدعاء فاتورة غير مكتملة");
      return;
    }
    setRecallingOrder(order);
    if (requireManagerForInvoices) {
      setPendingManagerAction("recall");
      setManagerOverrideVariant("default");
      setManagerOverrideTitle("موافقة المدير — استدعاء فاتورة");
      setManagerOverrideDesc(`استدعاء الفاتورة #${order.order_number || "---"} بقيمة ₪${order.total.toFixed(2)} للتعديل`);
      setShowManagerOverride(true);
    } else {
      // No manager approval needed, go straight to reason dialog
      setRecallReason("");
      setCustomReason("");
      setPendingApprovedBy(null);
      setShowReasonDialog(true);
    }
  };

  const handleManagerApprovedForRecall = (managerName: string) => {
    setShowManagerOverride(false);
    // After manager approval, show reason dialog
    setRecallReason("");
    setCustomReason("");
    // Store manager name for later use
    setPendingManagerAction(null);
    // Show reason dialog with managerName stored
    setShowReasonDialog(true);
    // We'll pass managerName through a state
    setPendingApprovedBy(managerName);
  };

  const [pendingApprovedBy, setPendingApprovedBy] = useState<string | null>(null);

  const handleReasonConfirm = () => {
    const reason = recallReason === "أخرى" ? customReason : recallReason;
    if (!reason) { toast.error("اختر سبب التعديل"); return; }
    executeRecall(recallingOrder!, reason, pendingApprovedBy);
  };

  const executeRecall = async (order: InvoiceOrder, reason: string, approvedBy: string | null) => {
    try {
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

      setShowReasonDialog(false);
      setRecallingOrder(null);
      setRecallReason("");
      setCustomReason("");
      setPendingApprovedBy(null);
      setSelectedOrder(null);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء استدعاء الفاتورة");
    }
  };

  // ── Cancel: always require manager ──
  const initiateCancel = (order: InvoiceOrder) => {
    if (order.state !== "paid") {
      toast.error("لا يمكن إلغاء فاتورة غير مكتملة");
      return;
    }
    setCancellingOrder(order);
    setShowCancelConfirm(true);
  };

  const handleCancelConfirm = () => {
    if (!cancelReason.trim()) { toast.error("أدخل سبب الإلغاء"); return; }
    setShowCancelConfirm(false);
    setPendingManagerAction("cancel");
    setManagerOverrideVariant("destructive");
    setManagerOverrideTitle("موافقة المدير — إلغاء فاتورة");
    setManagerOverrideDesc(`إلغاء الفاتورة #${cancellingOrder?.order_number || "---"} بقيمة ₪${cancellingOrder?.total.toFixed(2)} — السبب: ${cancelReason}`);
    setShowManagerOverride(true);
  };

  const handleManagerApprovedForCancel = async (managerName: string) => {
    setShowManagerOverride(false);
    if (!cancellingOrder) return;
    await executeCancel(cancellingOrder, cancelReason, managerName);
  };

  const executeCancel = async (order: InvoiceOrder, reason: string, approvedBy: string) => {
    try {
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
      setPendingManagerAction(null);
      fetchOrders();
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء إلغاء الفاتورة");
    }
  };

  // Manager approval handler
  const handleManagerApproved = (managerName: string) => {
    if (pendingManagerAction === "recall") {
      handleManagerApprovedForRecall(managerName);
    } else if (pendingManagerAction === "cancel") {
      handleManagerApprovedForCancel(managerName);
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

        {/* Filters */}
        <div className="px-5 py-3 border-b space-y-2.5" style={{ borderColor: "#E2E8F0" }}>
          <div className="flex items-center gap-2 text-xs font-medium" style={{ fontFamily: "Tajawal, sans-serif", color: "#64748B" }}>
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>فواتير الوردية الحالية</span>
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
                      <Lock className="h-3 w-3" />
                      <RotateCcw className="h-3.5 w-3.5" /> استدعاء للتعديل
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => initiateCancel(selectedOrder)}
                    >
                      <Lock className="h-3 w-3" />
                      <Ban className="h-3.5 w-3.5" /> إلغاء الفاتورة
                    </Button>
                  </>
                )}
              </div>

              {/* Manager approval note */}
              {selectedOrder.state === "paid" && !selectedOrder.recall_status && (
                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  التعديل والإلغاء يتطلب موافقة المدير
                </p>
              )}
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
            <Button variant="outline" size="sm" onClick={() => { setShowReasonDialog(false); setRecallingOrder(null); setPendingApprovedBy(null); }}>إلغاء</Button>
            <Button size="sm" style={{ background: "#C9A84C", color: "#0A2342" }} onClick={handleReasonConfirm}>تأكيد التعديل</Button>
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
              متابعة — يتطلب موافقة المدير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ MANAGER OVERRIDE DIALOG ══════ */}
      <ManagerOverrideDialog
        open={showManagerOverride}
        onClose={() => {
          setShowManagerOverride(false);
          setPendingManagerAction(null);
          setRecallingOrder(null);
          setCancellingOrder(null);
        }}
        onApproved={handleManagerApproved}
        title={managerOverrideTitle}
        description={managerOverrideDesc}
        variant={managerOverrideVariant}
      />
    </>
  );
}
