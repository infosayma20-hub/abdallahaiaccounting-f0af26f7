import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { loadReturnsByContact } from "./returns-helper";

type SetData = (data: any[]) => void;

// ── Receivables & Payables Loaders ──

export async function loadARAgingDetail(uid: string, setData: SetData) {
  // Invoice-level AR aging detail. Uses invoices.remaining_amount > 0 bucketed by
  // COALESCE(due_date, invoice_date). Replaces previous contacts.current_balance
  // logic (forbidden by Core memory rule).
  const { data: invoices } = await supabase
    .from("invoices")
    .select("contact_id, contact_name, invoice_date, due_date, remaining_amount, total_amount, paid_amount, payment_status")
    .eq("user_id", uid)
    .eq("invoice_type", "sale")
    .eq("is_voided", false)
    .not("status", "in", "(cancelled,void,reversed)")
    .gt("remaining_amount", 0);
  if (!invoices?.length) { setData([]); return; }
  const contactIds = Array.from(new Set(invoices.map(i => i.contact_id).filter(Boolean) as string[]));
  const { data: contacts } = contactIds.length
    ? await supabase.from("contacts").select("id, contact_name, contact_class").in("id", contactIds)
    : { data: [] as any[] };
  const cMap = new Map((contacts || []).map(c => [c.id, c]));
  const today = new Date();
  const agg: Record<string, { name: string; cls: string; current: number; d31_60: number; d61_90: number; over90: number; total: number }> = {};
  invoices.forEach(inv => {
    const remaining = Number(inv.remaining_amount ?? ((inv.total_amount || 0) - (inv.paid_amount || 0))) || 0;
    if (remaining <= 0) return;
    if ((inv.payment_status || "").toLowerCase() === "paid") return;
    const refDate = inv.due_date || inv.invoice_date;
    const days = refDate ? differenceInDays(today, new Date(refDate)) : 0;
    const key = (inv.contact_id as string) || `__name:${inv.contact_name || "—"}`;
    if (!agg[key]) {
      const c = inv.contact_id ? cMap.get(inv.contact_id) : null;
      agg[key] = { name: c?.contact_name || inv.contact_name || "—", cls: c?.contact_class || "C", current: 0, d31_60: 0, d61_90: 0, over90: 0, total: 0 };
    }
    const row = agg[key];
    row.total += remaining;
    if (days <= 30) row.current += remaining;
    else if (days <= 60) row.d31_60 += remaining;
    else if (days <= 90) row.d61_90 += remaining;
    else row.over90 += remaining;
  });
  setData(Object.values(agg).sort((a, b) => b.total - a.total));
}

export async function loadDSOReport(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const contactTypes = ["عميل", "customer", "زبون"];
  const { data: contacts } = await supabase.from("contacts").select("id, contact_name, contact_class").eq("user_id", uid).in("contact_type", contactTypes);
  if (!contacts?.length) { setData([]); return; }
  const { data: txns } = await supabase.from("transactions").select("contact_id, transaction_date, amount, transaction_type").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: true });
  const today = new Date();
  setData(contacts.map(c => {
    const sales = (txns || []).filter(t => t.contact_id === c.id && (t.transaction_type?.includes("sale") || t.transaction_type === "pos_sale")).sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    const receipts = (txns || []).filter(t => t.contact_id === c.id && (t.transaction_type === "receipt")).sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    const invCount = sales.length;
    const paidCount = receipts.length;
    // Calculate days between each sale and the next receipt for that customer
    const collDays: number[] = [];
    let receiptIdx = 0;
    sales.forEach(s => {
      // Find the first receipt that came after this sale
      while (receiptIdx < receipts.length && receipts[receiptIdx].transaction_date < s.transaction_date) receiptIdx++;
      if (receiptIdx < receipts.length) {
        collDays.push(differenceInDays(new Date(receipts[receiptIdx].transaction_date), new Date(s.transaction_date)));
        receiptIdx++;
      }
    });
    const avgDays = collDays.length > 0 ? Math.round(collDays.reduce((a, b) => a + b, 0) / collDays.length) : 0;
    const lateDays = collDays.filter(d => d > 30);
    const avgLate = lateDays.length > 0 ? Math.round(lateDays.reduce((a, b) => a + b, 0) / lateDays.length) : 0;
    const bestPayment = collDays.length > 0 ? Math.min(...collDays) : 0;
    const worstPayment = collDays.length > 0 ? Math.max(...collDays) : 0;
    const grade = avgDays < 30 && paidCount / Math.max(invCount, 1) > 0.8 ? "A" : avgDays <= 45 ? "B" : avgDays <= 60 ? "C" : "D";
    return { name: c.contact_name, invCount, avgDays, avgLate, bestPayment, worstPayment, grade };
  }).filter(r => r.invCount > 0).sort((a, b) => b.avgLate - a.avgLate));
}

