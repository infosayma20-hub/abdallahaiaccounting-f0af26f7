import { useState, useEffect, useMemo } from "react";
import {
  Loader2, Landmark, ChevronDown, ChevronRight, Calendar, FileSpreadsheet, Download, Printer,
  TrendingUp, TrendingDown, RefreshCw, Calculator, AlertTriangle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ReportSummary, exportToExcel } from "@/components/ReportComponents";
import ReportStatusBadge from "@/components/reports/ReportStatusBadge";
import { generateProfessionalPDFHtml, openPrintWindow, useCompanyInfo } from "@/components/ReportPrintLayout";
import {
  fetchTransactions, fetchAccounts, buildAccountMap, classifyAccount,
  SupabaseTransaction, SupabaseAccount, buildAccountTree, flattenAccountTree, FlatAccountLine,
} from "@/lib/supabase-data";
import { format, endOfMonth, startOfMonth, subMonths, startOfYear, endOfYear, startOfWeek, endOfWeek, subDays } from "date-fns";
import { FinanceShell, type ActionTab, type FilterCondition, type FilterField } from "@/components/finance/shell";

const LEVEL_OPTIONS = [
  { value: 1, label: "المستوى 1 — الفئات الرئيسية" },
  { value: 2, label: "المستوى 2 — المجموعات الفرعية" },
  { value: 3, label: "المستوى 3 — الحسابات الفرعية" },
  { value: 4, label: "المستوى 4 — التفاصيل الكاملة" },
];

const quickPeriods = [
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "this-week", label: "الأسبوع" },
  { key: "this-month", label: "الشهر" },
  { key: "last-month", label: "الشهر الماضي" },
  { key: "this-quarter", label: "الربع" },
  { key: "this-year", label: "السنة" },
];

const getQuickPeriodDate = (key: string): string => {
  const now = new Date();
  switch (key) {
    case "today": return format(now, "yyyy-MM-dd");
    case "yesterday": return format(subDays(now, 1), "yyyy-MM-dd");
    case "this-week": return format(endOfWeek(now, { weekStartsOn: 0 }), "yyyy-MM-dd");
    case "this-month": return format(endOfMonth(now), "yyyy-MM-dd");
    case "last-month": return format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
    case "this-quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return format(endOfMonth(new Date(now.getFullYear(), q * 3 + 2, 1)), "yyyy-MM-dd");
    }
    case "this-year": return format(endOfYear(now), "yyyy-MM-dd");
    default: return format(now, "yyyy-MM-dd");
  }
};

// Helper to compute previous "as of" date (same day, one month earlier)
const getPreviousAsOfDate = (asOf: string): string => {
  const d = new Date(asOf);
  return format(subMonths(d, 1), "yyyy-MM-dd");
};

// Signed balances: debit contributes +, credit contributes −. This lets
// contra-assets (e.g. مجمع الإهلاك) and contra-liabilities net correctly
// against their parents when summed at any tree level.
// Deleted rows are filtered here to match Trial Balance semantics 1:1.
// Reversals and their originals are both included (same universe as the General
// Ledger); a pair reversed inside the same period nets to zero on its own.

const computeBalances = (transactions: SupabaseTransaction[], cutoffDate: string) => {
  const balances: Record<string, number> = {};
  transactions.filter(tx => !tx.is_deleted && tx.transaction_date <= cutoffDate).forEach(tx => {
    const amount = tx.amount || 0;
    if (tx.debit_account_code) balances[tx.debit_account_code] = (balances[tx.debit_account_code] || 0) + amount;
    if (tx.credit_account_code) balances[tx.credit_account_code] = (balances[tx.credit_account_code] || 0) - amount;
  });
  return balances;
};

