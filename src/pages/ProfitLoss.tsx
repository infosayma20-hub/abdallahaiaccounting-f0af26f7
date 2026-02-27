import { useState, useEffect, useMemo, useCallback } from "react";
import { getAuthHeaders } from "@/lib/edge-helpers";
import {
  TrendingUp, TrendingDown, DollarSign, Loader2, BarChart3, ChevronDown, ChevronUp,
  Download, FileSpreadsheet, Printer, ArrowRight, Percent, Eye, EyeOff, Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip as RechartsTooltip,
  PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF } from "@/components/ReportComponents";
import * as XLSX from "xlsx";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, startOfWeek, endOfWeek, subDays, subWeeks } from "date-fns";

// ── Types ──
interface TransactionRecord {
  id: string;
  fields: {
    Amount?: number;
    Currency?: string;
    "Transaction Type"?: string;
    "Credit Account Rollup"?: string;
    "Debit Account Rollup"?: string;
    "Debit Account Name"?: string;
    "Credit Account Name"?: string;
    Description?: string;
    Date?: string;
    Client?: string;
  };
}

interface StatementLine {
  label: string;
  amount: number;
  compareAmount?: number;
  level: 0 | 1 | 2 | 3;
  type: "header" | "item" | "subtotal" | "total" | "grand-total" | "spacer";
  section?: string;
  transactions?: TransactionRecord[];
}

// ── Constants ──
const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

// ── Quick period helpers ──
const getQuickPeriod = (key: string): [Date, Date] => {
  const now = new Date();
  switch (key) {
    case "today": return [now, now];
    case "yesterday": { const d = subDays(now, 1); return [d, d]; }
    case "this-week": return [startOfWeek(now, { weekStartsOn: 0 }), endOfWeek(now, { weekStartsOn: 0 })];
    case "this-month": return [startOfMonth(now), endOfMonth(now)];
    case "last-month": { const lm = subMonths(now, 1); return [startOfMonth(lm), endOfMonth(lm)]; }
    case "this-quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return [new Date(now.getFullYear(), q * 3, 1), endOfMonth(new Date(now.getFullYear(), q * 3 + 2, 1))];
    }
    case "this-year": return [startOfYear(now), endOfYear(now)];
    default: return [startOfMonth(now), endOfMonth(now)];
  }
};

const quickPeriods = [
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "this-week", label: "الأسبوع" },
  { key: "this-month", label: "الشهر" },
  { key: "last-month", label: "الشهر الماضي" },
  { key: "this-quarter", label: "الربع" },
  { key: "this-year", label: "السنة" },
];

// ── Helpers ──
const isOpeningBalance = (tx: TransactionRecord) => {
  const type = (tx.fields["Transaction Type"] || "").trim();
  const desc = (tx.fields.Description || "").trim();
  return /رصيد\s*(ابتدائي|افتتاحي|مدور|أول\s*المدة)/i.test(desc) ||
    /رصيد\s*(ابتدائي|افتتاحي|مدور)/i.test(type) || type === "رصيد ابتدائي";
};

const txMatch = (tx: TransactionRecord, keywords: string[]) => {
  const all = `${tx.fields.Description || ""} ${tx.fields["Transaction Type"] || ""} ${tx.fields["Debit Account Name"] || ""} ${tx.fields["Credit Account Name"] || ""}`.toLowerCase();
  return keywords.some(k => all.includes(k));
};