export async function loadChecksReceivable(uid: string, setData: SetData) {
  const { data: cheques } = await supabase.from("cheques").select("*").eq("user_id", uid).eq("cheque_type", "وارد").order("cheque_date", { ascending: true });
  const today = new Date();
  setData((cheques || []).map(c => ({
    party: c.party_name, number: c.cheque_number || "—", chequeDate: c.cheque_date,
    amount: c.amount, daysUntilDue: differenceInDays(new Date(c.cheque_date), today),
    status: c.status, bank: c.bank_name || "—",
  })));
}

export async function loadCustomerProfitability(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  // Real profitability from invoices + invoice_items (revenue, cogs, profit, margin).
  // Returns are subtracted when the `returns` table exists with sales rows;
  // otherwise the row is flagged via returns_not_included (kept 0 for sum safety).
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, contact_id, contact_name")
    .eq("user_id", uid)
    .eq("invoice_type", "sale")
    .eq("is_voided", false)
    .not("status", "in", "(cancelled,void,reversed)")
    .gte("invoice_date", dateFrom)
    .lte("invoice_date", dateTo);

  if (!invoices?.length) { setData([]); return; }

  const invIds = invoices.map(i => i.id);
  const invMap = new Map(invoices.map(i => [i.id, i]));

  const { data: items } = await supabase
    .from("invoice_items")
    .select("invoice_id, quantity, total_amount, cost_price, line_profit")
    .in("invoice_id", invIds);

  // Optional returns subtraction — query defensively (table may differ across tenants)
  let returnsByContact: Record<string, number> = {};
  let returnsAvailable = false;
  try {
    const { data: rets, error } = await supabase
      .from("returns" as any)
      .select("contact_id, total_amount, status, return_type, return_date")
      .eq("user_id", uid)
      .eq("return_type", "sales")
      .gte("return_date", dateFrom)
      .lte("return_date", dateTo);
    if (!error) {
      returnsAvailable = true;
      (rets || []).forEach((r: any) => {
        if (r.status && !["confirmed", "posted"].includes(r.status)) return;
        const k = r.contact_id || "__none__";
        returnsByContact[k] = (returnsByContact[k] || 0) + (Number(r.total_amount) || 0);
      });
    }
  } catch {
    returnsAvailable = false;
  }

  type Agg = { contactId: string | null; name: string; revenue: number; cogs: number; profit: number; invIds: Set<string>; missingCost: boolean };
  const agg: Record<string, Agg> = {};

  (items || []).forEach(it => {
    const inv = invMap.get(it.invoice_id);
    if (!inv) return;
    const key = (inv.contact_id as string) || `__name:${inv.contact_name || "—"}`;
    if (!agg[key]) {
      agg[key] = { contactId: inv.contact_id || null, name: inv.contact_name || "—", revenue: 0, cogs: 0, profit: 0, invIds: new Set(), missingCost: false };
    }
    const row = agg[key];
    const qty = Number(it.quantity) || 0;
    const rev = Number(it.total_amount) || 0;
    row.revenue += rev;
    row.invIds.add(it.invoice_id);
    if (it.cost_price == null) {
      row.missingCost = true;
    } else {
      const cost = Number(it.cost_price) * qty;
      row.cogs += cost;
      row.profit += it.line_profit != null ? Number(it.line_profit) : (rev - cost);
    }
  });

  // Make sure every invoice contributes to invCount even if it has no items
  invoices.forEach(inv => {
    const key = (inv.contact_id as string) || `__name:${inv.contact_name || "—"}`;
    if (!agg[key]) agg[key] = { contactId: inv.contact_id || null, name: inv.contact_name || "—", revenue: 0, cogs: 0, profit: 0, invIds: new Set(), missingCost: false };
    agg[key].invIds.add(inv.id);
  });

  // (debug logging intentionally omitted to avoid cross-file dep)

  const rows = Object.values(agg).map(a => {
    const returnsTotal = returnsAvailable ? (returnsByContact[a.contactId || "__none__"] || 0) : 0;
    const netRevenue = a.revenue - returnsTotal;
    const profit = a.profit - returnsTotal; // returns reduce profit by their net amount (cost side unknown without join)
    return {
      name: a.name,
      revenue: a.revenue,
      cogs: a.cogs,
      profit,
      margin: netRevenue > 0 ? (profit / netRevenue * 100) : 0,
      returns: returnsTotal,
      invCount: a.invIds.size,
      // Back-compat keys (older totals/columns reference these)
      totalSales: a.revenue,
      avgInv: a.invIds.size > 0 ? Math.round(a.revenue / a.invIds.size) : 0,
      returns_not_included: !returnsAvailable,
      cost_incomplete: a.missingCost,
    };
  }).filter(r => r.revenue > 0 || r.invCount > 0).sort((a, b) => b.profit - a.profit);

  setData(rows);
}