const computeTotals = (accounts: SupabaseAccount[], balances: Record<string, number>) => {
  const isAsset = (a: SupabaseAccount) => classifyAccount(a) === "Asset";
  const isLiability = (a: SupabaseAccount) => classifyAccount(a) === "Liability";
  const isEquity = (a: SupabaseAccount) => classifyAccount(a) === "Equity";

  const assetTree = buildAccountTree(accounts, balances, isAsset);
  const liabilityTree = buildAccountTree(accounts, balances, isLiability);
  const equityTree = buildAccountTree(accounts, balances, isEquity);

  // Signed section totals (debit-normal → +, credit-normal → −).
  const assetsSigned = assetTree.reduce((s, n) => s + n.balance, 0);
  const liabSigned = liabilityTree.reduce((s, n) => s + n.balance, 0);
  const equitySigned = equityTree.reduce((s, n) => s + n.balance, 0);

  // Net profit uses signed sums exactly like قائمة الدخل so the two agree.
  // Revenue is credit → negative; Expenses/Purchases are debit → positive.
  // netProfit = revenue − (purchases + expenses) = (−revSigned) − (purSigned + expSigned)
  let revSigned = 0, purSigned = 0, expSigned = 0;
  accounts.forEach(a => {
    const cat = classifyAccount(a);
    const bal = balances[a.account_code] || 0;
    if (cat === "Revenue") revSigned += bal;
    else if (cat === "Purchases") purSigned += bal;
    else if (cat === "Expenses") expSigned += bal;
  });
  const netProfit = (-revSigned) - (purSigned + expSigned);

  // Present each side with its natural sign so the equation always balances
  // visually: Assets = Liabilities + Equity, even when some accounts hold
  // abnormal balances (surfaced with the "شاذ" tag inside their section).
  const totalAssets = assetsSigned;
  const totalLiabilities = -liabSigned;
  const totalEquity = -equitySigned + netProfit;

  return { assetTree, liabilityTree, equityTree, totalAssets, totalLiabilities, totalEquity, netProfit };
};

const BalanceSheetPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;
  const companyInfo = useCompanyInfo();
  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [accounts, setAccounts] = useState<SupabaseAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [detailLevel, setDetailLevel] = useState(2);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [asOfDate, setAsOfDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [activePeriod, setActivePeriod] = useState("this-month");
  const [showZeroAccounts, setShowZeroAccounts] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [costCenters, setCostCenters] = useState<{ id: string; name: string }[]>([]);
  const [costCenterFilter, setCostCenterFilter] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("company_name").eq("user_id", ownerId).maybeSingle()
      .then(({ data }) => { if (data?.company_name) setCompanyName(data.company_name); });
  }, [user]);

  useEffect(() => {
    if (!user || !dataOwnerId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [txData, accData] = await Promise.all([fetchTransactions(dataOwnerId), fetchAccounts(dataOwnerId)]);
        setTransactions(txData);
        setAccounts(accData);
      } catch { /* silent */ }
      setLoading(false);
    };
    load();
  }, [user, dataOwnerId]);

  // Load cost centers (branches) for filter
  useEffect(() => {
    if (!dataOwnerId) return;
    supabase
      .from("cost_centers")
      .select("id, name")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setCostCenters((data as any) || []));
  }, [dataOwnerId]);

  const handleQuickPeriod = (key: string) => {
    setActivePeriod(key);
    setAsOfDate(getQuickPeriodDate(key));
  };

  const filteredTransactions = useMemo(() => {
    if (costCenterFilter === "all") return transactions;
    if (costCenterFilter === "none") return transactions.filter(tx => !(tx as any).cost_center_id);
    return transactions.filter(tx => (tx as any).cost_center_id === costCenterFilter);
  }, [transactions, costCenterFilter]);

  const accountBalances = useMemo(() => computeBalances(filteredTransactions, asOfDate), [filteredTransactions, asOfDate]);
  const current = useMemo(() => computeTotals(accounts, accountBalances), [accounts, accountBalances]);

  const prevAsOfDate = useMemo(() => getPreviousAsOfDate(asOfDate), [asOfDate]);
  const prevBalances = useMemo(() => showComparison ? computeBalances(filteredTransactions, prevAsOfDate) : {}, [filteredTransactions, prevAsOfDate, showComparison]);
  const previous = useMemo(() => showComparison ? computeTotals(accounts, prevBalances) : null, [accounts, prevBalances, showComparison]);

  const periodLabel = new Date(asOfDate).toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
  const prevPeriodLabel = new Date(prevAsOfDate).toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
  const isBalanced = Math.abs(current.totalAssets - (current.totalLiabilities + current.totalEquity)) < 1;

  // Prev balances per line — used by the comparison column. Previously this
  // dead-code returned the *current* prevBalances object which was correct by
  // accident; we keep it explicit and per-account so account rows compare
  // themselves against their own prior balance, not a sibling's.
  const prevLineBalanceFor = useMemo(() => {
    return (code: string) => {
      if (!showComparison || !previous) return 0;
      // Prefer tree balance (which includes children roll-up) for parent rows;
      // fall back to raw prevBalances for leaf accounts.
      const findInTree = (nodes: any[]): number | null => {
        for (const n of nodes) {
          if (n.account.account_code === code) return n.balance;
          const inner = findInTree(n.children);
          if (inner !== null) return inner;
        }
        return null;
      };
      const fromTree =
        findInTree(previous.assetTree) ??
        findInTree(previous.liabilityTree) ??
        findInTree(previous.equityTree);
      return fromTree ?? (prevBalances[code] || 0);
    };
  }, [showComparison, previous, prevBalances]);

  // Accounts with missing name or type — surfaced as a warning banner (parity
  // with Trial Balance) so users can fix broken chart-of-accounts entries.
  const brokenAccounts = useMemo(() =>
    accounts.filter(a => !a.account_name?.trim() || !classifyAccount(a) || classifyAccount(a) === "Other"),
    [accounts],
  );

  // Orphan account codes: appear on transactions but have no row in the
  // accounts table. They silently leak from the totals (because we iterate
  // over accounts, not transactions) and cause phantom imbalances.
  const orphanCodes = useMemo(() => {
    const known = new Set(accounts.map(a => a.account_code));
    const orphans = new Map<string, { debit: number; credit: number }>();
    transactions.forEach(tx => {
      if (tx.is_deleted) return;
      if (tx.transaction_date > asOfDate) return;
      const amt = tx.amount || 0;
      const d = tx.debit_account_code;
      const c = tx.credit_account_code;
      if (d && !known.has(d)) {
        const cur = orphans.get(d) || { debit: 0, credit: 0 };
        cur.debit += amt;
        orphans.set(d, cur);
      }
      if (c && !known.has(c)) {
        const cur = orphans.get(c) || { debit: 0, credit: 0 };
        cur.credit += amt;
        orphans.set(c, cur);
      }
    });
    return Array.from(orphans.entries())
      .map(([code, v]) => ({ code, signed: v.debit - v.credit }))
      .filter(o => Math.abs(o.signed) > 0.001);
  }, [transactions, accounts, asOfDate]);

  const orphanNetImbalance = useMemo(
    () => orphanCodes.reduce((s, o) => s + o.signed, 0),
    [orphanCodes],
  );

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleExportExcel = () => {
    const rows: Record<string, any>[] = [];
    const addSection = (title: string, lines: FlatAccountLine[], total: number, normalSide: "debit" | "credit") => {
      rows.push({ "البيان": `═══ ${title} ═══`, "الكود": "", "الرصيد": "" });
      lines.forEach(l => {
        const indent = "  ".repeat(l.depth - 1);
        const presented = normalSide === "debit" ? l.balance : -l.balance;
        rows.push({ "البيان": `${indent}${l.name}`, "الكود": l.code, "الرصيد": presented === 0 ? "" : presented });
      });
      rows.push({ "البيان": `إجمالي ${title}`, "الكود": "", "الرصيد": total });
    };
    addSection("الأصول", assetLines, current.totalAssets, "debit");
    addSection("الالتزامات", liabLines, current.totalLiabilities, "credit");
    addSection("حقوق الملكية", eqLines, current.totalEquity, "credit");
    exportToExcel(rows, { "التقرير": "قائمة المركز المالي", "التاريخ": periodLabel }, `المركز-المالي-${Date.now()}`);
  };

  const handleExportPDF = () => {
    const tableHeaders = ["البيان", "الكود", "الرصيد ₪"];
    const tableRows: string[][] = [];
    const addSection = (title: string, lines: FlatAccountLine[], total: number, normalSide: "debit" | "credit") => {
      tableRows.push([`<strong style="color:#1B3A5C;font-size:12px">═══ ${title} ═══</strong>`, "", ""]);
      lines.forEach(l => {
        const indent = (l.depth - 1) * 16;
        const isBold = l.hasChildren;
        const style = isBold ? "font-weight:700;" : "";
        const presented = normalSide === "debit" ? l.balance : -l.balance;
        tableRows.push([`<span style="padding-right:${indent}px;${style}">${l.name}</span>`, l.code, `${isBold ? "<strong>" : ""}₪${presented.toLocaleString()}${isBold ? "</strong>" : ""}`]);
      });
      tableRows.push([`<strong>إجمالي ${title}</strong>`, "", `<strong>₪${total.toLocaleString()}</strong>`]);
    };
    addSection("الأصول", assetLines, current.totalAssets, "debit");
    addSection("الالتزامات", liabLines, current.totalLiabilities, "credit");
    addSection("حقوق الملكية", eqLines, current.totalEquity, "credit");
    const company = companyInfo.name ? companyInfo : { name: companyName, logo_url: "", address: "", phone: "", email: "", website: "", tax_number: "" };
    const html = generateProfessionalPDFHtml({
      company, reportTitle: "قائمة المركز المالي", reportTitleEn: "BALANCE SHEET",
      periodLabel: `كما في ${periodLabel}`,
      summaryItems: [
        { label: "إجمالي الأصول", value: `₪${current.totalAssets.toLocaleString()}`, color: "#2563EB" },
        { label: "إجمالي الالتزامات", value: `₪${current.totalLiabilities.toLocaleString()}`, color: "#DC2626" },
        { label: "حقوق الملكية", value: `₪${current.totalEquity.toLocaleString()}`, color: "#7C3AED" },
        { label: "التوازن", value: isBalanced ? "✅ متوازن" : "⚠️ غير متوازن", color: isBalanced ? "#16A34A" : "#DC2626" },
      ],
      tableHeaders, tableRows,
      notes: ["أُعد هذا التقرير وفقاً لمعايير المحاسبة الدولية (IAS 1)", `المعادلة: الأصول (₪${current.totalAssets.toLocaleString()}) = الالتزامات (₪${current.totalLiabilities.toLocaleString()}) + حقوق الملكية (₪${current.totalEquity.toLocaleString()})`],
    });
    openPrintWindow(html);
  };

  const renderHierarchicalSection = (
    title: string,
    lines: FlatAccountLine[],
    total: number,
    color: string,
    prevTotal?: number,
    normalSide: "debit" | "credit" = "debit",
  ) => {
    if (lines.length === 0 && !showZeroAccounts) return null;

    return (
      <div className="space-y-1">
        <h2 className={`text-sm font-bold ${color} px-1 mb-2`}>{title}</h2>
        <div className="rounded-xl border border-border/50 overflow-hidden">
          {lines.map((line, i) => {
            const isParentRow = line.hasChildren;
            const isCollapsed = collapsedGroups.has(line.code);
            const indent = (line.depth - 1) * 24;
            // Presented balance: signed for the section's natural side.
            // Debit-normal sections (أصول) show line.balance as-is.
            // Credit-normal sections (خصوم / حقوق) flip so a normal credit balance
            // reads positive; an abnormal debit balance stays negative and is
            // flagged as "رصيد شاذ".
            const presented = normalSide === "debit" ? line.balance : -line.balance;
            const isAbnormal = presented < 0 && Math.abs(presented) > 0.001;
            const prevRaw = showComparison ? prevLineBalanceFor(line.code) : 0;
            const prevPresented = normalSide === "debit" ? prevRaw : -prevRaw;
            const change = showComparison && Math.abs(prevPresented) > 0.001
              ? ((presented - prevPresented) / Math.abs(prevPresented)) * 100
              : null;

            return (
              <div
                key={`${line.code}-${i}`}
                className={`flex items-center justify-between px-4 py-2.5 border-b border-border/30 text-xs transition-colors ${
                  isParentRow ? "bg-muted/40 hover:bg-muted/60 cursor-pointer" : "hover:bg-muted/10"
                }`}
                style={{ paddingRight: `${16 + indent}px` }}
                onClick={() => isParentRow && toggleGroup(line.code)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isParentRow && (
                    isCollapsed
                      ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                  {!isParentRow && <div className="w-3.5" />}
                  <span className="text-[10px] text-muted-foreground font-mono w-10 flex-shrink-0">{line.code}</span>
                  <span className={`truncate ${isParentRow ? "font-bold text-foreground" : "text-foreground font-medium"}`}>
                    {line.name}
                  </span>
                  {isAbnormal && !isParentRow && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-medium flex-shrink-0">
                      رصيد شاذ
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {showComparison && (
                    <span className="text-[10px] text-muted-foreground tabular-nums w-20 text-left">
                      {Math.abs(prevPresented) > 0.001 ? `₪${prevPresented.toLocaleString()}` : "—"}
                    </span>
                  )}
                  <span className={`font-bold tabular-nums whitespace-nowrap ${
                    isAbnormal ? "text-amber-600 dark:text-amber-400" : (isParentRow ? color : "text-foreground")
                  }`}>
                    {Math.abs(presented) > 0.001 ? `₪${presented.toLocaleString()}` : "—"}
                  </span>
                  {showComparison && change !== null && (
                    <span className={`text-[9px] tabular-nums flex items-center gap-0.5 w-14 ${change >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {change >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                      {Math.abs(change).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20 text-xs font-bold">
            <span className="text-muted-foreground">إجمالي {title}</span>
            <div className="flex items-center gap-3">
              {showComparison && prevTotal !== undefined && (
                <span className="text-[10px] text-muted-foreground tabular-nums w-20 text-left">₪{prevTotal.toLocaleString()}</span>
              )}
              <span className={color}>₪{total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const assetLines = useMemo(() => flattenAccountTree(current.assetTree, detailLevel).filter(l => showZeroAccounts || l.balance !== 0), [current.assetTree, detailLevel, showZeroAccounts]);
  const liabLines = useMemo(() => flattenAccountTree(current.liabilityTree, detailLevel).filter(l => showZeroAccounts || l.balance !== 0), [current.liabilityTree, detailLevel, showZeroAccounts]);
  const eqLines = useMemo(() => flattenAccountTree(current.equityTree, detailLevel).filter(l => showZeroAccounts || l.balance !== 0), [current.equityTree, detailLevel, showZeroAccounts]);

  const actionTabs: ActionTab[] = useMemo(() => ([{
    key: "general",
    label: "عام",
    groups: [
      { key: "actions", label: "إجراءات", items: [
        { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: () => {
          if (!user || !dataOwnerId) return;
          (async () => {
            setLoading(true);
            try {
              const [txData, accData] = await Promise.all([fetchTransactions(dataOwnerId), fetchAccounts(dataOwnerId)]);
              setTransactions(txData); setAccounts(accData);
            } finally { setLoading(false); }
          })();
        }},
        { key: "center", label: "مركز المالية", icon: Calculator, onClick: () => navigate("/accounting-center") },
      ]},
      { key: "print", label: "طباعة", items: [
        { key: "print", label: "طباعة", icon: Printer, onClick: handleExportPDF, disabled: loading },
        { key: "pdf", label: "PDF", icon: Download, onClick: handleExportPDF, disabled: loading },
      ]},
      { key: "export", label: "تصدير", items: [
        { key: "excel", label: "Excel", icon: FileSpreadsheet, onClick: handleExportExcel, disabled: loading },
      ]},
    ],
  }]), [user, dataOwnerId, loading, navigate]);

  return (
    <FinanceShell
      title="قائمة المركز المالي"
      subtitle="الأصول = الالتزامات + حقوق الملكية — وفقاً لمعايير IAS 1"
      breadcrumb={[
        { label: "المالية", href: "/accounting-center" },
        { label: "التقارير" },
        { label: "المركز المالي" },
      ]}
      actionTabs={actionTabs}
      rightSlot={
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[12.5px] text-muted-foreground">كما في</span>
          <Input type="date" value={asOfDate} onChange={e => { setAsOfDate(e.target.value); setActivePeriod("custom"); }} className="w-[150px] h-8 text-xs" />
        </div>
      }
    >
      <div className="space-y-4 max-w-[1300px] mx-auto" dir="rtl">
      {/* Inline controls */}
      <Card className="border-0 shadow-sm rounded-2xl p-3 space-y-2 print:hidden">
        <div className="flex gap-1.5 flex-wrap">
          {quickPeriods.map(p => (
            <button key={p.key} onClick={() => handleQuickPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${activePeriod === p.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 flex-wrap text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={showComparison} onCheckedChange={(v) => setShowComparison(!!v)} />
            <span className="text-muted-foreground">مقارنة الفترة السابقة</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={showZeroAccounts} onCheckedChange={(v) => setShowZeroAccounts(!!v)} />
            <span className="text-muted-foreground">الحسابات الصفرية</span>
          </label>
          <div className="flex items-center gap-1.5 mr-4">
            <span className="text-muted-foreground text-[10px]">مستوى التفصيل:</span>
            {[1, 2, 3, 4].map(lv => (
              <button key={lv} onClick={() => setDetailLevel(lv)}
                className={`w-6 h-6 rounded text-[10px] font-bold transition-all ${detailLevel === lv ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
                {lv}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 mr-4">
            <span className="text-muted-foreground text-[10px]">الفرع / مركز التكلفة:</span>
            <select
              value={costCenterFilter}
              onChange={(e) => setCostCenterFilter(e.target.value)}
              className="h-7 text-[11px] rounded border border-border bg-background px-2"
            >
              <option value="all">الكل</option>
              <option value="none">بدون مركز تكلفة</option>
              {costCenters.map(cc => (
                <option key={cc.id} value={cc.id}>{cc.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <ReportSummary items={[
            { label: "إجمالي الأصول", value: current.totalAssets, color: "primary", signed: true },
            { label: "إجمالي الالتزامات", value: current.totalLiabilities, color: "destructive", signed: true },
            { label: "حقوق الملكية", value: current.totalEquity, color: "warning", signed: true },
          ]} />

          {showComparison && previous && (
            <div className="text-center text-[10px] text-muted-foreground py-1">
              مقارنة مع: {prevPeriodLabel}
            </div>
          )}

          <div className="flex items-center justify-center py-2">
            <ReportStatusBadge
              status={isBalanced ? "balanced" : "needs_review"}
              label={isBalanced ? "الميزانية متوازنة" : "الميزانية غير متوازنة"}
              detail={
                isBalanced
                  ? "الأصول = الالتزامات + حقوق الملكية"
                  : `فرق ₪${Math.abs(current.totalAssets - current.totalLiabilities - current.totalEquity).toLocaleString()}`
              }
            />
          </div>

          {brokenAccounts.length > 0 && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 flex items-start gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-destructive mb-1">حسابات بحاجة لتصحيح ({brokenAccounts.length})</p>
                <p className="text-muted-foreground text-[11px]">
                  الأكواد التالية بدون اسم أو نوع محاسبي صحيح، ولن تُصنَّف في القوائم المالية:
                  <span className="font-mono mx-1">{brokenAccounts.slice(0, 12).map(a => a.account_code).join("، ")}</span>
                  {brokenAccounts.length > 12 && <span> …</span>}
                </p>
                <Button size="sm" variant="link" className="h-auto p-0 mt-1 text-destructive" onClick={() => navigate("/chart-of-accounts")}>
                  فتح دليل الحسابات ←
                </Button>
              </div>
            </div>
          )}

          {orphanCodes.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 flex items-start gap-2 text-xs">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-amber-700 dark:text-amber-500 mb-1">
                  أكواد قيود يتيمة ({orphanCodes.length}) — صافي التأثير: ₪{Math.abs(orphanNetImbalance).toLocaleString()}
                </p>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  الأكواد التالية مُستخدَمة في القيود لكن **لا يوجد لها حساب في دليل الحسابات**، فتُهمَل من التصنيف وتُسبّب فرق في المعادلة المحاسبية:
                  <span className="block mt-1 font-mono">
                    {orphanCodes.slice(0, 10).map(o => (
                      <span key={o.code} className="inline-block ml-2 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">
                        {o.code} <span className="text-[10px] opacity-70">({o.signed > 0 ? "+" : ""}{o.signed.toLocaleString()})</span>
                      </span>
                    ))}
                    {orphanCodes.length > 10 && <span> …</span>}
                  </span>
                </p>
                <Button size="sm" variant="link" className="h-auto p-0 mt-1 text-amber-700 dark:text-amber-500" onClick={() => navigate("/chart-of-accounts")}>
                  أنشئ الحسابات المفقودة في دليل الحسابات ←
                </Button>
              </div>
            </div>
          )}

          {renderHierarchicalSection("الأصول", assetLines, current.totalAssets, "text-primary", previous?.totalAssets, "debit")}
          {renderHierarchicalSection("الالتزامات", liabLines, current.totalLiabilities, "text-destructive", previous?.totalLiabilities, "credit")}
          
          <div className="space-y-1">
            {renderHierarchicalSection("حقوق الملكية", eqLines, current.totalEquity, "text-warning", previous?.totalEquity, "credit")}
            {current.netProfit !== 0 && (
              <div className="rounded-xl border border-border/50 overflow-hidden mx-1">
                <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 dark:bg-emerald-500/10 text-xs">
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {current.netProfit >= 0 ? "📊 صافي ربح الفترة الحالية" : "📊 صافي خسارة الفترة الحالية"}
                  </span>
                  <span className={`font-mono font-bold ${current.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    ₪{Math.abs(current.netProfit).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 text-center space-y-1">
            <p className="text-[10px] text-muted-foreground font-medium">المعادلة المحاسبية</p>
            <p className="text-sm font-bold text-foreground">
              الأصول <span className="text-primary">₪{current.totalAssets.toLocaleString()}</span>
              {" = "}
              الالتزامات <span className="text-destructive">₪{current.totalLiabilities.toLocaleString()}</span>
              {" + "}
              حقوق الملكية <span className="text-warning">₪{current.totalEquity.toLocaleString()}</span>
            </p>
          </div>
        </>
      )}
      </div>
    </FinanceShell>
  );
};

export default BalanceSheetPage;
