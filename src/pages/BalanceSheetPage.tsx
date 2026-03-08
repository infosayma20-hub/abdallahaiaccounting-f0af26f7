import { useState, useEffect, useMemo } from "react";
import { Loader2, Landmark, Printer, ChevronDown, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ReportHeader, ReportSummary, exportToExcel } from "@/components/ReportComponents";
import { generateProfessionalPDFHtml, openPrintWindow, useCompanyInfo } from "@/components/ReportPrintLayout";
import {
  fetchTransactions, fetchAccounts, buildAccountMap, normalizeAccountType,
  SupabaseTransaction, SupabaseAccount, buildAccountTree, flattenAccountTree, FlatAccountLine,
} from "@/lib/supabase-data";

const LEVEL_OPTIONS = [
  { value: 1, label: "المستوى 1 — الفئات الرئيسية" },
  { value: 2, label: "المستوى 2 — المجموعات الفرعية" },
  { value: 3, label: "المستوى 3 — الحسابات الفرعية" },
  { value: 4, label: "المستوى 4 — التفاصيل الكاملة" },
];

const getSubcategory = (code: string, type: string): string => {
  const num = parseInt(code);
  if (type === "Asset") {
    if (num >= 1100 && num < 1200) return "أصول متداولة";
    return "أصول غير متداولة";
  }
  if (type === "Liability") {
    if (num >= 2100 && num < 2200) return "التزامات متداولة";
    return "التزامات غير متداولة";
  }
  return "حقوق الملكية";
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

  const accountMap = useMemo(() => buildAccountMap(accounts), [accounts]);

  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    transactions.filter(tx => !tx.is_deleted).forEach(tx => {
      const amount = tx.amount || 0;
      if (tx.debit_account_code) {
        balances[tx.debit_account_code] = (balances[tx.debit_account_code] || 0) + amount;
      }
      if (tx.credit_account_code) {
        balances[tx.credit_account_code] = (balances[tx.credit_account_code] || 0) - amount;
      }
    });
    return balances;
  }, [transactions]);

  // Build hierarchical trees for each section
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

    // Compute net profit: Revenue (credit balances, negative in our system) - Purchases/Expenses (debit balances, positive)
    let totalRevenue = 0;
    let totalPurchasesExpenses = 0;
    accounts.forEach(a => {
      const type = normalizeAccountType(a.account_type || "");
      const bal = accountBalances[a.account_code] || 0;
      if (type === "Revenue") totalRevenue += Math.abs(bal); // credit balances are negative
      if (type === "Purchases" || type === "Expenses") totalPurchasesExpenses += bal; // debit balances are positive
    });
    const netProfit = totalRevenue - totalPurchasesExpenses;
    const totalEquity = totalEquityAccounts + netProfit;

    return { assetTree, liabilityTree, equityTree, totalAssets: Math.abs(totalAssets), totalLiabilities, totalEquity, netProfit };
  }, [accounts, accountBalances]);

  const periodLabel = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
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

    const assetLines = flattenAccountTree(assetTree, detailLevel).filter(l => l.balance !== 0);
    const liabLines = flattenAccountTree(liabilityTree, detailLevel).filter(l => l.balance !== 0);
    const eqLines = flattenAccountTree(equityTree, detailLevel).filter(l => l.balance !== 0);

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

    const assetLines = flattenAccountTree(assetTree, detailLevel).filter(l => l.balance !== 0);
    const liabLines = flattenAccountTree(liabilityTree, detailLevel).filter(l => l.balance !== 0);
    const eqLines = flattenAccountTree(equityTree, detailLevel).filter(l => l.balance !== 0);

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
    if (lines.length === 0) return null;

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

  // Flatten trees with level filter, excluding zero balances
  const assetLines = useMemo(() => flattenAccountTree(assetTree, detailLevel).filter(l => l.balance !== 0), [assetTree, detailLevel]);
  const liabLines = useMemo(() => flattenAccountTree(liabilityTree, detailLevel).filter(l => l.balance !== 0), [liabilityTree, detailLevel]);
  const eqLines = useMemo(() => flattenAccountTree(equityTree, detailLevel).filter(l => l.balance !== 0), [equityTree, detailLevel]);

  return (
    <div className="px-4 pt-6 space-y-5 pb-8" dir="rtl">
      <ReportHeader
        reportName="قائمة المركز المالي"
        companyName={companyName}
        period={`كما في ${periodLabel}`}
        onBack={() => navigate(-1)}
        onExportPDF={!loading ? handleExportPDF : undefined}
        onExportExcel={!loading ? handleExportExcel : undefined}
        icon={<Landmark className="h-5 w-5 text-primary" />}
      />

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

          {/* Level Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">مستوى التفصيل:</span>
            <div className="flex gap-1">
              {LEVEL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDetailLevel(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    detailLevel === opt.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {opt.value}
                </button>
              ))}
              <span className="text-[10px] text-muted-foreground self-center mr-2">
                {LEVEL_OPTIONS.find(o => o.value === detailLevel)?.label}
              </span>
            </div>
          </div>

          {/* Balance check */}
          <div className={`text-center text-xs py-2 rounded-lg ${isBalanced ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
            {isBalanced ? "✅ الميزانية متوازنة (الأصول = الالتزامات + حقوق الملكية)" : `⚠️ الميزانية غير متوازنة — فرق: ₪${Math.abs(totalAssets - totalLiabilities - totalEquity).toLocaleString()}`}
          </div>

          {/* Sections */}
          {renderHierarchicalSection("الأصول", assetLines, totalAssets, "text-primary")}
          {renderHierarchicalSection("الالتزامات", liabLines, totalLiabilities, "text-destructive")}
          {renderHierarchicalSection("حقوق الملكية", eqLines, totalEquity, "text-warning")}

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