export async function loadCustomerStatementAll(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  // AR sub-account prefix is 113% (1130 root). Fixed assets live under 12xx and
  // must NOT be treated as AR movement.
  const contactTypes = ["عميل", "customer", "زبون"];
  const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).in("contact_type", contactTypes);
  if (!contacts?.length) { setData([]); return; }
  const { data: txns } = await supabase.from("transactions").select("contact_id, transaction_date, description, amount, debit_account_code, credit_account_code, reference").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
  const rows: any[] = [];
  contacts.forEach(c => {
    const cTxns = (txns || []).filter(t => t.contact_id === c.id);
    if (!cTxns.length) return;
    let balance = 0;
    cTxns.forEach(tx => {
      const debHitsAR = (tx.debit_account_code || "").startsWith("113");
      const creHitsAR = (tx.credit_account_code || "").startsWith("113");
      if (!debHitsAR && !creHitsAR) return; // skip lines unrelated to AR
      const debit = debHitsAR ? Number(tx.amount) || 0 : 0;
      const credit = creHitsAR ? Number(tx.amount) || 0 : 0;
      balance += debit - credit;
      rows.push({ contactName: c.contact_name, date: tx.transaction_date, ref: tx.reference || "—", desc: tx.description, debit, credit, balance });
    });
  });
  setData(rows);
}

