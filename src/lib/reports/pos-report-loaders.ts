import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, format, subMonths, startOfMonth, endOfMonth, getHours, getDay } from "date-fns";

type SetData = (data: any[]) => void;

// ── POS Report Loaders ──

export async function loadPOSDailySales(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, total, discount_amount, state, session_id, customer_name, payment_currency, currency").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59").order("created_at", { ascending: false });
  const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name").eq("user_id", uid);
  const sessMap = new Map((sessions || []).map(s => [s.id, s.cashier_name || "غير محدد"]));
  setData((orders || []).map(o => ({
    order_number: o.order_number || "—",
    date: o.created_at.split("T")[0],
    time: o.created_at.split("T")[1]?.substring(0, 5) || "",
    cashier: sessMap.get(o.session_id) || "غير محدد",
    customer_name: o.customer_name || "—",
    currency: o.payment_currency || o.currency || "ILS",
    discount: o.discount_amount || 0,
    total: o.total,
  })));
}

export async function loadPOSCashReconciliation(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  // P1 fix: include the cash box currency on every row so multi-currency
  // shifts (ILS / USD / EUR) are not silently summed into one number.
  const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name, opened_at, closed_at, opening_cash, closing_cash, expected_cash, cash_variance, state, cash_box_id").eq("user_id", uid).eq("is_deleted", false).gte("opened_at", dateFrom).lte("opened_at", dateTo + "T23:59:59").order("opened_at", { ascending: false });
  const boxIds = Array.from(new Set((sessions || []).map((s: any) => s.cash_box_id).filter(Boolean) as string[]));
  const { data: boxes } = boxIds.length
    ? await supabase.from("cash_boxes").select("id, currency").in("id", boxIds)
    : { data: [] as any[] };
  const ccyMap = new Map((boxes || []).map((b: any) => [b.id, b.currency || "ILS"]));
  setData((sessions || []).map(s => ({
    date: s.opened_at?.split("T")[0] || "", cashier: s.cashier_name || "غير محدد",
    currency: (s.cash_box_id ? ccyMap.get(s.cash_box_id) : null) || "ILS",
    opening: s.opening_cash || 0, closing: s.closing_cash || 0,
    expected: s.expected_cash || 0, variance: s.cash_variance || 0,
    state: s.state,
  })));
}

export async function loadPOSCashierPerformance(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name").eq("user_id", uid).eq("is_deleted", false).gte("opened_at", dateFrom).lte("opened_at", dateTo + "T23:59:59");
  const sessIds = (sessions || []).map(s => s.id);
  if (!sessIds.length) { setData([]); return; }
  const { data: orders } = await supabase.from("pos_orders").select("id, total, state, session_id").eq("user_id", uid).in("session_id", sessIds);
  const cashierMap: Record<string, { name: string; count: number; total: number; cancelled: number }> = {};
  const sessNameMap = new Map((sessions || []).map(s => [s.id, s.cashier_name || "غير محدد"]));
  (orders || []).forEach(o => {
    const name = sessNameMap.get(o.session_id) || "غير محدد";
    if (!cashierMap[name]) cashierMap[name] = { name, count: 0, total: 0, cancelled: 0 };
    if (o.state === "paid") { cashierMap[name].count++; cashierMap[name].total += o.total; }
    if (o.state === "cancelled") cashierMap[name].cancelled++;
  });
  setData(Object.values(cashierMap).sort((a, b) => b.total - a.total));
}

export async function loadPOSCancelled(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, customer_name, total, state, return_reason").eq("user_id", uid).in("state", ["cancelled"]).gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59").order("created_at", { ascending: false });
  setData(orders || []);
}

export async function loadPOSPeakHours(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("created_at, total").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
  const heatmap: Record<string, { hour: number; dayName: string; count: number; total: number }> = {};
  const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  (orders || []).forEach(o => {
    const d = new Date(o.created_at);
    const hour = getHours(d);
    const day = getDay(d);
    const key = `${day}-${hour}`;
    if (!heatmap[key]) heatmap[key] = { hour, dayName: dayNames[day], count: 0, total: 0 };
    heatmap[key].count++; heatmap[key].total += o.total;
  });
  setData(Object.values(heatmap).sort((a, b) => b.total - a.total));
}

