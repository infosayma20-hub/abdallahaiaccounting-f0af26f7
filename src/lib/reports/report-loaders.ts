import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, format, subDays, subMonths, startOfMonth, endOfMonth, getHours, getDay } from "date-fns";
import { fmtAmt } from "./report-helpers";

type SetData = (data: any[]) => void;

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

  // Calculate opening cash balance
  const { data: openTxns } = await supabase.from("transactions").select("debit_account_code, credit_account_code, amount").eq("user_id", uid).eq("is_deleted", false).lt("transaction_date", dateFrom).or("debit_account_code.like.111%,credit_account_code.like.111%");
  let openingCash = 0;
  (openTxns || []).forEach(tx => {
    if ((tx.debit_account_code || "").startsWith("111")) openingCash += tx.amount;
    if ((tx.credit_account_code || "").startsWith("111")) openingCash -= tx.amount;
  });

  let operating = 0, investing = 0, financing = 0;
  txns.forEach(tx => {
    const dc = tx.debit_account_code || "", cc = tx.credit_account_code || "";
    if (dc.startsWith("4") || cc.startsWith("4") || dc.startsWith("5") || cc.startsWith("5") || dc.startsWith("6") || cc.startsWith("6")) {
      if (cc.startsWith("4")) operating += tx.amount; else if (dc.startsWith("5") || dc.startsWith("6")) operating -= tx.amount; else operating += tx.amount;
    } else if (dc.startsWith("15") || cc.startsWith("15") || dc.startsWith("12") || cc.startsWith("12")) {
      if (dc.startsWith("15") || dc.startsWith("12")) investing -= tx.amount; else investing += tx.amount;
    } else if (dc.startsWith("3") || cc.startsWith("3") || dc.startsWith("22") || cc.startsWith("22")) {
      if (cc.startsWith("3") || cc.startsWith("22")) financing += tx.amount; else financing -= tx.amount;
    }
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

export async function loadTotalSales(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("transaction_date, amount").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
  const dayMap: Record<string, { date: string; count: number; total: number }> = {};
  (txns || []).forEach(tx => { const d = tx.transaction_date; if (!dayMap[d]) dayMap[d] = { date: d, count: 0, total: 0 }; dayMap[d].count++; dayMap[d].total += tx.amount; });
  setData(Object.values(dayMap));
}

export async function loadDailySalesReport(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("transaction_date, amount, transaction_type").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
  const dayMap: Record<string, { date: string; count: number; sales: number; returns: number }> = {};
  (txns || []).forEach(tx => {
    const d = tx.transaction_date;
    if (!dayMap[d]) dayMap[d] = { date: d, count: 0, sales: 0, returns: 0 };
    if (tx.transaction_type?.startsWith("sale") || tx.transaction_type === "pos_sale") { dayMap[d].count++; dayMap[d].sales += tx.amount; }
    if (tx.transaction_type === "return") dayMap[d].returns += tx.amount;
  });
  setData(Object.values(dayMap).map(d => ({ ...d, net: d.sales - d.returns })));
}

export async function loadInvoiceRegister(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, transaction_type, payment_method, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false });
  setData(txns || []);
}

export async function loadByCustomer(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("contact_id, amount, transaction_date").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
  const { data: contacts } = await supabase.from("contacts").select("id, contact_name, contact_class").eq("user_id", uid).eq("contact_type", "عميل");
  const cMap = new Map((contacts || []).map(c => [c.id, c]));
  const custMap: Record<string, { name: string; cls: string; count: number; total: number; lastDate: string }> = {};
  (txns || []).forEach(tx => {
    if (!tx.contact_id) return;
    const c = cMap.get(tx.contact_id);
    const key = tx.contact_id;
    if (!custMap[key]) custMap[key] = { name: c?.contact_name || "غير محدد", cls: c?.contact_class || "-", count: 0, total: 0, lastDate: "" };
    custMap[key].count++; custMap[key].total += tx.amount;
    if (tx.transaction_date > custMap[key].lastDate) custMap[key].lastDate = tx.transaction_date;
  });
  setData(Object.values(custMap).sort((a, b) => b.total - a.total));
}

export async function loadCollections(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, payment_method, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).eq("transaction_type", "receipt").gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false });
  setData(txns || []);
}

export async function loadSalesReturns(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).or("transaction_type.eq.return,description.ilike.%مرتجع%").order("transaction_date", { ascending: false });
  setData(txns || []);
}