export async function loadAPAgingDetail(uid: string, setData: SetData) {
  // Invoice-level AP aging detail. Uses invoices.remaining_amount > 0 bucketed by
  // COALESCE(due_date, invoice_date). Replaces previous contacts.current_balance
  // logic (forbidden by Core memory rule).
  const { data: invoices } = await supabase
    .from("invoices")
    .select("contact_id, contact_name, invoice_date, due_date, remaining_amount, total_amount, paid_amount, payment_status")
    .eq("user_id", uid)
    .eq("invoice_type", "purchase")
    .eq("is_voided", false)
    .not("status", "in", "(cancelled,void,reversed)")
    .gt("remaining_amount", 0);
  if (!invoices?.length) { setData([]); return; }
  const contactIds = Array.from(new Set(invoices.map(i => i.contact_id).filter(Boolean) as string[]));
  const { data: contacts } = contactIds.length
    ? await supabase.from("contacts").select("id, contact_name").in("id", contactIds)
    : { data: [] as any[] };
  const cMap = new Map((contacts || []).map(c => [c.id, c]));
  const today = new Date();
  const agg: Record<string, { name: string; current: number; d31_60: number; d61_90: number; over90: number; total: number; priority: string }> = {};
  invoices.forEach(inv => {
    const remaining = Number(inv.remaining_amount ?? ((inv.total_amount || 0) - (inv.paid_amount || 0))) || 0;
    if (remaining <= 0) return;
    if ((inv.payment_status || "").toLowerCase() === "paid") return;
    const refDate = inv.due_date || inv.invoice_date;
    const days = refDate ? differenceInDays(today, new Date(refDate)) : 0;
    const key = (inv.contact_id as string) || `__name:${inv.contact_name || "—"}`;
    if (!agg[key]) {
      const c = inv.contact_id ? cMap.get(inv.contact_id) : null;
      agg[key] = { name: c?.contact_name || inv.contact_name || "—", current: 0, d31_60: 0, d61_90: 0, over90: 0, total: 0, priority: "" };
    }
    const row = agg[key];
    row.total += remaining;
    if (days <= 30) row.current += remaining;
    else if (days <= 60) row.d31_60 += remaining;
    else if (days <= 90) row.d61_90 += remaining;
    else row.over90 += remaining;
  });
  Object.values(agg).forEach(r => {
    const maxDays = r.over90 > 0 ? 91 : r.d61_90 > 0 ? 61 : r.d31_60 > 0 ? 31 : 0;
    r.priority = maxDays > 90 ? "🔴 حرج" : maxDays > 60 ? "🟠 مرتفع" : maxDays > 30 ? "🟡 متوسط" : "🟢 مريح";
  });
  setData(Object.values(agg).sort((a, b) => b.total - a.total));
}

export async function loadDPOReport(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).eq("contact_type", "مورد");
  if (!contacts?.length) { setData([]); return; }
  const { data: txns } = await supabase.from("transactions").select("contact_id, transaction_date, amount, transaction_type").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date", { ascending: true });
  setData(contacts.map(c => {
    const purchases = (txns || []).filter(t => t.contact_id === c.id && t.transaction_type?.includes("purchase")).sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    const payments = (txns || []).filter(t => t.contact_id === c.id && t.transaction_type === "payment").sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    const totalPurchases = purchases.reduce((s, t) => s + (t.amount || 0), 0);
    // Match each purchase to next available payment chronologically
    const payDays: number[] = [];
    let payIdx = 0;
    purchases.forEach(p => {
      while (payIdx < payments.length && payments[payIdx].transaction_date < p.transaction_date) payIdx++;
      if (payIdx < payments.length) {
        payDays.push(differenceInDays(new Date(payments[payIdx].transaction_date), new Date(p.transaction_date)));
        payIdx++;
      }
    });
    const avgDays = payDays.length > 0 ? Math.round(payDays.reduce((a, b) => a + b, 0) / payDays.length) : 0;
    const compliance = purchases.length > 0 ? Math.round((payments.length / purchases.length) * 100) : 0;
    return { name: c.contact_name, totalPurchases, avgDays, compliance, invCount: purchases.length };
  }).filter(r => r.totalPurchases > 0).sort((a, b) => b.totalPurchases - a.totalPurchases));
}

