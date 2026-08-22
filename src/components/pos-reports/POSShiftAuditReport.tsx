import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Copy, Sun, Moon, AlertTriangle, CheckCircle2, ClipboardList, ChevronDown, ChevronLeft, Eye, Plus, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { POSSession } from "@/hooks/usePOSReportsData";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatOrderTypeLabel } from "@/lib/pos/order-type-label";

interface ForeignAdjustmentRow {
  id: string;
  currency: "JOD" | "USD";
  foreign_amount: number;
  exchange_rate: number;
  ils_equivalent: number;
  reason: string | null;
  created_at: string;
  created_by: string | null;
}

function classifyShift(openedAt: string): "morning" | "evening" {
  const h = new Date(openedAt).getHours();
  // Morning 09:00–16:59, Evening 17:00–03:59
  if (h >= 9 && h < 17) return "morning";
  return "evening";
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM HH:mm", { locale: ar });
}

function shortId(id: string) {
  return id.slice(0, 8);
}

// Map raw payment method codes/labels to Arabic display.
const PAYMENT_METHOD_AR: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  credit_card: "بطاقة ائتمان",
  debit_card: "بطاقة سحب",
  employee_account: "حساب موظف",
  employee: "حساب موظف",
  account: "ذمم العميل",
  customer_account: "ذمم العميل",
  transfer: "حوالة بنكية",
  cheque: "شيك",
};
function trMethod(m: string) {
  return PAYMENT_METHOD_AR[m?.toLowerCase?.() ?? m] || m;
}

const SYNC_STATUS_AR: Record<string, string> = {
  synced: "مرحّلة",
  pending: "معلّقة",
  quarantined: "في الحجر",
  syncing: "قيد الترحيل",
  failed: "فشل الترحيل",
};
function trSyncStatus(s: string | null | undefined) {
  if (!s) return "—";
  return SYNC_STATUS_AR[s] || s;
}

interface SessionOrder {
  id: string;
  order_number: string | null;
  created_at: string;
  total: number;
  state: string;
  is_return?: boolean | null;
  return_currency?: string | null;
  return_currency_amount?: number | null;
  payment_currency?: string | null;
  payment_currency_amount?: number | null;
  delivery_fee?: number | null;
  total_includes_delivery_fee?: boolean | null;
  was_offline: boolean | null;
  sync_status: string | null;
  transaction_id: string | null;
  linked_transaction_id?: string | null;
  voided?: boolean;
  order_note?: string | null;
  customer_name?: string | null;
  notes?: string | null;
  order_type?: string | null;
  /** Resolved employee name for employee_account payments (from GL account or order_note). */
  employee_name?: string | null;
}
interface SessionPayment {
  id: string;
  payment_method: string;
  amount: number;
  order_id?: string;
  currency?: string;
  tendered?: number;
  change_amount?: number;
  change_currency?: string;
  exchange_rate?: number;
  is_refund?: boolean;
}

interface ShiftAuditRow {
  variance_ils: number;
  variance_usd: number;
  variance_jod: number;
  variance_total_ils: number;
  expected_cash_ils: number | null;
  actual_cash_ils: number | null;
}

interface CashAdjustmentState {
  expensesILS: number;
  purchasesCashILS: number;
  returnsByCurrency: Record<string, number>;
  /** عربون نقدي مقبوض في هذه الوردية لطلبيات مجدولة (بدون فاتورة) */
  prepaidReceivedILS: number;
  /** عربون مقبوض سابقاً وتم خصمه من فاتورة صدرت في هذه الوردية */
  prepaidAppliedILS: number;
}

const EMPTY_CASH_ADJUSTMENTS: CashAdjustmentState = {
  expensesILS: 0,
  purchasesCashILS: 0,
  returnsByCurrency: { ILS: 0, USD: 0, JOD: 0 },
  prepaidReceivedILS: 0,
  prepaidAppliedILS: 0,
};

interface Props {
  sessions: POSSession[];
  branchName?: string | null;
}