export async function loadSalesPerformance(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("amount, transaction_date").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
  const daysDiff = differenceInDays(new Date(dateTo), new Date(dateFrom));
  const prevFrom = format(subDays(new Date(dateFrom), daysDiff + 1), "yyyy-MM-dd");
  const prevTo = format(subDays(new Date(dateFrom), 1), "yyyy-MM-dd");
  const { data: prevTxns } = await supabase.from("transactions").select("amount").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["sale_cash", "sale_bank", "sale_credit", "sale_cheque", "pos_sale"]).gte("transaction_date", prevFrom).lte("transaction_date", prevTo);
  const total = (txns || []).reduce((s, t) => s + t.amount, 0);
  const prevTotal = (prevTxns || []).reduce((s, t) => s + t.amount, 0);
  const growth = prevTotal > 0 ? ((total - prevTotal) / prevTotal * 100) : 0;
  const count = (txns || []).length;
  const avgTicket = count > 0 ? total / count : 0;
  const dayMap: Record<string, number> = {};
  (txns || []).forEach(t => { dayMap[t.transaction_date] = (dayMap[t.transaction_date] || 0) + t.amount; });
  const bestDay = Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0];
  setData([
    { label: "إجمالي المبيعات", value: fmtAmt(total), color: "#059669" },
    { label: "عدد الفواتير", value: count.toString(), color: "#0070F2" },
    { label: "متوسط قيمة الفاتورة", value: fmtAmt(avgTicket), color: "#6366F1" },
    { label: "معدل النمو", value: `${growth.toFixed(1)}%`, color: growth >= 0 ? "#059669" : "#DC2626" },
    { label: "أعلى يوم مبيعات", value: bestDay ? `${bestDay[0]}: ${fmtAmt(bestDay[1])}` : "-", color: "#4A9EE8" },
    { label: "مبيعات الفترة السابقة", value: fmtAmt(prevTotal), color: "#8B9BB4" },
  ]);
}

export async function loadSalesByProductReport(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("id").eq("user_id", uid).eq("state", "paid").gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
  if (!orders?.length) { setData([]); return; }
  const orderIds = orders.map(o => o.id);
  const { data: lines } = await supabase.from("pos_order_lines").select("product_name, qty, total, cost_price, order_id").in("order_id", orderIds);
  const pm: Record<string, { name: string; qty: number; revenue: number; cost: number }> = {};
  (lines || []).forEach(l => {
    if (!pm[l.product_name]) pm[l.product_name] = { name: l.product_name, qty: 0, revenue: 0, cost: 0 };
    pm[l.product_name].qty += l.qty; pm[l.product_name].revenue += l.total; pm[l.product_name].cost += (l.cost_price || 0) * l.qty;
  });
  setData(Object.values(pm).sort((a, b) => b.revenue - a.revenue));
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

export async function loadProductProfitability(uid: string, setData: SetData) {
  const { data: products } = await supabase.from("products").select("id, name, buy_price, sell_price, quantity").eq("user_id", uid);
  setData((products || []).map(p => ({
    name: p.name, buyPrice: p.buy_price || 0, sellPrice: p.sell_price || 0,
    margin: p.sell_price && p.buy_price ? ((p.sell_price - p.buy_price) / p.sell_price * 100) : 0,
    profit: (p.sell_price || 0) - (p.buy_price || 0), stock: p.quantity || 0,
  })).sort((a, b) => b.margin - a.margin));
}

export async function loadFinancialKPIs(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("debit_account_code, credit_account_code, amount").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
  let revenue = 0, cogs = 0, expenses = 0;
  (txns || []).forEach(tx => {
    const dc = tx.debit_account_code || "", cc = tx.credit_account_code || "";
    if (cc.startsWith("4")) revenue += tx.amount;
    if (dc.startsWith("51")) cogs += tx.amount;
    if (dc.startsWith("5") && !dc.startsWith("51")) expenses += tx.amount;
  });
  const grossMargin = revenue > 0 ? ((revenue - cogs) / revenue * 100) : 0;
  const netMargin = revenue > 0 ? ((revenue - cogs - expenses) / revenue * 100) : 0;
  setData([
    { label: "إجمالي الإيرادات", value: fmtAmt(revenue), color: "#059669" },
    { label: "هامش الربح الإجمالي", value: `${grossMargin.toFixed(1)}%`, color: grossMargin >= 30 ? "#059669" : grossMargin >= 15 ? "#4A9EE8" : "#DC2626" },
    { label: "هامش الربح الصافي", value: `${netMargin.toFixed(1)}%`, color: netMargin >= 10 ? "#059669" : netMargin >= 5 ? "#4A9EE8" : "#DC2626" },
    { label: "صافي الربح", value: fmtAmt(revenue - cogs - expenses), color: revenue - cogs - expenses >= 0 ? "#059669" : "#DC2626" },
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
    (txns || []).forEach(tx => { if (tx.transaction_date >= m.from && tx.transaction_date <= m.to) { if ((tx.credit_account_code || "").startsWith("4")) rev += tx.amount; if ((tx.debit_account_code || "").startsWith("5")) exp += tx.amount; } });
    return { month: m.label, revenue: rev, expenses: exp, profit: rev - exp };
  }));
}

