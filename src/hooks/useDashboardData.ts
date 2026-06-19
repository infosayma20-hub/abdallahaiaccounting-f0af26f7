import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

export type PeriodType = "today" | "week" | "month" | "year" | "custom";

interface PeriodRange {
  from: string;
  to: string;
}

function getPeriodRange(period: PeriodType, custom?: PeriodRange): PeriodRange {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  switch (period) {
    case "today":
      return { from: to, to };
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      return { from: d.toISOString().split("T")[0], to };
    }
    case "month":
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to };
    case "year":
      return { from: `${now.getFullYear()}-01-01`, to };
    case "custom":
      return custom || { from: `${now.getFullYear()}-01-01`, to };
  }
}

function getPrevYearRange(range: PeriodRange): PeriodRange {
  const shift = (d: string) => {
    const parts = d.split("-");
    return `${Number(parts[0]) - 1}-${parts[1]}-${parts[2]}`;
  };
  return { from: shift(range.from), to: shift(range.to) };
}

export interface DashboardKPI {
  netProfit: number;
  revenue: number;
  expenses: number;
  cashBalance: number;
  receivables: number;
  payables: number;
  // Previous period for comparison
  prevNetProfit: number;
  prevRevenue: number;
  prevExpenses: number;
  prevCashBalance: number;
  prevReceivables: number;
  prevPayables: number;
}