export default function POSShiftAuditReport({ sessions }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    // استبعاد حسابات الكول سنتر / دايال كولستر من دراسة الوردية
    const EXCLUDE = /(كول\s*سنتر|كولسنتر|كولستر|دايال|call\s*center|callcenter|dial)/i;
    return sessions.filter(s => !EXCLUDE.test(String(s.cashier_name || "")));
  }, [sessions]);

  useEffect(() => {
    if (filtered.length > 0 && !filtered.find(s => s.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
    if (filtered.length === 0) setSelectedId(null);
  }, [filtered, selectedId]);

  const selected = filtered.find(s => s.id === selectedId) || null;

  return (
    <section className="border-t border-border pt-4">
      <header className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            دراسة وردية — تدقيق محاسبي
          </h2>
        </div>
        <span className="text-[11px] text-muted-foreground">{filtered.length} وردية</span>
      </header>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded">
          لا توجد ورديات ضمن هذا الفلتر.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Sessions list */}
          <div className="border border-border rounded">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
              {filtered.length} وردية
            </div>
            <div className="max-h-[640px] overflow-y-auto divide-y divide-border">
              {filtered.map(s => {
                const kind = classifyShift(s.opened_at);
                const active = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "w-full text-right px-3 py-2 hover:bg-muted/30 transition-colors",
                      active && "bg-muted/50 border-r-2 border-primary",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-foreground truncate">
                        {s.cashier_name || "غير محدد"}
                      </span>
                      {kind === "morning" ? (
                        <Sun className="w-3 h-3 text-amber-500" />
                      ) : (
                        <Moon className="w-3 h-3 text-indigo-400" />
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-between">
                      <span>{fmtTime(s.opened_at)}</span>
                      <span
                        className={cn(
                          "px-1.5 py-px rounded text-[10px]",
                          s.state === "open"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {s.state === "open" ? "مفتوحة" : "مغلقة"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail panel */}
          <div>
            {selected ? <ShiftDetail session={selected} /> : <Skeleton className="h-64" />}
          </div>
        </div>
      )}
    </section>
  );
}

function ShiftDetail({ session }: { session: POSSession }) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SessionOrder[]>([]);
  const [payments, setPayments] = useState<SessionPayment[]>([]);
  const [voidedPayments, setVoidedPayments] = useState<SessionPayment[]>([]);
  const [cashAdjustments, setCashAdjustments] = useState<CashAdjustmentState>(EMPTY_CASH_ADJUSTMENTS);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [audit, setAudit] = useState<ShiftAuditRow | null>(null);
  const [foreignAdjustments, setForeignAdjustments] = useState<ForeignAdjustmentRow[]>([]);
  const { roles } = useUserRoles();
  const { user } = useAuth();
  const canEditAdjustments = roles.some(
    (r) => r === "admin" || r === "super_admin" || r === "accountant_senior",
  );

  const reloadForeignAdjustments = async () => {
    const { data } = await supabase
      .from("pos_shift_foreign_adjustments" as any)
      .select("id, currency, foreign_amount, exchange_rate, ils_equivalent, reason, created_at, created_by")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });
    setForeignAdjustments(((data as any[]) || []) as ForeignAdjustmentRow[]);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Reset previous session's data immediately so we never render a stale
      // mix of old orders/payments with the new session's audit row.
      setOrders([]);
      setPayments([]);
      setVoidedPayments([]);
      setCashAdjustments(EMPTY_CASH_ADJUSTMENTS);
      setAudit(null);
      setForeignAdjustments([]);
      setLoading(true);
      // Parallel: audit row + orders list + cash-out documents (independent).
      const [auditRes, ordersRes, expensesRes, purchasesRes, fadjRes, prepayRes] = await Promise.all([
        supabase
          .from("pos_shift_audits" as any)
          .select("variance_ils, variance_usd, variance_jod, variance_total_ils, expected_cash_ils, actual_cash_ils")
          .eq("session_id", session.id)
          .maybeSingle(),
        supabase
          .from("pos_orders")
          .select("id, order_number, created_at, total, state, is_return, return_currency, return_currency_amount, payment_currency, payment_currency_amount, delivery_fee, total_includes_delivery_fee, was_offline, sync_status, transaction_id, linked_transaction_id, order_note, customer_name, notes, order_type")
          .eq("session_id", session.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("pos_expenses")
          .select("amount")
          .eq("shift_id", session.id),
        supabase
          .from("pos_purchases")
          .select("total_amount, payment_type")
          .eq("shift_id", session.id),
        supabase
          .from("pos_shift_foreign_adjustments" as any)
          .select("id, currency, foreign_amount, exchange_rate, ils_equivalent, reason, created_at, created_by")
          .eq("session_id", session.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("pos_prepayments" as any)
          .select("amount, currency, method, status, session_id, applied_session_id")
          .or(`session_id.eq.${session.id},applied_session_id.eq.${session.id}`),
      ]);
      if (cancelled) return;
      const auditRow = auditRes.data as any;
      const ords = ordersRes.data as any[] | null;
      const rawOrders = (ords || []) as any[];
      const expensesILS = ((expensesRes.data as any[]) || [])
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const purchasesCashILS = ((purchasesRes.data as any[]) || [])
        .filter((p: any) => p.payment_type === "نقدي" || p.payment_type === "cash" || !p.payment_type)
        .reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);
      // 💵 دفع مسبق (عربون) لفاتورة آجلة مجدولة — كاش في الدرج بلا فاتورة.
      let prepaidReceivedILS = 0;
      let prepaidAppliedILS = 0;
      ((prepayRes as any)?.data as any[] || []).forEach((p: any) => {
        if (String(p.method || "cash").toLowerCase() !== "cash") return;
        if (String(p.currency || "ILS").toUpperCase() !== "ILS") return;
        const amt = Number(p.amount) || 0;
        if (amt <= 0) return;
        if (p.session_id === session.id && p.status !== "cancelled") prepaidReceivedILS += amt;
        if (p.applied_session_id === session.id && p.status === "applied") prepaidAppliedILS += amt;
      });
      const txIds = rawOrders.flatMap(o => [o.transaction_id, o.linked_transaction_id]).filter(Boolean) as string[];
      const orderIdsForPayments = rawOrders.map(o => o.id);
      // Parallel: voided-tx lookup + payments fetch (both depend only on ids we have now).
      const [voidedRes, payRes] = await Promise.all([
        txIds.length
          ? supabase.from("transactions").select("id, notes").in("id", txIds).eq("is_deleted", true)
          : Promise.resolve({ data: [] as any[] }),
        orderIdsForPayments.length
          ? supabase
              .from("pos_payments")
              .select("id, payment_method, amount, order_id, currency, tendered, change_amount, change_currency, exchange_rate, is_refund")
              .in("order_id", orderIdsForPayments)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (cancelled) return;
      // Exclude soft-deletes that are just automated GL re-posts (e.g. mixed-split
      // re-post): the invoice is still valid and has replacement journal entries,
      // so it must NOT be counted under "محذوف محاسبياً".
      const REPOST_MARKERS = /gl-sync|re-post|mixed-split|reposted/i;
      const voidedIds = new Set(
        ((voidedRes.data as any[]) || [])
          .filter((t: any) => !(t.notes && REPOST_MARKERS.test(String(t.notes))))
          .map((t: any) => t.id),
      );
      const enriched: SessionOrder[] = rawOrders.map(o => ({
        ...o,
        voided: Boolean(
          (o.transaction_id && voidedIds.has(o.transaction_id)) ||
          (o.linked_transaction_id && voidedIds.has(o.linked_transaction_id)),
        ),
      }));

      let pays: SessionPayment[] = [];
      let voidPays: SessionPayment[] = [];
      let nextCashAdjustments: CashAdjustmentState = EMPTY_CASH_ADJUSTMENTS;
      {
        const payData = (payRes.data as any[]) || [];
        const validSaleOrderIds = new Set(enriched.filter(o => !o.voided && o.state === "paid" && !o.is_return).map(o => o.id));
        const validReturnOrders = enriched.filter(o => !o.voided && o.state === "paid" && o.is_return);
        const voidedOrderIds = new Set(enriched.filter(o => o.voided).map(o => o.id));
        pays = payData
          .filter((p: any) => validSaleOrderIds.has(p.order_id))
          .map((p: any) => ({
            id: p.id, payment_method: p.payment_method,
            amount: Number(p.amount) || 0, order_id: p.order_id,
            currency: p.currency || "ILS",
            tendered: Number(p.tendered) || 0,
            change_amount: Number(p.change_amount) || 0,
            change_currency: p.change_currency || "ILS",
            exchange_rate: Number(p.exchange_rate) || 1,
            is_refund: !!p.is_refund,
          }));
        voidPays = payData
          .filter((p: any) => voidedOrderIds.has(p.order_id))
          .map((p: any) => ({
            id: p.id, payment_method: p.payment_method,
            amount: Number(p.amount) || 0, order_id: p.order_id,
            currency: p.currency || "ILS",
          }));

        const paymentByOrderId = new Map(payData.map((p: any) => [p.order_id, p]));
        const returnsByCurrency: Record<string, number> = { ILS: 0, USD: 0, JOD: 0 };
        validReturnOrders.forEach((o: any) => {
          const pay = paymentByOrderId.get(o.id) as any;
          const method = pay?.payment_method || "cash";
          if (method !== "cash") return;
          const cur = (o.return_currency || pay?.currency || "ILS").toUpperCase();
          const amount = cur === "ILS"
            ? Number(o.total) || 0
            : Number(o.return_currency_amount) || 0;
          returnsByCurrency[cur] = (returnsByCurrency[cur] || 0) + amount;
        });
        nextCashAdjustments = { expensesILS, purchasesCashILS, returnsByCurrency, prepaidReceivedILS, prepaidAppliedILS };

        // ── Resolve employee names for employee_account payments ──
        // Priority: order_note "حساب موظف: X" → GL debit account name (strip "ذمم موظف - ").
        const employeeOrderIds = new Set(
          payData
            .filter((p: any) => p.payment_method === "employee_account" || p.payment_method === "employee")
            .map((p: any) => p.order_id)
        );
        const empOrders = enriched.filter(o => employeeOrderIds.has(o.id));
          const txIdsForEmp = empOrders.flatMap(o => [o.transaction_id, o.linked_transaction_id]).filter(Boolean) as string[];
        const txToAccountCode = new Map<string, string>();
        if (txIdsForEmp.length) {
          const { data: txRows } = await supabase
            .from("transactions")
            .select("id, debit_account_code")
            .in("id", txIdsForEmp);
          if (cancelled) return;
          (txRows || []).forEach((t: any) => {
            if (t?.debit_account_code) txToAccountCode.set(t.id, t.debit_account_code);
          });
        }
        const codes = Array.from(new Set(Array.from(txToAccountCode.values())));
        const codeToName = new Map<string, string>();
        if (codes.length) {
          const { data: accRows } = await supabase
            .from("accounts")
            .select("account_code, account_name")
            .in("account_code", codes);
          if (cancelled) return;
          (accRows || []).forEach((a: any) => {
            if (a?.account_code && a?.account_name && !codeToName.has(a.account_code)) {
              codeToName.set(a.account_code, a.account_name);
            }
          });
        }
        const noteEmpRegex = /حساب\s*موظف\s*[:：]\s*([^|]+?)(?:\s*\||$)/;
        empOrders.forEach(o => {
          let name: string | null = null;
          // 1) order_note pattern
          const m = o.order_note?.match(noteEmpRegex);
          if (m?.[1]) name = m[1].trim();
          // 2) fall back to GL account name (strip "ذمم موظف - ")
          const empTxId = o.transaction_id || o.linked_transaction_id || null;
          if (!name && empTxId) {
            const code = txToAccountCode.get(empTxId);
            const accName = code ? codeToName.get(code) : null;
            if (accName) name = accName.replace(/^ذمم\s*موظف\s*-\s*/, "").trim();
          }
          o.employee_name = name;
        });
      }
      if (cancelled) return;
      // Single atomic commit — audit + orders + payments together, so the UI
      // never renders a mix of old and new session data.
      setAudit((auditRow as any) || null);
      setOrders(enriched);
      setPayments(pays);
      setVoidedPayments(voidPays);
      setCashAdjustments(nextCashAdjustments);
      setForeignAdjustments(((fadjRes.data as any[]) || []) as ForeignAdjustmentRow[]);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [session.id]);

  const totals = useMemo(() => {
    const paid = orders.filter(o => o.state === "paid" && !o.voided);
    const paidSales = paid.filter(o => !o.is_return);
    const paidReturns = paid.filter(o => o.is_return);
    const cancelled = orders.filter(o => o.state === "cancelled");
    const voided = orders.filter(o => o.voided);
    const offlineSynced = orders.filter(o => o.was_offline && o.sync_status === "synced");
    const pending = orders.filter(o => o.sync_status && !["synced", null].includes(o.sync_status));
    const netSales = paidSales.reduce((s, o) => s + Number(o.total || 0), 0);
    const byMethod: Record<string, { count: number; amount: number; rows: { orderId: string; orderNumber: string | null; amount: number; note: string | null }[] }> = {};
    const orderById = new Map(orders.map(o => [o.id, o]));
    const orderTime = (id: string | undefined) => {
      const o = id ? orderById.get(id) : undefined;
      return o?.created_at ? new Date(o.created_at).getTime() : 0;
    };
    const sortedPayments = [...payments].sort(
      (a, b) => orderTime(a.order_id) - orderTime(b.order_id),
    );
    sortedPayments.forEach(p => {
      const k = p.payment_method || "نقدي";
      if (!byMethod[k]) byMethod[k] = { count: 0, amount: 0, rows: [] };
      byMethod[k].count++;
      byMethod[k].amount += p.amount;
      const ord = p.order_id ? orderById.get(p.order_id) : undefined;
      const isEmpMethod = p.payment_method === "employee_account" || p.payment_method === "employee";
      byMethod[k].rows.push({
        orderId: p.order_id || "",
        orderNumber: ord?.order_number || null,
        amount: p.amount,
        note: isEmpMethod
          ? (ord?.employee_name || ord?.order_note || ord?.customer_name || null)
          : (ord?.order_note || ord?.customer_name || null),
      });
    });
    // Re-derive expected cash from real (non-voided) cash payments only.
    const cashKey = (m: string) => ["cash", "نقدي"].includes((m || "").toLowerCase());
    const voidedCash = voidedPayments.filter(p => cashKey(p.payment_method)).reduce((s, p) => s + p.amount, 0);

    // ── Currency-aware physical drawer calculation ──
    // For each cash payment we compute what physically enters/leaves each drawer
    // (ILS / USD / JOD), so multi-currency tenders and change never inflate the
    // ILS expected total (which used to show foreign tenders as if they were ILS).
    // Refunds flip the sign. `tendered` is stored in ILS-equivalent, so foreign
    // tender units = tendered / exchange_rate.
    let ilsCashSales = 0;
    let foreignChangeILS = 0;
    let foreignChangeUSD = 0;
    let foreignChangeJOD = 0;
    let foreignTenderedUSD = 0;
    let foreignTenderedJOD = 0;
    let foreignCashSalesILS = 0;
    let expectedUSD = 0;
    let expectedJOD = 0;
    let realCashILSEquivalent = 0; // net cash sales in ILS (for display parity)
    payments.forEach(p => {
      if (!cashKey(p.payment_method || "")) return;
      const cur = (p.currency || "ILS").toUpperCase();
      const rate = p.exchange_rate && p.exchange_rate > 0 ? p.exchange_rate : 1;
      const tendered = p.tendered || 0; // ILS-equivalent
      const change = p.change_amount || 0;
      const changeCur = (p.change_currency || "ILS").toUpperCase();
      realCashILSEquivalent += p.amount || 0;
      if (cur === "ILS") {
        ilsCashSales += p.amount || 0;
      } else if (cur === "USD") {
        foreignCashSalesILS += p.amount || 0;
        foreignTenderedUSD += tendered / rate;
      } else if (cur === "JOD") {
        foreignCashSalesILS += p.amount || 0;
        foreignTenderedJOD += tendered / rate;
      } else {
        foreignCashSalesILS += p.amount || 0;
      }
      // Subtract change only when it belongs to a foreign-currency cash tender.
      // For normal ILS cash payments, `p.amount` is already net after change;
      // subtracting the ILS change again falsely lowers expected cash (e.g. +813 instead of +35).
      if (change && cur !== "ILS") {
        if (changeCur === "ILS") foreignChangeILS += change;
        else if (changeCur === "USD") foreignChangeUSD += change;
        else if (changeCur === "JOD") foreignChangeJOD += change;
      }
    });
    const legacyDeliveryCashILS = paidSales
      .filter(o => (o.payment_currency || "ILS") === "ILS" && o.total_includes_delivery_fee === true)
      .reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0);
    const effectiveILSCashSales = Math.max(0, ilsCashSales - legacyDeliveryCashILS);
    const returnsILS = cashAdjustments.returnsByCurrency.ILS || 0;
    const returnsUSD = cashAdjustments.returnsByCurrency.USD || 0;
    const returnsJOD = cashAdjustments.returnsByCurrency.JOD || 0;
    const hasUSDActivity = foreignTenderedUSD > 0 || foreignChangeUSD > 0 || returnsUSD > 0;
    const hasJODActivity = foreignTenderedJOD > 0 || foreignChangeJOD > 0 || returnsJOD > 0;
    expectedUSD = hasUSDActivity ? (foreignTenderedUSD - foreignChangeUSD - returnsUSD) : 0;
    expectedJOD = hasJODActivity ? (foreignTenderedJOD - foreignChangeJOD - returnsJOD) : 0;
    const realCash = realCashILSEquivalent; // kept for existing labels
    const netILSDrawerSales = effectiveILSCashSales - foreignChangeILS;
    const recalcExpected = (session.opening_cash ?? 0)
      + netILSDrawerSales
      - cashAdjustments.expensesILS
      - cashAdjustments.purchasesCashILS
      - returnsILS
      + (cashAdjustments.prepaidReceivedILS || 0)
      - (cashAdjustments.prepaidAppliedILS || 0);
    return {
      paid, paidSales, paidReturns, cancelled, voided, offlineSynced, pending, netSales, byMethod,
      recalcExpected, voidedCash, realCash,
      expectedUSD, expectedJOD, hasUSDActivity, hasJODActivity,
      ilsCashSales: effectiveILSCashSales,
        foreignCashSalesILS,
        netILSDrawerSales,
        foreignTenderedUSD,
        foreignTenderedJOD,
        foreignChangeILS,
        foreignChangeUSD,
        foreignChangeJOD,
      returnsByCurrency: cashAdjustments.returnsByCurrency,
    };
  }, [orders, payments, voidedPayments, session.opening_cash, cashAdjustments]);

  const kind = classifyShift(session.opened_at);
  const durationMin = session.closed_at
    ? Math.round((new Date(session.closed_at).getTime() - new Date(session.opened_at).getTime()) / 60000)
    : Math.round((Date.now() - new Date(session.opened_at).getTime()) / 60000);
  const durationLabel = `${Math.floor(durationMin / 60)}س ${durationMin % 60}د`;

  const copyId = () => {
    navigator.clipboard.writeText(session.id);
    toast.success("تم نسخ Session ID");
  };

  // Root-cause fix: always recompute expected cash from CURRENT (post-deletion)
  // payment data, so accountant deletions of orders after shift close flow into
  // the variance. This keeps the "بعد استبعاد المحذوفات" section internally
  // consistent — cash tender totals, expected cash, and variance all agree.
  // ── Manual foreign-currency adjustments (accountant-entered) ──
  // Each row means "physically at drawer: X foreign currency (worth X*rate ILS)
  // that the cashier accidentally recorded as ILS". So we:
  //   • subtract the ILS equivalent from expected ILS,
  //   • add the foreign_amount to expected foreign currency drawer.
  const adjTotals = useMemo(() => {
    let jodForeign = 0, jodIls = 0, usdForeign = 0, usdIls = 0;
    foreignAdjustments.forEach(a => {
      const f = Number(a.foreign_amount) || 0;
      const ils = Number(a.ils_equivalent) || (f * (Number(a.exchange_rate) || 0));
      if (a.currency === "JOD") { jodForeign += f; jodIls += ils; }
      else if (a.currency === "USD") { usdForeign += f; usdIls += ils; }
    });
    return { jodForeign, jodIls, usdForeign, usdIls, totalIls: jodIls + usdIls };
  }, [foreignAdjustments]);

  const baseExpectedILSAtClose = totals.recalcExpected;
  const expectedILSAtClose = baseExpectedILSAtClose - adjTotals.totalIls;
  const actualILSAtClose = audit?.actual_cash_ils ?? session.closing_cash ?? null;
  const varianceILSAtClose = actualILSAtClose != null
    ? actualILSAtClose - expectedILSAtClose
    : null;
  const varianceLabel = varianceILSAtClose;
  const varianceColor =
    varianceLabel == null
      ? "text-muted-foreground"
      : Math.abs(varianceLabel) < 0.5
        ? "text-emerald-600"
        : varianceLabel < 0
          ? "text-destructive"
          : "text-amber-600";

  // Adjusted expected foreign totals (base tender activity + manual adjustments).
  const expectedUSDAdj = totals.expectedUSD + adjTotals.usdForeign;
  const expectedJODAdj = totals.expectedJOD + adjTotals.jodForeign;
  // Actual foreign closing = expected + variance (variance = actual − expected).
  const actualUSD = audit ? expectedUSDAdj + Number(audit.variance_usd || 0) : null;
  const actualJOD = audit ? expectedJODAdj + Number(audit.variance_jod || 0) : null;
  const varUSD = audit ? Number(audit.variance_usd || 0) : null;
  const varJOD = audit ? Number(audit.variance_jod || 0) : null;
  const varTotalILS = audit ? Number(audit.variance_total_ils || 0) : null;
  const hasUSD = totals.hasUSDActivity || Math.abs(expectedUSDAdj) > 0.001 || Math.abs(varUSD || 0) > 0.001 || Math.abs(actualUSD || 0) > 0.001 || adjTotals.usdForeign > 0;
  const hasJOD = totals.hasJODActivity || Math.abs(expectedJODAdj) > 0.001 || Math.abs(varJOD || 0) > 0.001 || Math.abs(actualJOD || 0) > 0.001 || adjTotals.jodForeign > 0;
  // Kept for backward-compat but effectively unused now that expected == recalc.
  const expectedMismatch = false;

  const fx = (n: number, curFmt: (v: number) => string, positive = true) =>
    positive && n >= 0 ? `+${curFmt(n)}` : curFmt(n);
  const fmtUSD = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const fmtJOD = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} د.أ`;
  const varColor = (v: number | null) =>
    v == null ? "text-muted-foreground"
      : Math.abs(v) < 0.01 ? "text-emerald-600"
      : v < 0 ? "text-destructive" : "text-amber-600";

  return (
    <div className="space-y-4">
      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {!loading && (
      <>
      {/* Section C: Actual numbers (moved to top, always open) */}
      <div className="border border-primary/40 rounded shadow-sm">
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-primary bg-primary/5 border-b border-border">
          الأرقام الفعلية (بعد استبعاد المحذوفات)
        </div>
        <div className="divide-y divide-border text-[13px]">
          <Row label="إجمالي المبيعات">
            <span className="font-mono font-semibold text-foreground">
              ₪{totals.netSales.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </Row>
          {Object.entries(totals.byMethod).map(([m, v]) => (
            <ExpandableMethodRow
              key={m}
              method={m}
              count={v.count}
              amount={v.amount}
              rows={v.rows}
              onOpenOrder={(id) => setOpenOrderId(id)}
            />
          ))}
          <Row label={`ملغي (${totals.cancelled.length} فاتورة)`}>
            <span className="font-mono text-muted-foreground">
              ₪{totals.cancelled.reduce((s, o) => s + Number(o.total || 0), 0).toLocaleString()}
            </span>
          </Row>
          <Row label={`محذوف محاسبياً (${totals.voided.length} فاتورة)`}>
            <span className="font-mono text-muted-foreground">
              ₪{totals.voided.reduce((s, o) => s + Number(o.total || 0), 0).toLocaleString()}
            </span>
          </Row>
          <Row label={`مرتجعات نقدية (${totals.paidReturns.length} فاتورة)`}>
            <span className="font-mono text-muted-foreground">
              ₪{(totals.returnsByCurrency.ILS || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </Row>
          <Row label="مصروفات/مشتريات نقدية">
            <span className="font-mono text-muted-foreground">
              ₪{(cashAdjustments.expensesILS + cashAdjustments.purchasesCashILS).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </Row>
          {(cashAdjustments.prepaidReceivedILS || 0) > 0 && (
            <Row label="دفع مسبق لفاتورة آجلة (عربون مقبوض)">
              <span className="font-mono text-emerald-600">
                +₪{cashAdjustments.prepaidReceivedILS.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </Row>
          )}
          {(cashAdjustments.prepaidAppliedILS || 0) > 0 && (
            <Row label="خصم دفع مسبق مقبوض سابقاً">
              <span className="font-mono text-amber-600">
                −₪{cashAdjustments.prepaidAppliedILS.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </Row>
          )}
          <Row label="كاش متوقع عند الإغلاق (شيكل)">
            <span className="font-mono font-semibold text-foreground">
              {expectedILSAtClose != null ? `₪${expectedILSAtClose.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
            </span>
          </Row>
          <Row label="كاش فعلي عند الإغلاق (شيكل)">
            <span className="font-mono">
              {actualILSAtClose != null ? `₪${actualILSAtClose.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "لم تُغلق"}
            </span>
          </Row>
          <Row label="فرق الكاش (شيكل)">
            <span className={cn("font-mono", varianceColor)}>
              {varianceILSAtClose != null ? `${varianceILSAtClose >= 0 ? "+" : ""}₪${varianceILSAtClose.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
            </span>
          </Row>
          {expectedMismatch && (
            <Row label="تنبيه مطابقة الكاش">
              <span className="font-mono text-amber-600">
                محسوب من التفاصيل: ₪{totals.recalcExpected.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </Row>
          )}
          {!hasUSD && !hasJOD && (
            <Row label="العملات الأجنبية">
              <span className="text-muted-foreground">لا توجد حركة</span>
            </Row>
          )}
          {totals.foreignChangeILS > 0 && (
            <>
              <Row label="قيمة فواتير مدفوعة بعملة أجنبية (للعلم فقط — غير مضافة للكاش المتوقع)">
                <span className="font-mono text-muted-foreground">
                  ₪{totals.foreignCashSalesILS.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </Row>
              <Row label="فكة مدفوعة بالشيكل لفواتير عملة أجنبية (تُخصم من درج الشيكل)">
                <span className="font-mono text-muted-foreground">
                  -₪{totals.foreignChangeILS.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </Row>
              <Row label="الأثر الفعلي على درج الشيكل (فكة فقط)">
                <span className="font-mono text-muted-foreground">
                  -₪{totals.foreignChangeILS.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </Row>
            </>
          )}
          {hasUSD && (
            <>
              <Row label="قبض نقدي (دولار)">
                <span className="font-mono text-muted-foreground">{fmtUSD(totals.foreignTenderedUSD)}</span>
              </Row>
              {(totals.foreignChangeUSD || 0) > 0 && (
                <Row label="فكة مدفوعة (دولار)">
                  <span className="font-mono text-muted-foreground">-{fmtUSD(totals.foreignChangeUSD)}</span>
                </Row>
              )}
              {(totals.returnsByCurrency.USD || 0) > 0 && (
                <Row label="مرتجعات نقدية (دولار)">
                  <span className="font-mono text-muted-foreground">-{fmtUSD(totals.returnsByCurrency.USD || 0)}</span>
                </Row>
              )}
              {adjTotals.usdForeign > 0 && (
                <Row label="تعديل يدوي (دولار)">
                  <span className="font-mono text-primary">+{fmtUSD(adjTotals.usdForeign)}</span>
                </Row>
              )}
              <Row label="كاش متوقع (دولار)">
                <span className="font-mono text-foreground">{fmtUSD(expectedUSDAdj)}</span>
              </Row>
              <Row label="كاش فعلي عند الإغلاق (دولار)">
                <span className="font-mono">
                  {actualUSD != null ? fmtUSD(actualUSD) : "—"}
                </span>
              </Row>
              <Row label="فرق الكاش (دولار)">
                <span className={cn("font-mono font-semibold", varColor(varUSD))}>
                  {varUSD != null ? fx(varUSD, fmtUSD) : "—"}
                </span>
              </Row>
            </>
          )}
          {hasJOD && (
            <>
              <Row label="قبض نقدي (دينار)">
                <span className="font-mono text-muted-foreground">{fmtJOD(totals.foreignTenderedJOD)}</span>
              </Row>
              {(totals.foreignChangeJOD || 0) > 0 && (
                <Row label="فكة مدفوعة (دينار)">
                  <span className="font-mono text-muted-foreground">-{fmtJOD(totals.foreignChangeJOD)}</span>
                </Row>
              )}
              {(totals.returnsByCurrency.JOD || 0) > 0 && (
                <Row label="مرتجعات نقدية (دينار)">
                  <span className="font-mono text-muted-foreground">-{fmtJOD(totals.returnsByCurrency.JOD || 0)}</span>
                </Row>
              )}
              {adjTotals.jodForeign > 0 && (
                <Row label="تعديل يدوي (دينار)">
                  <span className="font-mono text-primary">+{fmtJOD(adjTotals.jodForeign)}</span>
                </Row>
              )}
              <Row label="كاش متوقع (دينار)">
                <span className="font-mono text-foreground">{fmtJOD(expectedJODAdj)}</span>
              </Row>
              <Row label="كاش فعلي عند الإغلاق (دينار)">
                <span className="font-mono">
                  {actualJOD != null ? fmtJOD(actualJOD) : "—"}
                </span>
              </Row>
              <Row label="فرق الكاش (دينار)">
                <span className={cn("font-mono font-semibold", varColor(varJOD))}>
                  {varJOD != null ? fx(varJOD, fmtJOD) : "—"}
                </span>
              </Row>
            </>
          )}
          {audit && (hasUSD || hasJOD) && (
            <Row label="إجمالي الفرق (مُحوَّل للشيكل)">
              <span className={cn("font-mono font-semibold", varColor(varTotalILS))}>
                {varTotalILS != null
                  ? `${varTotalILS >= 0 ? "+" : ""}₪${varTotalILS.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : "—"}
              </span>
            </Row>
          )}
        </div>
      </div>

      {/* Manual foreign currency adjustments (accountant-only edit) */}
      <ForeignAdjustmentsSection
        sessionId={session.id}
        adjustments={foreignAdjustments}
        canEdit={canEditAdjustments}
        currentUserId={user?.id ?? null}
        onChanged={reloadForeignAdjustments}
      />

      {/* Section A: Summary (collapsible, closed by default) */}
      <CollapsibleSection title="ملخص الوردية">
        <div className="divide-y divide-border text-[13px]">
          <Row label="رقم الوردية">
            <div className="flex items-center gap-1.5">
              <code className="font-mono text-[12px]">{shortId(session.id)}…</code>
              <button onClick={copyId} className="text-muted-foreground hover:text-foreground">
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </Row>
          <Row label="الكاشير">{session.cashier_name || "—"}</Row>
          <Row label="الفرع">{session.branch_name || "—"}</Row>
          <Row label="نوع الوردية">
            <Badge variant="outline" className="font-normal">
              {kind === "morning" ? "صباحي" : "مسائي"}
            </Badge>
          </Row>
          <Row label="فُتحت">{fmtTime(session.opened_at)}</Row>
          <Row label="أُغلقت">{session.closed_at ? fmtTime(session.closed_at) : "لسا مفتوحة"}</Row>
          <Row label="المدة">{durationLabel}</Row>
          <Row label="كاش افتتاحي">
            <span className="font-mono">₪{(session.opening_cash ?? 0).toLocaleString()}</span>
          </Row>
        </div>
      </CollapsibleSection>

      {/* Section B: Server truth (collapsible, closed by default) */}
      <CollapsibleSection
        title="الفواتير على السيرفر (الحقيقة الكاملة)"
        right={<span className="font-mono text-foreground/70">{orders.length} سجل</span>}
      >
        {loading ? (
          <div className="p-3"><Skeleton className="h-32" /></div>
        ) : (
          <>
            <div className="px-3 py-3 text-[12px] space-y-1 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-foreground font-medium">{totals.paid.length}</span>
                <span className="text-muted-foreground">فاتورة مدفوعة</span>
                <span className="text-muted-foreground">+</span>
                <span className="text-foreground font-medium">{totals.cancelled.length}</span>
                <span className="text-muted-foreground">ملغية</span>
                {totals.voided.length > 0 && (
                  <>
                    <span className="text-muted-foreground">+</span>
                    <span className="text-destructive font-medium">{totals.voided.length}</span>
                    <span className="text-muted-foreground">محذوفة محاسبياً</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>{totals.offlineSynced.length}</span>
                <span>فاتورة offline ترحّلت بنجاح</span>
                {totals.pending.length > 0 && (
                  <>
                    <span>·</span>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>{totals.pending.length} معلقة</span>
                  </>
                )}
              </div>
            </div>

            <div className="max-h-[280px] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/20">
                  <tr>
                    <th className="text-right px-3 py-2 font-medium">رقم</th>
                    <th className="text-right px-3 py-2 font-medium">الوقت</th>
                    <th className="text-left px-3 py-2 font-medium">المبلغ</th>
                    <th className="text-center px-3 py-2 font-medium">أوفلاين</th>
                    <th className="text-center px-3 py-2 font-medium">الحالة</th>
                    <th className="text-center px-3 py-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map(o => (
                    <tr key={o.id} className="hover:bg-muted/30">
                      <td className="px-3 py-1.5 font-mono">{o.order_number || shortId(o.id)}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {format(new Date(o.created_at), "HH:mm")}
                      </td>
                      <td className="px-3 py-1.5 text-left font-mono tabular-nums">
                        ₪{Number(o.total).toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {o.was_offline ? (
                          <span className="text-[10px] text-amber-600">✓</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {o.voided ? (
                          <Badge variant="destructive" className="text-[10px] font-normal">
                            محذوفة
                          </Badge>
                        ) : o.state === "cancelled" ? (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            ملغية
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-emerald-600">{trSyncStatus(o.sync_status) || "مدفوعة"}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => setOpenOrderId(o.id)}
                          title="عرض تفاصيل الفاتورة"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CollapsibleSection>

      {/* Order details dialog */}
      <OrderDetailsDialog
        orderId={openOrderId}
        onClose={() => setOpenOrderId(null)}
        order={openOrderId ? orders.find(o => o.id === openOrderId) || null : null}
      />
      </>
      )}
    </div>
  );
}

// ── Collapsible section (closed by default) ──
function CollapsibleSection({
  title, right, children, defaultOpen = false,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          {title}
        </span>
        {right}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ── Expandable row for payment methods (shows employees / invoices) ──
function ExpandableMethodRow({
  method, count, amount, rows, onOpenOrder,
}: {
  method: string;
  count: number;
  amount: number;
  rows: { orderId: string; orderNumber: string | null; amount: number; note: string | null }[];
  onOpenOrder: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isEmployee = method === "employee_account" || method === "employee";
  return (
    <div className="divide-y divide-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors text-right"
      >
        <span className="text-muted-foreground text-[12px] flex items-center gap-1.5">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          {trMethod(method)} ({count} دفعة)
        </span>
        <span className="font-mono text-foreground">
          ₪{amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </button>
      {open && (
        <div className="bg-muted/10 px-3 py-2">
          <table className="w-full text-[11.5px]">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-right py-1 font-medium w-32">رقم الفاتورة</th>
                <th className="text-right py-1 font-medium">{isEmployee ? "اسم الموظف" : "ملاحظة"}</th>
                <th className="text-left py-1 font-medium w-24">المبلغ</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="py-1 font-mono">{r.orderNumber || shortId(r.orderId)}</td>
                  <td className="py-1 text-foreground">
                    {r.note || <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className="py-1 text-left font-mono tabular-nums">
                    ₪{r.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-1 text-center">
                    <button
                      onClick={() => onOpenOrder(r.orderId)}
                      className="text-muted-foreground hover:text-foreground"
                      title="فتح الفاتورة"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Order details dialog (items + notes) ──
function OrderDetailsDialog({
  orderId, order, onClose,
}: {
  orderId: string | null;
  order: SessionOrder | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<any[]>([]);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    supabase
      .from("pos_order_lines")
      .select("id, product_name, qty, unit, unit_price, discount_amount, tax_amount, total, notes")
      .eq("order_id", orderId)
      .then(({ data }) => {
        setLines(data || []);
        setLoading(false);
      });
  }, [orderId]);

  if (!orderId) return null;
  const linesTotal = lines.reduce((s, l) => s + Number(l.total || 0), 0);

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-right">
            تفاصيل الفاتورة {order?.order_number || ""}
          </DialogTitle>
          <DialogDescription className="text-right">
            {order && (
              <span className="flex flex-wrap gap-3 text-[11px]">
                <span>الوقت: {format(new Date(order.created_at), "dd/MM HH:mm")}</span>
                <span>الإجمالي: ₪{Number(order.total).toLocaleString()}</span>
                <span>الحالة: {order.voided ? "محذوفة" : order.state === "cancelled" ? "ملغية" : "مدفوعة"}</span>
                {order.was_offline && <span className="text-amber-600">أوفلاين</span>}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {order?.order_note && (
          <div className="bg-muted/30 border border-border rounded p-2.5 text-[12px]">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wider">ملاحظة الفاتورة</span>
            <p className="text-foreground mt-0.5">{order.order_note}</p>
          </div>
        )}
        {order?.customer_name && (
          <div className="text-[12px]">
            <span className="text-muted-foreground">الزبون: </span>
            <span className="text-foreground">{order.customer_name}</span>
          </div>
        )}

        <div className="border border-border rounded overflow-hidden">
          <div className="px-3 py-1.5 bg-muted/30 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
            الأصناف ({lines.length})
          </div>
          {loading ? (
            <div className="p-3"><Skeleton className="h-24" /></div>
          ) : lines.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-[12px]">لا توجد أصناف</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-right px-2.5 py-1.5 font-medium">الصنف</th>
                  <th className="text-center px-2 py-1.5 font-medium w-16">الكمية</th>
                  <th className="text-left px-2 py-1.5 font-medium w-20">السعر</th>
                  <th className="text-left px-2 py-1.5 font-medium w-20">المجموع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l: any) => (
                  <tr key={l.id}>
                    <td className="px-2.5 py-1.5">
                      <div>{l.product_name}</div>
                      {l.notes && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">📝 {l.notes}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono">{l.qty}</td>
                    <td className="px-2 py-1.5 text-left font-mono">₪{Number(l.unit_price).toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-left font-mono font-medium">
                      ₪{Number(l.total).toLocaleString()}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/20 font-semibold">
                  <td colSpan={3} className="px-2.5 py-1.5 text-right">المجموع</td>
                  <td className="px-2 py-1.5 text-left font-mono">₪{linesTotal.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-foreground text-[12.5px] font-medium">{label}</span>
      <span className="text-foreground font-semibold">{children}</span>
    </div>
  );
}

// ── Manual foreign currency adjustments (accountant tool) ──
function ForeignAdjustmentsSection({
  sessionId, adjustments, canEdit, currentUserId, onChanged,
}: {
  sessionId: string;
  adjustments: ForeignAdjustmentRow[];
  canEdit: boolean;
  currentUserId: string | null;
  onChanged: () => void | Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [currency, setCurrency] = useState<"JOD" | "USD">("JOD");
  const [amountStr, setAmountStr] = useState("");
  const [rateStr, setRateStr] = useState("4.2");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const amount = Number(amountStr) || 0;
  const rate = Number(rateStr) || 0;
  const ilsPreview = amount * rate;

  const reset = () => {
    setAmountStr(""); setReason(""); setShowForm(false);
  };

  const save = async () => {
    if (!(amount > 0)) { toast.error("أدخل مبلغاً موجباً"); return; }
    if (!(rate > 0)) { toast.error("سعر صرف غير صحيح"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("pos_shift_foreign_adjustments" as any)
      .insert({
        session_id: sessionId,
        user_id: currentUserId,
        currency,
        foreign_amount: amount,
        exchange_rate: rate,
        reason: reason.trim() || null,
        created_by: currentUserId,
      });
    setSaving(false);
    if (error) {
      toast.error("تعذّر حفظ التعديل: " + error.message);
      return;
    }
    toast.success("تمّت إضافة التعديل");
    reset();
    await onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذا التعديل؟")) return;
    const { error } = await supabase
      .from("pos_shift_foreign_adjustments" as any)
      .delete()
      .eq("id", id);
    if (error) { toast.error("تعذّر الحذف: " + error.message); return; }
    toast.success("تم الحذف");
    await onChanged();
  };

  if (!canEdit && adjustments.length === 0) return null;

  return (
    <div className="border border-border rounded">
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border flex items-center justify-between">
        <span>تعديلات يدوية للعملات الأجنبية</span>
        {canEdit && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline normal-case"
          >
            <Plus className="w-3 h-3" /> إضافة تعديل
          </button>
        )}
      </div>

      {adjustments.length === 0 && !showForm && (
        <div className="px-3 py-3 text-[12px] text-muted-foreground">
          {canEdit
            ? "لا يوجد تعديلات — استخدم الزر أعلاه لتصحيح مبالغ سُجّلت بالشيكل بينما استُلمت فعلياً بعملة أجنبية."
            : "لا يوجد تعديلات."}
        </div>
      )}

      {adjustments.length > 0 && (
        <div className="divide-y divide-border text-[12.5px]">
          {adjustments.map((a) => (
            <div key={a.id} className="px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-foreground">
                  {a.currency === "JOD"
                    ? `${a.foreign_amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} د.أ`
                    : `$${a.foreign_amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                  <span className="text-muted-foreground mx-1.5">×</span>
                  <span className="text-muted-foreground">{a.exchange_rate}</span>
                  <span className="text-muted-foreground mx-1.5">=</span>
                  <span className="text-primary">₪{Number(a.ils_equivalent).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
                {a.reason && (
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{a.reason}</div>
                )}
              </div>
              {canEdit && (
                <button
                  onClick={() => remove(a.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="حذف"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && showForm && (
        <div className="border-t border-border p-3 space-y-2 bg-muted/10">
          <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr_1fr] gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">العملة</label>
              <Select value={currency} onValueChange={(v) => {
                setCurrency(v as "JOD" | "USD");
                setRateStr(v === "JOD" ? "4.2" : "3.7");
              }}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="JOD">دينار (JOD)</SelectItem>
                  <SelectItem value="USD">دولار (USD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">المبلغ الأجنبي</label>
              <Input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="h-8 text-[12px]"
                placeholder={currency === "JOD" ? "مثال: 40" : "مثال: 10"}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">سعر الصرف (شيكل / وحدة)</label>
              <Input
                type="number" inputMode="decimal" step="0.0001" min="0"
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value)}
                className="h-8 text-[12px]"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">السبب (اختياري)</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              className="h-8 text-[12px]"
              placeholder="مثال: قبض 40 دينار من الزبون سُجّل بالشيكل خطأً"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="text-[12px] text-muted-foreground">
              المكافئ بالشيكل:{" "}
              <span className="font-mono text-primary">
                ₪{ilsPreview.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={reset} disabled={saving}>إلغاء</Button>
              <Button size="sm" onClick={save} disabled={saving || !(amount > 0) || !(rate > 0)}>
                {saving ? "جاري الحفظ…" : "حفظ التعديل"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}