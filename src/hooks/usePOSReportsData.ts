import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, format, getDay, getHours } from "date-fns";

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
  /**
   * Delivery fee collected on behalf of a 3rd-party delivery company.
   * It IS included in `total` (so customer-facing totals stay accurate),
   * but it must be SUBTRACTED from any "restaurant sales" KPI — the money
   * is owed to the delivery company, not the restaurant.
   */
  delivery_fee?: number | null;
}

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

export function usePOSReportsData() {
  const { user } = useAuth();
  const [preset, setPreset] = useState<DatePreset>("month");
  const [customFrom, setCustomFrom] = useState<Date>(startOfMonth(new Date()));
  const [customTo, setCustomTo] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);

  const [orders, setOrders] = useState<POSOrder[]>([]);
  const [orderLines, setOrderLines] = useState<POSOrderLine[]>([]);
  const [payments, setPayments] = useState<POSPayment[]>([]);
  const [sessions, setSessions] = useState<POSSession[]>([]);
  const [products, setProducts] = useState<ProductInfo[]>([]);

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
    const fetchAll = async () => {
      setLoading(true);
      const from = dateFrom.toISOString();
      const to = dateTo.toISOString();

      const [ordersRes, linesRes, paymentsRes, sessionsRes, productsRes] = await Promise.all([
        supabase
          .from("pos_orders")
          .select("id, created_at, total, subtotal, discount_amount, tax_amount, state, is_return, return_reason, session_id, customer_id, customer_name, order_number, delivery_fee")
          .eq("user_id", dataOwnerId)
          .gte("created_at", from)
          .lte("created_at", to)
          .order("created_at", { ascending: false }),
        supabase
          .from("pos_order_lines")
          .select("id, order_id, product_id, product_name, qty, unit_price, cost_price, subtotal, total, discount_amount, tax_amount")
          .eq("user_id", dataOwnerId)
          .gte("created_at", from)
          .lte("created_at", to),
        supabase
          .from("pos_payments")
          .select("id, order_id, payment_method, amount, created_at")
          .eq("user_id", dataOwnerId)
          .gte("created_at", from)
          .lte("created_at", to),
        supabase
          .from("pos_sessions")
          .select("id, cashier_name, cashier_pos_user_id, opened_at, closed_at, opening_cash, closing_cash, expected_cash, cash_variance, total_sales, total_orders, total_returns, terminal_id, state")
          .eq("user_id", dataOwnerId)
          .eq("is_deleted", false)
          .gte("opened_at", from)
          .lte("opened_at", to)
          .order("opened_at", { ascending: false }),
        supabase
          .from("products")
          .select("id, name, buy_price, sell_price, quantity, min_quantity, category, pos_category_id")
          .eq("user_id", dataOwnerId),
      ]);

      setOrders((ordersRes.data || []) as POSOrder[]);
      setOrderLines((linesRes.data || []) as POSOrderLine[]);
      setPayments((paymentsRes.data || []) as POSPayment[]);
      setSessions((sessionsRes.data || []) as POSSession[]);
      setProducts((productsRes.data || []) as ProductInfo[]);
      setLoading(false);
    };
    fetchAll();
  }, [user, dataOwnerId, dateFrom, dateTo, refreshKey]);

  const refetch = () => setRefreshKey(k => k + 1);

  // Computed KPIs
  const paidOrders = useMemo(() => orders.filter(o => o.state === "paid" && !o.is_return), [orders]);
  const returnOrders = useMemo(() => orders.filter(o => o.is_return && o.state !== "cancelled"), [orders]);

  // Restaurant sales = customer total − delivery fee. Delivery is money the
  // restaurant collects on behalf of the delivery company, NOT its own revenue.
  const totalSales = useMemo(
    () => paidOrders.reduce((s, o) => s + (Number(o.total) || 0) - (Number(o.delivery_fee) || 0), 0),
    [paidOrders],
  );
  const totalReturns = useMemo(
    () => returnOrders.reduce((s, o) => s + (Number(o.total) || 0) - (Number(o.delivery_fee) || 0), 0),
    [returnOrders],
  );
  // Separate "money collected from customers for delivery" KPI so the UI can
  // surface it without polluting sales numbers.
  const deliveryCollected = useMemo(
    () => paidOrders.reduce((s, o) => s + (Number(o.delivery_fee) || 0), 0),
    [paidOrders],
  );
  const customerCollected = useMemo(
    () => paidOrders.reduce((s, o) => s + (Number(o.total) || 0), 0),
    [paidOrders],
  );
  const netSales = totalSales - totalReturns;
  const totalOrders = paidOrders.length;
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

  // COGS from order lines of paid orders
  const paidOrderIds = useMemo(() => new Set(paidOrders.map(o => o.id)), [paidOrders]);
  const paidLines = useMemo(() => orderLines.filter(l => paidOrderIds.has(l.order_id)), [orderLines, paidOrderIds]);
  const totalCOGS = useMemo(() => paidLines.reduce((s, l) => s + l.cost_price * l.qty, 0), [paidLines]);
  const grossProfit = totalSales - totalCOGS;
  const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

  // Daily breakdown — sales here also exclude delivery_fee for the same reason.
  const dailySales = useMemo(() => {
    const map: Record<string, { date: string; orders: number; sales: number; returns: number; net: number }> = {};
    paidOrders.forEach(o => {
      const d = format(new Date(o.created_at), "yyyy-MM-dd");
      if (!map[d]) map[d] = { date: d, orders: 0, sales: 0, returns: 0, net: 0 };
      map[d].orders++;
      const net = (Number(o.total) || 0) - (Number(o.delivery_fee) || 0);
      map[d].sales += net;
      map[d].net += net;
    });
    returnOrders.forEach(o => {
      const d = format(new Date(o.created_at), "yyyy-MM-dd");
      if (!map[d]) map[d] = { date: d, orders: 0, sales: 0, returns: 0, net: 0 };
      const net = (Number(o.total) || 0) - (Number(o.delivery_fee) || 0);
      map[d].returns += net;
      map[d].net -= net;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [paidOrders, returnOrders]);

  // Top products
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number; cost: number; productId: string | null }> = {};
    paidLines.forEach(l => {
      const key = l.product_name;
      if (!map[key]) map[key] = { name: key, qty: 0, revenue: 0, cost: 0, productId: l.product_id };
      map[key].qty += l.qty;
      map[key].revenue += l.total;
      map[key].cost += l.cost_price * l.qty;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [paidLines]);

  // Payment methods breakdown
  const paymentBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    // Only include payments for paid orders
    payments.filter(p => paidOrderIds.has(p.order_id)).forEach(p => {
      const method = p.payment_method || "نقدي";
      map[method] = (map[method] || 0) + p.amount;
    });
    return Object.entries(map).map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount);
  }, [payments, paidOrderIds]);

  // Cashier performance
  const cashierPerformance = useMemo(() => {
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
      const sales = cashierOrders.reduce(
        (s, o) => s + (Number(o.total) || 0) - (Number(o.delivery_fee) || 0),
        0,
      );
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
  }, [sessions, paidOrders, returnOrders]);

  // Peak hours heatmap
  const peakHoursData = useMemo(() => {
    const heatmap: Record<string, number> = {};
    paidOrders.forEach(o => {
      const d = new Date(o.created_at);
      const day = getDay(d); // 0=Sun
      const hour = getHours(d);
      const key = `${day}-${hour}`;
      heatmap[key] = (heatmap[key] || 0) + (Number(o.total) || 0) - (Number(o.delivery_fee) || 0);
    });
    return heatmap;
  }, [paidOrders]);

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
    orders, paidOrders, returnOrders, orderLines, paidLines, payments, sessions, products,
    totalSales, totalReturns, netSales, totalOrders, avgOrderValue,
    deliveryCollected, customerCollected,
    totalCOGS, grossProfit, grossMargin,
    dailySales, topProducts, paymentBreakdown, cashierPerformance, peakHoursData, inventoryReport,
    refetch,
  };
}
