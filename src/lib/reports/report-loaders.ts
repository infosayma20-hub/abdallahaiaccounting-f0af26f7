import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, format, subDays, subMonths, startOfMonth, endOfMonth, getHours, getDay } from "date-fns";
import { fmtAmt } from "./report-helpers";

type SetData = (data: any[]) => void;

// ── Debug Mode (toggle from Developer Settings) ──
// Set localStorage.setItem("amwali:reports:debug", "1") to enable verbose logs
export const reportsDebugEnabled = () => {
  try { return typeof window !== "undefined" && localStorage.getItem("amwali:reports:debug") === "1"; }
  catch { return false; }
};
const dbg = (label: string, payload: Record<string, any>) => {
  if (reportsDebugEnabled()) {
    // eslint-disable-next-line no-console
    console.log(`[reports:${label}]`, payload);
  }
};

// ── Source filter helper ──
// sourceFilter: "all" | "rep" | "pos" | "invoice"
// Returns set of transaction IDs (i.e. invoices.linked_transaction_id) that match.
// Used to filter `transactions` rows where the source is invoice-driven.
export type SalesSourceFilter = "all" | "rep" | "pos" | "invoice";

async function getInvoiceTxnIdsBySource(
  uid: string,
  source: SalesSourceFilter,
  dateFrom: string,
  dateTo: string,
): Promise<Set<string> | null> {
  if (source === "all") return null; // null => no filter
  const { data } = await supabase
    .from("invoices")
    .select("linked_transaction_id, source")
    .eq("user_id", uid)
    .eq("source", source)
    .eq("is_voided", false)
    .not("status", "in", "(cancelled,void,reversed)")
    .gte("invoice_date", dateFrom)
    .lte("invoice_date", dateTo);
  return new Set((data || []).map(r => r.linked_transaction_id).filter(Boolean) as string[]);
}

async function getVoidedInvoiceTxnIds(uid: string, dateFrom: string, dateTo: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("invoices")
    .select("linked_transaction_id, status, is_voided")
    .eq("user_id", uid)
    .gte("invoice_date", dateFrom)
    .lte("invoice_date", dateTo);
  return new Set(
    (data || [])
      .filter((r: any) => r.linked_transaction_id && (r.is_voided || ["cancelled", "void", "reversed"].includes((r.status || "").toLowerCase())))
      .map((r: any) => r.linked_transaction_id)
  );
}

// ── General / Accounting Loaders ──

export async function loadAgingReport(uid: string, contactType: string, setData: SetData) {
  const { data: contacts } = await supabase.from("contacts").select("id, contact_name, current_balance, contact_class, last_transaction_date").eq("user_id", uid).eq("contact_type", contactType).gt("current_balance", 0);
  if (!contacts?.length) { setData([]); return; }

  // Get unpaid invoices for proper per-invoice aging
  const txTypes = contactType === "عميل"
    ? ["sale_cash", "sale_bank", "sale_credit", "sale_cheque"]
    : ["purchase_cash", "purchase_credit", "purchase_bank"];
  const { data: txns } = await supabase.from("transactions").select("contact_id, transaction_date, amount, transaction_type").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", txTypes);

  const today = new Date();
  setData(contacts.map(c => {
    // Use oldest unpaid transaction for aging, not last_transaction_date
    const cTxns = (txns || []).filter(t => t.contact_id === c.id).sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    const oldestDate = cTxns.length > 0 ? cTxns[0].transaction_date : null;
    const days = oldestDate ? differenceInDays(today, new Date(oldestDate)) : 0;
    return {
      name: c.contact_name, cls: c.contact_class || "-",
      current: days <= 0 ? c.current_balance : 0,
      d30: days > 0 && days <= 30 ? c.current_balance : 0,
      d60: days > 30 && days <= 60 ? c.current_balance : 0,
      d90: days > 60 && days <= 90 ? c.current_balance : 0,
      over90: days > 90 ? c.current_balance : 0,
      total: c.current_balance || 0,
    };
  }).sort((a, b) => b.total - a.total));
}