export async function loadChecksPayable(uid: string, setData: SetData) {
  const { data: cheques } = await supabase.from("cheques").select("*").eq("user_id", uid).eq("cheque_type", "صادر").order("cheque_date", { ascending: true });
  const today = new Date();
  setData((cheques || []).map(c => ({
    party: c.party_name, number: c.cheque_number || "—", chequeDate: c.cheque_date,
    amount: c.amount, daysUntilDue: differenceInDays(new Date(c.cheque_date), today),
    status: c.status, bank: c.bank_name || "—",
  })));
}

export async function loadSupplierPurchaseAnalysis(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).eq("contact_type", "مورد");
  if (!contacts?.length) { setData([]); return; }
  const { data: txns } = await supabase.from("transactions").select("contact_id, amount, transaction_type").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo);
  // Subtract purchase returns by contact_id (P1 fix). Flag rows where the
  // returns table is unavailable so the UI can surface a warning.
  const ret = await loadReturnsByContact(uid, "purchase", dateFrom, dateTo);
  const totalAllPurchases = (txns || []).filter(t => t.transaction_type?.includes("purchase")).reduce((s, t) => s + (t.amount || 0), 0);
  setData(contacts.map(c => {
    const purchases = (txns || []).filter(t => t.contact_id === c.id && t.transaction_type?.includes("purchase"));
    const gross = purchases.reduce((s, t) => s + (t.amount || 0), 0);
    const returns = ret.byContactId.get(c.id) || 0;
    const total = gross - returns;
    const invCount = purchases.length;
    const avgInv = invCount > 0 ? Math.round(total / invCount) : 0;
    const pct = totalAllPurchases > 0 ? Math.round((gross / totalAllPurchases) * 100) : 0;
    return {
      name: c.contact_name,
      gross, returns, total, invCount, avgInv, pct,
      returns_not_included: !ret.available,
    };
  }).filter(r => r.gross > 0 || r.returns > 0).sort((a, b) => b.total - a.total));
}

export async function loadSupplierStatementAll(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  // AP sub-account prefix is 211% (2110 root). Tightened from 21% to avoid
  // 22xx long-term liabilities leaking in.
  const { data: contacts } = await supabase.from("contacts").select("id, contact_name").eq("user_id", uid).eq("contact_type", "مورد");
  if (!contacts?.length) { setData([]); return; }
  const { data: txns } = await supabase.from("transactions").select("contact_id, transaction_date, description, amount, debit_account_code, credit_account_code, reference").eq("user_id", uid).eq("is_deleted", false).gte("transaction_date", dateFrom).lte("transaction_date", dateTo).order("transaction_date");
  const rows: any[] = [];
  contacts.forEach(c => {
    const cTxns = (txns || []).filter(t => t.contact_id === c.id);
    if (!cTxns.length) return;
    let balance = 0;
    cTxns.forEach(tx => {
      const debHitsAP = (tx.debit_account_code || "").startsWith("211");
      const creHitsAP = (tx.credit_account_code || "").startsWith("211");
      if (!debHitsAP && !creHitsAP) return;
      const debit = debHitsAP ? Number(tx.amount) || 0 : 0;
      const credit = creHitsAP ? Number(tx.amount) || 0 : 0;
      balance += credit - debit;
      rows.push({ contactName: c.contact_name, date: tx.transaction_date, ref: tx.reference || "—", desc: tx.description, debit, credit, balance });
    });
  });
  setData(rows);
}

// ── Invoice Tracking Loaders ──