export async function loadForeignBalances(uid: string, setData: SetData) {
  const { data: accounts } = await supabase.from("accounts").select("account_code, account_name").eq("user_id", uid).in("account_code", ["1111", "1112", "1113", "1114"]);
  if (!accounts?.length) { setData([]); return; }
  const result = [];
  for (const acc of accounts) {
    const { data: txns } = await supabase.from("transactions").select("amount, debit_account_code, credit_account_code").eq("user_id", uid).eq("is_deleted", false).or(`debit_account_code.eq.${acc.account_code},credit_account_code.eq.${acc.account_code}`);
    let balance = 0;
    (txns || []).forEach(tx => { if (tx.debit_account_code === acc.account_code) balance += tx.amount; if (tx.credit_account_code === acc.account_code) balance -= tx.amount; });
    const currencyMap: Record<string, string> = { "1111": "USD", "1112": "JOD", "1113": "EUR", "1114": "EGP" };
    result.push({ account: acc.account_name, code: acc.account_code, currency: currencyMap[acc.account_code] || "—", balance });
  }
  setData(result);
}

export async function loadTotalPurchases(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("transaction_date, amount").eq("user_id", uid).eq("is_deleted", false).in("transaction_type", ["purchase_cash", "purchase_credit", "purchase_bank"]).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
  const dayMap: Record<string, { date: string; count: number; total: number }> = {};
  (txns || []).forEach(tx => { const d = tx.transaction_date; if (!dayMap[d]) dayMap[d] = { date: d, count: 0, total: 0 }; dayMap[d].count++; dayMap[d].total += tx.amount; });
  setData(Object.values(dayMap));
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
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, contact_id, reference").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).or("transaction_type.eq.purchase_return,description.ilike.%مرتجع شراء%").order("transaction_date", { ascending: false });
  setData(txns || []);
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

export async function loadStockMovement(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("id, created_at, state").eq("user_id", uid).gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59");
  if (!orders?.length) { setData([]); return; }
  const { data: lines } = await supabase.from("pos_order_lines").select("product_name, qty, order_id").in("order_id", orders.map(o => o.id));
  const orderStateMap = new Map(orders.map(o => [o.id, o]));
  setData((lines || []).map(l => {
    const order = orderStateMap.get(l.order_id);
    return {
      date: order?.created_at?.split("T")[0] || "", product: l.product_name,
      type: order?.state === "paid" ? "بيع" : "مرتجع",
      qty: order?.state === "paid" ? -l.qty : l.qty, ref: l.order_id.substring(0, 8),
    };
  }));
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
  const { data: assets } = await supabase.from("assets").select("*").eq("user_id", uid).lte("net_book_value", 0);
  setData(assets || []);
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
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, debit_account_code, credit_account_code").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).or("debit_account_code.eq.7110,credit_account_code.eq.7110,debit_account_code.eq.5110,credit_account_code.eq.5110").order("transaction_date", { ascending: false });
  setData((txns || []).map(tx => ({
    ...tx, type: (tx.credit_account_code || "").startsWith("7") ? "ربح" : "خسارة",
  })));
}

export async function loadAllOrders(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: orders } = await supabase.from("pos_orders").select("id, order_number, created_at, total, state, customer_name").eq("user_id", uid).gte("created_at", dateFrom).lte("created_at", dateTo + "T23:59:59").order("created_at", { ascending: false });
  setData(orders || []);
}

export async function loadGenericTransactions(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: txns } = await supabase.from("transactions").select("id, transaction_date, description, amount, debit_account_code, credit_account_code, transaction_type, reference").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: false }).limit(200);
  setData(txns || []);
}