export async function loadCashFlowReport(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("debit_account_code, credit_account_code, amount").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
  if (!txns?.length) { setData([]); return; }

  // Calculate opening cash balance (cash = 111x, bank = 112x)
  const { data: openTxns } = await supabase.from("transactions").select("debit_account_code, credit_account_code, amount").eq("user_id", uid).eq("is_deleted", false).lt("transaction_date", dateFrom).or("debit_account_code.like.111%,credit_account_code.like.111%,debit_account_code.like.112%,credit_account_code.like.112%");
  let openingCash = 0;
  (openTxns || []).forEach(tx => {
    const dc = tx.debit_account_code || "", cc = tx.credit_account_code || "";
    if (dc.startsWith("111") || dc.startsWith("112")) openingCash += tx.amount;
    if (cc.startsWith("111") || cc.startsWith("112")) openingCash -= tx.amount;
  });

  let operating = 0, investing = 0, financing = 0;
  txns.forEach(tx => {
    const dc = tx.debit_account_code || "", cc = tx.credit_account_code || "";
    // Operating: revenue (4xxx), COGS (5xxx), expenses (6xxx), receivables (12xx), payables (21xx)
    const isOpDc = dc.startsWith("4") || dc.startsWith("5") || dc.startsWith("6") || dc.startsWith("12") || dc.startsWith("21");
    const isOpCc = cc.startsWith("4") || cc.startsWith("5") || cc.startsWith("6") || cc.startsWith("12") || cc.startsWith("21");
    // Investing: fixed assets (15xx), long-term investments
    const isInvDc = dc.startsWith("15");
    const isInvCc = cc.startsWith("15");
    // Financing: equity (3xxx), long-term liabilities (22xx)
    const isFinDc = dc.startsWith("3") || dc.startsWith("22");
    const isFinCc = cc.startsWith("3") || cc.startsWith("22");

    // Only count transactions that touch cash/bank accounts
    const touchesCashDc = dc.startsWith("111") || dc.startsWith("112");
    const touchesCashCc = cc.startsWith("111") || cc.startsWith("112");
    if (!touchesCashDc && !touchesCashCc) return;

    const cashIn = touchesCashDc ? tx.amount : 0;
    const cashOut = touchesCashCc ? tx.amount : 0;
    const netCash = cashIn - cashOut;

    if (isOpDc || isOpCc) operating += netCash;
    else if (isInvDc || isInvCc) investing += netCash;
    else if (isFinDc || isFinCc) financing += netCash;
    else operating += netCash; // default to operating
  });
  const netChange = operating + investing + financing;
  setData([
    { section: "الرصيد الافتتاحي للنقد", amount: openingCash },
    { section: "أنشطة تشغيلية", amount: operating },
    { section: "أنشطة استثمارية", amount: investing },
    { section: "أنشطة تمويلية", amount: financing },
    { section: "صافي التغير في النقد", amount: netChange },
    { section: "الرصيد الختامي للنقد", amount: openingCash + netChange },
  ]);
}

export async function loadAccountMovement(uid: string, accountCodePrefix: string, dateFrom: string, dateTo: string, setData: SetData) {
  // Use like filter to capture sub-accounts (e.g. 1110 captures 1111, 1112...)
  const { data: openTxns } = await supabase.from("transactions").select("amount, debit_account_code, credit_account_code").eq("user_id", uid).eq("is_deleted", false).lt("transaction_date", dateFrom).or(`debit_account_code.like.${accountCodePrefix}%,credit_account_code.like.${accountCodePrefix}%`);
  let openBal = 0;
  (openTxns || []).forEach(tx => {
    if ((tx.debit_account_code || "").startsWith(accountCodePrefix)) openBal += tx.amount;
    if ((tx.credit_account_code || "").startsWith(accountCodePrefix)) openBal -= tx.amount;
  });
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, debit_account_code, credit_account_code, reference").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).or(`debit_account_code.like.${accountCodePrefix}%,credit_account_code.like.${accountCodePrefix}%`).order("transaction_date", { ascending: true });
  let running = openBal;
  const rows = (txns || []).map(tx => {
    const inflow = (tx.debit_account_code || "").startsWith(accountCodePrefix) ? tx.amount : 0;
    const outflow = (tx.credit_account_code || "").startsWith(accountCodePrefix) ? tx.amount : 0;
    running += inflow - outflow;
    return { date: tx.transaction_date, description: tx.description, inflow, outflow, balance: running, ref: tx.reference };
  });
  setData([{ openingBalance: openBal }, ...rows]);
}

export async function loadChequesReport(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: cheques } = await supabase.from("cheques").select("*").eq("user_id", uid).gte("cheque_date", dateFrom).lte("cheque_date", dateTo).order("cheque_date", { ascending: false });
  setData(cheques || []);
}

export async function loadTotalSales(uid: string, dateFrom: string, dateTo: string, setData: SetData, source: SalesSourceFilter = "all") {
  const txnIds = await getInvoiceTxnIdsBySource(uid, source, dateFrom, dateTo);
  const voidedTxnIds = await getVoidedInvoiceTxnIds(uid, dateFrom, dateTo);
  let q = supabase.from("transactions").select("id, transaction_date, amount").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
  const { data: txns } = await q;
  const filtered = (txnIds ? (txns || []).filter(t => txnIds.has(t.id)) : (txns || [])).filter(t => !voidedTxnIds.has(t.id));
  dbg("totalSales", { source, txnCount: filtered.length, total: filtered.reduce((s, t) => s + t.amount, 0) });
  // Sales returns from new returns table (confirmed only) + legacy transactions
  const { data: rets } = await supabase.from("returns" as any).select("return_date, total, status").eq("user_id", uid).eq("return_type", "sales").gte("return_date", dateFrom).lte("return_date", dateTo);
  const dayMap: Record<string, { date: string; count: number; total: number; returns: number; net: number }> = {};
  filtered.forEach(tx => { const d = tx.transaction_date; if (!dayMap[d]) dayMap[d] = { date: d, count: 0, total: 0, returns: 0, net: 0 }; dayMap[d].count++; dayMap[d].total += tx.amount; });
  (rets || []).forEach((r: any) => {
    if (r.status !== "confirmed" && r.status !== "posted") return;
    const d = r.return_date;
    if (!dayMap[d]) dayMap[d] = { date: d, count: 0, total: 0, returns: 0, net: 0 };
    dayMap[d].returns += Number(r.total) || 0;
  });
  Object.values(dayMap).forEach(d => { d.net = d.total - d.returns; });
  setData(Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)));
}

