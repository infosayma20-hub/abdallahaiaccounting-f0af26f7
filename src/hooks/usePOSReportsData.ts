import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, format, getDay, getHours } from "date-fns";
import { fetchAllRows } from "@/lib/fetch-all-rows";

export type DatePreset = "today" | "yesterday" | "week" | "month" | "custom";

export interface POSOrder {
  id: string;
  created_at: string;
  total: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  state: string;
  is_return: boolean;
  return_reason: string | null;
  session_id: string;
  customer_id: string | null;
  customer_name: string | null;
  order_number: string | null;
  transaction_id?: string | null;
  linked_transaction_id?: string | null;
  /**
   * Delivery fee collected on behalf of a 3rd-party delivery company.
   * Money is owed to the driver, NOT restaurant revenue.
   * - New orders: `total` is already items-only (`total_includes_delivery_fee=false`).
   * - Legacy orders: `total` bundles the fee (`total_includes_delivery_fee=true`).
   * Always use `netSalesOf(o)` below to read restaurant-only revenue safely.
   */
  delivery_fee?: number | null;
  total_includes_delivery_fee?: boolean | null;
}

/** Restaurant-only portion of an order's total (handles legacy + new). */
export const netSalesOf = (o: { total: number; delivery_fee?: number | null; total_includes_delivery_fee?: boolean | null }) => {
  const t = Number(o.total) || 0;
  if (o.total_includes_delivery_fee) return Math.max(0, t - (Number(o.delivery_fee) || 0));
  return t;
};

export interface POSOrderLine {
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
  tax_amount: number;
}

export interface POSPayment {
  id: string;
  order_id: string;
  payment_method: string;
  amount: number;
  created_at: string;
}

export interface POSSession {
  id: string;
  cashier_name: string | null;
  cashier_pos_user_id: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  cash_variance: number | null;
  total_sales: number;
  total_orders: number;
  total_returns: number;
  terminal_id: string;
  state: string;
  branch_id?: string | null;
  branch_name?: string | null;
}

export interface ProductInfo {
  id: string;
  name: string;
  buy_price: number;
  sell_price: number;
  quantity: number;
  min_quantity: number;
  category: string;
  pos_category_id: string | null;
}

export interface BranchOption {
  id: string;
  name: string;
}

/**
 * Tabs that ONLY need session data (fast: ~hundreds of rows).
 * On these tabs we skip the heavy fetches (orders/lines/payments/products)
 * that dominate load time for high-volume tenants (Malaki: 65k+ rows/month).
 *
 * IMPORTANT: default is "sales" so any legacy caller without the arg keeps
 * the exact previous behavior (full fetch). No breakage.
 */
const LIGHT_TABS = new Set(["shift-audit", "shifts", "customers", "delivery-apps"]);

/**
 * Tabs that should never download all POS orders to the browser. They are
 * rendered from a compact server-side summary instead (tens of rows, not
 * 37k+ orders / 68k+ lines for a monthly Malaki report).
 */
const SUMMARY_TABS = new Set(["sales", "payments", "cashier", "peak", "profit", "products", "inventory"]);

/**
 * Tabs rendered from the server-side products aggregate
 * (`get_pos_products_report`) instead of downloading 68k+ order lines.
 */
const PRODUCT_SUMMARY_TABS = new Set(["products", "inventory"]);

/**
 * Tabs that genuinely need the raw order LINES (68k+ rows/month on Malaki).
 * Every other tab gets its COGS from the server-side aggregate RPC
 * `get_pos_cogs_by_session`, which returns a few hundred rows instead.
 */
const LINE_TABS = new Set(["returns"]);
/** Tabs that need raw payment rows (37k+/month). */
const PAYMENT_TABS = new Set(["payments"]);

const PERIOD_KEY = "amwali:pos-reports:period";

const VALID_PRESETS = new Set(["today", "yesterday", "week", "month", "custom"]);

