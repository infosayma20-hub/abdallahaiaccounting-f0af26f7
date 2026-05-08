import { useState, useEffect, useMemo } from "react";
import { Loader2, Landmark, ChevronDown, ChevronRight, Calendar, FileSpreadsheet, Download, Printer, TrendingUp, TrendingDown } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ReportSummary, exportToExcel } from "@/components/ReportComponents";
import { generateProfessionalPDFHtml, openPrintWindow, useCompanyInfo } from "@/components/ReportPrintLayout";
import {
  fetchTransactions, fetchAccounts, buildAccountMap, normalizeAccountType,
  SupabaseTransaction, SupabaseAccount, buildAccountTree, flattenAccountTree, FlatAccountLine,
} from "@/lib/supabase-data";
import { format, endOfMonth, startOfMonth, subMonths, startOfYear, endOfYear, startOfWeek, endOfWeek, subDays } from "date-fns";

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
  const isAsset = (a: SupabaseAccount) => normalizeAccountType(a.account_type || "") === "Asset";
  const isLiability = (a: SupabaseAccount) => normalizeAccountType(a.account_type || "") === "Liability";
  const isEquity = (a: SupabaseAccount) => normalizeAccountType(a.account_type || "") === "Equity";

  const assetTree = buildAccountTree(accounts, balances, isAsset);
  const liabilityTree = buildAccountTree(accounts, balances, isLiability);
  const equityTree = buildAccountTree(accounts, balances, isEquity);

  const totalAssets = Math.abs(assetTree.reduce((s, n) => s + n.balance, 0));
  const totalLiabilities = liabilityTree.reduce((s, n) => s + Math.abs(n.balance), 0);
  const totalEquityAccounts = equityTree.reduce((s, n) => s + Math.abs(n.balance), 0);

  let totalRevenue = 0, totalPurchasesExpenses = 0;
  accounts.forEach(a => {
    const type = normalizeAccountType(a.account_type || "");
    const bal = balances[a.account_code] || 0;
    if (type === "Revenue") totalRevenue += Math.abs(bal);
    if (type === "Purchases" || type === "Expenses") totalPurchasesExpenses += bal;
  });
  const netProfit = totalRevenue - totalPurchasesExpenses;
  const totalEquity = totalEquityAccounts + netProfit;

  return { assetTree, liabilityTree, equityTree, totalAssets, totalLiabilities, totalEquity, netProfit };
};

const BalanceSheetPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
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

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("company_name").eq("user_id", user.id).maybeSingle()
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

  const handleQuickPeriod = (key: string) => {
    setActivePeriod(key);
    setAsOfDate(getQuickPeriodDate(key));
  };

  const accountBalances = useMemo(() => computeBalances(transactions, asOfDate), [transactions, asOfDate]);
  const current = useMemo(() => computeTotals(accounts, accountBalances), [accounts, accountBalances]);

  const prevAsOfDate = useMemo(() => getPreviousAsOfDate(asOfDate), [asOfDate]);
  const prevBalances = useMemo(() => showComparison ? computeBalances(transactions, prevAsOfDate) : {}, [transactions, prevAsOfDate, showComparison]);
  const previous = useMemo(() => showComparison ? computeTotals(accounts, prevBalances) : null, [accounts, prevBalances, showComparison]);

  // Build a map of previous balances per account code for line-level comparison
  const prevAccountBalanceMap = useMemo(() => {
    if (!showComparison) return {};
    const map: Record<string, number> = {};
    const prevLines = [
      ...flattenAccountTree(current.assetTree, 99),
      ...flattenAccountTree(current.liabilityTree, 99),
      ...flattenAccountTree(current.equityTree, 99),
    ];
    // Compute from prevBalances directly
    return prevBalances;
  }, [showComparison, prevBalances, current]);

  const periodLabel = new Date(asOfDate).toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
  const prevPeriodLabel = new Date(prevAsOfDate).toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
  const isBalanced = Math.abs(current.totalAssets - (current.totalLiabilities + current.totalEquity)) < 1;

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleExportExcel = () => {
    const rows: Record<string, any>[] = [];
    const addSection = (title: string, lines: FlatAccountLine[], total: number) => {
      rows.push({ "البيان": `═══ ${title} ═══`, "الكود": "", "الرصيد": "" });
      lines.forEach(l => {
        const indent = "  ".repeat(l.depth - 1);
        rows.push({ "البيان": `${indent}${l.name}`, "الكود": l.code, "الرصيد": l.balance === 0 ? "" : Math.abs(l.balance) });
      });
      rows.push({ "البيان": `إجمالي ${title}`, "الكود": "", "الرصيد": total });
    };
    addSection("الأصول", assetLines, current.totalAssets);
    addSection("الالتزامات", liabLines, current.totalLiabilities);
    addSection("حقوق الملكية", eqLines, current.totalEquity);
    exportToExcel(rows, { "التقرير": "قائمة المركز المالي", "التاريخ": periodLabel }, `المركز-المالي-${Date.now()}`);
  };

  const handleExportPDF = () => {
    const tableHeaders = ["البيان", "الكود", "الرصيد ₪"];
    const tableRows: string[][] = [];
    const addSection = (title: string, lines: FlatAccountLine[], total: number) => {
      tableRows.push([`<strong style="color:#1B3A5C;font-size:12px">═══ ${title} ═══</strong>`, "", ""]);
      lines.forEach(l => {
        const indent = (l.depth - 1) * 16;
        const isBold = l.hasChildren;
        const style = isBold ? "font-weight:700;" : "";
        tableRows.push([`<span style="padding-right:${indent}px;${style}">${l.name}</span>`, l.code, `${isBold ? "<strong>" : ""}₪${Math.abs(l.balance).toLocaleString()}${isBold ? "</strong>" : ""}`]);
      });
      tableRows.push([`<strong>إجمالي ${title}</strong>`, "", `<strong>₪${total.toLocaleString()}</strong>`]);
    };
    addSection("الأصول", assetLines, current.totalAssets);
    addSection("الالتزامات", liabLines, current.totalLiabilities);
    addSection("حقوق الملكية", eqLines, current.totalEquity);
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

  const renderHierarchicalSection = (title: string, lines: FlatAccountLine[], total: number, color: string, prevTotal?: number) => {
    if (lines.length === 0 && !showZeroAccounts) return null;

    return (
      <div className="space-y-1">
        <h2 className={`text-sm font-bold ${color} px-1 mb-2`}>{title}</h2>
        <div className="rounded-xl border border-border/50 overflow-hidden">
          {lines.map((line, i) => {
            const isParentRow = line.hasChildren;
            const isCollapsed = collapsedGroups.has(line.code);
            const indent = (line.depth - 1) * 24;
            const absBalance = Math.abs(line.balance);
            const prevBal = showComparison ? Math.abs(prevBalances[line.code] || 0) : 0;
            const change = showComparison && prevBal > 0 ? ((absBalance - prevBal) / prevBal) * 100 : null;

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
                </div>
                <div className="flex items-center gap-3">
                  {showComparison && (
                    <span className="text-[10px] text-muted-foreground tabular-nums w-20 text-left">
                      {prevBal > 0 ? `₪${prevBal.toLocaleString()}` : "—"}
                    </span>
                  )}
                  <span className={`font-bold tabular-nums whitespace-nowrap ${isParentRow ? color : "text-foreground"}`}>
                    {absBalance > 0 ? `₪${absBalance.toLocaleString()}` : "—"}
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

  return (
    <div className="px-4 pt-6 space-y-5 pb-8" dir="rtl">
      {/* Header */}
      <PageHeader title="قائمة المركز المالي" breadcrumb={["المحاسبة", "التقارير", "قائمة المركز المالي"]} />

      {/* Controls Card */}
      <Card className="border-0 shadow-sm rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">كما في:</span>
            <Input type="date" value={asOfDate} onChange={e => { setAsOfDate(e.target.value); setActivePeriod("custom"); }} className="w-[160px] h-8 text-xs" />
          </div>
        </div>
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
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={handleExportExcel} disabled={loading}>
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={handleExportPDF} disabled={loading}>
            <Download className="h-3 w-3" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={handleExportPDF} disabled={loading}>
            <Printer className="h-3 w-3" /> طباعة PDF
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <ReportSummary items={[
            { label: "إجمالي الأصول", value: current.totalAssets, color: "primary" },
            { label: "إجمالي الالتزامات", value: current.totalLiabilities, color: "destructive" },
            { label: "حقوق الملكية", value: current.totalEquity, color: "warning" },
          ]} />

          {showComparison && previous && (
            <div className="text-center text-[10px] text-muted-foreground py-1">
              مقارنة مع: {prevPeriodLabel}
            </div>
          )}

          <div className={`text-center text-xs py-2 rounded-lg ${isBalanced ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
            {isBalanced ? "✅ الميزانية متوازنة (الأصول = الالتزامات + حقوق الملكية)" : `⚠️ الميزانية غير متوازنة — فرق: ₪${Math.abs(current.totalAssets - current.totalLiabilities - current.totalEquity).toLocaleString()}`}
          </div>

          {renderHierarchicalSection("الأصول", assetLines, current.totalAssets, "text-primary", previous?.totalAssets)}
          {renderHierarchicalSection("الالتزامات", liabLines, current.totalLiabilities, "text-destructive", previous?.totalLiabilities)}
          
          <div className="space-y-1">
            {renderHierarchicalSection("حقوق الملكية", eqLines, current.totalEquity, "text-warning", previous?.totalEquity)}
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
  );
};

export default BalanceSheetPage;