export async function loadDailySalesReport(uid: string, dateFrom: string, dateTo: string, setData: SetData, source: SalesSourceFilter = "all") {
  const txnIds = await getInvoiceTxnIdsBySource(uid, source, dateFrom, dateTo);
  const voidedTxnIds = await getVoidedInvoiceTxnIds(uid, dateFrom, dateTo);
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, amount, transaction_type").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
  const filtered = (txnIds ? (txns || []).filter(t => txnIds.has(t.id) || t.transaction_type === "return") : (txns || [])).filter(t => !voidedTxnIds.has(t.id));
  dbg("dailySales", { source, total: filtered.length });
  const dayMap: Record<string, { date: string; count: number; sales: number; returns: number }> = {};
  filtered.forEach(tx => {
    const d = tx.transaction_date;
    if (!dayMap[d]) dayMap[d] = { date: d, count: 0, sales: 0, returns: 0 };
    if (tx.transaction_type?.startsWith("sale") || tx.transaction_type === "pos_sale") { dayMap[d].count++; dayMap[d].sales += tx.amount; }
    if (tx.transaction_type === "return") dayMap[d].returns += tx.amount;
  });
  setData(Object.values(dayMap).map(d => ({ ...d, net: d.sales - d.returns })));
}

export async function loadInvoiceRegister(uid: string, dateFrom: string, dateTo: string, setData: SetData, source: SalesSourceFilter = "all") {
  const txnIds = await getInvoiceTxnIdsBySource(uid, source, dateFrom, dateTo);
  const voidedTxnIds = await getVoidedInvoiceTxnIds(uid, dateFrom, dateTo);
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, transaction_type, payment_method, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false });
  const filtered = (txnIds ? (txns || []).filter(t => txnIds.has(t.id)) : (txns || [])).filter(t => !voidedTxnIds.has(t.id));
  dbg("invoiceRegister", { source, count: filtered.length });
  setData(filtered);
}

export async function loadByCustomer(uid: string, dateFrom: string, dateTo: string, setData: SetData, source: SalesSourceFilter = "all") {
  const txnIds = await getInvoiceTxnIdsBySource(uid, source, dateFrom, dateTo);
  const voidedTxnIds = await getVoidedInvoiceTxnIds(uid, dateFrom, dateTo);
  const { data: txns } = await supabase.from("transactions").select("id, contact_id, amount, transaction_date").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
  const filtered = (txnIds ? (txns || []).filter(t => txnIds.has(t.id)) : (txns || [])).filter(t => !voidedTxnIds.has(t.id));
  const { data: contacts } = await supabase.from("contacts").select("id, contact_name, contact_class").eq("user_id", uid).eq("contact_type", "عميل");
  const cMap = new Map((contacts || []).map(c => [c.id, c]));
  const custMap: Record<string, { name: string; cls: string; count: number; total: number; lastDate: string }> = {};
  filtered.forEach(tx => {
    if (!tx.contact_id) return;
    const c = cMap.get(tx.contact_id);
    const key = tx.contact_id;
    if (!custMap[key]) custMap[key] = { name: c?.contact_name || "غير محدد", cls: c?.contact_class || "-", count: 0, total: 0, lastDate: "" };
    custMap[key].count++; custMap[key].total += tx.amount;
    if (tx.transaction_date > custMap[key].lastDate) custMap[key].lastDate = tx.transaction_date;
  });
  dbg("byCustomer", { source, customers: Object.keys(custMap).length });
  setData(Object.values(custMap).sort((a, b) => b.total - a.total));
}

export async function loadCollections(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, payment_method, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).eq("transaction_type", "receipt").gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false });
  setData(txns || []);
}

export async function loadSalesReturns(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  // Source of truth: `returns` table (return_type='sales'). No more description LIKE heuristics.
  const { data: rets } = await supabase
    .from("returns" as any)
    .select("id, return_date, return_number, contact_name, total_amount, status, reason, related_invoice_id")
    .eq("user_id", uid)
    .eq("return_type", "sales")
    .eq("is_deleted", false)
    .gte("return_date", dateFrom)
    .lte("return_date", dateTo)
    .order("return_date", { ascending: false });
  dbg("salesReturns", { count: (rets || []).length });
  setData((rets || []).map((r: any) => ({
    id: r.id,
    transaction_date: r.return_date,
    description: `${r.return_number || ""} — ${r.contact_name || ""}${r.reason ? " — " + r.reason : ""}`,
    amount: Number(r.total_amount) || 0,
    contact_id: null,
    reference: r.related_invoice_id,
    status: r.status,
  })));
}