function readPersistedPreset(): DatePreset {
  try {
    const raw = sessionStorage.getItem(`${PERIOD_KEY}:preset`);
    if (raw && VALID_PRESETS.has(raw)) return raw as DatePreset;
  } catch { /* ignore */ }
  return "today";
}

function readPersistedDate(sub: string, fallback: Date): Date {
  try {
    const raw = sessionStorage.getItem(`${PERIOD_KEY}:${sub}`);
    if (raw) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d;
    }
  } catch { /* ignore */ }
  return fallback;
}

export function usePOSReportsData(
  branchId: string | null = null,
  activeTab: string = "sales",
) {
  // Recompute per render — cheap, avoids stale gating when tab changes.
  const isLightTab = LIGHT_TABS.has(activeTab);
  const usesServerSummary = SUMMARY_TABS.has(activeTab);
  const usesProductsSummary = PRODUCT_SUMMARY_TABS.has(activeTab);
  const needsRawOrders = !isLightTab && !usesServerSummary;
  const needsLines = needsRawOrders && LINE_TABS.has(activeTab);
  const needsPayments = needsRawOrders && PAYMENT_TABS.has(activeTab);
  const { user } = useAuth();
  // Default to "today" — the previous "month" default forced a full-month
  // scan of pos_orders/pos_order_lines/pos_payments on every entry, which
  // is prohibitively slow for high-volume tenants (Malaki: 1500+ orders/day).
  // Users can still one-click "هذا الشهر" from the preset row.
  // Period selection is persisted for the browser session so that navigating
  // to another tab and back does not silently reset the report to "today".
  const [preset, setPreset] = useState<DatePreset>(() => readPersistedPreset());
  const [customFrom, setCustomFrom] = useState<Date>(() => readPersistedDate("customFrom", startOfMonth(new Date())));
  const [customTo, setCustomTo] = useState<Date>(() => readPersistedDate("customTo", new Date()));

  useEffect(() => {
    try { sessionStorage.setItem(`${PERIOD_KEY}:preset`, preset); } catch { /* ignore */ }
  }, [preset]);
  useEffect(() => {
    try { sessionStorage.setItem(`${PERIOD_KEY}:customFrom`, customFrom.toISOString()); } catch { /* ignore */ }
  }, [customFrom]);
  useEffect(() => {
    try { sessionStorage.setItem(`${PERIOD_KEY}:customTo`, customTo.toISOString()); } catch { /* ignore */ }
  }, [customTo]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);

  const [orders, setOrders] = useState<POSOrder[]>([]);
  const [orderLines, setOrderLines] = useState<POSOrderLine[]>([]);
  const [payments, setPayments] = useState<POSPayment[]>([]);
  const [sessions, setSessions] = useState<POSSession[]>([]);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const loadSeqRef = useRef(0);
  // COGS aggregated per session, used when raw lines are not loaded.
  const [cogsBySession, setCogsBySession] = useState<Map<string, number>>(new Map());
  const [summaryKpis, setSummaryKpis] = useState<{
    total_sales: number;
    total_returns: number;
    delivery_collected: number;
    customer_collected: number;
    total_orders: number;
    total_discounts: number;
    total_cogs: number;
  } | null>(null);
  const [summaryDailySales, setSummaryDailySales] = useState<Array<{ date: string; orders: number; sales: number; returns: number; net: number }>>([]);
  const [summaryPayments, setSummaryPayments] = useState<Array<{ method: string; amount: number }>>([]);
  const [summaryCashiers, setSummaryCashiers] = useState<Array<{
    name: string;
    shifts: number;
    orders: number;
    sales: number;
    avgOrder: number;
    variance: number;
    discounts: number;
    returns: number;
  }>>([]);
  const [summaryPeakHours, setSummaryPeakHours] = useState<Record<string, number>>({});
  const [summaryProducts, setSummaryProducts] = useState<Array<{
    name: string;
    productId: string | null;
    qty: number;
    revenue: number;
    cost: number;
    marginPct: number | null;
    currentStock: number;
    minQuantity: number;
    buyPrice: number;
  }>>([]);

  // Resolve team owner for multi-tenant access
  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_team_owner_id", { _user_id: user.id }).then(({ data }) => {
      setDataOwnerId(data || user.id);
    });
  }, [user]);

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case "today":
        return { dateFrom: startOfDay(now), dateTo: endOfDay(now) };
      case "yesterday":
        return { dateFrom: startOfDay(subDays(now, 1)), dateTo: endOfDay(subDays(now, 1)) };
      case "week":
        return { dateFrom: startOfWeek(now, { weekStartsOn: 0 }), dateTo: endOfDay(now) };
      case "month":
        return { dateFrom: startOfMonth(now), dateTo: endOfDay(now) };
      case "custom":
        return { dateFrom: startOfDay(customFrom), dateTo: endOfDay(customTo) };
    }
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    if (!user || !dataOwnerId) return;
    // Abort the previous run when the tab / period / branch changes. Without
    // this, stale page requests keep occupying the global in-flight slots of
    // fetchAllRows and the fresh load appears to hang forever (blank screen,
    // empty branch list).
    const ac = new AbortController();
    const loadSeq = ++loadSeqRef.current;
    const isCurrentLoad = () => !ac.signal.aborted && loadSeqRef.current === loadSeq;
    const fetchAll = async () => {
      setLoading(true);
      try {
      const from = dateFrom.toISOString();
      const to = dateTo.toISOString();
      // Widen the created_at window forward by 12h for child tables so that
      // late-night order lines/payments belonging to the same business day
      // aren't dropped. The orders query itself uses business_date, and the
      // client-side joins by order_id filter out anything not in scope.
      const toBuffered = new Date(dateTo.getTime() + 12 * 60 * 60 * 1000).toISOString();
      // POS uses a business-day cutoff (e.g. 6 AM). Filtering purely on
      // created_at drops late-night orders that belong to the previous
      // business day, so we prefer business_date when it is populated and
      // fall back to created_at only for legacy rows without a business_date.
      const fromDay = format(dateFrom, "yyyy-MM-dd");
      const toDay = format(dateTo, "yyyy-MM-dd");
      const businessDayOr =
        `and(business_date.gte.${fromDay},business_date.lte.${toDay}),` +
        `and(business_date.is.null,created_at.gte.${from},created_at.lte.${to})`;

      // NOTE: PostgREST caps single requests at 1000 rows. High-volume tenants
      // (e.g. Malaki with 1500+ orders/day) MUST paginate — otherwise KPIs
      // silently under-report. Use fetchAllRows for every list that can exceed
      // 1000 rows on a busy day.
      // Sessions + branches are ALWAYS fetched (lightweight, needed by every
      // tab). Orders/lines/payments/products are gated by `isLightTab` — on
      // shift-audit / shifts / customers we skip 65k+ rows entirely.
      const summaryPromise = usesServerSummary
        ? (supabase.rpc as any)("get_pos_reports_summary", {
            p_from: fromDay,
            p_to: toDay,
            p_branch: branchId,
          }).abortSignal(ac.signal)
        : Promise.resolve({ data: null, error: null });

      const productsSummaryPromise = usesProductsSummary
        ? (supabase.rpc as any)("get_pos_products_report", {
            p_from: fromDay,
            p_to: toDay,
            p_branch: branchId,
          }).abortSignal(ac.signal)
        : Promise.resolve({ data: null, error: null });

      const heavyPromises = !needsRawOrders
        ? [
            Promise.resolve([]),
            Promise.resolve([]),
            Promise.resolve([]),
            Promise.resolve({ data: [] }),
          ]
        : [
          fetchAllRows<any>((f, t) =>
          supabase
            .from("pos_orders")
            .select("id, created_at, business_date, total, subtotal, discount_amount, tax_amount, state, is_return, return_reason, session_id, customer_id, customer_name, order_number, delivery_fee, total_includes_delivery_fee, transaction_id, linked_transaction_id")
            .eq("user_id", dataOwnerId)
            .or(businessDayOr)
            .order("created_at", { ascending: false })
            .abortSignal(ac.signal)
            .range(f, t),
        ),
        needsLines ? fetchAllRows<any>((f, t) =>
          supabase
            .from("pos_order_lines")
            .select("id, order_id, product_id, product_name, qty, unit_price, cost_price, subtotal, total, discount_amount, tax_amount")
            .eq("user_id", dataOwnerId)
            .gte("created_at", from)
            .lte("created_at", toBuffered)
            .abortSignal(ac.signal)
            .range(f, t),
        ) : Promise.resolve([]),
        needsPayments ? fetchAllRows<any>((f, t) =>
          supabase
            .from("pos_payments")
            .select("id, order_id, payment_method, amount, created_at")
            .eq("user_id", dataOwnerId)
            .gte("created_at", from)
            .lte("created_at", toBuffered)
            .abortSignal(ac.signal)
            .range(f, t),
        ) : Promise.resolve([]),
          needsLines ? supabase
            .from("products")
            .select("id, name, buy_price, sell_price, quantity, min_quantity, category, pos_category_id, profit_margin_percent")
            .eq("user_id", dataOwnerId) : Promise.resolve({ data: [] }),
        ];

      const [ordersData, linesData, paymentsData, sessionsData, productsRes, branchesRes, summaryRes, productsSummaryRes] = await Promise.all([
        heavyPromises[0] as Promise<any[]>,
        heavyPromises[1] as Promise<any[]>,
        heavyPromises[2] as Promise<any[]>,
        fetchAllRows<any>((f, t) =>
          supabase
            .from("pos_sessions")
            .select("id, cashier_name, cashier_pos_user_id, opened_at, closed_at, opening_cash, closing_cash, expected_cash, cash_variance, total_sales, total_orders, total_returns, terminal_id, state, branch_id")
            .eq("user_id", dataOwnerId)
            .eq("is_deleted", false)
            .gte("opened_at", from)
            .lte("opened_at", to)
            .order("opened_at", { ascending: false })
            .abortSignal(ac.signal)
            .range(f, t),
        ),
        heavyPromises[3] as Promise<any>,
        supabase
          .from("branches")
          .select("id, name")
          .eq("user_id", dataOwnerId)
          .order("name", { ascending: true })
          .abortSignal(ac.signal),
        summaryPromise,
        productsSummaryPromise,
      ]);
      if ((summaryRes as any)?.error) throw (summaryRes as any).error;
      if ((productsSummaryRes as any)?.error) throw (productsSummaryRes as any).error;
      if (!isCurrentLoad()) return;
      const productsSummaryPayload = ((productsSummaryRes as any)?.data || null) as any[] | null;
      setSummaryProducts(
        usesProductsSummary && Array.isArray(productsSummaryPayload)
          ? productsSummaryPayload.map((p: any) => ({
              name: String(p.name || "غير محدد"),
              productId: p.productId ?? null,
              qty: Number(p.qty) || 0,
              revenue: Number(p.revenue) || 0,
              cost: Number(p.cost) || 0,
              marginPct: p.marginPct != null ? Number(p.marginPct) : null,
              currentStock: Number(p.currentStock) || 0,
              minQuantity: Number(p.minQuantity) || 0,
              buyPrice: Number(p.buyPrice) || 0,
            }))
          : [],
      );
      const ordersRes = { data: ordersData } as any;
      const linesRes = { data: linesData } as any;
      const paymentsRes = { data: paymentsData } as any;
      const sessionsRes = { data: sessionsData } as any;

      // Resolve terminal -> branch mapping so sessions/orders can be filtered by branch.
      const rawSessions = (sessionsRes.data || []) as POSSession[];
      const allBranches = ((branchesRes as any).data || []).map((b: any) => ({ id: b.id, name: b.name })) as BranchOption[];
      const terminalIds = Array.from(new Set(rawSessions.filter(s => !s.branch_id).map(s => s.terminal_id).filter(Boolean)));
      let terminalBranchMap = new Map<string, string>();
      let branchNameMap = new Map<string, string>(allBranches.map(b => [b.id, b.name]));
      if (terminalIds.length > 0) {
        const { data: terms } = await supabase
          .from("pos_terminals")
          .select("id, branch_id")
          .in("id", terminalIds)
          .abortSignal(ac.signal);
        if (!isCurrentLoad()) return;
        (terms || []).forEach((t: any) => {
          if (t.branch_id) terminalBranchMap.set(t.id, t.branch_id);
        });
        const branchIds = Array.from(new Set(Array.from(terminalBranchMap.values())));
        if (branchIds.length > 0) {
          const { data: brs } = await supabase
            .from("branches")
            .select("id, name")
            .in("id", branchIds)
            .abortSignal(ac.signal);
          if (!isCurrentLoad()) return;
          (brs || []).forEach((b: any) => branchNameMap.set(b.id, b.name));
        }
      }
      setBranches(allBranches);

      // Enrich sessions with branch info
      const enrichedSessions = rawSessions.map(s => {
        const bid = s.branch_id || terminalBranchMap.get(s.terminal_id) || null;
        return { ...s, branch_id: bid, branch_name: bid ? branchNameMap.get(bid) || null : null };
      });

      // Exclude call-center cashier sessions — they are not real POS shifts
      // and shouldn't appear in shift-audit / cashier reports.
      const cashierPosIds = Array.from(
        new Set(enrichedSessions.map(s => s.cashier_pos_user_id).filter(Boolean)),
      ) as string[];
      let callCenterCashierIds = new Set<string>();
      if (cashierPosIds.length > 0) {
        const { data: posUsers } = await supabase
          .from("pos_users")
          .select("id, is_call_center")
          .in("id", cashierPosIds)
          .eq("is_call_center", true)
          .abortSignal(ac.signal);
        if (!isCurrentLoad()) return;
        (posUsers || []).forEach((u: any) => callCenterCashierIds.add(u.id));
      }
      const nonCallCenterSessions = enrichedSessions.filter(
        s => !s.cashier_pos_user_id || !callCenterCashierIds.has(s.cashier_pos_user_id),
      );

      // Apply branch filter to sessions, then derive a session_id whitelist to filter orders too.
      const filteredSessions = branchId
        ? nonCallCenterSessions.filter(s => s.branch_id === branchId)
        : nonCallCenterSessions;
      const allowedSessionIds = branchId
        ? new Set(filteredSessions.map(s => s.id))
        : null;

      // Exclude orders whose linked accounting transaction was soft-deleted (voided duplicates)
      const rawOrders = (ordersRes.data || []) as POSOrder[];
      let voidedTxIds = new Set<string>();
      if (rawOrders.length > 0) {
        // Voided (soft-deleted) transactions are RARE (a few hundred per tenant
        // in total), while orders can be tens of thousands per month. Fetching
        // the small deleted-set once beats chunking 70k order tx-ids into
        // ~140 `.in()` requests, which used to dominate load time.
        const voidedRows = await fetchAllRows<any>((f, t) =>
          supabase
            .from("transactions")
            .select("id")
            .eq("user_id", dataOwnerId)
            .eq("is_deleted", true)
            .abortSignal(ac.signal)
            .range(f, t),
        );
        if (!isCurrentLoad()) return;
        voidedRows.forEach((t: any) => voidedTxIds.add(t.id));
      }
      const cleanOrders = rawOrders
        .filter(o => {
          const ids = [o.transaction_id, o.linked_transaction_id].filter(Boolean) as string[];
          return ids.length === 0 || ids.every(id => !voidedTxIds.has(id));
        })
        .filter(o => !allowedSessionIds || allowedSessionIds.has(o.session_id));
      setOrders(cleanOrders);
      setOrderLines((linesRes.data || []) as POSOrderLine[]);
      setPayments((paymentsRes.data || []) as POSPayment[]);
      setSessions(filteredSessions);
      setProducts((productsRes.data || []) as ProductInfo[]);

      const summaryPayload = ((summaryRes as any)?.data || null) as any;
      if (usesServerSummary && summaryPayload) {
        const k = summaryPayload.kpis || {};
        setSummaryKpis({
          total_sales: Number(k.total_sales) || 0,
          total_returns: Number(k.total_returns) || 0,
          delivery_collected: Number(k.delivery_collected) || 0,
          customer_collected: Number(k.customer_collected) || 0,
          total_orders: Number(k.total_orders) || 0,
          total_discounts: Number(k.total_discounts) || 0,
          total_cogs: Number(k.total_cogs) || 0,
        });
        setSummaryDailySales(((summaryPayload.daily || []) as any[]).map(d => ({
          date: String(d.date),
          orders: Number(d.orders) || 0,
          sales: Number(d.sales) || 0,
          returns: Number(d.returns) || 0,
          net: Number(d.net) || 0,
        })));
        setSummaryPayments(((summaryPayload.payments || []) as any[]).map(p => ({
          method: String(p.method || "نقدي"),
          amount: Number(p.amount) || 0,
        })));
        setSummaryCashiers(((summaryPayload.cashier || []) as any[]).map(c => ({
          name: String(c.name || "غير محدد"),
          shifts: Number(c.shifts) || 0,
          orders: Number(c.orders) || 0,
          sales: Number(c.sales) || 0,
          avgOrder: Number(c.avg_order) || 0,
          variance: Number(c.variance) || 0,
          discounts: Number(c.discounts) || 0,
          returns: Number(c.returns) || 0,
        })));
        const peakMap: Record<string, number> = {};
        ((summaryPayload.peak || []) as any[]).forEach(p => {
          peakMap[`${Number(p.day) || 0}-${Number(p.hour) || 0}`] = Number(p.sales) || 0;
        });
        setSummaryPeakHours(peakMap);
      } else {
        setSummaryKpis(null);
        setSummaryDailySales([]);
        setSummaryPayments([]);
        setSummaryCashiers([]);
        setSummaryPeakHours({});
      }

      // When raw lines are skipped, get an exact COGS aggregate from the server
      // (grouped per session so the branch filter stays accurate).
      if (needsRawOrders && !needsLines) {
        const { data: cogsRows } = await (supabase.rpc as any)("get_pos_cogs_by_session", {
          _owner: dataOwnerId,
          _from: fromDay,
          _to: toDay,
          _from_ts: from,
          _to_ts: to,
        }).abortSignal(ac.signal);
        if (!isCurrentLoad()) return;
        const m = new Map<string, number>();
        (cogsRows || []).forEach((r: any) => m.set(r.session_id, Number(r.cogs) || 0));
        setCogsBySession(m);
      } else {
        setCogsBySession(new Map());
      }
      setLoading(false);
      } catch (e: any) {
        if (ac.signal.aborted || e?.name === "AbortError" || e?.code === "20") return;
        console.error("[POSReports] load failed", e);
        setLoading(false);
      }
    };
    fetchAll();
    return () => ac.abort();
  }, [user, dataOwnerId, dateFrom, dateTo, refreshKey, branchId, isLightTab, needsRawOrders, needsLines, needsPayments, usesServerSummary]);

  const refetch = () => setRefreshKey(k => k + 1);

  // Computed KPIs
  const paidOrders = useMemo(() => orders.filter(o => o.state === "paid" && !o.is_return), [orders]);
  const returnOrders = useMemo(() => orders.filter(o => o.is_return && o.state !== "cancelled"), [orders]);

  // Restaurant sales = customer total − delivery fee. Delivery is money the
  // restaurant collects on behalf of the delivery company, NOT its own revenue.
  const rawTotalSales = useMemo(
    () => paidOrders.reduce((s, o) => s + netSalesOf(o), 0),
    [paidOrders],
  );
  const rawTotalReturns = useMemo(
    () => returnOrders.reduce((s, o) => s + netSalesOf(o), 0),
    [returnOrders],
  );
  const totalSales = summaryKpis ? summaryKpis.total_sales : rawTotalSales;
  const totalReturns = summaryKpis ? summaryKpis.total_returns : rawTotalReturns;
  // Separate "money collected from customers for delivery" KPI so the UI can
  // surface it without polluting sales numbers.
  const rawDeliveryCollected = useMemo(
    () => paidOrders.reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0),
    [paidOrders],
  );
  const rawCustomerCollected = useMemo(
    () => paidOrders.reduce((s, o) => s + (Number(o.total) || 0), 0),
    [paidOrders],
  );
  const deliveryCollected = summaryKpis ? summaryKpis.delivery_collected : rawDeliveryCollected;
  const customerCollected = summaryKpis ? summaryKpis.customer_collected : rawCustomerCollected;
  const netSales = totalSales - totalReturns;
  const totalOrders = summaryKpis ? summaryKpis.total_orders : paidOrders.length;
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  const totalDiscounts = summaryKpis
    ? summaryKpis.total_discounts
    : paidOrders.reduce((s, o) => s + o.discount_amount, 0);

  // COGS from order lines of paid orders
  const paidOrderIds = useMemo(() => new Set(paidOrders.map(o => o.id)), [paidOrders]);
  const paidLines = useMemo(() => orderLines.filter(l => paidOrderIds.has(l.order_id)), [orderLines, paidOrderIds]);
  const totalCOGS = useMemo(() => {
    if (summaryKpis) return summaryKpis.total_cogs;
    if (orderLines.length > 0) return paidLines.reduce((s, l) => s + l.cost_price * l.qty, 0);
    if (cogsBySession.size === 0) return 0;
    // No branch filter → sum everything the server returned for the period.
    if (!branchId) {
      let all = 0;
      cogsBySession.forEach(v => { all += v; });
      return all;
    }
    // Branch filter → count only the sessions of that branch.
    const allowed = new Set(sessions.map(s => s.id));
    let sum = 0;
    cogsBySession.forEach((v, sid) => { if (allowed.has(sid)) sum += v; });
    return sum;
  }, [summaryKpis, paidLines, orderLines, cogsBySession, sessions, branchId]);
  const grossProfit = totalSales - totalCOGS;
  const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

  // Daily breakdown — sales here also exclude delivery_fee for the same reason.
  const dailySales = useMemo(() => {
    if (summaryDailySales.length > 0) return summaryDailySales;
    const map: Record<string, { date: string; orders: number; sales: number; returns: number; net: number }> = {};
    paidOrders.forEach(o => {
      const d = format(new Date(o.created_at), "yyyy-MM-dd");
      if (!map[d]) map[d] = { date: d, orders: 0, sales: 0, returns: 0, net: 0 };
      map[d].orders++;
      const net = netSalesOf(o);
      map[d].sales += net;
      map[d].net += net;
    });
    returnOrders.forEach(o => {
      const d = format(new Date(o.created_at), "yyyy-MM-dd");
      if (!map[d]) map[d] = { date: d, orders: 0, sales: 0, returns: 0, net: 0 };
      const net = netSalesOf(o);
      map[d].returns += net;
      map[d].net -= net;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [summaryDailySales, paidOrders, returnOrders]);

  // Top products
  const topProducts = useMemo(() => {
    const marginById = new Map(
      products.map((p: any) => [p.id, p.profit_margin_percent != null ? Number(p.profit_margin_percent) : null]),
    );
    const marginByName = new Map(
      products
        .filter((p: any) => p.profit_margin_percent != null)
        .map((p: any) => [String(p.name).trim(), Number(p.profit_margin_percent)]),
    );
    const map: Record<string, { name: string; qty: number; revenue: number; cost: number; productId: string | null; marginPct: number | null }> = {};
    paidLines.forEach(l => {
      const key = l.product_name;
      if (!map[key]) {
        const pct = (l.product_id && marginById.get(l.product_id)) ?? marginByName.get(String(key).trim()) ?? null;
        map[key] = { name: key, qty: 0, revenue: 0, cost: 0, productId: l.product_id, marginPct: pct };
      }
      map[key].qty += l.qty;
      map[key].revenue += l.total;
      map[key].cost += l.cost_price * l.qty;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [paidLines, products]);

  // Payment methods breakdown
  const paymentBreakdown = useMemo(() => {
    if (summaryPayments.length > 0) return summaryPayments;
    const map: Record<string, number> = {};
    // Only include payments for paid orders
    payments.filter(p => paidOrderIds.has(p.order_id)).forEach(p => {
      const method = p.payment_method || "نقدي";
      map[method] = (map[method] || 0) + p.amount;
    });
    return Object.entries(map).map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount);
  }, [summaryPayments, payments, paidOrderIds]);

  // Cashier performance
  const cashierPerformance = useMemo(() => {
    if (summaryCashiers.length > 0) return summaryCashiers;
    const sessionMap: Record<string, POSSession[]> = {};
    sessions.forEach(s => {
      const key = s.cashier_name || "غير محدد";
      if (!sessionMap[key]) sessionMap[key] = [];
      sessionMap[key].push(s);
    });

    return Object.entries(sessionMap).map(([name, sess]) => {
      const sessionIds = new Set(sess.map(s => s.id));
      const cashierOrders = paidOrders.filter(o => sessionIds.has(o.session_id));
      const cashierReturns = returnOrders.filter(o => sessionIds.has(o.session_id));
      const sales = cashierOrders.reduce((s, o) => s + netSalesOf(o), 0);
      const discounts = cashierOrders.reduce((s, o) => s + o.discount_amount, 0);
      const variance = sess.reduce((s, se) => s + (se.cash_variance || 0), 0);

      return {
        name,
        shifts: sess.length,
        orders: cashierOrders.length,
        sales,
        avgOrder: cashierOrders.length > 0 ? sales / cashierOrders.length : 0,
        variance,
        discounts,
        returns: cashierReturns.length,
      };
    }).sort((a, b) => b.sales - a.sales);
  }, [summaryCashiers, sessions, paidOrders, returnOrders]);

  // Peak hours heatmap
  const peakHoursData = useMemo(() => {
    if (Object.keys(summaryPeakHours).length > 0) return summaryPeakHours;
    const heatmap: Record<string, number> = {};
    paidOrders.forEach(o => {
      const d = new Date(o.created_at);
      const day = getDay(d); // 0=Sun
      const hour = getHours(d);
      const key = `${day}-${hour}`;
      heatmap[key] = (heatmap[key] || 0) + netSalesOf(o);
    });
    return heatmap;
  }, [summaryPeakHours, paidOrders]);

  // Inventory + sales cross-reference
  const inventoryReport = useMemo(() => {
    const productMap = new Map(products.map(p => [p.id, p]));
    return topProducts.map(tp => {
      const product = tp.productId ? productMap.get(tp.productId) : null;
      return {
        ...tp,
        currentStock: product?.quantity ?? 0,
        minQuantity: product?.min_quantity ?? 0,
        buyPrice: product?.buy_price ?? 0,
        profit: tp.revenue - tp.cost,
        lowStock: product ? product.quantity <= product.min_quantity : false,
      };
    });
  }, [topProducts, products]);

  return {
    preset, setPreset,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    dateFrom, dateTo,
    loading,
    dataOwnerId,
    isLightTab,
    orders, paidOrders, returnOrders, orderLines, paidLines, payments, sessions, products,
    branches,
    totalSales, totalReturns, netSales, totalOrders, avgOrderValue,
    deliveryCollected, customerCollected,
    totalCOGS, grossProfit, grossMargin, totalDiscounts,
    dailySales, topProducts, paymentBreakdown, cashierPerformance, peakHoursData, inventoryReport,
    refetch,
  };
}
