import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Search, Printer, RotateCcw, Ban, Clock, User, Eye,
  ChevronLeft, AlertTriangle, Lock, FileText, ShoppingCart, ArrowRightLeft, Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format, startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from "date-fns";
import ManagerOverrideDialog from "./ManagerOverrideDialog";
import ReturnDialog from "./ReturnDialog";
import { multiWordMatchAny } from "@/lib/utils";
import { assertPermission } from "@/lib/permissions/assertPermission";
import { sendToBridge } from "@/lib/print-bridge-client";
import type { PrintOrder, PrintItem } from "@/hooks/usePrintBridge";
import { printReceiptImage } from "@/lib/image-print-service";
import { getServerNow, initServerClock, isClockSkewed, getClockSkewMs } from "@/lib/pos/server-clock";

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
  contacts?: { phone: string | null } | null;
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
  transferred_from_session_id: string | null;
  transferred_to_name: string | null;
  pos_payments?: { payment_method: string }[];
  order_type?: string | null;
  is_delivery?: boolean | null;
  delivery_address?: string | null;
  customer_address?: string | null;
  area_name?: string | null;
  zone_code?: string | null;
  delivery_fee?: number | null;
  order_note?: string | null;
  notes?: string | null;
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
  notes?: string | null;
}

interface InvoicePayment {
  id: string;
  order_id: string;
  payment_method: string;
  amount: number;
  currency: string | null;
}

type StatusFilter = "all" | "paid" | "draft" | "cancelled" | "recalled" | "transferred";

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
  canCancelInvoices?: boolean;
  requireManagerForInvoices?: boolean;
  requireManagerForRecall?: boolean;
  requireManagerForCancel?: boolean;
  requireManagerForReturn?: boolean;
  /**
   * Cashier-restricted mode: hides payment-method badges, payment-method row
   * in detail modal, and the "cancelled" status filter + cancelled rows in list.
   * Does NOT change recall/cancel/return entitlements (those are controlled by
   * canEditInvoices/canCancelInvoices/requireManagerFor*).
   */
  cashierMode?: boolean;
  /**
   * Grace window (minutes) where a CASHIER can cancel their own freshly-printed
   * invoice WITHOUT manager approval. Outside this window, the normal
   * requireManagerForCancel rule applies. Only meaningful when cashierMode=true.
   * Default: 30 minutes.
   */
  cancelWindowMinutes?: number;
  /**
   * In cashierMode, the invoice total is shown only for this many minutes after
   * the invoice was created. After that the amount is masked ("—") in the
   * cashier's history list. Default: 60 minutes.
   */
  amountVisibleMinutes?: number;
  /**
   * Fires after a successful invoice cancellation so the parent (POS page)
   * can remember the cancelled invoice and offer a "Replacement invoice"
   * checkbox on the very next sale.
   */
  onInvoiceCancelled?: (orderId: string, orderNumber: string | null) => void;
  allowOrderTransfer?: boolean;
  printInvoices?: boolean;
  resendInvoice?: boolean;
  onRecallToCart: (items: CartItem[], invoiceId: string, orderNumber: string, reason: string, approvedBy: string | null) => void;
  onLoadDraftToCart?: (items: CartItem[], orderId: string) => void;
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
  transferred: { label: "منقولة", bg: "#F3E8FF", text: "#7C3AED" },
};

const RECALL_REASONS = [
  "خطأ في الكمية",
  "خطأ في السعر",
  "إضافة صنف",
  "حذف صنف",
  "تعديل الزبون",
];