export async function loadSalesPerformance(uid: string, dateFrom: string, dateTo: string, setData: SetData, source: SalesSourceFilter = "all") {
  const txnIds = await getInvoiceTxnIdsBySource(uid, source, dateFrom, dateTo);
  const voidedTxnIds = await getVoidedInvoiceTxnIds(uid, dateFrom, dateTo);
  const { data: txns } = await supabase.from("transactions").select("id, amount, transaction_date").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
  const cur = (txnIds ? (txns || []).filter(t => txnIds.has(t.id)) : (txns || [])).filter(t => !voidedTxnIds.has(t.id));
  const daysDiff = differenceInDays(new Date(dateTo), new Date(dateFrom));
  const prevFrom = format(subDays(new Date(dateFrom), daysDiff + 1), "yyyy-MM-dd");
  const prevTo = format(subDays(new Date(dateFrom), 1), "yyyy-MM-dd");
  const prevIds = await getInvoiceTxnIdsBySource(uid, source, prevFrom, prevTo);
  const prevVoidedTxnIds = await getVoidedInvoiceTxnIds(uid, prevFrom, prevTo);
  const { data: prevTxns } = await supabase.from("transactions").select("id, amount").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", prevFrom).lte("transaction_date", prevTo);
  const prev = (prevIds ? (prevTxns || []).filter(t => prevIds.has(t.id)) : (prevTxns || [])).filter(t => !prevVoidedTxnIds.has(t.id));
  const total = cur.reduce((s, t) => s + t.amount, 0);
  const prevTotal = prev.reduce((s, t) => s + t.amount, 0);
  const growth = prevTotal > 0 ? ((total - prevTotal) / prevTotal * 100) : 0;
  const count = cur.length;
  const avgTicket = count > 0 ? total / count : 0;
  const dayMap: Record<string, number> = {};
  cur.forEach(t => { dayMap[t.transaction_date] = (dayMap[t.transaction_date] || 0) + t.amount; });
  const bestDay = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0];
  dbg("salesPerformance", { source, total, count, prevTotal });
  setData([
    { label: "إجمالي المبيعات", value: fmtAmt(total), color: "#059669" },
    { label: "عدد الفواتير", value: count.toString(), color: "#0070F2" },
    { label: "متوسط قيمة الفاتورة", value: fmtAmt(avgTicket), color: "#6366F1" },
    { label: "معدل النمو", value: `${growth.toFixed(1)}%`, color: growth >= 0 ? "#059669" : "#DC2626" },
    { label: "أعلى يوم مبيعات", value: bestDay ? `${bestDay[0]}: ${fmtAmt(bestDay[1])}` : "-", color: "#4A9EE8" },
    { label: "مبيعات الفترة السابقة", value: fmtAmt(prevTotal), color: "#8B9BB4" },
  ]);
}

// Sales by Product — single source of truth: invoice_items (covers rep/pos/invoice unified)
export async function loadSalesByProductReport(uid: string, dateFrom: string, dateTo: string, setData: SetData, source: SalesSourceFilter = "all") {
  // 1) get invoices in range (filtered by source if any)
  let invQ = supabase.from("invoices").select("id, source").eq("user_id", uid).eq("is_voided", false).not("status", "in", "(cancelled,void,reversed)").gte("invoice_date", dateFrom).lte("invoice_date", dateTo);
  if (source !== "all") invQ = invQ.eq("source", source);
  const { data: invoices } = await invQ;
  if (!invoices?.length) { dbg("salesByProduct", { source, invoices: 0 }); setData([]); return; }
  const invIds = invoices.map(i => i.id);
  // 2) get items
  const { data: items } = await supabase.from("invoice_items").select("product_name, quantity, total_amount, cost_price, line_profit").in("invoice_id", invIds);
  const pm: Record<string, { name: string; qty: number; revenue: number; cost: number; profit: number; missingCost: boolean }> = {};
  (items || []).forEach(it => {
    const name = it.product_name || "—";
    if (!pm[name]) pm[name] = { name, qty: 0, revenue: 0, cost: 0, profit: 0, missingCost: false };
    const q = Number(it.quantity) || 0;
    pm[name].qty += q;
    pm[name].revenue += Number(it.total_amount) || 0;
    if (it.cost_price == null) {
      pm[name].missingCost = true;
    } else {
      pm[name].cost += Number(it.cost_price) * q;
      pm[name].profit += it.line_profit != null ? Number(it.line_profit) : (Number(it.total_amount) - Number(it.cost_price) * q);
    }
  });
  dbg("salesByProduct", { source, invoices: invoices.length, items: (items || []).length, products: Object.keys(pm).length });
  setData(Object.values(pm).map(p => ({
    ...p,
    margin: p.revenue > 0 ? (p.profit / p.revenue * 100) : 0,
    profitDisplay: p.missingCost ? "تكلفة غير محددة" : p.profit,
  })).sort((a, b) => b.revenue - a.revenue));
}

export async function loadDeadStockReport(uid: string, setData: SetData) {
  const { data: products } = await supabase.from("products").select("id, name, quantity, buy_price").eq("user_id", uid);
  const { data: lastSales } = await supabase.from("pos_order_lines").select("product_id, order_id").eq("user_id", uid);
  const { data: paidOrders } = await supabase.from("pos_orders").select("id, created_at").eq("user_id", uid).eq("state", "paid");
  const orderDateMap = new Map((paidOrders || []).map(o => [o.id, o.created_at]));
  const productLastSale: Record<string, string> = {};
  (lastSales || []).forEach(l => {
    if (!l.product_id) return;
    const d = orderDateMap.get(l.order_id);
    if (d && (!productLastSale[l.product_id] || d > productLastSale[l.product_id])) productLastSale[l.product_id] = d;
  });
  const today = new Date();
  setData((products || []).map(p => {
    const lastSaleDate = productLastSale[p.id];
    const days = lastSaleDate ? differenceInDays(today, new Date(lastSaleDate)) : 999;
    return { name: p.name, qty: p.quantity || 0, value: (p.quantity || 0) * (p.buy_price || 0), lastMove: lastSaleDate || null, days };
  }).filter(p => p.days >= 90 && p.qty > 0).sort((a, b) => b.value - a.value));
}