export interface ChartDataPoint {
  period: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface AgingBucket {
  contactName: string;
  contactId: string;
  total: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
}

export interface RecentActivity {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "other";
  timeAgo: string;
}

export interface ChequeItem {
  id: string;
  chequeDate: string;
  amount: number;
  partyName: string;
  chequeType: string;
  status: string;
  daysRemaining: number;
}

export interface InventoryAlert {
  id: string;
  name: string;
  quantity: number;
  reorderPoint: number;
  status: "out" | "low" | "ok";
}

export function useDashboardData() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<PeriodType>("month");
  const [customRange, setCustomRange] = useState<PeriodRange | undefined>();
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [chartGrouping, setChartGrouping] = useState<"daily" | "weekly" | "monthly">("daily");

  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [cheques, setCheques] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [profileData, setProfileData] = useState<any>(null);
  const [companyLogo, setCompanyLogo] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const range = useMemo(() => getPeriodRange(period, customRange), [period, customRange]);
  const prevRange = useMemo(() => getPrevYearRange(range), [range]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [txRes, acctRes, chqRes, prodRes, contactRes, profileRes, invoiceItemsRes, settingsRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, transaction_date, description, transaction_type, debit_account_code, credit_account_code, amount, currency, is_deleted, is_opening_balance, contact_id, created_at")
          .eq("user_id", dataOwnerId!)
          .eq("is_deleted", false)
          .order("transaction_date", { ascending: false })
          .limit(5000),
        supabase
          .from("accounts")
          .select("account_code, account_name, account_type")
          .eq("user_id", dataOwnerId!),
        supabase
          .from("cheques")
          .select("id, cheque_date, amount, party_name, cheque_type, status, currency")
          .eq("user_id", dataOwnerId!),
        supabase
          .from("products")
          .select("id, name, quantity, min_quantity, buy_price, sell_price")
          .eq("user_id", dataOwnerId!)
          .order("quantity", { ascending: true }),
        supabase
          .from("contacts")
          .select("id, contact_name, contact_type, current_balance")
          .eq("user_id", dataOwnerId!)
          .eq("is_active", true),
        supabase
          .from("profiles")
          .select("display_name, company_name, setup_completed")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("invoice_items")
          .select("product_name, quantity, total_amount, invoice_id, invoices!inner(user_id, invoice_type, status, is_voided)")
          .eq("invoices.user_id", user.id)
          .eq("invoices.invoice_type", "sale")
          .eq("invoices.is_voided", false)
          .not("invoices.status", "in", "(cancelled,void,reversed)"),
        supabase
          .from("company_settings")
          .select("logo_url")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      setTransactions(txRes.data || []);
      setAccounts(acctRes.data || []);
      setCheques(chqRes.data || []);
      setProducts(prodRes.data || []);
      setContacts(contactRes.data || []);
      setInvoiceItems(invoiceItemsRes.data || []);
      setProfileData(profileRes.data);
      setCompanyLogo(settingsRes.data?.logo_url || "");
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh KPIs every 5 min
  useEffect(() => {
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Account type map
  const accountTypeMap = useMemo(() => {
    const m: Record<string, string> = {};
    accounts.forEach((a) => { m[a.account_code] = a.account_type; });
    return m;
  }, [accounts]);

  // Filter transactions by period
  const filterByRange = useCallback((txs: any[], r: PeriodRange) => {
    return txs.filter((tx) => {
      const d = tx.transaction_date;
      return d >= r.from && d <= r.to;
    });
  }, []);

  const plTx = useMemo(() => transactions.filter(
    (tx) => !tx.is_opening_balance && tx.transaction_type !== "رصيد ابتدائي"
  ), [transactions]);

  // Compute KPIs for a given range
  const computeKPIs = useCallback((txs: any[], allTxs: any[], allTxsIncludingOB: any[]) => {
    // ✅ Reversal-aware net calculations
    // Revenue accounts (4xxx): natural side is CREDIT. Debits to 4xxx = reversal/contra entries
    //   (e.g. POS reversal: Dr 4100 / Cr Cash). Net revenue = Credits - Debits.
    // Expense accounts (5xxx/6xxx): natural side is DEBIT. Credits to 5xxx/6xxx = reversal/contra
    //   entries. Net expense = Debits - Credits.
    // This matches the journal source-of-truth and prevents overstating revenue/expense
    // when reversal entries (عكس قيد) exist for cancelled POS sales, invoices, or vouchers.
    const revenueCredits = txs.filter((t) => t.credit_account_code?.startsWith("4")).reduce((s, t) => s + (t.amount || 0), 0);
    const revenueDebits = txs.filter((t) => t.debit_account_code?.startsWith("4")).reduce((s, t) => s + (t.amount || 0), 0);
    const revenue = revenueCredits - revenueDebits;

    const isPurchaseCode = (c: string) => c.startsWith("51") || c.startsWith("52");
    const isGenExpenseCode = (c: string) => (c.startsWith("5") && !isPurchaseCode(c)) || c.startsWith("6");
    const isExpenseCode = (c: string) => isPurchaseCode(c) || isGenExpenseCode(c);

    const expenseDebits = txs.filter((t) => isExpenseCode(t.debit_account_code || "")).reduce((s, t) => s + (t.amount || 0), 0);
    const expenseCredits = txs.filter((t) => isExpenseCode(t.credit_account_code || "")).reduce((s, t) => s + (t.amount || 0), 0);
    const expenses = expenseDebits - expenseCredits;
    const netProfit = revenue - expenses;

    // Balance sheet items use ALL transactions INCLUDING opening balances (cumulative)
    // ── Net receivables = customer AR (1130) minus customer advances (2115).
    //    Advance from a customer is a liability that offsets what they owe us.
    const recDr = allTxsIncludingOB.filter((t) => t.debit_account_code === "1130").reduce((s, t) => s + (t.amount || 0), 0);
    const recCr = allTxsIncludingOB.filter((t) => t.credit_account_code === "1130").reduce((s, t) => s + (t.amount || 0), 0);
    const custAdvCr = allTxsIncludingOB.filter((t) => t.credit_account_code === "2115").reduce((s, t) => s + (t.amount || 0), 0);
    const custAdvDr = allTxsIncludingOB.filter((t) => t.debit_account_code === "2115").reduce((s, t) => s + (t.amount || 0), 0);
    const receivables = (recDr - recCr) - (custAdvCr - custAdvDr);

    // ── Net payables = supplier AP (2110) minus supplier advances (1146 is asset).
    //    Advance to a supplier is an asset that offsets what we owe them.
    //    payables stays negative = money owed to suppliers (existing convention).
    const payCr = allTxsIncludingOB.filter((t) => t.credit_account_code?.startsWith("2") && t.credit_account_code !== "2115").reduce((s, t) => s + (t.amount || 0), 0);
    const payDr = allTxsIncludingOB.filter((t) => t.debit_account_code?.startsWith("2") && t.debit_account_code !== "2115").reduce((s, t) => s + (t.amount || 0), 0);
    const supAdvDr = allTxsIncludingOB.filter((t) => t.debit_account_code === "1146").reduce((s, t) => s + (t.amount || 0), 0);
    const supAdvCr = allTxsIncludingOB.filter((t) => t.credit_account_code === "1146").reduce((s, t) => s + (t.amount || 0), 0);
    // (payDr - payCr) is negative when we owe; advances reduce that absolute owe.
    const payables = (payDr - payCr) + (supAdvDr - supAdvCr);

    // Cash = all cash boxes (111x) + all bank accounts (112x)
    const cashDr = allTxsIncludingOB.filter((t) => t.debit_account_code?.startsWith("111") || t.debit_account_code?.startsWith("112")).reduce((s, t) => s + (t.amount || 0), 0);
    const cashCr = allTxsIncludingOB.filter((t) => t.credit_account_code?.startsWith("111") || t.credit_account_code?.startsWith("112")).reduce((s, t) => s + (t.amount || 0), 0);
    const cashBalance = cashDr - cashCr;

    return { revenue, expenses, netProfit, receivables, payables, cashBalance };
  }, []);

  const kpis = useMemo<DashboardKPI>(() => {
    const periodTx = filterByRange(plTx, range);
    const current = computeKPIs(periodTx, plTx, transactions);
    const prevTx = filterByRange(plTx, prevRange);
    const prev = computeKPIs(prevTx, plTx, transactions);

    return {
      ...current,
      prevNetProfit: prev.netProfit,
      prevRevenue: prev.revenue,
      prevExpenses: prev.expenses,
      prevCashBalance: prev.cashBalance,
      prevReceivables: prev.receivables,
      prevPayables: prev.payables,
    };
  }, [plTx, transactions, range, prevRange, filterByRange, computeKPIs]);

  // Chart data
  const chartData = useMemo<ChartDataPoint[]>(() => {
    const periodTx = filterByRange(plTx, range);
    const buckets: Record<string, { revenue: number; expenses: number }> = {};

    periodTx.forEach((tx) => {
      let key: string;
      const d = new Date(tx.transaction_date);
      if (chartGrouping === "monthly") {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } else if (chartGrouping === "weekly") {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        key = weekStart.toISOString().split("T")[0];
      } else {
        key = tx.transaction_date;
      }

      if (!buckets[key]) buckets[key] = { revenue: 0, expenses: 0 };
      // ✅ Reversal-aware: subtract debits to revenue accounts and credits to expense accounts
      if (tx.credit_account_code?.startsWith("4")) buckets[key].revenue += tx.amount || 0;
      if (tx.debit_account_code?.startsWith("4")) buckets[key].revenue -= tx.amount || 0;
      const dc = tx.debit_account_code || "";
      const cc = tx.credit_account_code || "";
      if (dc.startsWith("5") || dc.startsWith("6")) buckets[key].expenses += tx.amount || 0;
      if (cc.startsWith("5") || cc.startsWith("6")) buckets[key].expenses -= tx.amount || 0;
    });

    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => ({
        period,
        revenue: v.revenue,
        expenses: v.expenses,
        profit: v.revenue - v.expenses,
      }));
  }, [plTx, range, chartGrouping, filterByRange]);

  // Sparkline data for KPIs (last 7 days)
  const sparklines = useMemo(() => {
    const now = new Date();
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split("T")[0]);
    }

    // ✅ Reversal-aware sparklines: subtract reversal entries from revenue/expense
    const dailyRevenue = (day: string) => {
      const rows = plTx.filter((t) => t.transaction_date === day);
      const cr = rows.filter((t) => t.credit_account_code?.startsWith("4")).reduce((s, t) => s + (t.amount || 0), 0);
      const dr = rows.filter((t) => t.debit_account_code?.startsWith("4")).reduce((s, t) => s + (t.amount || 0), 0);
      return cr - dr;
    };
    const dailyExpense = (day: string) => {
      const rows = plTx.filter((t) => t.transaction_date === day);
      const dr = rows.filter((t) => (t.debit_account_code || "").startsWith("5") || (t.debit_account_code || "").startsWith("6")).reduce((s, t) => s + (t.amount || 0), 0);
      const cr = rows.filter((t) => (t.credit_account_code || "").startsWith("5") || (t.credit_account_code || "").startsWith("6")).reduce((s, t) => s + (t.amount || 0), 0);
      return dr - cr;
    };

    const revenueArr = days.map(dailyRevenue);
    const expenseArr = days.map(dailyExpense);
    return {
      revenue: revenueArr,
      expenses: expenseArr,
      profit: days.map((_, i) => revenueArr[i] - expenseArr[i]),
    };
  }, [plTx]);

  // Health score
  const healthScore = useMemo(() => {
    const { revenue, expenses, receivables, payables, cashBalance } = kpis;
    const absPayables = Math.abs(payables); // payables is negative, use absolute for ratios
    const profitMargin = revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0;
    const currentRatio = absPayables > 0 ? cashBalance / absPayables : cashBalance > 0 ? 3 : 0;
    const collectionEff = (revenue > 0 && receivables >= 0) ? Math.max(0, Math.min(100, ((revenue - receivables) / revenue) * 100)) : 100;
    const debtRatio = (cashBalance + receivables) > 0 ? absPayables / (cashBalance + receivables) : 0;

    let score = 50;
    if (profitMargin > 15) score += 15; else if (profitMargin > 5) score += 8; else if (profitMargin < 0) score -= 15;
    if (currentRatio > 1.5) score += 15; else if (currentRatio > 1) score += 8; else score -= 10;
    if (collectionEff > 80) score += 10; else if (collectionEff > 50) score += 5; else score -= 10;
    if (debtRatio < 0.6) score += 10; else if (debtRatio < 1) score += 3; else score -= 15;

    score = Math.max(0, Math.min(100, score));

    return {
      score,
      label: score >= 75 ? "ممتاز" : score >= 55 ? "جيد" : score >= 35 ? "تحذير" : "خطر",
      profitMargin: Math.round(profitMargin),
      currentRatio: Math.round(currentRatio * 10) / 10,
      collectionEff: Math.round(collectionEff),
      debtRatio: Math.round(debtRatio * 10) / 10,
    };
  }, [kpis]);

  // Aging report
  const agingData = useMemo<{ receivables: AgingBucket[]; payables: AgingBucket[] }>(() => {
    const now = new Date();
    const buildAging = (contactType: "عميل" | "مورد", accountCode: string): AgingBucket[] => {
      const relevantContacts = contacts.filter((c) => c.contact_type === contactType && Math.abs(c.current_balance || 0) > 0);
      return relevantContacts.map((contact) => {
        const total = Math.abs(contact.current_balance || 0);
        // For customers: look at debit transactions on receivables (1130) = invoices creating debt
        // For suppliers: look at credit transactions on payables (2xxx) = purchases creating debt
        const isCustomer = contactType === "عميل";
        const agingTxs = transactions.filter((t) => {
          if (t.contact_id !== contact.id || t.is_deleted) return false;
          if (isCustomer) {
            // Debit to receivables = customer owes us
            return t.debit_account_code === accountCode;
          } else {
            // Credit to payables = we owe supplier
            return t.credit_account_code?.startsWith("2");
          }
        });

        let b0 = 0, b30 = 0, b60 = 0, b90 = 0;
        agingTxs.forEach((tx) => {
          const days = Math.floor((now.getTime() - new Date(tx.transaction_date).getTime()) / 86400000);
          const amt = tx.amount || 0;
          if (days <= 30) b0 += amt;
          else if (days <= 60) b30 += amt;
          else if (days <= 90) b60 += amt;
          else b90 += amt;
        });
        const sum = b0 + b30 + b60 + b90 || 1;
        return {
          contactName: contact.contact_name,
          contactId: contact.id,
          total,
          bucket_0_30: Math.round((b0 / sum) * total),
          bucket_31_60: Math.round((b30 / sum) * total),
          bucket_61_90: Math.round((b60 / sum) * total),
          bucket_90_plus: Math.round((b90 / sum) * total),
        };
      }).sort((a, b) => b.total - a.total).slice(0, 10);
    };

    return {
      receivables: buildAging("عميل", "1130"),
      payables: buildAging("مورد", "2110"),
    };
  }, [contacts, transactions]);

  // Recent activity
  const recentActivity = useMemo<RecentActivity[]>(() => {
    const now = new Date();
    return transactions.slice(0, 12).map((tx) => {
      const txDate = new Date(tx.created_at || tx.transaction_date);
      const diffMs = now.getTime() - txDate.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);
      let timeAgo = "الآن";
      if (diffDay > 0) timeAgo = diffDay === 1 ? "أمس" : `منذ ${diffDay} أيام`;
      else if (diffHr > 0) timeAgo = `منذ ${diffHr} ساعة`;
      else if (diffMin > 0) timeAgo = `منذ ${diffMin} دقيقة`;

      const dc = tx.debit_account_code || "";
      const cc = tx.credit_account_code || "";
      let type: "income" | "expense" | "other" = "other";
      // ✅ Reversal-aware classification (must run BEFORE income/expense checks):
      //   - Reversal of revenue (Dr 4xxx) → outflow / expense-like effect
      //   - Reversal of expense (Cr 5xxx/6xxx) → inflow / income-like effect
      const isReversal = tx.transaction_type === "reversal" || (tx.description || "").startsWith("عكس قيد");
      if (isReversal) {
        if (dc.startsWith("4")) type = "expense"; // reversed sale = money out / negative income
        else if (cc.startsWith("5") || cc.startsWith("6")) type = "income"; // reversed expense
      }
      // Income: revenue credited OR cash/bank received
      if (type === "other" && (cc.startsWith("4") || dc === "1110" || dc === "1120")) type = "income";
      // Expense: expense accounts debited, OR cash/bank paid out (credit side) for non-revenue
      if (type === "other" && (dc.startsWith("5") || dc.startsWith("6"))) type = "expense";
      // Payments from cash/bank (credit 1110/1120) that are NOT revenue (no credit 4xxx) = expense/outflow
      if (type === "other" && (cc === "1110" || cc === "1120" || cc.startsWith("111") || cc.startsWith("112")) && !dc.startsWith("1")) type = "expense";
      // Employee advances (debit 1130 employee receivable, credit cash) = outflow
      if (dc === "1130" && (cc === "1110" || cc.startsWith("111"))) type = "expense";

      return {
        id: tx.id,
        date: tx.transaction_date,
        description: tx.description || "عملية",
        amount: tx.amount || 0,
        type,
        timeAgo,
      };
    });
  }, [transactions]);