export default function InvoiceHistoryDrawer({
  open, onClose, dataOwnerId, sessionId, cashierName, terminalName, canEditInvoices = true, canCancelInvoices = true, requireManagerForInvoices = true, requireManagerForRecall, requireManagerForCancel, requireManagerForReturn = false, cashierMode = false, cancelWindowMinutes = 30, amountVisibleMinutes = 60, onInvoiceCancelled, allowOrderTransfer = false, printInvoices = true, resendInvoice = true, onRecallToCart, onLoadDraftToCart,
}: InvoiceHistoryDrawerProps) {
  // Use specific flags if provided, otherwise fall back to general flag
  const needsManagerForRecall = requireManagerForRecall ?? requireManagerForInvoices;
  const needsManagerForCancel = requireManagerForCancel ?? requireManagerForInvoices;

  // ── Cashier grace windows ──
  // Re-evaluated each render so the grace window naturally expires as time passes
  // (the drawer is mounted live and re-renders on user interactions).
  const isWithinCancelGrace = (order: InvoiceOrder) => {
    if (!order.created_at) return false;
    const ageMin = (getServerNow() - new Date(order.created_at).getTime()) / 60000;
    return ageMin <= cancelWindowMinutes;
  };
  const canCashierSeeAmount = (order: InvoiceOrder) => {
    if (!cashierMode) return true;
    if (!order.created_at) return false;
    const ageMin = (getServerNow() - new Date(order.created_at).getTime()) / 60000;
    return ageMin <= amountVisibleMinutes;
  };
  // نفس مدة السماح للأمبر تُستخدم لإخفاء التفاصيل الحساسة عن الكاشير بعد ساعة
  const canSeeDetails = (order: InvoiceOrder) => canCashierSeeAmount(order);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [clockSkewMin, setClockSkewMin] = useState<number>(0);

  // Auto-focus search input when drawer opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 150);
      // Re-sync server clock each time the drawer opens so grace-window
      // calculations stay correct even if the device clock is wrong.
      void initServerClock().then(() => {
        if (isClockSkewed()) {
          setClockSkewMin(Math.round(getClockSkewMs() / 60000));
        } else {
          setClockSkewMin(0);
        }
      });
    }
  }, [open]);

  // Load cancel reasons from DB
  useEffect(() => {
    if (!open || !dataOwnerId) return;
    (async () => {
      const { data } = await (supabase
        .from("pos_cancel_reasons" as any)
        .select("id, reason_text") as any)
        .eq("user_id", dataOwnerId)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (Array.isArray(data)) setCancelReasons(data as any);
    })();
  }, [open, dataOwnerId]);
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
  const [pendingManagerAction, setPendingManagerAction] = useState<"recall" | "cancel" | "return" | null>(null);
  const [returnApprovedBy, setReturnApprovedBy] = useState<string | null>(null);

  // Cancel flow
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [cancelReasons, setCancelReasons] = useState<{ id: string; reason_text: string }[]>([]);
  const [cancellingOrder, setCancellingOrder] = useState<InvoiceOrder | null>(null);

  // Return flow
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returningOrder, setReturningOrder] = useState<InvoiceOrder | null>(null);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({ USD: 3.6, JOD: 5.0, ILS: 1 });
  const [orderCurrency, setOrderCurrency] = useState<string>("ILS");

  // Transfer flow
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferringOrder, setTransferringOrder] = useState<InvoiceOrder | null>(null);
  const [posUsers, setPosUsers] = useState<{ id: string; name: string; auth_user_id: string | null }[]>([]);
  const [selectedTransferUser, setSelectedTransferUser] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  // Fetch only POS users/sessions who have an active open session
  useEffect(() => {
    if (!allowOrderTransfer || !dataOwnerId || !open) return;
    (async () => {
      // Get all open sessions (exclude current session)
      const { data: openSessions } = await (supabase
        .from("pos_sessions")
        .select("id, cashier_auth_user_id, cashier_name") as any)
        .eq("user_id", dataOwnerId)
        .eq("state", "open")
        .neq("id", sessionId || "");

      if (!openSessions || openSessions.length === 0) {
        setPosUsers([]);
        return;
      }

      // Try to match with pos_users for those with auth_user_id
      const activeAuthIds = openSessions
        .map((s: any) => s.cashier_auth_user_id)
        .filter(Boolean);

      let matchedUsers: { id: string; name: string; auth_user_id: string | null }[] = [];

      if (activeAuthIds.length > 0) {
        const { data: users } = await supabase
          .from("pos_users")
          .select("id, name, auth_user_id")
          .eq("user_id", dataOwnerId)
          .eq("is_active", true)
          .in("auth_user_id", activeAuthIds);
        matchedUsers = users || [];
      }

      // For sessions without matching pos_users, create entries from session data
      const matchedAuthIds = new Set(matchedUsers.map(u => u.auth_user_id));
      const unmatchedSessions = openSessions.filter(
        (s: any) => !s.cashier_auth_user_id || !matchedAuthIds.has(s.cashier_auth_user_id)
      );

      const sessionEntries = unmatchedSessions.map((s: any) => ({
        id: s.id,
        name: s.cashier_name || "موظف",
        auth_user_id: s.cashier_auth_user_id || null,
      }));

      // Deduplicate by auth_user_id where possible
      const seen = new Set<string>();
      const combined = [...matchedUsers, ...sessionEntries].filter(u => {
        const key = u.auth_user_id || u.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setPosUsers(combined);
    })();
  }, [allowOrderTransfer, dataOwnerId, open, sessionId]);

  const handleTransferOrder = async () => {
    if (!transferringOrder || !selectedTransferUser || transferring) return;
    setTransferring(true);
    try {
      const targetUser = posUsers.find(u => u.id === selectedTransferUser);
      if (!targetUser) throw new Error("المستخدم غير موجود");

      let targetSessionId: string | null = null;

      if (targetUser.auth_user_id) {
        // Find target user's active session by auth_user_id
        const { data: sessions } = await (supabase
          .from("pos_sessions")
          .select("id") as any)
          .eq("cashier_auth_user_id", targetUser.auth_user_id)
          .eq("state", "open");
        targetSessionId = sessions?.[0]?.id || null;
      } else {
        // The id is already a session id (from session-based entry)
        targetSessionId = targetUser.id;
      }

      if (!targetSessionId) {
        toast.error("لا توجد وردية مفتوحة لهذا الموظف");
        return;
      }

      // If the order is already paid, create a GL transfer entry between cash boxes
      if (transferringOrder.state === "paid") {
        // Get source session's cash_box GL code
        const { data: srcSession } = await (supabase
          .from("pos_sessions")
          .select("cash_box_id, terminal_id") as any)
          .eq("id", sessionId)
          .maybeSingle();
        
        // Get target session's cash_box GL code
        const { data: tgtSession } = await (supabase
          .from("pos_sessions")
          .select("cash_box_id, terminal_id") as any)
          .eq("id", targetSessionId)
          .maybeSingle();

        let srcGLCode = "1110";
        let tgtGLCode = "1110";

        if (srcSession?.cash_box_id) {
          const { data: srcBox } = await supabase.from("cash_boxes").select("gl_account_code").eq("id", srcSession.cash_box_id).maybeSingle();
          if (srcBox?.gl_account_code) srcGLCode = srcBox.gl_account_code;
        } else if (srcSession?.terminal_id) {
          const { data: srcTerm } = await (supabase.from("pos_terminals").select("cash_account_code") as any).eq("id", srcSession.terminal_id).maybeSingle();
          if (srcTerm?.cash_account_code) srcGLCode = srcTerm.cash_account_code;
        }

        if (tgtSession?.cash_box_id) {
          const { data: tgtBox } = await supabase.from("cash_boxes").select("gl_account_code").eq("id", tgtSession.cash_box_id).maybeSingle();
          if (tgtBox?.gl_account_code) tgtGLCode = tgtBox.gl_account_code;
        } else if (tgtSession?.terminal_id) {
          const { data: tgtTerm } = await (supabase.from("pos_terminals").select("cash_account_code") as any).eq("id", tgtSession.terminal_id).maybeSingle();
          if (tgtTerm?.cash_account_code) tgtGLCode = tgtTerm.cash_account_code;
        }

        // Fetch payment info to carry currency data in the transfer entry
        const { data: paymentData } = await supabase
          .from("pos_payments")
          .select("currency, exchange_rate, amount")
          .eq("order_id", transferringOrder.id)
          .limit(1)
          .maybeSingle();

        const payCurrency = paymentData?.currency || "ILS";
        const payRate = paymentData?.exchange_rate || 1;
        const isForeign = payCurrency !== "ILS";
        const currencyLabel = ({ USD: "دولار", JOD: "دينار", EUR: "يورو", EGP: "جنيه", ILS: "شيكل" } as Record<string, string>)[payCurrency] || "شيكل";

        // Only create transfer entry if GL codes differ
        if (srcGLCode !== tgtGLCode) {
          await supabase.from("transactions").insert({
            user_id: dataOwnerId,
            transaction_date: new Date().toISOString().split("T")[0],
            description: `نقل فاتورة POS #${transferringOrder.order_number || ""} إلى ${targetUser.name}`,
            debit_account_code: tgtGLCode,
            credit_account_code: srcGLCode,
            amount: transferringOrder.total,
            currency: currencyLabel,
            transaction_type: "pos_transfer",
            reference: transferringOrder.order_number || "",
            idempotency_key: `POS-TRANSFER-${transferringOrder.id}`,
            foreign_amount: isForeign ? (paymentData?.amount || null) : null,
            exchange_rate: isForeign ? payRate : null,
          });
        }

      }

      const { error } = await supabase
        .from("pos_orders")
        .update({
          session_id: targetSessionId,
          transferred_from_session_id: sessionId,
          transferred_to_name: targetUser.name,
        } as any)
        .eq("id", transferringOrder.id);

      if (error) throw error;
      toast.success(`تم نقل الفاتورة #${transferringOrder.order_number} إلى ${targetUser.name}`);
      setShowTransferDialog(false);
      setTransferringOrder(null);
      setSelectedTransferUser(null);
      setSelectedOrder(null);
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || "فشل في نقل الفاتورة");
    } finally {
      setTransferring(false);
    }
  };

  // ── Fetch orders ──
  const fetchOrders = useCallback(async () => {
    if (!dataOwnerId || !open) return;
    setLoading(true);
    try {
      const selectFields = "id, order_number, created_at, total, subtotal, discount_amount, tax_amount, state, customer_name, customer_id, session_id, is_return, recall_status, recall_reason, recalled_by, recalled_approved_by, recalled_at, cancelled_at, cancel_reason, paid_at, transferred_from_session_id, transferred_to_name, order_type, is_delivery, delivery_address, customer_address, area_name, zone_code, delivery_fee, order_note, notes, pos_payments(payment_method), contacts:customer_id(phone)";

      // Main query: orders belonging to this session
      let query = supabase
        .from("pos_orders")
        .select(selectFields)
        .eq("user_id", dataOwnerId);

      if (sessionId) {
        query = query.eq("session_id", sessionId);
      }

      query = query.order("created_at", { ascending: false }).limit(200) as any;

      if (statusFilter !== "all" && statusFilter !== "transferred") {
        if (statusFilter === "recalled") {
          query = query.not("recall_status", "is", null);
        } else {
          query = query.eq("state", statusFilter);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      let allOrders = (data || []) as InvoiceOrder[];

      // Also fetch transferred-out orders (orders that were in this session but moved)
      if (sessionId) {
        let transferQuery = supabase
          .from("pos_orders")
          .select(selectFields)
          .eq("user_id", dataOwnerId)
          .eq("transferred_from_session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(50);

        const { data: transferredData } = await transferQuery;
        if (transferredData && transferredData.length > 0) {
          // Avoid duplicates
          const existingIds = new Set(allOrders.map(o => o.id));
          const newTransferred = (transferredData as InvoiceOrder[]).filter(o => !existingIds.has(o.id));
          allOrders = [...allOrders, ...newTransferred].sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        }
      }

      // If filtering by "transferred" status, only show transferred-out orders
      if (statusFilter === "transferred") {
        allOrders = allOrders.filter(o => o.transferred_from_session_id === sessionId && o.session_id !== sessionId);
      }

      setOrders(allOrders);
    } catch (err) {
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  }, [dataOwnerId, open, sessionId, statusFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filtered = useMemo(() => {
    let list = orders;
    if (cashierMode) {
      list = list.filter(o => o.state !== "cancelled");
    }
    if (!searchQuery.trim()) return list;
    return list.filter(o => multiWordMatchAny(searchQuery, o.order_number, o.customer_name));
  }, [orders, searchQuery, cashierMode]);

  const isTransferredOut = (order: InvoiceOrder) => 
    order.transferred_from_session_id === sessionId && order.session_id !== sessionId;

  const summary = useMemo(() => {
    // Exclude transferred-out orders from summary
    const sessionOrders = orders.filter(o => !isTransferredOut(o));
    const paid = sessionOrders.filter(o => o.state === "paid" && !o.is_return);
    return {
      totalToday: paid.reduce((s, o) => s + o.total, 0),
      count: paid.length,
      cancelled: sessionOrders.filter(o => o.state === "cancelled").length,
    };
  }, [orders, sessionId]);

  const loadDetail = async (order: InvoiceOrder) => {
    setSelectedOrder(order);
    setLoadingDetail(true);
    try {
      const [linesRes, paymentsRes] = await Promise.all([
        supabase.from("pos_order_lines").select("id, order_id, product_id, product_name, qty, unit_price, cost_price, subtotal, total, discount_amount, notes").eq("order_id", order.id),
        supabase.from("pos_payments").select("id, order_id, payment_method, amount, currency").eq("order_id", order.id),
      ]);
      setOrderLines((linesRes.data || []) as InvoiceLine[]);
      setOrderPayments((paymentsRes.data || []) as InvoicePayment[]);
      setOrderCurrency((paymentsRes.data?.[0] as any)?.currency || "ILS");
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Open return dialog
  const initiateReturn = async (order: InvoiceOrder) => {
    if (order.state !== "paid") {
      toast.error("لا يمكن ارتجاع فاتورة غير مكتملة");
      return;
    }
    if (order.is_return) {
      toast.error("لا يمكن ارتجاع فاتورة مرتجع");
      return;
    }
    if (!sessionId) {
      toast.error("لا توجد وردية مفتوحة");
      return;
    }
    try { await assertPermission("pos", "sell", "refund"); } catch { return; }
    setReturningOrder(order);
    if (requireManagerForReturn) {
      setPendingManagerAction("return");
      setManagerOverrideVariant("destructive");
      setManagerOverrideTitle("موافقة المدير — ارتجاع فاتورة");
      setManagerOverrideDesc(`ارتجاع الفاتورة #${order.order_number || "---"} بقيمة ₪${order.total.toFixed(2)} يتطلب موافقة المدير`);
      setShowManagerOverride(true);
    } else {
      setShowReturnDialog(true);
    }
  };

  const handleManagerApprovedForReturn = async (managerName: string) => {
    setShowManagerOverride(false);
    setReturnApprovedBy(managerName);
    setPendingManagerAction(null);
    // Log sensitive action
    try {
      await (supabase.from("pos_sensitive_actions_log" as any) as any).insert({
        company_id: dataOwnerId,
        action: "manager_override_return",
        invoice_id: returningOrder?.id || null,
        session_id: sessionId,
        notes: `موافقة مدير لارتجاع فاتورة #${returningOrder?.order_number || ""}`,
        metadata: { manager_name: managerName, cashier_name: cashierName },
      });
    } catch { /* ignore */ }
    setShowReturnDialog(true);
  };

  // Load exchange rates from latest pos_payments to feed return dialog
  useEffect(() => {
    if (!open || !dataOwnerId) return;
    (async () => {
      const { data } = await supabase
        .from("pos_payments")
        .select("currency, exchange_rate")
        .eq("user_id", dataOwnerId)
        .neq("currency", "ILS")
        .order("created_at", { ascending: false })
        .limit(20);
      const rates: Record<string, number> = { ILS: 1 };
      (data || []).forEach((p: any) => {
        if (p.currency && p.exchange_rate && !rates[p.currency]) {
          rates[p.currency] = Number(p.exchange_rate);
        }
      });
      // Fallbacks
      if (!rates.USD) rates.USD = 3.6;
      if (!rates.JOD) rates.JOD = 5.0;
      setExchangeRates(rates);
    })();
  }, [open, dataOwnerId]);

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
    if (needsManagerForRecall) {
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

  // ── Cancel: require manager based on permission ──
  const initiateCancel = (order: InvoiceOrder) => {
    if (!canCancelInvoices) {
      toast.error("ليس لديك صلاحية إلغاء الفواتير");
      return;
    }
    if (order.state !== "paid" && order.recall_status !== "recalled") {
      toast.error("لا يمكن إلغاء فاتورة غير مكتملة");
      return;
    }
    setCancellingOrder(order);
    setShowCancelConfirm(true);
  };

  const handleCancelConfirm = () => {
    if (!cancelReason.trim()) { toast.error("اختر سبب الإلغاء"); return; }
    setShowCancelConfirm(false);
    // Cashier grace window: within N minutes of issuance, allow cancel without
    // manager override. Outside the window → fall back to manager approval.
    const inGrace = cashierMode && cancellingOrder && isWithinCancelGrace(cancellingOrder);
    if (needsManagerForCancel && !inGrace) {
      setPendingManagerAction("cancel");
      setManagerOverrideVariant("destructive");
      setManagerOverrideTitle("موافقة المدير — إلغاء فاتورة");
      setManagerOverrideDesc(`إلغاء الفاتورة #${cancellingOrder?.order_number || "---"} بقيمة ₪${cancellingOrder?.total.toFixed(2)} — السبب: ${cancelReason}`);
      setShowManagerOverride(true);
    } else {
      if (cancellingOrder) {
        const approver = inGrace
          ? `الكاشير (ضمن مهلة ${cancelWindowMinutes} دقيقة)`
          : "بدون موافقة مدير";
        executeCancel(cancellingOrder, cancelReason, approver);
      }
    }
  };

  const handleManagerApprovedForCancel = async (managerName: string) => {
    setShowManagerOverride(false);
    if (!cancellingOrder) return;
    await executeCancel(cancellingOrder, cancelReason, managerName);
  };

  const executeCancel = async (order: InvoiceOrder, reason: string, approvedBy: string) => {
    try {
      const fullReason = cancelNote.trim() ? `${reason} — ${cancelNote.trim()}` : reason;

      // Call RPC: validates session match, creates reverse entry if paid
      const { data: rpcResult, error: rpcErr } = await (supabase.rpc as any)("void_pos_order", {
        p_order_id: order.id,
        p_session_id: sessionId,
        p_reason: fullReason,
        p_cancelled_by_name: cashierName,
        p_user_id: dataOwnerId,
      });

      if (rpcErr) {
        toast.error(rpcErr.message || "فشل إلغاء الفاتورة");
        return;
      }
      if (rpcResult && rpcResult.success === false) {
        toast.error(rpcResult.error || "فشل إلغاء الفاتورة");
        return;
      }

      // Update approved_by separately (RPC uses single name)
      if (approvedBy && approvedBy !== "بدون موافقة مدير") {
        await supabase.from("pos_orders")
          .update({ cancelled_approved_by: approvedBy } as any)
          .eq("id", order.id);
      }

      await supabase.from("pos_audit_log").insert({
        user_id: dataOwnerId,
        order_id: order.id,
        action: "INVOICE_CANCELLED",
        cashier_name: cashierName,
        approved_by: approvedBy,
        reason: fullReason,
        original_total: order.total,
        terminal_name: terminalName,
      } as any);

      // Print KITCHEN CANCEL TICKET (fire-and-forget)
      try {
        const { data: lines } = await (supabase
          .from("pos_order_lines")
          .select("id, product_id, product_name, qty, unit_price")
          .eq("order_id", order.id) as any);

        if (Array.isArray(lines) && lines.length > 0) {
          const printItems: PrintItem[] = lines.map((l: any) => ({
            id: l.id,
            name: l.product_name,
            quantity: Number(l.qty) || 0,
            price: Number(l.unit_price) || 0,
          }));
          const printOrder: PrintOrder = {
            id: order.id,
            orderNumber: order.order_number || order.id.slice(0, 8),
            date: format(new Date(), "yyyy-MM-dd"),
            time: format(new Date(), "HH:mm"),
            branchName: terminalName || "",
            cashier: cashierName,
            items: printItems,
            total: order.total,
            isCancellation: true,
            cancelReason: fullReason,
            cancelledBy: cashierName,
          };
          sendToBridge("kitchen", printOrder).catch(() => {
            console.warn("Kitchen cancel ticket: bridge unavailable");
          });
        }
      } catch (printErr) {
        console.warn("Failed to print kitchen cancel ticket:", printErr);
      }

      const wasReversed = rpcResult?.reverse_transaction_id;
      toast.success(
        `تم إلغاء الفاتورة #${order.order_number || ""}` +
        (wasReversed ? " — تم إنشاء قيد عكسي" : "") +
        " — أُرسلت تذكرة إلغاء للمطبخ"
      );
      // Notify parent so it can offer a "replacement invoice" toggle on the
      // next sale (links the new invoice to this cancelled one).
      try { onInvoiceCancelled?.(order.id, order.order_number); } catch { /* ignore */ }
      setSelectedOrder(null);
      setCancellingOrder(null);
      setCancelReason("");
      setCancelNote("");
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
    } else if (pendingManagerAction === "return") {
      handleManagerApprovedForReturn(managerName);
    }
  };

  const getStatusDisplay = (order: InvoiceOrder) => {
    if (isTransferredOut(order)) return STATUS_CONFIG.transferred;
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
        className="fixed right-0 top-0 h-full z-[1000] flex flex-col pos-readable"
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

        {clockSkewMin !== 0 && (
          <div
            className="px-5 py-2 text-[11px] font-medium flex items-center gap-2"
            style={{
              fontFamily: "Tajawal, sans-serif",
              background: "#FEF3C7",
              color: "#92400E",
              borderBottom: "1px solid #FCD34D",
            }}
          >
            ⚠️ ساعة هذا الجهاز {clockSkewMin > 0 ? "متقدمة" : "متأخرة"} عن الخادم بحوالي {Math.abs(clockSkewMin)} دقيقة — يُرجى ضبط ساعة Windows لضمان عمل مهل الإلغاء/التعديل بشكل صحيح.
          </div>
        )}

        {/* Filters */}
        <div className="px-5 py-3 border-b space-y-2.5" style={{ borderColor: "#E2E8F0" }}>
          <div className="flex items-center gap-2 text-xs font-medium" style={{ fontFamily: "Tajawal, sans-serif", color: "#64748B" }}>
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>{sessionId ? "فواتير الوردية الحالية" : "جميع الفواتير"}</span>
          </div>

          {/* Status filter */}
          <div className="flex flex-wrap gap-1.5">
            {(([
              { key: "all", label: "كل الفواتير" },
              { key: "paid", label: "مكتملة" },
              { key: "draft", label: "معلقة" },
              { key: "cancelled", label: "ملغية" },
              { key: "recalled", label: "معدّلة" },
              { key: "transferred", label: "منقولة" },
            ] as { key: StatusFilter; label: string }[]).filter(f => !(cashierMode && f.key === "cancelled"))).map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                style={{
                  fontFamily: "Tajawal, sans-serif",
                  background: statusFilter === f.key ? "#4A9EE820" : "transparent",
                  color: statusFilter === f.key ? "#4A9EE8" : "#94A3B8",
                  border: statusFilter === f.key ? "1px solid #4A9EE8" : "1px solid transparent",
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
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث برقم الفاتورة أو اسم الزبون..."
              className="w-full h-9 pr-9 pl-3 rounded-lg border text-xs"
              style={{ fontFamily: "Tajawal, sans-serif", borderColor: "#E2E8F0" }}
            />
          </div>
        </div>

        {/* Summary bar */}
        <div className="flex items-center justify-between px-5 py-2.5 text-xs" style={{ background: "#F8FAFC", fontFamily: "Tajawal, sans-serif" }}>
          <span style={{ color: "#64748B" }}>إجمالي: <strong style={{ color: "#0A2342", fontFamily: "JetBrains Mono, monospace" }}>₪{summary.totalToday.toFixed(2)}</strong></span>
          <span style={{ color: "#64748B" }}>الفواتير: <strong style={{ color: "#0A2342" }}>{summary.count}</strong></span>
          {!cashierMode && <span style={{ color: "#DC2626" }}>ملغية: <strong>{summary.cancelled}</strong></span>}
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
                const date = format(new Date(order.created_at), "dd/MM/yyyy");
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
                      <div className="text-[11px] mt-0.5 flex items-center gap-2" style={{ color: "#64748B" }}>
                        {canSeeDetails(order) ? (
                          <>
                            <span>{order.customer_name || "زبون"}</span>
                            {order.contacts?.phone && (
                              <span className="font-mono text-[10px]" dir="ltr">{order.contacts.phone}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px]" style={{ color: "#94A3B8" }}>انتهت مدة عرض التفاصيل</span>
                        )}
                        {!cashierMode && order.pos_payments && order.pos_payments.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: "#F1F5F9", color: "#475569" }}>
                            {order.pos_payments.map(p => PAYMENT_LABELS[p.payment_method] || p.payment_method).filter((v, i, a) => a.indexOf(v) === i).join(" + ")}
                          </span>
                        )}
                      </div>
                      {isTransferredOut(order) && order.transferred_to_name && (
                        <div className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: "#7C3AED" }}>
                          <ArrowRightLeft className="h-3 w-3" />
                          <span>نُقلت إلى: {order.transferred_to_name}</span>
                        </div>
                      )}
                      {Number(order.delivery_fee || 0) > 0 && canCashierSeeAmount(order) && (
                        <div className="mt-1 flex items-center gap-1 flex-wrap text-[10px]" style={{ color: "#64748B" }}>
                          <span style={{ fontFamily: "JetBrains Mono, monospace" }}>أصناف ₪{(Number(order.total) - Number(order.delivery_fee || 0)).toFixed(2)}</span>
                          <span style={{ color: "#CBD5E1" }}>·</span>
                          <span style={{ fontFamily: "JetBrains Mono, monospace" }}>توصيل ₪{Number(order.delivery_fee).toFixed(2)}</span>
                          {(order.area_name || order.delivery_address) && (
                            <>
                              <span style={{ color: "#CBD5E1" }}>·</span>
                              <span className="truncate max-w-[180px]" title={order.delivery_address || order.area_name || ""}>
                                {order.area_name || order.delivery_address}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                      {(order.order_note || order.notes) && canSeeDetails(order) && (
                        <div className="text-[10px] mt-0.5 truncate max-w-full" style={{ color: "#94A3B8" }} title={order.order_note || order.notes || ""}>
                          ملاحظة: {(order.order_note || order.notes || "").split("\n")[0].slice(0, 60)}{((order.order_note || order.notes || "").length > 60 || (order.order_note || order.notes || "").includes("\n")) ? "…" : ""}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {canCashierSeeAmount(order) ? (
                        <div className="flex flex-col items-end">
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 16, fontWeight: 700, color: "#0A2342" }}>
                            ₪{order.total.toFixed(2)}
                          </span>
                          {Number(order.delivery_fee || 0) > 0 && (
                            <span className="text-[9px]" style={{ color: "#94A3B8" }}>يشمل التوصيل</span>
                          )}
                        </div>
                      ) : (
                        <span
                          style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 16, fontWeight: 700, color: "#94A3B8" }}
                          title={`المبلغ متاح للكاشير لأول ${amountVisibleMinutes} دقيقة فقط`}
                        >
                          —
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); loadDetail(order); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
                          style={{ background: "#F1F5F9", color: "#64748B" }}
                        >
                          <Eye className="h-3 w-3" /> عرض
                        </button>
                        {!cashierMode && canEditInvoices && order.state === "paid" && !order.recall_status && !isTransferredOut(order) && (
                          <button
                            onClick={e => { e.stopPropagation(); initiateRecall(order); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
                            style={{ background: "#4A9EE820", color: "#4A9EE8" }}
                          >
                            <RotateCcw className="h-3 w-3" /> استدعاء
                          </button>
                        )}
                        {!cashierMode && canCancelInvoices && order.state === "paid" && !order.is_return && !isTransferredOut(order) && (
                          <button
                            onClick={e => { e.stopPropagation(); initiateReturn(order); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
                            style={{ background: "#FEE2E220", color: "#DC2626" }}
                            title="ارتجاع جزئي أو كلي"
                          >
                            <RotateCcw className="h-3 w-3" /> ارتجاع
                          </button>
                        )}
                        {canCancelInvoices && (order.state === "paid" || order.recall_status === "recalled") && !isTransferredOut(order) && (!cashierMode || isWithinCancelGrace(order)) && (
                          <button
                            onClick={e => { e.stopPropagation(); initiateCancel(order); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
                            style={{ background: "#FEE2E220", color: "#DC2626" }}
                          >
                            <Ban className="h-3 w-3" /> إلغاء
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
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto z-[1100] bg-white" style={{ fontFamily: "Tajawal, sans-serif", color: "#0F172A" }}>
          {selectedOrder && (
            <>
              {(() => {
                const st = getStatusDisplay(selectedOrder);
                const orderTypeLabel = ({ delivery: "توصيل", takeaway: "استلام", takeout: "استلام", dine_in: "طاولة", table: "طاولة" } as Record<string, string>)[selectedOrder.order_type || ""] || (selectedOrder.is_delivery ? "توصيل" : (selectedOrder.order_type || "—"));
                const paymentLabel = orderPayments.map(p => PAYMENT_LABELS[p.payment_method] || p.payment_method).join("، ") || "—";
                const deliveryFee = Number(selectedOrder.delivery_fee || 0);
                const itemsSubtotal = Number(selectedOrder.total) - deliveryFee;
                const showDelivery = canSeeDetails(selectedOrder) && (selectedOrder.is_delivery || selectedOrder.delivery_address || selectedOrder.customer_address || selectedOrder.area_name);
                const showNote = canSeeDetails(selectedOrder) && (selectedOrder.order_note || selectedOrder.notes);
                // Neutral cell wrapper
                const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: "#94A3B8" }}>{label}</div>
                    <div className="text-[12px]" style={{ color: "#0F172A" }}>{children}</div>
                  </div>
                );
                return (
                  <>
                    {/* Header */}
                    <DialogHeader className="pb-3 border-b" style={{ borderColor: "#E5E7EB" }}>
                      <DialogTitle className="flex items-center gap-2 text-right">
                        <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#0F172A", fontSize: 14, fontWeight: 600 }}>
                          #{selectedOrder.order_number || "---"}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium border" style={{ borderColor: "#E5E7EB", background: "#F8FAFC", color: "#475569" }}>
                          {st.label}
                        </span>
                        <span className="text-[11px] mr-auto" style={{ color: "#94A3B8" }}>
                          {format(new Date(selectedOrder.created_at), "dd/MM/yyyy · HH:mm")}
                        </span>
                      </DialogTitle>
                    </DialogHeader>

                    {/* Section: identity */}
                    <div className="grid grid-cols-3 gap-x-4 gap-y-3 py-3 border-b" style={{ borderColor: "#F1F5F9" }}>
                      <Field label="الفرع">{terminalName || "—"}</Field>
                      <Field label="طريقة الدفع">{paymentLabel}</Field>
                      <Field label="نوع الطلب">{orderTypeLabel}</Field>
                    </div>

                    {/* Section: customer */}
                    {canSeeDetails(selectedOrder) ? (
                      <div className="grid grid-cols-3 gap-x-4 gap-y-3 py-3 border-b" style={{ borderColor: "#F1F5F9" }}>
                        <Field label="اسم الزبون">{selectedOrder.customer_name || "زبون نقدي"}</Field>
                        <Field label="رقم الجوال">
                          {selectedOrder.contacts?.phone ? (
                            <span className="font-mono" dir="ltr">{selectedOrder.contacts.phone}</span>
                          ) : "—"}
                        </Field>
                        {selectedOrder.recall_status && (
                          <Field label="سبب التعديل">{selectedOrder.recall_reason || "—"}</Field>
                        )}
                      </div>
                    ) : (
                      <div className="py-3 border-b text-[11px]" style={{ borderColor: "#F1F5F9", color: "#94A3B8" }}>
                        انتهت مدة عرض تفاصيل الزبون لهذه الفاتورة (بعد {amountVisibleMinutes} دقيقة من الإصدار).
                      </div>
                    )}

                    {/* Section: delivery */}
                    {showDelivery && (
                      <div className="py-3 border-b" style={{ borderColor: "#F1F5F9" }}>
                        <div className="text-[10px] mb-2" style={{ color: "#94A3B8" }}>بيانات التوصيل</div>
                        <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-[12px]" style={{ color: "#0F172A" }}>
                          {selectedOrder.area_name && (
                            <div><span className="text-[10px]" style={{ color: "#94A3B8" }}>المنطقة · </span>{selectedOrder.area_name}</div>
                          )}
                          {(selectedOrder.delivery_address || selectedOrder.customer_address) && (
                            <div className="col-span-2"><span className="text-[10px]" style={{ color: "#94A3B8" }}>العنوان · </span>{selectedOrder.delivery_address || selectedOrder.customer_address}</div>
                          )}
                          {deliveryFee > 0 && (
                            <div><span className="text-[10px]" style={{ color: "#94A3B8" }}>رسوم التوصيل · </span><span style={{ fontFamily: "JetBrains Mono, monospace" }}>₪{deliveryFee.toFixed(2)}</span></div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Section: note */}
                    {showNote && (
                      <div className="py-3 border-b" style={{ borderColor: "#F1F5F9" }}>
                        <div className="text-[10px] mb-1" style={{ color: "#94A3B8" }}>ملاحظة الطلبية</div>
                        <div className="text-[12px] whitespace-pre-wrap leading-relaxed break-words" style={{ color: "#334155" }}>
                          {selectedOrder.order_note || selectedOrder.notes}
                        </div>
                      </div>
                    )}

                    {/* Section: items */}
                    {loadingDetail ? (
                      <div className="py-8 text-center text-sm" style={{ color: "#94A3B8" }}>جاري التحميل...</div>
                    ) : canSeeDetails(selectedOrder) ? (
                      <div className="mt-3">
                        <div className="text-[10px] mb-1.5" style={{ color: "#94A3B8" }}>الأصناف</div>
                        <table className="w-full text-[12px] border-collapse">
                          <thead>
                            <tr className="border-y" style={{ borderColor: "#E5E7EB" }}>
                              <th className="py-1.5 px-2 text-right font-medium" style={{ color: "#64748B" }}>الصنف</th>
                              <th className="py-1.5 px-2 text-center font-medium w-14" style={{ color: "#64748B" }}>الكمية</th>
                              <th className="py-1.5 px-2 text-center font-medium w-20" style={{ color: "#64748B" }}>السعر</th>
                              <th className="py-1.5 px-2 text-left font-medium w-24" style={{ color: "#64748B" }}>الإجمالي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orderLines.map(line => (
                              <tr key={line.id} className="border-b" style={{ borderColor: "#F1F5F9" }}>
                                <td className="py-2 px-2 text-right align-top" style={{ color: "#0F172A" }}>
                                  <div>{line.product_name}</div>
                                  {line.notes && (
                                    <div className="text-[10px] mt-0.5 whitespace-pre-wrap" style={{ color: "#94A3B8" }}>{line.notes}</div>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-center align-top" style={{ fontFamily: "JetBrains Mono, monospace", color: "#475569" }}>{line.qty}</td>
                                <td className="py-2 px-2 text-center align-top" style={{ fontFamily: "JetBrains Mono, monospace", color: "#475569" }}>₪{line.unit_price.toFixed(2)}</td>
                                <td className="py-2 px-2 text-left align-top" style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: "#0F172A" }}>₪{line.total.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Financial summary */}
                        <div className="mt-3 space-y-1.5 text-[12px]" style={{ color: "#475569" }}>
                          {deliveryFee > 0 && (
                            <>
                              <div className="flex items-center justify-between">
                                <span>سعر الأصناف</span>
                                <span style={{ fontFamily: "JetBrains Mono, monospace" }}>₪{itemsSubtotal.toFixed(2)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>رسوم التوصيل</span>
                                <span style={{ fontFamily: "JetBrains Mono, monospace" }}>₪{deliveryFee.toFixed(2)}</span>
                              </div>
                            </>
                          )}
                          {Number(selectedOrder.discount_amount || 0) > 0 && (
                            <div className="flex items-center justify-between">
                              <span>الخصم</span>
                              <span style={{ fontFamily: "JetBrains Mono, monospace" }}>−₪{Number(selectedOrder.discount_amount).toFixed(2)}</span>
                            </div>
                          )}
                          {Number(selectedOrder.tax_amount || 0) > 0 && (
                            <div className="flex items-center justify-between">
                              <span>الضريبة</span>
                              <span style={{ fontFamily: "JetBrains Mono, monospace" }}>₪{Number(selectedOrder.tax_amount).toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-2 mt-1 border-t" style={{ borderColor: "#E5E7EB", color: "#0F172A" }}>
                            <span className="text-[13px] font-semibold">الإجمالي للتحصيل</span>
                            <span className="text-[15px] font-bold" style={{ fontFamily: "JetBrains Mono, monospace" }}>₪{selectedOrder.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t flex items-center justify-between text-[12px]" style={{ borderColor: "#E5E7EB", color: "#0F172A" }}>
                        <span className="font-semibold">الإجمالي للتحصيل</span>
                        <span className="text-[15px] font-bold" style={{ fontFamily: "JetBrains Mono, monospace" }}>₪{selectedOrder.total.toFixed(2)}</span>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap pt-4 border-t mt-4" style={{ borderColor: "#E5E7EB" }}>
                {selectedOrder.state === "draft" && onLoadDraftToCart && (
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs"
                    style={{ background: "#16A34A", color: "white" }}
                    onClick={() => {
                      const items: CartItem[] = orderLines.map(line => ({
                        id: crypto.randomUUID(),
                        product_id: line.product_id || null,
                        name: line.product_name,
                        qty: line.qty,
                        unit_price: line.unit_price,
                        cost_price: 0,
                        discount_pct: 0,
                        tax_rate: 0,
                        unit: "قطعة",
                        total: line.total,
                        note: "",
                      }));
                      onLoadDraftToCart(items, selectedOrder.id);
                      setSelectedOrder(null);
                      onClose();
                      toast.success("تم تحميل الطلب المعلق للسلة — يمكنك الدفع الآن");
                    }}
                  >
                    <ShoppingCart className="h-3.5 w-3.5" /> تحميل للسلة والدفع
                  </Button>
                )}
                {selectedOrder.state === "draft" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={async () => {
                      if (!confirm(`هل أنت متأكد من حذف الطلب المعلق #${selectedOrder.order_number || ""}؟`)) return;
                      try {
                        await supabase.from("pos_order_lines").delete().eq("order_id", selectedOrder.id);
                        await supabase.from("pos_payments").delete().eq("order_id", selectedOrder.id);
                        const { error } = await supabase.from("pos_orders").delete().eq("id", selectedOrder.id);
                        if (error) throw error;
                        toast.success("تم حذف الطلب المعلق");
                        setSelectedOrder(null);
                        fetchOrders();
                      } catch (err: any) {
                        toast.error(err.message || "فشل حذف الطلب");
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> حذف الطلب المعلق
                  </Button>
                )}
                {printInvoices && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    // Use bridge for silent printing
                    const paymentLabel = orderPayments.map(p => PAYMENT_LABELS[p.payment_method] || p.payment_method).join(", ") || "---";
                    const bridgeOrder = {
                      orderNumber: selectedOrder.order_number || "---",
                      branchName: terminalName || "نقطة البيع",
                      cashier: cashierName,
                      items: orderLines.map(line => ({
                        id: line.product_id || line.product_name,
                        name: line.product_name,
                        quantity: line.qty,
                        price: line.unit_price,
                      })),
                      subtotal: selectedOrder.subtotal || selectedOrder.total,
                      discount: selectedOrder.discount_amount || 0,
                      total: selectedOrder.total,
                      paymentMethod: paymentLabel,
                    };
                    printReceiptImage(bridgeOrder).catch(() => {
                      console.warn("Print bridge unavailable");
                    });
                    toast.success("تم إرسال الإيصال للطابعة");
                  }}
                >
                  <Printer className="h-3.5 w-3.5" /> طباعة
                </Button>
                )}

                {canCancelInvoices && (selectedOrder.state === "paid" || selectedOrder.recall_status === "recalled") && (
                  <>
                    {!cashierMode && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => initiateRecall(selectedOrder)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> استدعاء للتعديل
                    </Button>
                    )}
                    {!cashierMode && selectedOrder.state === "paid" && !selectedOrder.is_return && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() => initiateReturn(selectedOrder)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> ارتجاع
                      </Button>
                    )}
                    {(!cashierMode || isWithinCancelGrace(selectedOrder)) ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => initiateCancel(selectedOrder)}
                    >
                      <Lock className="h-3 w-3" />
                      <Ban className="h-3.5 w-3.5" /> إلغاء الفاتورة
                    </Button>
                    ) : (
                      <span className="text-[11px] flex items-center gap-1" style={{ color: "#94A3B8" }}>
                        <Lock className="h-3 w-3" /> انتهت مدة السماح لإلغاء هذه الفاتورة
                      </span>
                    )}
                  </>
                )}
                {allowOrderTransfer && selectedOrder.state === "paid" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    style={{ borderColor: "#6366F1", color: "#6366F1" }}
                    onClick={() => {
                      setTransferringOrder(selectedOrder);
                      setSelectedTransferUser(null);
                      setShowTransferDialog(true);
                    }}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" /> نقل لموظف آخر
                  </Button>
                )}
              </div>

              {/* Manager approval note */}
              {requireManagerForInvoices && selectedOrder.state === "paid" && !selectedOrder.recall_status && (
                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  التعديل يتطلب موافقة المدير
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
              <label key={r} className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-gray-50" style={{ border: recallReason === r ? "2px solid #4A9EE8" : "1px solid #E2E8F0" }}>
                <input
                  type="radio"
                  name="recallReason"
                  checked={recallReason === r}
                  onChange={() => setRecallReason(r)}
                  className="accent-[#4A9EE8]"
                />
                <span className="text-sm">{r}</span>
              </label>
            ))}
            <label className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-gray-50" style={{ border: recallReason === "أخرى" ? "2px solid #4A9EE8" : "1px solid #E2E8F0" }}>
              <input
                type="radio"
                name="recallReason"
                checked={recallReason === "أخرى"}
                onChange={() => setRecallReason("أخرى")}
                className="accent-[#4A9EE8]"
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
            <Button size="sm" style={{ background: "#4A9EE8", color: "#0A2342" }} onClick={handleReasonConfirm}>تأكيد التعديل</Button>
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
              <br />سيتم إنشاء قيد محاسبي عكسي وإرسال تذكرة إلغاء للمطبخ تلقائياً.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: "#475569" }}>سبب الإلغاء (إلزامي)</label>
              <div className="grid grid-cols-2 gap-1.5">
                {cancelReasons.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setCancelReason(r.reason_text)}
                    className="text-xs px-2 py-2 rounded-md border text-right transition-colors"
                    style={{
                      borderColor: cancelReason === r.reason_text ? "#DC2626" : "#E2E8F0",
                      background: cancelReason === r.reason_text ? "#FEE2E2" : "#FFFFFF",
                      color: cancelReason === r.reason_text ? "#991B1B" : "#0F172A",
                      fontWeight: cancelReason === r.reason_text ? 600 : 400,
                    }}
                  >
                    {r.reason_text}
                  </button>
                ))}
              </div>
              {cancelReasons.length === 0 && (
                <p className="text-xs" style={{ color: "#94A3B8" }}>لا توجد أسباب محفوظة — يرجى إضافتها من الإعدادات.</p>
              )}
            </div>
            <textarea
              value={cancelNote}
              onChange={e => setCancelNote(e.target.value)}
              placeholder="ملاحظة إضافية (اختياري)..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none text-black"
              style={{ borderColor: "#E2E8F0" }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowCancelConfirm(false); setCancellingOrder(null); setCancelReason(""); setCancelNote(""); }}>تراجع</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!cancelReason.trim()}
              onClick={handleCancelConfirm}
            >
              {needsManagerForCancel ? "متابعة — يتطلب موافقة المدير" : "تأكيد الإلغاء"}
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

      {/* ══════ TRANSFER DIALOG ══════ */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="max-w-sm z-[1200]" style={{ fontFamily: "Tajawal, sans-serif" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" style={{ color: "#6366F1" }} />
              نقل الفاتورة لموظف آخر
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-xs" style={{ color: "#64748B" }}>
              اختر الموظف الذي تريد نقل الفاتورة #{transferringOrder?.order_number} إليه.
              يجب أن يكون لديه وردية مفتوحة.
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {posUsers.map(u => (
                <label
                  key={u.id}
                  className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-50"
                  style={{ border: selectedTransferUser === u.id ? "2px solid #6366F1" : "1px solid #E2E8F0" }}
                >
                  <input
                    type="radio"
                    name="transferUser"
                    checked={selectedTransferUser === u.id}
                    onChange={() => setSelectedTransferUser(u.id)}
                    className="accent-[#6366F1]"
                  />
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" style={{ color: "#64748B" }} />
                    <span className="text-sm font-medium">{u.name}</span>
                  </div>
                </label>
              ))}
              {posUsers.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">لا يوجد موظفين آخرين لديهم وردية مفتوحة</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowTransferDialog(false); setTransferringOrder(null); }}>إلغاء</Button>
            <Button
              size="sm"
              disabled={!selectedTransferUser || transferring}
              style={{ background: "#6366F1", color: "white" }}
              onClick={handleTransferOrder}
            >
              {transferring ? "جارِ النقل..." : "نقل الفاتورة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ RETURN DIALOG ══════ */}
      {returningOrder && sessionId && (
        <ReturnDialog
          open={showReturnDialog}
          onClose={() => { setShowReturnDialog(false); setReturningOrder(null); }}
          originalOrderId={returningOrder.id}
          originalOrderNumber={returningOrder.order_number}
          originalTotal={returningOrder.total}
          originalCurrency={orderCurrency}
          sessionId={sessionId}
          dataOwnerId={dataOwnerId}
          exchangeRates={exchangeRates}
          onSuccess={() => { fetchOrders(); setSelectedOrder(null); }}
        />
      )}
    </>
  );
}