// Product profitability — REAL profit from invoice_items.line_profit (no more buy/sell price guesses)
export async function loadProductProfitability(uid: string, setData: SetData, dateFrom?: string, dateTo?: string, source: SalesSourceFilter = "all") {
  // default to last 90 days if no range provided
  const to = dateTo || format(new Date(), "yyyy-MM-dd");
  const from = dateFrom || format(subDays(new Date(), 90), "yyyy-MM-dd");
  let invQ = supabase.from("invoices").select("id, source").eq("user_id", uid).eq("is_voided", false).not("status", "in", "(cancelled,void,reversed)").gte("invoice_date", from).lte("invoice_date", to);
  if (source !== "all") invQ = invQ.eq("source", source);
  const { data: invoices } = await invQ;
  const invIds = (invoices || []).map(i => i.id);
  const { data: items } = invIds.length
    ? await supabase.from("invoice_items").select("product_name, quantity, unit_price, total_amount, cost_price, line_profit").in("invoice_id", invIds)
    : { data: [] as any[] };
  const { data: products } = await supabase.from("products").select("id, name, quantity").eq("user_id", uid);
  const stockMap = new Map((products || []).map(p => [p.name, p.quantity || 0]));

  const pm: Record<string, { name: string; qtySold: number; revenue: number; cost: number; profit: number; missingCost: boolean }> = {};
  (items || []).forEach(it => {
    const name = it.product_name || "—";
    if (!pm[name]) pm[name] = { name, qtySold: 0, revenue: 0, cost: 0, profit: 0, missingCost: false };
    const q = Number(it.quantity) || 0;
    pm[name].qtySold += q;
    pm[name].revenue += Number(it.total_amount) || 0;
    if (it.cost_price == null) pm[name].missingCost = true;
    else {
      pm[name].cost += Number(it.cost_price) * q;
      pm[name].profit += it.line_profit != null ? Number(it.line_profit) : (Number(it.total_amount) - Number(it.cost_price) * q);
    }
  });
  dbg("productProfitability", { source, from, to, products: Object.keys(pm).length });
  setData(Object.values(pm).map(p => ({
    name: p.name,
    qtySold: p.qtySold,
    revenue: p.revenue,
    cost: p.cost,
    profit: p.profit,
    profitDisplay: p.missingCost ? "تكلفة غير محددة" : p.profit,
    margin: p.revenue > 0 ? (p.profit / p.revenue * 100) : 0,
    stock: stockMap.get(p.name) || 0,
  })).sort((a, b) => b.profit - a.profit));
}

export async function loadFinancialKPIs(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("debit_account_code, credit_account_code, amount").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
  let revenue = 0, cogs = 0, expenses = 0;
  (txns || []).forEach(tx => {
    const dc = tx.debit_account_code || "", cc = tx.credit_account_code || "";
    // Revenue: credit to 4xxx accounts
    if (cc.startsWith("4")) revenue += tx.amount;
    // COGS: debit to 51xx accounts
    if (dc.startsWith("51")) cogs += tx.amount;
    // Expenses: debit to 5xxx (non-COGS) and 6xxx accounts
    if ((dc.startsWith("5") && !dc.startsWith("51")) || dc.startsWith("6")) expenses += tx.amount;
  });
  const grossMargin = revenue > 0 ? ((revenue - cogs) / revenue * 100) : 0;
  const netMargin = revenue > 0 ? ((revenue - cogs - expenses) / revenue * 100) : 0;

  // Current ratio: current assets / current liabilities
  const { data: allTxns } = await supabase.from("transactions").select("debit_account_code, credit_account_code, amount").eq("user_id", uid).eq("is_deleted", false);
  let currentAssets = 0, currentLiabilities = 0;
  (allTxns || []).forEach(tx => {
    const dc = tx.debit_account_code || "", cc = tx.credit_account_code || "";
    // Current assets: 1xxx (excl fixed 15xx)
    if (dc.startsWith("1") && !dc.startsWith("15")) currentAssets += tx.amount;
    if (cc.startsWith("1") && !cc.startsWith("15")) currentAssets -= tx.amount;
    // Current liabilities: 21xx
    if (cc.startsWith("21")) currentLiabilities += tx.amount;
    if (dc.startsWith("21")) currentLiabilities -= tx.amount;
  });
  const currentRatio = currentLiabilities > 0 ? (currentAssets / currentLiabilities) : 0;

  setData([
    { label: "إجمالي الإيرادات", value: fmtAmt(revenue), color: "#059669" },
    { label: "هامش الربح الإجمالي", value: `${grossMargin.toFixed(1)}%`, color: grossMargin >= 30 ? "#059669" : grossMargin >= 15 ? "#4A9EE8" : "#DC2626" },
    { label: "هامش الربح الصافي", value: `${netMargin.toFixed(1)}%`, color: netMargin >= 10 ? "#059669" : netMargin >= 5 ? "#4A9EE8" : "#DC2626" },
    { label: "صافي الربح", value: fmtAmt(revenue - cogs - expenses), color: revenue - cogs - expenses >= 0 ? "#059669" : "#DC2626" },
    { label: "نسبة التداول", value: currentRatio.toFixed(2), color: currentRatio >= 1.5 ? "#059669" : currentRatio >= 1 ? "#4A9EE8" : "#DC2626" },
    { label: "تكلفة المبيعات", value: fmtAmt(cogs), color: "#6366F1" },
    { label: "المصروفات التشغيلية", value: fmtAmt(expenses), color: "#DC2626" },
  ]);
}