  // Upcoming cheques
  const upcomingCheques = useMemo<ChequeItem[]>(() => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    return cheques
      .filter((c) => c.status !== "محصل" && c.status !== "ملغي")
      .map((c) => {
        const days = Math.floor((new Date(c.cheque_date).getTime() - now.getTime()) / 86400000);
        return {
          id: c.id,
          chequeDate: c.cheque_date,
          amount: c.amount,
          partyName: c.party_name,
          chequeType: c.cheque_type,
          status: c.status,
          daysRemaining: days,
        };
      })
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 10);
  }, [cheques]);

  // Inventory alerts
  const inventoryAlerts = useMemo<InventoryAlert[]>(() => {
    return products
      .map((p) => ({
        id: p.id,
        name: p.name,
        quantity: p.quantity || 0,
        reorderPoint: p.min_quantity || 5,
        status: (p.quantity || 0) <= 0 ? "out" as const : (p.quantity || 0) <= (p.min_quantity || 5) ? "low" as const : "ok" as const,
      }))
      .filter((p) => p.status !== "ok")
      .slice(0, 8);
  }, [products]);

  // Inventory summary
  const inventorySummary = useMemo(() => {
    const totalItems = products.length;
    const totalValue = products.reduce((s, p) => s + (p.quantity || 0) * (p.buy_price || 0), 0);
    const lowStock = products.filter((p) => (p.quantity || 0) > 0 && (p.quantity || 0) <= (p.min_quantity || 5)).length;
    const outOfStock = products.filter((p) => (p.quantity || 0) <= 0).length;
    return { totalItems, totalValue, lowStock, outOfStock };
  }, [products]);

  // Cash flow data
  const cashFlowData = useMemo(() => {
    const periodTx = filterByRange(plTx, range);
    const isCashAccount = (code: string) => code?.startsWith("1110") || code?.startsWith("1120");

    // ✅ Reversal-aware cash flow:
    // عند إلغاء سند قبض/فاتورة نقدية يُنشئ النظام قيداً عكسياً (transaction_type = "reversal"
    // أو وصف يبدأ بـ "عكس قيد"). القيد الأصلي يبقى لكن يُربط بـ reversed_by_id.
    // يجب استثناء الطرفين من التدفق النقدي حتى لا يظهر الإلغاء كحركة "خارج" أو "داخل" وهمية.
    const reversedIds = new Set(
      plTx
        .filter((t) => t.reversed_by_id)
        .map((t) => t.id as string)
    );
    const isReversalEntry = (t: any) =>
      t.transaction_type === "reversal" || (t.description || "").startsWith("عكس قيد");
    const isCanceledOriginal = (t: any) => reversedIds.has(t.id);

    const cashTx = periodTx.filter((t) => !isReversalEntry(t) && !isCanceledOriginal(t));

    const inflows = cashTx
      .filter((t) => isCashAccount(t.debit_account_code))
      .reduce((s, t) => s + (t.amount || 0), 0);
    const outflows = cashTx
      .filter((t) => isCashAccount(t.credit_account_code))
      .reduce((s, t) => s + (t.amount || 0), 0);

    // Monthly expense rate for runway
    const monthlyExpense = kpis.expenses || 1;
    const runway = kpis.cashBalance > 0 ? Math.round((kpis.cashBalance / (monthlyExpense || 1)) * (period === "month" ? 1 : period === "year" ? 12 : 1)) : 0;

    return { inflows, outflows, net: inflows - outflows, runway };
  }, [plTx, range, kpis, filterByRange, period]);

  // Top sales by contact
  const topSales = useMemo(() => {
    const periodTx = filterByRange(plTx, range);
    const salesByContact: Record<string, { name: string; amount: number }> = {};
    // ✅ Reversal-aware: credits to 4xxx add sales, debits to 4xxx subtract reversed sales
    periodTx
      .filter((t) => t.contact_id && (t.credit_account_code?.startsWith("4") || t.debit_account_code?.startsWith("4")))
      .forEach((t) => {
        const contact = contacts.find((c) => c.id === t.contact_id);
        const name = contact?.contact_name || "غير محدد";
        if (!salesByContact[t.contact_id]) salesByContact[t.contact_id] = { name, amount: 0 };
        if (t.credit_account_code?.startsWith("4")) salesByContact[t.contact_id].amount += t.amount || 0;
        if (t.debit_account_code?.startsWith("4")) salesByContact[t.contact_id].amount -= t.amount || 0;
      });

    return Object.values(salesByContact)
      .filter((v) => v.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [plTx, range, contacts, filterByRange]);

  // Top selling items (from invoice_items)
  const topSellingItems = useMemo(() => {
    const itemMap: Record<string, { name: string; totalQty: number; totalAmount: number }> = {};
    invoiceItems.forEach((item) => {
      const name = item.product_name || "غير محدد";
      if (!itemMap[name]) itemMap[name] = { name, totalQty: 0, totalAmount: 0 };
      itemMap[name].totalQty += item.quantity || 0;
      itemMap[name].totalAmount += item.total_amount || 0;
    });
    return Object.values(itemMap)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 8);
  }, [invoiceItems]);

  return {
    // Data
    kpis,
    chartData,
    sparklines,
    healthScore,
    agingData,
    recentActivity,
    upcomingCheques,
    inventoryAlerts,
    inventorySummary,
    cashFlowData,
    topSales,
    topSellingItems,
    profileData,
    companyLogo,
    // State
    loading,
    lastUpdated,
    period,
    setPeriod,
    customRange,
    setCustomRange,
    compareYear,
    setCompareYear,
    chartGrouping,
    setChartGrouping,
    // Actions
    refresh: fetchAll,
  };
}