export async function loadInvoiceLifecycle(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: invoices } = await supabase.from("invoices").select("id, invoice_number, invoice_date, due_date, total_amount, paid_amount, remaining_amount, status, payment_status, contact_name").eq("user_id", uid).eq("invoice_type", "sale").eq("is_voided", false).not("status", "in", "(cancelled,void,reversed)").gte("invoice_date", dateFrom).lte("invoice_date", dateTo).order("invoice_date", { ascending: false });
  if (!invoices?.length) { setData([]); return; }
  const { data: linkData } = await supabase.from("payment_invoice_links").select("invoice_id, payment_id, allocated_amount");
  const { data: voucherData } = await supabase.from("receipt_vouchers").select("id, payment_date").eq("user_id", uid);
  const vMap = new Map((voucherData || []).map(v => [v.id, v.payment_date]));
  const invLinks = new Map<string, string[]>();
  (linkData || []).forEach(l => { if (!invLinks.has(l.invoice_id)) invLinks.set(l.invoice_id, []); invLinks.get(l.invoice_id)!.push(l.payment_id); });
  const today = new Date();
  setData(invoices.map(inv => {
    const paid = inv.paid_amount || 0;
    const remaining = inv.remaining_amount ?? (inv.total_amount - paid);
    const isPaid = inv.payment_status === "paid" || paid >= inv.total_amount;
    const paymentIds = invLinks.get(inv.id) || [];
    const lastPayDate = paymentIds.map(pid => vMap.get(pid)).filter(Boolean).sort().pop();
    let daysToClose: number | null = null;
    let closureStatus = "جارية";
    if (isPaid && lastPayDate) {
      daysToClose = differenceInDays(new Date(lastPayDate), new Date(inv.invoice_date));
      closureStatus = inv.due_date && lastPayDate <= inv.due_date ? "✅ في الموعد" : "⚠️ متأخر";
    } else if (!isPaid && inv.due_date && today > new Date(inv.due_date)) {
      closureStatus = "🔴 متأخرة";
    } else if (!isPaid) {
      closureStatus = "⏳ جارية";
    }
    return {
      invoiceNumber: inv.invoice_number || "—", customer: inv.contact_name || "—",
      issueDate: inv.invoice_date, dueDate: inv.due_date || "—",
      total: inv.total_amount, paid, remaining,
      daysToClose: daysToClose ?? "—", closureStatus,
    };
  }));
}

export async function loadDSODetailed(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: invoices } = await supabase.from("invoices").select("id, invoice_date, due_date, total_amount, paid_amount, payment_status, contact_name, contact_id").eq("user_id", uid).eq("invoice_type", "sale").eq("is_voided", false).not("status", "in", "(cancelled,void,reversed)").gte("invoice_date", dateFrom).lte("invoice_date", dateTo);
  if (!invoices?.length) { setData([]); return; }
  const { data: linkData } = await supabase.from("payment_invoice_links").select("invoice_id, payment_id");
  const { data: voucherData } = await supabase.from("receipt_vouchers").select("id, payment_date").eq("user_id", uid);
  const vMap = new Map((voucherData || []).map(v => [v.id, v.payment_date]));
  const invLinks = new Map<string, string[]>();
  (linkData || []).forEach(l => { if (!invLinks.has(l.invoice_id)) invLinks.set(l.invoice_id, []); invLinks.get(l.invoice_id)!.push(l.payment_id); });
  const customerMap: Record<string, { name: string; days: number[]; invCount: number }> = {};
  invoices.forEach(inv => {
    const isPaid = inv.payment_status === "paid" || (inv.paid_amount || 0) >= inv.total_amount;
    if (!isPaid) return;
    const paymentIds = invLinks.get(inv.id) || [];
    const lastPayDate = paymentIds.map(pid => vMap.get(pid)).filter(Boolean).sort().pop();
    if (!lastPayDate) return;
    const d = differenceInDays(new Date(lastPayDate), new Date(inv.invoice_date));
    const key = inv.contact_name || "غير محدد";
    if (!customerMap[key]) customerMap[key] = { name: key, days: [], invCount: 0 };
    customerMap[key].days.push(d);
    customerMap[key].invCount++;
  });
  setData(Object.values(customerMap).map(c => {
    const avg = Math.round(c.days.reduce((a, b) => a + b, 0) / c.days.length);
    const fastest = Math.min(...c.days);
    const slowest = Math.max(...c.days);
    const grade = avg < 30 ? "🟢 A ممتاز" : avg < 45 ? "🟡 B جيد" : avg < 60 ? "🟠 C مقبول" : "🔴 D خطر";
    return { name: c.name, invCount: c.invCount, avgDSO: avg, fastest, slowest, grade };
  }).sort((a, b) => a.avgDSO - b.avgDSO));
}