export async function loadMonthComparison(uid: string, setData: SetData) {
  const months = [];
  for (let i = 5; i >= 0; i--) { const m = subMonths(new Date(), i); months.push({ label: format(m, "yyyy-MM"), from: format(startOfMonth(m), "yyyy-MM-dd"), to: format(endOfMonth(m), "yyyy-MM-dd") }); }
  const { data: txns } = await supabase.from("transactions").select("transaction_date, debit_account_code, credit_account_code, amount").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", months[0].from).lte("transaction_date", months[5].to);
  setData(months.map(m => {
    let rev = 0, exp = 0;
    (txns || []).forEach(tx => {
      if (tx.transaction_date >= m.from && tx.transaction_date <= m.to) {
        const dc = tx.debit_account_code || "", cc = tx.credit_account_code || "";
        if (cc.startsWith("4")) rev += tx.amount;
        if (dc.startsWith("5") || dc.startsWith("6")) exp += tx.amount;
      }
    });
    return { month: m.label, revenue: rev, expenses: exp, profit: rev - exp };
  }));
}

export async function loadForeignBalances(uid: string, setData: SetData) {
  // Get all cash sub-accounts (111x) dynamically — not hardcoded
  const { data: accounts } = await supabase.from("accounts").select("account_code, account_name").eq("user_id", uid).like("account_code", "111%");
  if (!accounts?.length) { setData([]); return; }
  const result = [];
  for (const acc of accounts) {
    const { data: txns } = await supabase.from("transactions").select("amount, debit_account_code, credit_account_code, foreign_amount, currency").eq("user_id", uid).eq("is_deleted", false).or(`debit_account_code.eq.${acc.account_code},credit_account_code.eq.${acc.account_code}`);
    let balance = 0, foreignBalance = 0;
    let detectedCurrency = "ILS";
    (txns || []).forEach(tx => {
      if (tx.debit_account_code === acc.account_code) { balance += tx.amount; foreignBalance += tx.foreign_amount || tx.amount; }
      if (tx.credit_account_code === acc.account_code) { balance -= tx.amount; foreignBalance -= tx.foreign_amount || tx.amount; }
      if (tx.currency && tx.currency !== "ILS") detectedCurrency = tx.currency;
    });
    // Try to detect currency from account name
    const nameLC = acc.account_name.toLowerCase();
    if (nameLC.includes("دولار") || nameLC.includes("usd") || nameLC.includes("$")) detectedCurrency = "USD";
    else if (nameLC.includes("دينار") || nameLC.includes("jod")) detectedCurrency = "JOD";
    else if (nameLC.includes("يورو") || nameLC.includes("eur") || nameLC.includes("€")) detectedCurrency = "EUR";
    else if (nameLC.includes("جنيه") || nameLC.includes("egp")) detectedCurrency = "EGP";
    result.push({ account: acc.account_name, code: acc.account_code, currency: detectedCurrency, balance, foreignBalance });
  }
  setData(result);
}

export async function loadTotalPurchases(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("transaction_date, amount").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["purchase_cash", "purchase_credit", "purchase_bank"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
  const { data: rets } = await supabase.from("returns" as any).select("return_date, total, status").eq("user_id", uid).eq("return_type", "purchase").gte("return_date", dateFrom).lte("return_date", dateTo);
  const dayMap: Record<string, { date: string; count: number; total: number; returns: number; net: number }> = {};
  (txns || []).forEach(tx => { const d = tx.transaction_date; if (!dayMap[d]) dayMap[d] = { date: d, count: 0, total: 0, returns: 0, net: 0 }; dayMap[d].count++; dayMap[d].total += tx.amount; });
  (rets || []).forEach((r: any) => {
    if (r.status !== "confirmed" && r.status !== "posted") return;
    const d = r.return_date;
    if (!dayMap[d]) dayMap[d] = { date: d, count: 0, total: 0, returns: 0, net: 0 };
    dayMap[d].returns += Number(r.total) || 0;
  });
  Object.values(dayMap).forEach(d => { d.net = d.total - d.returns; });
  setData(Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)));
}

export async function loadPurchaseInvoiceRegister(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, transaction_type, payment_method, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["purchase_cash", "purchase_credit", "purchase_bank"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false });
  setData(txns || []);
}

export async function loadBySupplier(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("contact_id, amount, transaction_date").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["purchase_cash", "purchase_credit", "purchase_bank"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
  const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).eq("contact_type", "مورد");
  const cMap = new Map((contacts || []).map(c => [c.id, c]));
  const suppMap: Record<string, { name: string; count: number; total: number }> = {};
  (txns || []).forEach(tx => {
    if (!tx.contact_id) return;
    const c = cMap.get(tx.contact_id);
    const key = tx.contact_id;
    if (!suppMap[key]) suppMap[key] = { name: c?.contact_name || "غير محدد", count: 0, total: 0 };
    suppMap[key].count++; suppMap[key].total += tx.amount;
  });
  setData(Object.values(suppMap).sort((a, b) => b.total - a.total));
}

export async function loadSupplierPayments(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, payment_method, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).eq("transaction_type", "payment").gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false });
  setData(txns || []);
}