export async function loadPOSSalesByCategory(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("id").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
  if (!orders?.length) { setData([]); return; }
  const orderIds = orders.map(o => o.id);
  const allLines: any[] = [];
  for (let i = 0; i < orderIds.length; i += 500) {
    const batch = orderIds.slice(i, i + 500);
    const { data: lines } = await supabase.from("pos_order_lines").select("product_id, product_name, qty, total, cost_price, unit_price").in("order_id", batch);
    if (lines) allLines.push(...lines);
  }
  const prodIds = [...new Set(allLines.filter(l => l.product_id).map(l => l.product_id))];
  const prodCatMap = new Map<string, string>();
  if (prodIds.length) {
    for (let i = 0; i < prodIds.length; i += 500) {
      const batch = prodIds.slice(i, i + 500);
      const { data: prods } = await supabase.from("products").select("id, category").in("id", batch);
      (prods || []).forEach(p => prodCatMap.set(p.id, p.category || "بدون فئة"));
    }
  }
  const catMap: Record<string, { category: string; product: string; qty: number; revenue: number; cost: number }> = {};
  allLines.forEach(l => {
    const cat = l.product_id ? (prodCatMap.get(l.product_id) || "بدون فئة") : "بدون فئة";
    const key = `${cat}||${l.product_name}`;
    if (!catMap[key]) catMap[key] = { category: cat, product: l.product_name, qty: 0, revenue: 0, cost: 0 };
    catMap[key].qty += l.qty;
    catMap[key].revenue += l.total;
    catMap[key].cost += (l.cost_price || 0) * l.qty;
  });
  const totalRevenue = Object.values(catMap).reduce((s, c) => s + c.revenue, 0);
  setData(Object.values(catMap).map(c => ({
    ...c, profit: c.revenue - c.cost,
    pct: totalRevenue > 0 ? ((c.revenue / totalRevenue) * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue));
}

export async function loadPOSPeriodComparison(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("created_at, total, discount_amount").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
  const dayMap: Record<string, { period: string; sales: number; orders: number; discounts: number }> = {};
  (orders || []).forEach(o => {
    const d = o.created_at.split("T")[0];
    if (!dayMap[d]) dayMap[d] = { period: d, sales: 0, orders: 0, discounts: 0 };
    dayMap[d].sales += o.total;
    dayMap[d].orders++;
    dayMap[d].discounts += o.discount_amount || 0;
  });
  const sorted = Object.values(dayMap).sort((a, b) => a.period.localeCompare(b.period));
  setData(sorted.map((d, i) => ({
    ...d,
    avg: d.orders > 0 ? Math.round(d.sales / d.orders) : 0,
    growth: i > 0 && sorted[i - 1].sales > 0 ? (((d.sales - sorted[i - 1].sales) / sorted[i - 1].sales) * 100) : 0,
  })));
}

export async function loadPOSInvoiceRegister(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, total, discount_amount, tax_amount, subtotal, state, customer_name, session_id, payment_currency, currency, linked_transaction_id, cancel_reason").eq("user_id", uid).gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59").order("created_at", { ascending: false });
  const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name").eq("user_id", uid);
  const sessMap = new Map((sessions || []).map(s => [s.id, s.cashier_name || "غير محدد"]));
  setData((orders || []).map(o => ({
    id: o.id,
    session_id: o.session_id,
    linked_transaction_id: o.linked_transaction_id,
    order_number: o.order_number || "—",
    date: o.created_at.split("T")[0],
    time: o.created_at.split("T")[1]?.substring(0, 5) || "",
    cashier: sessMap.get(o.session_id) || "غير محدد",
    customer: o.customer_name || "—",
    subtotal: o.subtotal,
    discount: o.discount_amount || 0,
    tax: o.tax_amount || 0,
    total: o.total,
    currency: o.payment_currency || o.currency || "ILS",
    state: o.state,
    cancel_reason: o.cancel_reason,
  })));
}

export async function loadPOSPendingOrders(uid: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, total, customer_name, session_id, table_id, guest_count").eq("user_id", uid).eq("state", "draft").order("created_at", { ascending: false });
  const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name").eq("user_id", uid);
  const sessMap = new Map((sessions || []).map(s => [s.id, s.cashier_name || "غير محدد"]));
  setData((orders || []).map(o => {
    const mins = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
    return {
      order_number: o.order_number || "—",
      date: o.created_at.split("T")[0],
      time: o.created_at.split("T")[1]?.substring(0, 5) || "",
      cashier: sessMap.get(o.session_id) || "غير محدد",
      customer: o.customer_name || "—",
      total: o.total,
      wait_minutes: mins,
    };
  }));
}

export async function loadPOSShiftOpenClose(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name, opened_at, closed_at, opening_cash, closing_cash, state").eq("user_id", uid).eq("is_deleted", false).gte("opened_at", dateFrom).lte("opened_at", dateTo + "T23:59:59").order("opened_at", { ascending: false });
  setData((sessions || []).map(s => {
    const dur = s.closed_at ? Math.round((new Date(s.closed_at).getTime() - new Date(s.opened_at).getTime()) / 3600000 * 10) / 10 : 0;
    return {
      cashier: s.cashier_name || "غير محدد",
      date: s.opened_at.split("T")[0],
      open_time: s.opened_at.split("T")[1]?.substring(0, 5) || "",
      close_time: s.closed_at ? s.closed_at.split("T")[1]?.substring(0, 5) || "" : "مفتوحة",
      opening: s.opening_cash || 0,
      closing: s.closing_cash ?? 0,
      duration_hrs: dur,
      state: s.state,
    };
  }));
}

export async function loadPOSPaymentMethods(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  // Get paid order IDs first to exclude cancelled orders' payments
  const { data: paidOrders } = await supabase.from("pos_orders").select("id").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
  const paidIds = (paidOrders || []).map(o => o.id);
  if (!paidIds.length) { setData([]); return; }
  const allPayments: any[] = [];
  for (let i = 0; i < paidIds.length; i += 500) {
    const batch = paidIds.slice(i, i + 500);
    const { data: payments } = await supabase.from("pos_payments").select("payment_method, amount, currency").in("order_id", batch);
    if (payments) allPayments.push(...payments);
  }
  const methodMap: Record<string, { method: string; count: number; total: number; max: number; min: number }> = {};
  allPayments.forEach(p => {
    const m = p.payment_method === "cash" ? "نقدي" : p.payment_method === "card" ? "بطاقة" : p.payment_method === "credit" ? "آجل" : p.payment_method || "نقدي";
    if (!methodMap[m]) methodMap[m] = { method: m, count: 0, total: 0, max: 0, min: Infinity };
    methodMap[m].count++;
    methodMap[m].total += p.amount;
    methodMap[m].max = Math.max(methodMap[m].max, p.amount);
    methodMap[m].min = Math.min(methodMap[m].min, p.amount);
  });
  const totalAll = Object.values(methodMap).reduce((s, m) => s + m.total, 0);
  setData(Object.values(methodMap).map(m => ({
    ...m,
    avg: m.count > 0 ? Math.round(m.total / m.count) : 0,
    min: m.min === Infinity ? 0 : m.min,
    pct: totalAll > 0 ? ((m.total / totalAll) * 100) : 0,
  })).sort((a, b) => b.total - a.total));
}

export async function loadPOSProductMovement(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: paidOrders } = await supabase.from("pos_orders").select("id").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
  const { data: returnOrders } = await supabase.from("pos_orders").select("id").eq("user_id", uid).eq("is_return", true).gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
  const paidIds = (paidOrders || []).map(o => o.id);
  const returnIds = (returnOrders || []).map(o => o.id);
  const allIds = [...paidIds, ...returnIds];
  if (!allIds.length) { setData([]); return; }
  const allLines: any[] = [];
  for (let i = 0; i < allIds.length; i += 500) {
    const batch = allIds.slice(i, i + 500);
    const { data: lines } = await supabase.from("pos_order_lines").select("product_name, product_id, qty, total, unit_price, order_id").in("order_id", batch);
    if (lines) allLines.push(...lines);
  }
  const returnIdSet = new Set(returnIds);
  const prodMap: Record<string, { product: string; sold_qty: number; return_qty: number; revenue: number; avg_price: number }> = {};
  allLines.forEach(l => {
    const key = l.product_name;
    if (!prodMap[key]) prodMap[key] = { product: key, sold_qty: 0, return_qty: 0, revenue: 0, avg_price: 0 };
    if (returnIdSet.has(l.order_id)) {
      prodMap[key].return_qty += l.qty;
    } else {
      prodMap[key].sold_qty += l.qty;
      prodMap[key].revenue += l.total;
    }
  });
  setData(Object.values(prodMap).map(p => ({
    ...p,
    net_qty: p.sold_qty - p.return_qty,
    avg_price: p.sold_qty > 0 ? Math.round(p.revenue / p.sold_qty) : 0,
  })).sort((a, b) => b.revenue - a.revenue));
}

export async function loadPOSCategoryTotals(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("id").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
  if (!orders?.length) { setData([]); return; }
  const orderIds = orders.map(o => o.id);
  const allLines: any[] = [];
  for (let i = 0; i < orderIds.length; i += 500) {
    const batch = orderIds.slice(i, i + 500);
    const { data: lines } = await supabase.from("pos_order_lines").select("product_id, qty, total").in("order_id", batch);
    if (lines) allLines.push(...lines);
  }
  const prodIds = [...new Set(allLines.filter(l => l.product_id).map(l => l.product_id))];
  const prodCatMap = new Map<string, string>();
  if (prodIds.length) {
    for (let i = 0; i < prodIds.length; i += 500) {
      const batch = prodIds.slice(i, i + 500);
      const { data: prods } = await supabase.from("products").select("id, category").in("id", batch);
      (prods || []).forEach(p => prodCatMap.set(p.id, p.category || "بدون فئة"));
    }
  }
  const catMap: Record<string, { category: string; items: number; qty: number; revenue: number }> = {};
  const seenProducts = new Map<string, Set<string>>();
  allLines.forEach(l => {
    const cat = l.product_id ? (prodCatMap.get(l.product_id) || "بدون فئة") : "بدون فئة";
    if (!catMap[cat]) { catMap[cat] = { category: cat, items: 0, qty: 0, revenue: 0 }; seenProducts.set(cat, new Set()); }
    catMap[cat].qty += l.qty;
    catMap[cat].revenue += l.total;
    if (l.product_id) seenProducts.get(cat)!.add(l.product_id);
  });
  const totalRevenue = Object.values(catMap).reduce((s, c) => s + c.revenue, 0);
  setData(Object.values(catMap).map(c => ({
    ...c,
    items: seenProducts.get(c.category)?.size || 0,
    pct: totalRevenue > 0 ? ((c.revenue / totalRevenue) * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue));
}

export async function loadPOSInvoiceTiming(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, paid_at, total, session_id, customer_name").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59").order("created_at", { ascending: false });
  const { data: sessions } = await supabase.from("pos_sessions").select("id, cashier_name").eq("user_id", uid);
  const sessMap = new Map((sessions || []).map(s => [s.id, s.cashier_name || "غير محدد"]));
  setData((orders || []).map(o => {
    const openTime = new Date(o.created_at);
    const closeTime = o.paid_at ? new Date(o.paid_at) : openTime;
    const durationMin = Math.round((closeTime.getTime() - openTime.getTime()) / 60000);
    return {
      order_number: o.order_number || "—",
      date: o.created_at.split("T")[0],
      open_time: o.created_at.split("T")[1]?.substring(0, 5) || "",
      close_time: o.paid_at ? o.paid_at.split("T")[1]?.substring(0, 5) || "" : "—",
      duration_min: durationMin,
      cashier: sessMap.get(o.session_id) || "غير محدد",
      customer: o.customer_name || "—",
      total: o.total,
    };
  }));
}

export async function loadPOSCreditSales(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: payments } = await supabase.from("pos_payments").select("order_id, amount, payment_method, created_at").eq("user_id", uid).eq("payment_method", "credit").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
  if (!payments?.length) { setData([]); return; }
  const orderIds = [...new Set(payments.map(p => p.order_id))];
  const allOrders: any[] = [];
  for (let i = 0; i < orderIds.length; i += 500) {
    const batch = orderIds.slice(i, i + 500);
    const { data: ords } = await supabase.from("pos_orders").select("id, order_number, created_at, total, customer_name, customer_id").in("id", batch);
    if (ords) allOrders.push(...ords);
  }
  const orderMap = new Map(allOrders.map(o => [o.id, o]));
  const custMap: Record<string, { customer: string; orders: number; credit_total: number; invoices: string[] }> = {};
  payments.forEach(p => {
    const order = orderMap.get(p.order_id);
    const custName = order?.customer_name || "عميل غير مسمى";
    if (!custMap[custName]) custMap[custName] = { customer: custName, orders: 0, credit_total: 0, invoices: [] };
    custMap[custName].orders++;
    custMap[custName].credit_total += p.amount;
    if (order?.order_number) custMap[custName].invoices.push(order.order_number);
  });
  setData(Object.values(custMap).sort((a, b) => b.credit_total - a.credit_total));
}