export async function loadARAgingAdvanced(uid: string, setData: SetData) {
  const { data: invoices } = await supabase.from("invoices").select("id, invoice_number, invoice_date, due_date, total_amount, paid_amount, remaining_amount, contact_name, payment_status").eq("user_id", uid).eq("invoice_type", "sale").eq("is_voided", false).not("status", "in", "(cancelled,void,reversed)");
  if (!invoices?.length) { setData([]); return; }
  const today = new Date();
  const customerMap: Record<string, { name: string; current: number; d1_30: number; d31_60: number; d61_90: number; over90: number; total: number }> = {};
  invoices.forEach(inv => {
    const remaining = Number(inv.remaining_amount ?? ((inv.total_amount || 0) - (inv.paid_amount || 0))) || 0;
    if (remaining <= 0) return;
    if ((inv.payment_status || "").toLowerCase() === "paid") return;
    const key = inv.contact_name || "غير محدد";
    if (!customerMap[key]) customerMap[key] = { name: key, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0, total: 0 };
    // Fallback to invoice_date when due_date is missing so legacy invoices age correctly.
    const refDate = inv.due_date || inv.invoice_date;
    const overdue = refDate ? differenceInDays(today, new Date(refDate)) : 0;
    if (overdue <= 0) customerMap[key].current += remaining;
    else if (overdue <= 30) customerMap[key].d1_30 += remaining;
    else if (overdue <= 60) customerMap[key].d31_60 += remaining;
    else if (overdue <= 90) customerMap[key].d61_90 += remaining;
    else customerMap[key].over90 += remaining;
    customerMap[key].total += remaining;
  });
  setData(Object.values(customerMap).sort((a, b) => b.total - a.total));
}

export async function loadCollectionEfficiency(uid: string, setData: SetData) {
  const months = [];
  for (let i = 11; i >= 0; i--) { const m = subMonths(new Date(), i); months.push({ label: format(m, "yyyy-MM"), from: format(startOfMonth(m), "yyyy-MM-dd"), to: format(endOfMonth(m), "yyyy-MM-dd") }); }
  const { data: invoices } = await supabase.from("invoices").select("id, invoice_date, due_date, total_amount, paid_amount, payment_status, contact_name").eq("user_id", uid).eq("invoice_type", "sale").eq("is_voided", false).not("status", "in", "(cancelled,void,reversed)").gte("invoice_date", months[0].from).lte("invoice_date", months[11].to);
  const { data: linkData } = await supabase.from("payment_invoice_links").select("invoice_id, payment_id, allocated_amount");
  const { data: voucherData } = await supabase.from("receipt_vouchers").select("id, payment_date").eq("user_id", uid);
  const vMap = new Map((voucherData || []).map(v => [v.id, v.payment_date]));
  const invLinks = new Map<string, { paymentIds: string[]; totalAllocated: number }>();
  (linkData || []).forEach(l => {
    if (!invLinks.has(l.invoice_id)) invLinks.set(l.invoice_id, { paymentIds: [], totalAllocated: 0 });
    invLinks.get(l.invoice_id)!.paymentIds.push(l.payment_id);
    invLinks.get(l.invoice_id)!.totalAllocated += l.allocated_amount;
  });
  setData(months.map(m => {
    const mInvoices = (invoices || []).filter(i => i.invoice_date >= m.from && i.invoice_date <= m.to);
    const issued = mInvoices.reduce((s, i) => s + i.total_amount, 0);
    const collected = mInvoices.reduce((s, i) => { const link = invLinks.get(i.id); return s + (link?.totalAllocated || 0); }, 0);
    const collectionRate = issued > 0 ? Math.round((collected / issued) * 100) : 0;
    let onTime = 0, late = 0;
    const lateDays: number[] = [];
    mInvoices.forEach(inv => {
      const isPaid = inv.payment_status === "paid" || (inv.paid_amount || 0) >= inv.total_amount;
      if (!isPaid) return;
      const link = invLinks.get(inv.id);
      if (!link) return;
      const lastPayDate = link.paymentIds.map(pid => vMap.get(pid)).filter(Boolean).sort().pop();
      if (!lastPayDate || !inv.due_date) return;
      if (lastPayDate <= inv.due_date) onTime++;
      else { late++; lateDays.push(differenceInDays(new Date(lastPayDate), new Date(inv.due_date))); }
    });
    const avgDaysLate = lateDays.length > 0 ? Math.round(lateDays.reduce((a, b) => a + b, 0) / lateDays.length) : 0;
    return { month: m.label, issued, collected, collectionRate, onTime, late, avgDaysLate };
  }));
}