export async function loadPurchaseReturns(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  // Source of truth: `returns` table (return_type='purchases'). No more description LIKE heuristics.
  const { data: rets } = await supabase
    .from("returns" as any)
    .select("id, return_date, return_number, contact_name, total_amount, status, reason, related_invoice_id")
    .eq("user_id", uid)
    .eq("return_type", "purchases")
    .eq("is_deleted", false)
    .gte("return_date", dateFrom)
    .lte("return_date", dateTo)
    .order("return_date", { ascending: false });
  setData((rets || []).map((r: any) => ({
    id: r.id,
    transaction_date: r.return_date,
    description: `${r.return_number || ""} — ${r.contact_name || ""}${r.reason ? " — " + r.reason : ""}`,
    amount: Number(r.total_amount) || 0,
    contact_id: null,
    reference: r.related_invoice_id,
    status: r.status,
  })));
}

export async function loadSupplierComparison(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("contact_id, description, amount, transaction_date").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["purchase_cash", "purchase_credit", "purchase_bank"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
  const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).eq("contact_type", "مورد");
  const cMap = new Map((contacts || []).map(c => [c.id, c.contact_name]));
  setData((txns || []).map(tx => ({
    supplier: cMap.get(tx.contact_id || "") || "غير محدد",
    description: tx.description, amount: tx.amount, date: tx.transaction_date,
  })));
}

export async function loadInventoryValuation(uid: string, setData: SetData) {
  const { data: products } = await supabase.from("products").select("id, name, quantity, buy_price, sell_price, category").eq("user_id", uid);
  const totalValue = (products || []).reduce((s, p) => s + (p.quantity || 0) * (p.buy_price || 0), 0);
  setData((products || []).map(p => ({
    name: p.name, qty: p.quantity || 0, cost: p.buy_price || 0,
    value: (p.quantity || 0) * (p.buy_price || 0),
    pct: totalValue > 0 ? ((p.quantity || 0) * (p.buy_price || 0) / totalValue * 100) : 0,
  })).sort((a, b) => b.value - a.value));
}

// Stock movement — single source of truth: stock_movements (covers POS + invoices + purchases + manual)
export async function loadStockMovement(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: moves } = await supabase
    .from("stock_movements")
    .select("id, created_at, product_id, movement_type, quantity, reference_note, warehouse_id")
    .eq("user_id", uid)
    .gte("created_at", dateFrom)
    .lte("created_at", dateTo + "T23:59:59")
    .order("created_at", { ascending: false });

  const productIds = Array.from(new Set((moves || []).map(m => m.product_id).filter(Boolean) as string[]));
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name").in("id", productIds)
    : { data: [] as any[] };
  const nameMap = new Map((products || []).map(p => [p.id, p.name]));

  const typeLabel: Record<string, string> = {
    sale: "بيع", purchase: "شراء", return_in: "مرتجع وارد", return_out: "مرتجع صادر",
    adjustment: "تسوية", transfer: "تحويل", pos_sale: "بيع POS", pos_return: "مرتجع POS",
    opening: "رصيد افتتاحي", waste: "تالف",
  };

  dbg("stockMovement", { count: (moves || []).length });
  setData((moves || []).map(m => ({
    date: (m.created_at || "").split("T")[0],
    product: nameMap.get(m.product_id || "") || "—",
    type: typeLabel[m.movement_type as string] || m.movement_type,
    qty: Number(m.quantity) || 0,
    ref: m.reference_note || "",
  })));
}

export async function loadBelowReorder(uid: string, setData: SetData) {
  const { data: products } = await supabase.from("products").select("id, name, quantity, min_quantity, buy_price").eq("user_id", uid);
  setData((products || []).filter(p => (p.quantity || 0) <= (p.min_quantity || 0) && (p.min_quantity || 0) > 0).map(p => ({
    name: p.name, qty: p.quantity || 0, min: p.min_quantity || 0,
    shortage: (p.min_quantity || 0) - (p.quantity || 0),
    reorderCost: ((p.min_quantity || 0) - (p.quantity || 0)) * (p.buy_price || 0),
  })).sort((a, b) => b.shortage - a.shortage));
}

export async function loadEmployeeDirectory(uid: string, setData: SetData) {
  const { data: employees } = await supabase.from("employees").select("id, full_name, department, job_title, start_date, salary, employment_status").eq("user_id", uid).order("full_name");
  setData(employees || []);
}

export async function loadEmployeeWithdrawals(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: vouchers } = await supabase
    .from("vouchers")
    .select("id, ref_number, date, description, amount, amount_ils, employee_id, linked_transaction_id")
    .eq("user_id", uid)
    .eq("type", "payment")
    .not("employee_id", "is", null)
    .eq("status", "posted")
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .order("date", { ascending: false });

  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("user_id", uid);

  const { data: transactions } = await supabase
    .from("transactions")
    .select("id, expense_category")
    .eq("user_id", uid)
    .eq("is_deleted", false);

  const empMap = Object.fromEntries((employees || []).map(e => [e.id, e.full_name]));
  const txMap = Object.fromEntries((transactions || []).map(t => [t.id, (t as any).expense_category]));

  const rows = (vouchers || []).map(v => {
    // Try to get category from linked transaction, fallback to parsing description
    let category = v.linked_transaction_id ? txMap[v.linked_transaction_id] : null;
    if (!category && v.description) {
      const desc = v.description;
      const cats = ["سلفة", "رواتب", "أكل", "عجز", "مشتريات", "توصيل", "مخالفة"];
      category = cats.find(c => desc.startsWith(c)) || "أخرى";
    }
    return {
      date: v.date,
      ref_number: v.ref_number,
      employee_name: empMap[v.employee_id!] || "—",
      category: category || "أخرى",
      description: v.description || "",
      amount: v.amount_ils || v.amount || 0,
    };
  });

  setData(rows);
}