const fmtAmount = (n: number, showSign = false) => {
  if (n === 0) return "₪ 0";
  const abs = Math.abs(n);
  const formatted = `₪ ${abs.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (n < 0) return `(${formatted})`;
  return showSign && n > 0 ? formatted : formatted;
};

const pctChange = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
};

// ── Main Component ──
const ProfitLoss = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [activePeriod, setActivePeriod] = useState("this-month");
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [showPercentages, setShowPercentages] = useState(true);
  const [showComparison, setShowComparison] = useState(false);
  const [showZeroAccounts, setShowZeroAccounts] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [drillDownAccount, setDrillDownAccount] = useState<{ label: string; txs: TransactionRecord[] } | null>(null);
  const [showCharts, setShowCharts] = useState(true);

  // Fetch data
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("company_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.company_name) setCompanyName(data.company_name); });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchTx = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`,
          { headers: await getAuthHeaders() }
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setTransactions(data.records || []);
      } catch (err) {
        console.error("Error fetching P&L data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTx();
  }, [user]);

  // Quick period selection
  const handleQuickPeriod = useCallback((key: string) => {
    setActivePeriod(key);
    const [from, to] = getQuickPeriod(key);
    setDateFrom(format(from, "yyyy-MM-dd"));
    setDateTo(format(to, "yyyy-MM-dd"));
  }, []);

  // Filter transactions by date range, exclude OB
  const plTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (isOpeningBalance(tx)) return false;
      const d = tx.fields.Date;
      if (!d) return false;
      return d >= dateFrom && d <= dateTo;
    });
  }, [transactions, dateFrom, dateTo]);

  // Previous period transactions for comparison
  const prevPeriodTxs = useMemo(() => {
    if (!showComparison) return [];
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    const duration = toDate.getTime() - fromDate.getTime();
    const prevFrom = format(new Date(fromDate.getTime() - duration - 86400000), "yyyy-MM-dd");
    const prevTo = format(new Date(fromDate.getTime() - 86400000), "yyyy-MM-dd");
    return transactions.filter(tx => {
      if (isOpeningBalance(tx)) return false;
      const d = tx.fields.Date;
      if (!d) return false;
      return d >= prevFrom && d <= prevTo;
    });
  }, [transactions, dateFrom, dateTo, showComparison]);

  // ── Compute P&L ──
  const computePL = useCallback((txs: TransactionRecord[]) => {
    const calc = (filter: (tx: TransactionRecord) => boolean) => ({
      total: txs.filter(filter).reduce((s, tx) => s + (tx.fields.Amount || 0), 0),
      txs: txs.filter(filter),
    });

    // Revenue
    const salesData = calc(tx => tx.fields["Credit Account Rollup"] === "Revenue" && !txMatch(tx, ["مردود", "خصم"]));
    const salesDiscountData = calc(tx => txMatch(tx, ["خصم مسموح", "خصم مبيعات"]));
    const salesReturnData = calc(tx => txMatch(tx, ["مردود مبيعات", "مرتجع مبيعات"]));

    // COGS
    const purchasesData = calc(tx => (txMatch(tx, ["مشتريات", "شراء", "بضاعة"]) && tx.fields["Debit Account Rollup"] === "Expenses") || (tx.fields["Transaction Type"] || "").includes("فاتورة مشتريات"));
    const purchaseDiscountData = calc(tx => txMatch(tx, ["خصم مكتسب", "خصم مشتريات"]));
    const purchaseReturnData = calc(tx => txMatch(tx, ["مردود مشتريات", "مرتجع مشتريات"]));

    // Expense categories
    const categorizeExpense = (tx: TransactionRecord) => {
      if (tx.fields["Debit Account Rollup"] !== "Expenses") return null;
      if (txMatch(tx, ["مشتريات", "شراء", "بضاعة", "مردود", "خصم"])) return null;
      const name = (tx.fields["Debit Account Name"] || tx.fields.Description || "أخرى").trim();
      return name;
    };

    const expenseMap = new Map<string, { total: number; txs: TransactionRecord[] }>();
    txs.forEach(tx => {
      const cat = categorizeExpense(tx);
      if (!cat) return;
      const curr = expenseMap.get(cat) || { total: 0, txs: [] };
      curr.total += tx.fields.Amount || 0;
      curr.txs.push(tx);
      expenseMap.set(cat, curr);
    });

    const expenseEntries = Array.from(expenseMap.entries()).sort((a, b) => b[1].total - a[1].total);
    const totalOpExpenses = expenseEntries.reduce((s, [, v]) => s + v.total, 0);

    // Other income/expenses
    const otherIncome = calc(tx => txMatch(tx, ["فوائد بنكية", "أرباح فروقات", "أرباح بيع أصول", "إيرادات أخرى"]) && !txMatch(tx, ["خسائر"]));
    const otherExpenses = calc(tx => txMatch(tx, ["خسائر فروقات", "مصاريف فوائد", "خسائر استبعاد", "خسائر بيع"]));

    const totalRevenue = salesData.total - salesDiscountData.total - salesReturnData.total;
    const totalCOGS = purchasesData.total - purchaseDiscountData.total - purchaseReturnData.total;
    const grossProfit = totalRevenue - totalCOGS;
    const operatingProfit = grossProfit - totalOpExpenses;
    const netOther = otherIncome.total - otherExpenses.total;
    const netProfit = operatingProfit + netOther;

    return {
      salesData, salesDiscountData, salesReturnData,
      purchasesData, purchaseDiscountData, purchaseReturnData,
      expenseEntries, totalOpExpenses,
      otherIncome, otherExpenses,
      totalRevenue, totalCOGS, grossProfit, operatingProfit, netOther, netProfit,
    };
  }, []);

  const current = useMemo(() => computePL(plTransactions), [plTransactions, computePL]);
  const previous = useMemo(() => showComparison ? computePL(prevPeriodTxs) : null, [prevPeriodTxs, showComparison, computePL]);

  const margin = current.totalRevenue > 0 ? (current.netProfit / current.totalRevenue) * 100 : 0;
  const grossMarginPct = current.totalRevenue > 0 ? (current.grossProfit / current.totalRevenue) * 100 : 0;

  // ── Build statement lines ──
  const statementLines = useMemo((): StatementLine[] => {
    const lines: StatementLine[] = [];
    const rev = current.totalRevenue;
    const pct = (n: number) => rev > 0 ? (n / rev) * 100 : 0;

    const addLine = (label: string, amount: number, level: StatementLine["level"], type: StatementLine["type"], section?: string, txs?: TransactionRecord[], compareAmt?: number) => {
      if (!showZeroAccounts && type === "item" && amount === 0) return;
      lines.push({ label, amount, level, type, section, transactions: txs, compareAmount: compareAmt });
    };

    // Revenue
    addLine("الإيرادات", 0, 0, "header", "revenue");
    addLine("إيرادات المبيعات", current.salesData.total, 2, "item", "revenue", current.salesData.txs, previous?.salesData.total);
    if (current.salesDiscountData.total > 0) addLine("(-) خصم مسموح به", -current.salesDiscountData.total, 2, "item", "revenue", current.salesDiscountData.txs);
    if (current.salesReturnData.total > 0) addLine("(-) مردود مبيعات", -current.salesReturnData.total, 2, "item", "revenue", current.salesReturnData.txs);
    addLine("إجمالي الإيرادات", current.totalRevenue, 1, "subtotal", "revenue", undefined, previous?.totalRevenue);

    lines.push({ label: "", amount: 0, level: 0, type: "spacer" });

    // COGS
    addLine("تكلفة المبيعات", 0, 0, "header", "cogs");
    addLine("المشتريات", current.purchasesData.total, 2, "item", "cogs", current.purchasesData.txs, previous?.purchasesData.total);
    if (current.purchaseDiscountData.total > 0) addLine("(-) خصم مكتسب", -current.purchaseDiscountData.total, 2, "item", "cogs", current.purchaseDiscountData.txs);
    if (current.purchaseReturnData.total > 0) addLine("(-) مردود مشتريات", -current.purchaseReturnData.total, 2, "item", "cogs", current.purchaseReturnData.txs);
    addLine("إجمالي تكلفة المبيعات", current.totalCOGS, 1, "subtotal", "cogs", undefined, previous?.totalCOGS);

    lines.push({ label: "", amount: 0, level: 0, type: "spacer" });
    addLine("مجمل الربح", current.grossProfit, 0, "total", undefined, undefined, previous?.grossProfit);
    lines.push({ label: "", amount: 0, level: 0, type: "spacer" });

    // Operating Expenses
    addLine("المصروفات التشغيلية", 0, 0, "header", "opex");
    current.expenseEntries.forEach(([name, data]) => {
      const prevVal = previous?.expenseEntries.find(([n]) => n === name)?.[1]?.total;
      addLine(name, data.total, 2, "item", "opex", data.txs, prevVal);
    });
    addLine("إجمالي المصروفات التشغيلية", current.totalOpExpenses, 1, "subtotal", "opex", undefined, previous?.totalOpExpenses);

    lines.push({ label: "", amount: 0, level: 0, type: "spacer" });
    addLine("الربح التشغيلي", current.operatingProfit, 0, "total", undefined, undefined, previous?.operatingProfit);
    lines.push({ label: "", amount: 0, level: 0, type: "spacer" });

    // Other
    if (current.otherIncome.total > 0 || current.otherExpenses.total > 0) {
      addLine("إيرادات ومصروفات أخرى", 0, 0, "header", "other");
      if (current.otherIncome.total > 0) addLine("إيرادات أخرى", current.otherIncome.total, 2, "item", "other", current.otherIncome.txs);
      if (current.otherExpenses.total > 0) addLine("مصروفات أخرى", -current.otherExpenses.total, 2, "item", "other", current.otherExpenses.txs);
      addLine("صافي البنود الأخرى", current.netOther, 1, "subtotal", "other", undefined, previous?.netOther);
      lines.push({ label: "", amount: 0, level: 0, type: "spacer" });
    }

    // Net Profit
    addLine("صافي الربح / (الخسارة)", current.netProfit, 0, "grand-total", undefined, undefined, previous?.netProfit);

    return lines;
  }, [current, previous, showZeroAccounts]);

  // ── Monthly chart data ──
  const monthlyChartData = useMemo(() => {
    const map: Record<number, { revenue: number; expenses: number; profit: number }> = {};
    plTransactions.forEach(tx => {
      if (!tx.fields.Date) return;
      const m = new Date(tx.fields.Date).getMonth();
      if (!map[m]) map[m] = { revenue: 0, expenses: 0, profit: 0 };
      if (tx.fields["Credit Account Rollup"] === "Revenue") map[m].revenue += tx.fields.Amount || 0;
      if (tx.fields["Debit Account Rollup"] === "Expenses") map[m].expenses += tx.fields.Amount || 0;
    });
    return Object.entries(map).sort(([a], [b]) => Number(a) - Number(b)).map(([m, d]) => ({
      month: monthNames[Number(m)],
      revenue: d.revenue,
      expenses: d.expenses,
      profit: d.revenue - d.expenses,
    }));
  }, [plTransactions]);

  // ── Expense pie data ──
  const expensePieData = useMemo(() => {
    const entries = current.expenseEntries.slice(0, 5);
    const othersTotal = current.expenseEntries.slice(5).reduce((s, [, v]) => s + v.total, 0);
    const data = entries.map(([name, val]) => ({ name, value: val.total }));
    if (othersTotal > 0) data.push({ name: "أخرى", value: othersTotal });
    return data;
  }, [current.expenseEntries]);

  // Toggle section
  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  };

  // ── Export Excel ──
  const handleExportExcel = () => {
    const rows = statementLines.filter(l => l.type !== "spacer").map(l => ({
      "البند": l.label,
      "المبلغ": l.amount,
      ...(showPercentages && current.totalRevenue > 0 ? { "النسبة %": l.type === "item" || l.type === "subtotal" || l.type === "total" || l.type === "grand-total" ? ((l.amount / current.totalRevenue) * 100).toFixed(1) : "" } : {}),
      ...(showComparison && l.compareAmount !== undefined ? { "الفترة السابقة": l.compareAmount } : {}),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 35 }, { wch: 18 }, { wch: 12 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "قائمة الدخل");
    XLSX.writeFile(wb, `قائمة_الدخل_${dateFrom}_${dateTo}.xlsx`);
  };

  // ── Export PDF ──
  const handleExportPDF = () => {
    const exportDate = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    const rows = statementLines.filter(l => l.type !== "spacer");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box;font-family:'Cairo',sans-serif}
body{padding:40px;color:#1a1a2e;background:#fff}
.header{text-align:center;border-bottom:3px double #16a34a;padding-bottom:16px;margin-bottom:24px}
.header h1{font-size:18px;color:#333}.header h2{font-size:22px;font-weight:700;color:#16a34a;margin-top:4px}
.header h3{font-size:12px;color:#666;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px}
th{background:#f3f4f6;font-weight:700;padding:10px 8px;border:1px solid #d1d5db;text-align:right}
td{padding:8px;border-bottom:1px solid #e5e7eb;text-align:right}
.header-row{background:#f8fafc;font-weight:700;font-size:13px;color:#1e40af}
.subtotal-row{border-top:2px solid #d1d5db;font-weight:700;background:#f1f5f9}
.total-row{border-top:3px double #64748b;font-weight:700;font-size:14px;background:#e2e8f0}
.grand-total-row{border-top:3px double #16a34a;font-weight:700;font-size:15px;background:#dcfce7;color:#15803d}
.negative{color:#dc2626}
.notes{margin-top:24px;font-size:10px;color:#666;border-top:1px solid #e5e7eb;padding-top:12px}
.footer{margin-top:16px;text-align:center;font-size:10px;color:#999}
@media print{body{padding:20px}}
</style></head><body>
<div class="header">
  <h1>${companyName || "النظام المالي"}</h1>
  <h2>قائمة الدخل</h2>
  <h3>للفترة من ${dateFrom} إلى ${dateTo}</h3>
  <h3>(المبالغ بالشيكل الإسرائيلي)</h3>
</div>
<table>
<thead><tr><th style="width:55%">البند</th><th>المبلغ</th>${showPercentages ? '<th>%</th>' : ''}${showComparison ? '<th>المقارنة</th>' : ''}</tr></thead>
<tbody>
${rows.map(l => {
  const cls = l.type === "header" ? "header-row" : l.type === "subtotal" ? "subtotal-row" : l.type === "total" ? "total-row" : l.type === "grand-total" ? "grand-total-row" : "";
  const neg = l.amount < 0 ? "negative" : "";
  const indent = l.level * 16;
  const pctVal = current.totalRevenue > 0 && l.type !== "header" ? ((l.amount / current.totalRevenue) * 100).toFixed(1) + "%" : "";
  return `<tr class="${cls}"><td style="padding-right:${8 + indent}px">${l.label}</td><td class="${neg}">${l.type === "header" ? "" : fmtAmount(l.amount)}</td>${showPercentages ? `<td>${pctVal}</td>` : ""}${showComparison && l.compareAmount !== undefined ? `<td>${fmtAmount(l.compareAmount)}</td>` : showComparison ? "<td></td>" : ""}</tr>`;
}).join("")}
</tbody></table>
<div class="notes">
<p>1. أُعدت هذه القائمة وفقاً لمعايير المحاسبة الدولية (IAS 1)</p>
<p>2. المبالغ بين أقواس تمثل مبالغ سالبة</p>
<p>3. تم استبعاد الأرصدة الافتتاحية من هذه القائمة</p>
</div>
<div class="footer">تاريخ الطباعة: ${exportDate} — تم إنشاؤه بواسطة عبدالله AI للمحاسبة</div>
</body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) win.onload = () => setTimeout(() => win.print(), 500);
  };

  const periodLabel = `${dateFrom} — ${dateTo}`;

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto pb-10 px-4 pt-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/reports")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">قائمة الدخل</h1>
            <p className="text-[10px] text-muted-foreground">Income Statement</p>
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-primary/10">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
      </div>

      {/* ── Date Controls ── */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePeriod("custom"); }} className="w-[140px] h-8 text-xs" />
            <span className="text-xs text-muted-foreground">—</span>
            <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePeriod("custom"); }} className="w-[140px] h-8 text-xs" />
          </div>
        </div>
        {/* Quick Periods */}
        <div className="flex gap-1.5 flex-wrap">
          {quickPeriods.map(p => (
            <button key={p.key} onClick={() => handleQuickPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${activePeriod === p.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
              {p.label}
            </button>
          ))}
        </div>
        {/* Options */}
        <div className="flex items-center gap-4 flex-wrap text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={showPercentages} onCheckedChange={(v) => setShowPercentages(!!v)} />
            <span className="text-muted-foreground">النسب المئوية</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={showComparison} onCheckedChange={(v) => setShowComparison(!!v)} />
            <span className="text-muted-foreground">مقارنة الفترة السابقة</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={showZeroAccounts} onCheckedChange={(v) => setShowZeroAccounts(!!v)} />
            <span className="text-muted-foreground">الحسابات الصفرية</span>
          </label>
        </div>
        {/* Export */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={handleExportExcel} disabled={loading}>
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={handleExportPDF} disabled={loading}>
            <Download className="h-3 w-3" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => window.print()} disabled={loading}>
            <Printer className="h-3 w-3" /> طباعة
          </Button>
          <Button variant={showCharts ? "default" : "outline"} size="sm" className="h-7 text-[10px] gap-1 mr-auto" onClick={() => setShowCharts(!showCharts)}>
            <BarChart3 className="h-3 w-3" /> رسوم بيانية
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "إجمالي الإيرادات", value: current.totalRevenue, prev: previous?.totalRevenue, color: "border-primary/30 bg-primary/5", textColor: "text-primary" },
              { label: "إجمالي المصروفات", value: current.totalCOGS + current.totalOpExpenses, prev: previous ? (previous.totalCOGS + previous.totalOpExpenses) : undefined, color: "border-destructive/30 bg-destructive/5", textColor: "text-destructive", invertTrend: true },
              { label: current.netProfit >= 0 ? "صافي الربح" : "صافي الخسارة", value: current.netProfit, prev: previous?.netProfit, color: current.netProfit >= 0 ? "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20" : "border-destructive/30 bg-destructive/5", textColor: current.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive" },
              { label: "هامش الربح الصافي", value: margin, prev: previous ? (previous.totalRevenue > 0 ? (previous.netProfit / previous.totalRevenue) * 100 : 0) : undefined, color: "border-violet-500/30 bg-violet-50 dark:bg-violet-950/20", textColor: "text-violet-600 dark:text-violet-400", isPercent: true },
            ].map((card, i) => {
              const change = card.prev !== undefined ? pctChange(card.value, card.prev) : null;
              const favorable = card.invertTrend ? change !== null && change < 0 : change !== null && change > 0;
              return (
                <Card key={i} className={`p-3 border ${card.color}`}>
                  <p className="text-[10px] text-muted-foreground mb-1">{card.label}</p>
                  <p className={`text-base font-bold tabular-nums ${card.textColor}`}>
                    {(card as any).isPercent ? `${card.value.toFixed(1)}%` : fmtAmount(card.value)}
                  </p>
                  {change !== null && showComparison && (
                    <div className={`flex items-center gap-1 mt-1 text-[10px] ${favorable ? "text-emerald-600" : "text-red-500"}`}>
                      {favorable ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      <span>{Math.abs(change).toFixed(1)}% vs السابقة</span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* ── Statement Table ── */}
          <Card className="overflow-hidden">
            {/* Table Title */}
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <p className="text-xs font-bold text-foreground text-center">{companyName || "النظام المالي"}</p>
              <p className="text-[10px] text-muted-foreground text-center">قائمة الدخل — {periodLabel}</p>
              <p className="text-[10px] text-muted-foreground text-center">(المبالغ بالشيكل الإسرائيلي)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-3 text-right font-bold text-muted-foreground" style={{ width: "55%" }}>البند</th>
                    <th className="p-3 text-right font-bold text-muted-foreground">المبلغ</th>
                    {showPercentages && <th className="p-3 text-center font-bold text-muted-foreground w-16">%</th>}
                    {showComparison && <th className="p-3 text-right font-bold text-muted-foreground">السابقة</th>}
                    {showComparison && <th className="p-3 text-center font-bold text-muted-foreground w-20">التغير</th>}
                  </tr>
                </thead>
                <tbody>
                  {statementLines.map((line, i) => {
                    if (line.type === "spacer") return <tr key={i}><td colSpan={5} className="h-2" /></tr>;
                    const isCollapsed = line.section && collapsedSections.has(line.section);
                    if (line.type === "item" && isCollapsed) return null;

                    const pctVal = current.totalRevenue > 0 && line.type !== "header" ? ((Math.abs(line.amount) / current.totalRevenue) * 100).toFixed(1) : "";
                    const change = showComparison && line.compareAmount !== undefined ? pctChange(line.amount, line.compareAmount) : null;
                    const isNeg = line.amount < 0;
                    const indent = line.level * 16;

                    const rowCls =
                      line.type === "header" ? "bg-muted/40 font-bold text-primary" :
                      line.type === "subtotal" ? "border-t-2 border-border font-bold bg-muted/20" :
                      line.type === "total" ? "border-t-2 border-double border-muted-foreground/30 font-bold bg-accent/30 text-sm" :
                      line.type === "grand-total" ? "border-t-[3px] border-double border-primary/40 font-bold bg-primary/10 text-primary text-sm" :
                      "hover:bg-muted/10";

                    return (
                      <tr key={i} className={`${rowCls} transition-colors`}>
                        <td className="p-3" style={{ paddingRight: `${12 + indent}px` }}>
                          <div className="flex items-center gap-1.5">
                            {line.type === "header" && line.section && (
                              <button onClick={() => toggleSection(line.section!)} className="p-0.5 rounded hover:bg-muted">
                                {isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                              </button>
                            )}
                            <span className={line.transactions?.length ? "cursor-pointer hover:underline" : ""}
                              onClick={() => line.transactions?.length && setDrillDownAccount({ label: line.label, txs: line.transactions })}>
                              {line.label}
                            </span>
                          </div>
                        </td>
                        <td className={`p-3 tabular-nums ${isNeg ? "text-destructive" : ""}`}>
                          {line.type === "header" ? "" : fmtAmount(line.amount)}
                        </td>
                        {showPercentages && <td className="p-3 text-center text-muted-foreground tabular-nums">{line.type === "header" ? "" : pctVal ? `${pctVal}%` : ""}</td>}
                        {showComparison && (
                          <td className="p-3 tabular-nums text-muted-foreground">
                            {line.compareAmount !== undefined ? fmtAmount(line.compareAmount) : ""}
                          </td>
                        )}
                        {showComparison && (
                          <td className="p-3 text-center tabular-nums">
                            {change !== null ? (
                              <span className={`inline-flex items-center gap-0.5 text-[10px] ${
                                (line.section === "opex" || line.section === "cogs") ? (change < 0 ? "text-emerald-600" : "text-red-500") : (change > 0 ? "text-emerald-600" : "text-red-500")
                              }`}>
                                {change > 0 ? "▲" : change < 0 ? "▼" : "—"} {Math.abs(change).toFixed(1)}%
                              </span>
                            ) : ""}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Charts ── */}
          {showCharts && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Bar Chart */}
              {monthlyChartData.length > 0 && (
                <Card className="p-4">
                  <h3 className="text-xs font-bold text-foreground mb-3">الإيرادات مقابل المصروفات</h3>
                  <div className="h-52" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyChartData} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RechartsTooltip formatter={(v: number) => `₪ ${v.toLocaleString()}`} />
                        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="الإيرادات" />
                        <Bar dataKey="expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="المصروفات" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-4 mt-2">
                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-primary" /><span className="text-[10px] text-muted-foreground">الإيرادات</span></div>
                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-destructive" /><span className="text-[10px] text-muted-foreground">المصروفات</span></div>
                  </div>
                </Card>
              )}

              {/* Expense Pie */}
              {expensePieData.length > 0 && (
                <Card className="p-4">
                  <h3 className="text-xs font-bold text-foreground mb-3">توزيع المصروفات</h3>
                  <div className="h-52" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={expensePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                          {expensePieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip formatter={(v: number) => `₪ ${v.toLocaleString()}`} />
                        <Legend formatter={(value) => <span className="text-[10px]">{value}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}

              {/* Profit Trend */}
              {monthlyChartData.length > 1 && (
                <Card className="p-4 lg:col-span-2">
                  <h3 className="text-xs font-bold text-foreground mb-3">اتجاه صافي الربح</h3>
                  <div className="h-48" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RechartsTooltip formatter={(v: number) => `₪ ${v.toLocaleString()}`} />
                        <Area type="monotone" dataKey="profit" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" name="صافي الربح" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}

              {/* Margin Gauges */}
              <Card className="p-4">
                <h3 className="text-xs font-bold text-foreground mb-3">هامش الربح الإجمالي</h3>
                <div className="flex flex-col items-center">
                  <div className="text-3xl font-bold text-primary tabular-nums">{grossMarginPct.toFixed(1)}%</div>
                  <div className="w-full mt-3 h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(grossMarginPct, 100)}%` }} />
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <h3 className="text-xs font-bold text-foreground mb-3">هامش الربح الصافي</h3>
                <div className="flex flex-col items-center">
                  <div className={`text-3xl font-bold tabular-nums ${margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{margin.toFixed(1)}%</div>
                  <div className="w-full mt-3 h-3 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${margin >= 0 ? "bg-emerald-500" : "bg-destructive"}`} style={{ width: `${Math.min(Math.abs(margin), 100)}%` }} />
                  </div>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* ── Drill-down Modal ── */}
      {drillDownAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDrillDownAccount(null)}>
          <Card className="max-w-[600px] w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">القيود المكونة — {drillDownAccount.label}</h3>
              <button onClick={() => setDrillDownAccount(null)} className="p-1 rounded hover:bg-muted text-muted-foreground">✕</button>
            </div>
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-right font-semibold text-muted-foreground">التاريخ</th>
                    <th className="p-2 text-right font-semibold text-muted-foreground">البيان</th>
                    <th className="p-2 text-right font-semibold text-muted-foreground">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {drillDownAccount.txs.map((tx, i) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-2">{tx.fields.Date || "-"}</td>
                      <td className="p-2">{tx.fields.Description || "-"}</td>
                      <td className="p-2 font-medium tabular-nums">{fmtAmount(tx.fields.Amount || 0)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border font-bold bg-muted/30">
                    <td className="p-2" colSpan={2}>المجموع</td>
                    <td className="p-2 tabular-nums">{fmtAmount(drillDownAccount.txs.reduce((s, tx) => s + (tx.fields.Amount || 0), 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ProfitLoss;
