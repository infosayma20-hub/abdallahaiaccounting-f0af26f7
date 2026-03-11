import { useState, useEffect, useMemo } from "react";
import { Loader2, Landmark, ChevronDown, ChevronRight, Calendar, FileSpreadsheet, Download, Printer, BarChart3, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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

const BalanceSheetPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
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

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("company_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.company_name) setCompanyName(data.company_name); });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const [txData, accData] = await Promise.all([
          fetchTransactions(user.id),
          fetchAccounts(user.id),
        ]);
        setTransactions(txData);
        setAccounts(accData);
      } catch { /* silent */ }
      setLoading(false);
    };
    load();
  }, [user]);

  const handleQuickPeriod = (key: string) => {
    setActivePeriod(key);
    setAsOfDate(getQuickPeriodDate(key));
  };

  const accountMap = useMemo(() => buildAccountMap(accounts), [accounts]);

  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    transactions.filter(tx => !tx.is_deleted && tx.transaction_date <= asOfDate).forEach(tx => {
      const amount = tx.amount || 0;
      if (tx.debit_account_code) {
        balances[tx.debit_account_code] = (balances[tx.debit_account_code] || 0) + amount;
      }
      if (tx.credit_account_code) {
        balances[tx.credit_account_code] = (balances[tx.credit_account_code] || 0) - amount;
      }
    });
    return balances;
  }, [transactions, asOfDate]);

  const { assetTree, liabilityTree, equityTree, totalAssets, totalLiabilities, totalEquity, netProfit } = useMemo(() => {
    const isAsset = (a: SupabaseAccount) => normalizeAccountType(a.account_type || "") === "Asset";
    const isLiability = (a: SupabaseAccount) => normalizeAccountType(a.account_type || "") === "Liability";
    const isEquity = (a: SupabaseAccount) => normalizeAccountType(a.account_type || "") === "Equity";

    const assetTree = buildAccountTree(accounts, accountBalances, isAsset);
    const liabilityTree = buildAccountTree(accounts, accountBalances, isLiability);
    const equityTree = buildAccountTree(accounts, accountBalances, isEquity);

    const totalAssets = assetTree.reduce((s, n) => s + n.balance, 0);
    const totalLiabilities = liabilityTree.reduce((s, n) => s + Math.abs(n.balance), 0);
    const totalEquityAccounts = equityTree.reduce((s, n) => s + Math.abs(n.balance), 0);

    let totalRevenue = 0;
    let totalPurchasesExpenses = 0;
    accounts.forEach(a => {
      const type = normalizeAccountType(a.account_type || "");
      const bal = accountBalances[a.account_code] || 0;
      if (type === "Revenue") totalRevenue += Math.abs(bal);
      if (type === "Purchases" || type === "Expenses") totalPurchasesExpenses += bal;
    });
    const netProfit = totalRevenue - totalPurchasesExpenses;
    const totalEquity = totalEquityAccounts + netProfit;

    return { assetTree, liabilityTree, equityTree, totalAssets: Math.abs(totalAssets), totalLiabilities, totalEquity, netProfit };
  }, [accounts, accountBalances]);

  const periodLabel = new Date(asOfDate).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1;

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
        rows.push({
          "البيان": `${indent}${l.name}`,
          "الكود": l.code,
          "الرصيد": l.balance === 0 ? "" : Math.abs(l.balance),
        });
      });
      rows.push({ "البيان": `إجمالي ${title}`, "الكود": "", "الرصيد": total });
    };

    addSection("الأصول", assetLines, totalAssets);
    addSection("الالتزامات", liabLines, totalLiabilities);
    addSection("حقوق الملكية", eqLines, totalEquity);

    exportToExcel(rows, {
      "التقرير": "قائمة المركز المالي",
      "التاريخ": periodLabel,
    }, `المركز-المالي-${Date.now()}`);
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
        tableRows.push([
          `<span style="padding-right:${indent}px;${style}">${l.name}</span>`,
          l.code,
          `${isBold ? "<strong>" : ""}₪${Math.abs(l.balance).toLocaleString()}${isBold ? "</strong>" : ""}`,
        ]);
      });
      tableRows.push([`<strong>إجمالي ${title}</strong>`, "", `<strong>₪${total.toLocaleString()}</strong>`]);
    };

    addSection("الأصول", assetLines, totalAssets);
    addSection("الالتزامات", liabLines, totalLiabilities);
    addSection("حقوق الملكية", eqLines, totalEquity);

    const company = companyInfo.name ? companyInfo : { name: companyName, logo_url: "", address: "", phone: "", email: "", website: "", tax_number: "" };
    const html = generateProfessionalPDFHtml({
      company,
      reportTitle: "قائمة المركز المالي",
      reportTitleEn: "BALANCE SHEET",
      periodLabel: `كما في ${periodLabel}`,
      summaryItems: [
        { label: "إجمالي الأصول", value: `₪${totalAssets.toLocaleString()}`, color: "#2563EB" },
        { label: "إجمالي الالتزامات", value: `₪${totalLiabilities.toLocaleString()}`, color: "#DC2626" },
        { label: "حقوق الملكية", value: `₪${totalEquity.toLocaleString()}`, color: "#7C3AED" },
        { label: "التوازن", value: isBalanced ? "✅ متوازن" : "⚠️ غير متوازن", color: isBalanced ? "#16A34A" : "#DC2626" },
      ],
      tableHeaders,
      tableRows,
      notes: [
        "أُعد هذا التقرير وفقاً لمعايير المحاسبة الدولية (IAS 1)",
        `المعادلة: الأصول (₪${totalAssets.toLocaleString()}) = الالتزامات (₪${totalLiabilities.toLocaleString()}) + حقوق الملكية (₪${totalEquity.toLocaleString()})`,
      ],
    });
    openPrintWindow(html);
  };

  const renderHierarchicalSection = (title: string, lines: FlatAccountLine[], total: number, color: string) => {
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
                <span className={`font-bold tabular-nums whitespace-nowrap ${isParentRow ? color : "text-foreground"}`}>
                  {absBalance > 0 ? `₪${absBalance.toLocaleString()}` : "—"}
                </span>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20 text-xs font-bold">
            <span className="text-muted-foreground">إجمالي {title}</span>
            <span className={color}>₪{total.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  };

  // Flatten trees with level filter
  const assetLines = useMemo(() => flattenAccountTree(assetTree, detailLevel).filter(l => showZeroAccounts || l.balance !== 0), [assetTree, detailLevel, showZeroAccounts]);
  const liabLines = useMemo(() => flattenAccountTree(liabilityTree, detailLevel).filter(l => showZeroAccounts || l.balance !== 0), [liabilityTree, detailLevel, showZeroAccounts]);
  const eqLines = useMemo(() => flattenAccountTree(equityTree, detailLevel).filter(l => showZeroAccounts || l.balance !== 0), [equityTree, detailLevel, showZeroAccounts]);

  return (
    <div className="px-4 pt-6 space-y-5 pb-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">قائمة المركز المالي</h1>
            <p className="text-[10px] text-muted-foreground">Balance Sheet</p>
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Landmark className="h-5 w-5 text-primary" />
        </div>
      </div>

      {/* Controls Card - matching Income Statement */}
      <Card className="p-4 space-y-3">
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
            <Checkbox checked={showZeroAccounts} onCheckedChange={(v) => setShowZeroAccounts(!!v)} />
            <span className="text-muted-foreground">الحسابات الصفرية</span>
          </label>
          <div className="flex items-center gap-1.5 mr-4">
            <span className="text-muted-foreground text-[10px]">مستوى التفصيل:</span>
            {[1, 2, 3, 4].map(lv => (
              <button
                key={lv}
                onClick={() => setDetailLevel(lv)}
                className={`w-6 h-6 rounded text-[10px] font-bold transition-all ${
                  detailLevel === lv
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
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
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => window.print()} disabled={loading}>
            <Printer className="h-3 w-3" /> طباعة
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <ReportSummary items={[
            { label: "إجمالي الأصول", value: totalAssets, color: "primary" },
            { label: "إجمالي الالتزامات", value: totalLiabilities, color: "destructive" },
            { label: "حقوق الملكية", value: totalEquity, color: "warning" },
          ]} />

          {/* Balance check */}
          <div className={`text-center text-xs py-2 rounded-lg ${isBalanced ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
            {isBalanced ? "✅ الميزانية متوازنة (الأصول = الالتزامات + حقوق الملكية)" : `⚠️ الميزانية غير متوازنة — فرق: ₪${Math.abs(totalAssets - totalLiabilities - totalEquity).toLocaleString()}`}
          </div>

          {/* Sections */}
          {renderHierarchicalSection("الأصول", assetLines, totalAssets, "text-primary")}
          {renderHierarchicalSection("الالتزامات", liabLines, totalLiabilities, "text-destructive")}
          
          {/* Equity section with net profit */}
          <div className="space-y-1">
            {renderHierarchicalSection("حقوق الملكية", eqLines, totalEquity, "text-warning")}
            {netProfit !== 0 && (
              <div className="rounded-xl border border-border/50 overflow-hidden mx-1">
                <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 dark:bg-emerald-500/10 text-xs">
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {netProfit >= 0 ? "📊 صافي ربح الفترة الحالية" : "📊 صافي خسارة الفترة الحالية"}
                  </span>
                  <span className={`font-mono font-bold ${netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    ₪{Math.abs(netProfit).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Final equation */}
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 text-center space-y-1">
            <p className="text-[10px] text-muted-foreground font-medium">المعادلة المحاسبية</p>
            <p className="text-sm font-bold text-foreground">
              الأصول <span className="text-primary">₪{totalAssets.toLocaleString()}</span>
              {" = "}
              الالتزامات <span className="text-destructive">₪{totalLiabilities.toLocaleString()}</span>
              {" + "}
              حقوق الملكية <span className="text-warning">₪{totalEquity.toLocaleString()}</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default BalanceSheetPage;