export async function loadAssetRegister(uid: string, setData: SetData) {
  const { data: assets } = await supabase.from("assets").select("id, asset_number, name_ar, acquisition_cost, accumulated_depreciation, net_book_value, status, acquisition_date, location").eq("user_id", uid).order("asset_number");
  setData(assets || []);
}

export async function loadMonthlyDepreciation(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: entries } = await supabase.from("asset_depreciation_entries").select("*, assets!inner(asset_number, name_ar)").eq("user_id", uid).gte("period_start", dateFrom).lte("period_end", dateTo).order("period_start");
  setData((entries || []).map((e: any) => ({
    assetNumber: e.assets?.asset_number, assetName: e.assets?.name_ar,
    period: `${e.period_start} → ${e.period_end}`, amount: e.depreciation_amount, accumulated: e.accumulated_total, nbv: e.net_book_value,
  })));
}

export async function loadDepreciationSchedule(uid: string, setData: SetData) {
  const { data: entries } = await supabase.from("asset_depreciation_entries").select("*, assets!inner(asset_number, name_ar)").eq("user_id", uid).order("period_start");
  setData((entries || []).map((e: any) => ({
    assetNumber: e.assets?.asset_number, assetName: e.assets?.name_ar,
    period: `${e.period_start} → ${e.period_end}`, amount: e.depreciation_amount, accumulated: e.accumulated_total, nbv: e.net_book_value,
  })));
}

export async function loadFullyDepreciated(uid: string, setData: SetData) {
  const { data: assets } = await supabase.from("assets").select("*").eq("user_id", uid);
  // Filter assets where NBV is 0 or null (fully depreciated) but still active
  setData((assets || []).filter(a => (a.net_book_value === 0 || a.net_book_value === null) && a.status !== "disposed"));
}

export async function loadAssetDisposal(uid: string, setData: SetData) {
  const { data: disposals } = await supabase.from("asset_disposals").select("*, assets!inner(asset_number, name_ar)").eq("user_id", uid).order("disposal_date", { ascending: false });
  setData((disposals || []).map((d: any) => ({
    assetNumber: d.assets?.asset_number, assetName: d.assets?.name_ar,
    date: d.disposal_date, nbv: d.net_book_value_at_disposal || 0, proceeds: d.disposal_proceeds || 0,
    gainLoss: d.gain_loss || 0, method: d.disposal_method,
  })));
}

export async function loadAssetsByLocation(uid: string, setData: SetData) {
  const { data: assets } = await supabase.from("assets").select("location, acquisition_cost, net_book_value").eq("user_id", uid);
  const locMap: Record<string, { location: string; count: number; cost: number; nbv: number }> = {};
  (assets || []).forEach(a => {
    const loc = a.location || "غير محدد";
    if (!locMap[loc]) locMap[loc] = { location: loc, count: 0, cost: 0, nbv: 0 };
    locMap[loc].count++; locMap[loc].cost += a.acquisition_cost || 0; locMap[loc].nbv += a.net_book_value || 0;
  });
  setData(Object.values(locMap).sort((a, b) => b.cost - a.cost));
}

export async function loadExchangeRates(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: rates } = await supabase.from("exchange_rates").select("*").eq("user_id", uid).gte("date", dateFrom).lte("date", dateTo).order("date", { ascending: false });
  setData((rates || []).map((r: any) => ({
    date: r.date, currency: r.currency_name || r.currency_code, code: r.currency_code,
    buy: r.buy_rate, sell: r.sell_rate, mid: r.mid_rate || ((r.buy_rate || 0) + (r.sell_rate || 0)) / 2,
  })));
}

export async function loadCurrencyConversions(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount").eq("user_id", uid).eq("is_deleted", false).eq("transaction_type", "currency_exchange").gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false });
  setData(txns || []);
}

export async function loadExchangeGainLoss(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  // Forex gains (7xxx) and forex losses (69xx or description-based)
  // Account-code based filter only — description LIKE removed (heuristic)
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, debit_account_code, credit_account_code").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).or("debit_account_code.like.71%,credit_account_code.like.71%,debit_account_code.like.69%,credit_account_code.like.69%,transaction_type.eq.currency_exchange").order("transaction_date", { ascending: false });
  setData((txns || []).map(tx => {
    const cc = tx.credit_account_code || "";
    const dc = tx.debit_account_code || "";
    const isGain = cc.startsWith("71") || dc.startsWith("69"); // credit to income = gain
    return { ...tx, type: isGain ? "ربح" : "خسارة" };
  }));
}

export async function loadAllOrders(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, total, state, customer_name").eq("user_id", uid).gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59").order("created_at", { ascending: false });
  setData(orders || []);
}

export async function loadGenericTransactions(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, debit_account_code, credit_account_code, transaction_type, reference").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false }).limit(200);
  setData(txns || []);
}