export async function loadPaymentAllocation(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  const { data: linkData } = await supabase.from("payment_invoice_links").select("invoice_id, payment_id, allocated_amount");
  if (!linkData?.length) { setData([]); return; }
  const invIds = [...new Set(linkData.map(l => l.invoice_id))];
  const payIds = [...new Set(linkData.map(l => l.payment_id))];
  const { data: invoices } = await supabase.from("invoices").select("id, invoice_number").in("id", invIds);
  const { data: vouchers } = await supabase.from("receipt_vouchers").select("id, receipt_number, payment_date, contact_name, payment_method").eq("user_id", uid).in("id", payIds);
  const invMap = new Map((invoices || []).map(i => [i.id, i.invoice_number]));
  const vMap = new Map((vouchers || []).map(v => [v.id, v]));
  setData(linkData.filter(l => {
    const v = vMap.get(l.payment_id);
    return v && v.payment_date >= dateFrom && v.payment_date <= dateTo;
  }).map(l => {
    const v = vMap.get(l.payment_id)!;
    return {
      receiptNumber: v.receipt_number || "—",
      paymentDate: v.payment_date,
      customer: v.contact_name || "—",
      paymentMethod: v.payment_method || "—",
      invoiceNumber: invMap.get(l.invoice_id) || "—",
      allocated: l.allocated_amount,
    };
  }).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)));
}

export async function loadUnpaidInvoices(uid: string, dateFrom: string, dateTo: string, setData: SetData) {
  // Outstanding Invoices = ALL active sales invoices with remaining_amount > 0
  // as of `dateTo` (treated as "as-of date"). `dateFrom` is intentionally ignored
  // because outstanding balance is a point-in-time snapshot — filtering on
  // invoice_date >= dateFrom would hide historical unpaid invoices (P0 fix).
  // Excludes voided/cancelled/reversed. Includes partially-paid invoices
  // regardless of payment_invoice_links presence.
  const asOf = dateTo || new Date().toISOString().slice(0, 10);
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, due_date, total_amount, contact_name, contact_id, payment_status, paid_amount, remaining_amount")
    .eq("user_id", uid)
    .eq("invoice_type", "sale")
    .eq("is_voided", false)
    .not("status", "in", "(cancelled,void,reversed)")
    .gt("remaining_amount", 0)
    .lte("invoice_date", asOf);
  if (!invoices?.length) { setData([]); return; }
  const today = new Date(asOf);
  setData(invoices.map(inv => ({
    invoiceNumber: inv.invoice_number || "—",
    customer: inv.contact_name || "—",
    issueDate: inv.invoice_date,
    total: Number(inv.total_amount) || 0,
    daysSinceIssue: differenceInDays(today, new Date(inv.invoice_date)),
  })).sort((a, b) => b.daysSinceIssue - a.daysSinceIssue));
}
