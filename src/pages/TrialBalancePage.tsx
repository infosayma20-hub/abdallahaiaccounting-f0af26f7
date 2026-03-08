import { useState, useEffect, useMemo } from "react";
import {
  ArrowRight, Loader2, RefreshCw, Search, Filter, Scale,
  ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, FileSpreadsheet, Printer,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { generateProfessionalPDFHtml, openPrintWindow, useCompanyInfo } from "@/components/ReportPrintLayout";
import {
  fetchTransactions, fetchAccounts, buildAccountMap, getAccountNameOnly,
  SupabaseTransaction, SupabaseAccount,
} from "@/lib/supabase-data";

interface TrialBalanceRow {
  accountName: string;
  accountCode: string;
  accountType: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

const ACCOUNT_TYPE_ORDER: Record<string, number> = {
  "Asset": 1, "أصول": 1, "أصل": 1,
  "Liability": 2, "التزامات": 2, "التزام": 2, "خصوم": 2,
  "Owner's Equity": 3, "Equity": 3, "حقوق ملكية": 3, "حقوق الملكية": 3, "رأس مال": 3,
  "Revenue": 4, "إيرادات": 4, "إيراد": 4, "دخل": 4,
  "Purchases": 5, "مشتريات": 5,
  "Expenses": 6, "مصروفات": 6, "مصروف": 6, "المصروفات": 6, "مصاريف": 6,
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  "Assets": "الأصول", "Asset": "الأصول",
  "Liabilities": "الالتزامات", "Liability": "الالتزامات",
  "Owner's Equity": "حقوق الملكية", "Equity": "حقوق الملكية",
  "Revenue": "الإيرادات",
  "Purchases": "المشتريات",
  "Expenses": "المصروفات",
  "أصول": "الأصول", "أصل": "الأصول",
  "التزامات": "الالتزامات", "التزام": "الالتزامات", "خصوم": "الالتزامات",
  "حقوق ملكية": "حقوق الملكية", "حقوق الملكية": "حقوق الملكية", "رأس مال": "حقوق الملكية",
  "إيرادات": "الإيرادات", "إيراد": "الإيرادات", "دخل": "الإيرادات",
  "مشتريات": "المشتريات",
  "مصروفات": "المصروفات", "مصروف": "المصروفات", "المصروفات": "المصروفات", "مصاريف": "المصروفات",
};

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  "الأصول": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "الالتزامات": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  "حقوق الملكية": "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  "الإيرادات": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "المشتريات": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "المصروفات": "bg-red-500/10 text-red-600 dark:text-red-400",
};

const TrialBalancePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const companyInfo = useCompanyInfo();

  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [accounts, setAccounts] = useState<SupabaseAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [txData, accData, profileRes] = await Promise.all([
        fetchTransactions(user.id),
        fetchAccounts(user.id),
        supabase.from("profiles").select("display_name, company_name").eq("user_id", user.id).maybeSingle(),
      ]);
      setTransactions(txData);
      setAccounts(accData);
      if (profileRes.data) setProfileData(profileRes.data);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  const accountMap = useMemo(() => buildAccountMap(accounts), [accounts]);

  // Build trial balance
  const { rows, grandTotalDebit, grandTotalCredit, isBalanced } = useMemo(() => {
    // Filter transactions by date and not deleted
    let filteredTx = transactions.filter(tx => !tx.is_deleted);
    if (dateFrom) filteredTx = filteredTx.filter(tx => (tx.transaction_date || "") >= dateFrom);
    if (dateTo) filteredTx = filteredTx.filter(tx => (tx.transaction_date || "") <= dateTo);

    // Accumulate debits and credits per account code
    const debitMap: Record<string, number> = {};
    const creditMap: Record<string, number> = {};

    for (const tx of filteredTx) {
      const amount = tx.amount || 0;
      if (tx.debit_account_code) {
        debitMap[tx.debit_account_code] = (debitMap[tx.debit_account_code] || 0) + amount;
      }
      if (tx.credit_account_code) {
        creditMap[tx.credit_account_code] = (creditMap[tx.credit_account_code] || 0) + amount;
      }
    }

    // Combine into rows
    const allCodes = new Set([...Object.keys(debitMap), ...Object.keys(creditMap)]);
    const rows: TrialBalanceRow[] = [];

    for (const code of allCodes) {
      const acc = accountMap[code];
      const totalDebit = debitMap[code] || 0;
      const totalCredit = creditMap[code] || 0;
      rows.push({
        accountName: acc ? acc.account_name : code,
        accountCode: acc ? acc.account_code : code,
        accountType: acc ? acc.account_type : "",
        totalDebit,
        totalCredit,
        balance: totalDebit - totalCredit,
      });
    }

    // Sort by account type order, then by code
    rows.sort((a, b) => {
      const orderA = ACCOUNT_TYPE_ORDER[a.accountType] || 99;
      const orderB = ACCOUNT_TYPE_ORDER[b.accountType] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return (a.accountCode || "").localeCompare(b.accountCode || "");
    });

    const grandTotalDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
    const grandTotalCredit = rows.reduce((s, r) => s + r.totalCredit, 0);

    return { rows, grandTotalDebit, grandTotalCredit, isBalanced: Math.abs(grandTotalDebit - grandTotalCredit) < 0.01 };
  }, [transactions, accounts, accountMap, dateFrom, dateTo]);

  // Search filter
  const filteredRows = useMemo(() => {
    let result = rows;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.accountName.toLowerCase().includes(q) ||
        r.accountCode.toLowerCase().includes(q) ||
        r.accountType.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") {
      result = result.filter(r => {
        const label = ACCOUNT_TYPE_LABELS[r.accountType] || r.accountType;
        return label === typeFilter;
      });
    }
    return result;
  }, [rows, searchQuery, typeFilter]);

  // Group rows by account type for section headers
  const groupedRows = useMemo(() => {
    const groups: { type: string; label: string; rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number }[] = [];
    let currentType = "";
    let currentGroup: typeof groups[0] | null = null;

    for (const row of filteredRows) {
      const label = ACCOUNT_TYPE_LABELS[row.accountType] || row.accountType || "أخرى";
      if (label !== currentType) {
        currentType = label;
        currentGroup = { type: row.accountType, label, rows: [], totalDebit: 0, totalCredit: 0 };
        groups.push(currentGroup);
      }
      currentGroup!.rows.push(row);
      currentGroup!.totalDebit += row.totalDebit;
      currentGroup!.totalCredit += row.totalCredit;
    }
    return groups;
  }, [filteredRows]);

  // Export Excel
  const handleExport = () => {
    const data = filteredRows.map(r => ({
      "كود الحساب": r.accountCode,
      "اسم الحساب": r.accountName,
      "النوع": ACCOUNT_TYPE_LABELS[r.accountType] || r.accountType,
      "مدين": r.totalDebit,
      "دائن": r.totalCredit,
      "الرصيد": r.balance,
    }));
    data.push({
      "كود الحساب": "",
      "اسم الحساب": "الإجمالي",
      "النوع": "",
      "مدين": grandTotalDebit,
      "دائن": grandTotalCredit,
      "الرصيد": grandTotalDebit - grandTotalCredit,
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ميزان المراجعة");
    XLSX.writeFile(wb, `ميزان_المراجعة_${dateFrom || "all"}_${dateTo || "all"}.xlsx`);
  };

  // Export PDF
  const handleExportPDF = () => {
    const tableHeaders = ["الكود", "اسم الحساب", "النوع", "مدين ₪", "دائن ₪", "الرصيد ₪"];
    const tableRows = filteredRows.map(r => [
      r.accountCode,
      r.accountName,
      ACCOUNT_TYPE_LABELS[r.accountType] || r.accountType,
      r.totalDebit > 0 ? r.totalDebit.toLocaleString() : "—",
      r.totalCredit > 0 ? r.totalCredit.toLocaleString() : "—",
      r.balance !== 0 ? Math.abs(r.balance).toLocaleString() : "—",
    ]);

    const html = generateProfessionalPDFHtml({
      company: companyInfo,
      reportTitle: "ميزان المراجعة",
      reportTitleEn: "TRIAL BALANCE",
      periodLabel: dateRangeLabel,
      summaryItems: [
        { label: "عدد الحسابات", value: String(filteredRows.length), color: "#1B3A5C" },
        { label: "إجمالي المدين", value: `₪${grandTotalDebit.toLocaleString()}`, color: "#2563EB" },
        { label: "إجمالي الدائن", value: `₪${grandTotalCredit.toLocaleString()}`, color: "#DC2626" },
        { label: "التوازن", value: isBalanced ? "✅ متوازن" : `فرق: ₪${Math.abs(grandTotalDebit - grandTotalCredit).toLocaleString()}`, color: isBalanced ? "#16A34A" : "#DC2626" },
      ],
      tableHeaders,
      tableRows,
      notes: [
        "أُعد هذا التقرير وفقاً لمعايير المحاسبة الدولية",
        `عدد الحسابات: ${filteredRows.length} حساب`,
      ],
    });
    openPrintWindow(html);
  };

  const companyName = profileData?.company_name || profileData?.display_name || "الشركة";
  const dateRangeLabel = dateFrom && dateTo
    ? `${dateFrom} — ${dateTo}`
    : dateFrom ? `من ${dateFrom}` : dateTo ? `حتى ${dateTo}` : "جميع الفترات";

  const accountTypeOptions = [
    { value: "all", label: "جميع الأنواع" },
    { value: "الأصول", label: "الأصول" },
    { value: "الالتزامات", label: "الالتزامات" },
    { value: "حقوق الملكية", label: "حقوق الملكية" },
    { value: "الإيرادات", label: "الإيرادات" },
    { value: "المصروفات", label: "المصروفات" },
  ];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/")}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              ميزان المراجعة
            </h1>
            <p className="text-xs text-muted-foreground">{companyName} • {dateRangeLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredRows.length === 0} className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            تصدير Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={filteredRows.length === 0} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" />
            PDF
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">عدد الحسابات</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{filteredRows.length}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">إجمالي المدين</p>
          <p className="text-xl font-bold text-primary tabular-nums">₪{grandTotalDebit.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">إجمالي الدائن</p>
          <p className="text-xl font-bold text-destructive tabular-nums">₪{grandTotalCredit.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
          <p className="text-[11px] text-muted-foreground">حالة التوازن</p>
          <div className="flex items-center gap-1.5 mt-1">
            {isBalanced ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="text-sm font-bold text-primary">متوازن ✅</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <span className="text-sm font-bold text-destructive">
                  فرق: ₪{Math.abs(grandTotalDebit - grandTotalCredit).toLocaleString()}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl p-4 shadow-card border border-border/40">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">فلاتر البحث</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">من تاريخ</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-lg bg-secondary/50 border-0 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">إلى تاريخ</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-lg bg-secondary/50 border-0 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">نوع الحساب</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full h-9 rounded-lg bg-secondary/50 border-0 text-sm px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {accountTypeOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">بحث</label>
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث باسم الحساب أو الكود..."
                className="h-9 pr-8 rounded-lg bg-secondary/50 border-0 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Scale className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد حسابات بحركات للفترة المحددة</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-card border border-border/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-primary/20 bg-muted/40">
                  <th className="text-right px-4 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider w-[80px]">الكود</th>
                  <th className="text-right px-4 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider min-w-[200px]">اسم الحساب</th>
                  <th className="text-right px-4 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider w-[120px]">النوع</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-bold text-primary uppercase tracking-wider w-[130px]">مدين (₪)</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-bold text-destructive uppercase tracking-wider w-[130px]">دائن (₪)</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-bold text-foreground uppercase tracking-wider w-[130px]">الرصيد (₪)</th>
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((group) => (
                  <>
                    {/* Group Header */}
                    <tr key={`group-${group.label}`} className="bg-muted/20">
                      <td colSpan={6} className="px-4 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${ACCOUNT_TYPE_COLORS[group.label] || "bg-muted text-muted-foreground"}`}>
                            {group.label}
                          </span>
                          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                            <span>{group.rows.length} حساب</span>
                            <span className="text-primary font-semibold">م: ₪{group.totalDebit.toLocaleString()}</span>
                            <span className="text-destructive font-semibold">د: ₪{group.totalCredit.toLocaleString()}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {/* Rows */}
                    {group.rows.map((row) => (
                      <tr key={row.accountName} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums font-mono">
                          {row.accountCode || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground font-medium">
                          {row.accountName}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${ACCOUNT_TYPE_COLORS[ACCOUNT_TYPE_LABELS[row.accountType] || ""] || "bg-muted text-muted-foreground"}`}>
                            {ACCOUNT_TYPE_LABELS[row.accountType] || row.accountType || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-primary tabular-nums text-left">
                          {row.totalDebit > 0 ? row.totalDebit.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-destructive tabular-nums text-left">
                          {row.totalCredit > 0 ? row.totalCredit.toLocaleString() : "—"}
                        </td>
                        <td className={`px-4 py-3 text-xs font-bold tabular-nums text-left ${row.balance > 0 ? "text-primary" : row.balance < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {row.balance !== 0 ? `${row.balance > 0 ? "" : "-"}${Math.abs(row.balance).toLocaleString()}` : "—"}
                        </td>
                      </tr>
                    ))}
                    {/* Group Subtotal */}
                    <tr key={`subtotal-${group.label}`} className="bg-muted/30 border-b border-border/40">
                      <td colSpan={3} className="px-4 py-2.5 text-xs font-bold text-muted-foreground text-right">
                        إجمالي {group.label}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-bold text-primary tabular-nums text-left">
                        {group.totalDebit.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-bold text-destructive tabular-nums text-left">
                        {group.totalCredit.toLocaleString()}
                      </td>
                      <td className={`px-4 py-2.5 text-xs font-bold tabular-nums text-left ${(group.totalDebit - group.totalCredit) >= 0 ? "text-primary" : "text-destructive"}`}>
                        {(group.totalDebit - group.totalCredit) !== 0
                          ? `${(group.totalDebit - group.totalCredit) > 0 ? "" : "-"}${Math.abs(group.totalDebit - group.totalCredit).toLocaleString()}`
                          : "—"}
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
              {/* Grand Total */}
              <tfoot>
                <tr className="bg-muted/50 border-t-2 border-primary/30">
                  <td colSpan={3} className="px-4 py-4 text-sm font-bold text-foreground text-right">
                    الإجمالي الكلي
                  </td>
                  <td className="px-4 py-4 text-sm font-bold text-primary tabular-nums text-left">
                    ₪{grandTotalDebit.toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-sm font-bold text-destructive tabular-nums text-left">
                    ₪{grandTotalCredit.toLocaleString()}
                  </td>
                  <td className={`px-4 py-4 text-sm font-bold tabular-nums text-left ${isBalanced ? "text-primary" : "text-destructive"}`}>
                    {isBalanced ? "✅ 0" : `₪${Math.abs(grandTotalDebit - grandTotalCredit).toLocaleString()}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Footer info */}
          <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              آخر تحديث: {new Date().toLocaleString("en-US")}
            </p>
            <div className="flex items-center gap-1.5">
              {isBalanced ? (
                <span className="text-[10px] text-primary font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> الميزان متوازن
                </span>
              ) : (
                <span className="text-[10px] text-destructive font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> الميزان غير متوازن
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrialBalancePage;
