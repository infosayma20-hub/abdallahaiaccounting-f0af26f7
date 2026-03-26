import { useState, useEffect, useMemo } from "react";
import {
  Loader2, RefreshCw, Search, Scale,
  AlertTriangle, CheckCircle2, FileSpreadsheet, Printer, Calendar, Download,
  TrendingUp, TrendingDown,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { generateProfessionalPDFHtml, openPrintWindow, useCompanyInfo } from "@/components/ReportPrintLayout";
import {
  fetchTransactions, fetchAccounts, buildAccountMap, getAccountNameOnly,
  SupabaseTransaction, SupabaseAccount,
} from "@/lib/supabase-data";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, startOfWeek, endOfWeek, subDays } from "date-fns";
import { multiWordMatchAny } from "@/lib/utils";

interface TrialBalanceRow {
  accountName: string;
  accountCode: string;
  accountType: string;
  openingDebit: number;
  openingCredit: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  balance: number;
  closingBalance: number;
  prevDebit?: number;
  prevCredit?: number;
  prevBalance?: number;
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

const quickPeriods = [
  { key: "today", label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "this-week", label: "الأسبوع" },
  { key: "this-month", label: "الشهر" },
  { key: "last-month", label: "الشهر الماضي" },
  { key: "this-quarter", label: "الربع" },
  { key: "this-year", label: "السنة" },
];

const getQuickPeriod = (key: string): [string, string] => {
  const now = new Date();
  switch (key) {
    case "today": return [format(now, "yyyy-MM-dd"), format(now, "yyyy-MM-dd")];
    case "yesterday": { const d = subDays(now, 1); return [format(d, "yyyy-MM-dd"), format(d, "yyyy-MM-dd")]; }
    case "this-week": return [format(startOfWeek(now, { weekStartsOn: 0 }), "yyyy-MM-dd"), format(endOfWeek(now, { weekStartsOn: 0 }), "yyyy-MM-dd")];
    case "this-month": return [format(startOfMonth(now), "yyyy-MM-dd"), format(endOfMonth(now), "yyyy-MM-dd")];
    case "last-month": { const lm = subMonths(now, 1); return [format(startOfMonth(lm), "yyyy-MM-dd"), format(endOfMonth(lm), "yyyy-MM-dd")]; }
    case "this-quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return [format(new Date(now.getFullYear(), q * 3, 1), "yyyy-MM-dd"), format(endOfMonth(new Date(now.getFullYear(), q * 3 + 2, 1)), "yyyy-MM-dd")];
    }
    case "this-year": return [format(startOfYear(now), "yyyy-MM-dd"), format(endOfYear(now), "yyyy-MM-dd")];
    default: return [format(startOfMonth(now), "yyyy-MM-dd"), format(endOfMonth(now), "yyyy-MM-dd")];
  }
};

const accountTypeOptions = [
  { value: "all", label: "جميع الأنواع" },
  { value: "الأصول", label: "الأصول" },
  { value: "الالتزامات", label: "الالتزامات" },
  { value: "حقوق الملكية", label: "حقوق الملكية" },
  { value: "الإيرادات", label: "الإيرادات" },
  { value: "المصروفات", label: "المصروفات" },
];

const TrialBalancePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const companyInfo = useCompanyInfo();

  const [transactions, setTransactions] = useState<SupabaseTransaction[]>([]);
  const [accounts, setAccounts] = useState<SupabaseAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);

  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [activePeriod, setActivePeriod] = useState("this-month");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showZeroAccounts, setShowZeroAccounts] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

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

  const handleQuickPeriod = (key: string) => {
    setActivePeriod(key);
    const [from, to] = getQuickPeriod(key);
    setDateFrom(from);
    setDateTo(to);
  };

  const accountMap = useMemo(() => buildAccountMap(accounts), [accounts]);

  // Compute previous period dates
  const prevPeriod = useMemo(() => {
    if (!dateFrom || !dateTo) return { from: "", to: "" };
    const duration = new Date(dateTo).getTime() - new Date(dateFrom).getTime();
    const prevTo = new Date(new Date(dateFrom).getTime() - 86400000); // day before dateFrom
    const prevFrom = new Date(prevTo.getTime() - duration);
    return { from: format(prevFrom, "yyyy-MM-dd"), to: format(prevTo, "yyyy-MM-dd") };
  }, [dateFrom, dateTo]);

  // Build trial balance
  const { rows, grandTotalDebit, grandTotalCredit, isBalanced, prevGrandDebit, prevGrandCredit, grandOpeningDebit, grandOpeningCredit, grandClosingDebit, grandClosingCredit } = useMemo(() => {
    const allTx = transactions.filter(tx => !tx.is_deleted);

    // Opening balance: all transactions BEFORE dateFrom
    const openingDebitMap: Record<string, number> = {};
    const openingCreditMap: Record<string, number> = {};
    if (dateFrom) {
      for (const tx of allTx) {
        if ((tx.transaction_date || "") < dateFrom) {
          const amount = tx.amount || 0;
          if (tx.debit_account_code) openingDebitMap[tx.debit_account_code] = (openingDebitMap[tx.debit_account_code] || 0) + amount;
          if (tx.credit_account_code) openingCreditMap[tx.credit_account_code] = (openingCreditMap[tx.credit_account_code] || 0) + amount;
        }
      }
    }

    // Period transactions
    let filteredTx = allTx;
    if (dateFrom) filteredTx = filteredTx.filter(tx => (tx.transaction_date || "") >= dateFrom);
    if (dateTo) filteredTx = filteredTx.filter(tx => (tx.transaction_date || "") <= dateTo);

    // Previous period transactions
    let prevFilteredTx: SupabaseTransaction[] = [];
    if (showComparison && prevPeriod.from && prevPeriod.to) {
      prevFilteredTx = allTx.filter(tx => (tx.transaction_date || "") >= prevPeriod.from && (tx.transaction_date || "") <= prevPeriod.to);
    }

    const debitMap: Record<string, number> = {};
    const creditMap: Record<string, number> = {};
    const prevDebitMap: Record<string, number> = {};
    const prevCreditMap: Record<string, number> = {};

    for (const tx of filteredTx) {
      const amount = tx.amount || 0;
      if (tx.debit_account_code) debitMap[tx.debit_account_code] = (debitMap[tx.debit_account_code] || 0) + amount;
      if (tx.credit_account_code) creditMap[tx.credit_account_code] = (creditMap[tx.credit_account_code] || 0) + amount;
    }

    for (const tx of prevFilteredTx) {
      const amount = tx.amount || 0;
      if (tx.debit_account_code) prevDebitMap[tx.debit_account_code] = (prevDebitMap[tx.debit_account_code] || 0) + amount;
      if (tx.credit_account_code) prevCreditMap[tx.credit_account_code] = (prevCreditMap[tx.credit_account_code] || 0) + amount;
    }

    const allCodes = new Set([
      ...Object.keys(debitMap), ...Object.keys(creditMap),
      ...Object.keys(prevDebitMap), ...Object.keys(prevCreditMap),
      ...Object.keys(openingDebitMap), ...Object.keys(openingCreditMap),
    ]);
    if (showZeroAccounts) accounts.forEach(acc => allCodes.add(acc.account_code));

    const rows: TrialBalanceRow[] = [];
    for (const code of allCodes) {
      const acc = accountMap[code];
      const totalDebit = debitMap[code] || 0;
      const totalCredit = creditMap[code] || 0;
      const openingDebit = openingDebitMap[code] || 0;
      const openingCredit = openingCreditMap[code] || 0;
      const openingBalance = openingDebit - openingCredit;
      const balance = totalDebit - totalCredit;
      rows.push({
        accountName: acc ? acc.account_name : code,
        accountCode: acc ? acc.account_code : code,
        accountType: acc ? acc.account_type : "",
        openingDebit, openingCredit, openingBalance,
        totalDebit, totalCredit, balance,
        closingBalance: openingBalance + balance,
        prevDebit: prevDebitMap[code] || 0,
        prevCredit: prevCreditMap[code] || 0,
        prevBalance: (prevDebitMap[code] || 0) - (prevCreditMap[code] || 0),
      });
    }

    rows.sort((a, b) => {
      const orderA = ACCOUNT_TYPE_ORDER[a.accountType] || 99;
      const orderB = ACCOUNT_TYPE_ORDER[b.accountType] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return (a.accountCode || "").localeCompare(b.accountCode || "");
    });

    const grandTotalDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
    const grandTotalCredit = rows.reduce((s, r) => s + r.totalCredit, 0);
    const prevGrandDebit = rows.reduce((s, r) => s + (r.prevDebit || 0), 0);
    const prevGrandCredit = rows.reduce((s, r) => s + (r.prevCredit || 0), 0);
    const grandOpeningDebit = rows.reduce((s, r) => s + r.openingDebit, 0);
    const grandOpeningCredit = rows.reduce((s, r) => s + r.openingCredit, 0);
    const grandClosingDebit = rows.reduce((s, r) => s + (r.closingBalance > 0 ? r.closingBalance : 0), 0);
    const grandClosingCredit = rows.reduce((s, r) => s + (r.closingBalance < 0 ? Math.abs(r.closingBalance) : 0), 0);

    return { rows, grandTotalDebit, grandTotalCredit, isBalanced: Math.abs(grandTotalDebit - grandTotalCredit) < 0.01, prevGrandDebit, prevGrandCredit, grandOpeningDebit, grandOpeningCredit, grandClosingDebit, grandClosingCredit };
  }, [transactions, accounts, accountMap, dateFrom, dateTo, showZeroAccounts, showComparison, prevPeriod]);

  // Search filter
  const filteredRows = useMemo(() => {
    let result = rows;
    if (searchQuery.trim()) {
      result = result.filter(r => multiWordMatchAny(searchQuery, r.accountName, r.accountCode, r.accountType));
    }
    if (typeFilter !== "all") {
      result = result.filter(r => {
        const label = ACCOUNT_TYPE_LABELS[r.accountType] || r.accountType;
        return label === typeFilter;
      });
    }
    return result;
  }, [rows, searchQuery, typeFilter]);

  // Group rows by account type
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
    const hasDateRange = !!dateFrom;
    const tableHeaders = hasDateRange
      ? ["الكود", "اسم الحساب", "النوع", "رصيد افتتاحي", "مدين ₪", "دائن ₪", "الرصيد ₪", "رصيد ختامي"]
      : ["الكود", "اسم الحساب", "النوع", "مدين ₪", "دائن ₪", "الرصيد ₪"];
    const tableRows = filteredRows.map(r => {
      const base = [
        r.accountCode,
        r.accountName,
        ACCOUNT_TYPE_LABELS[r.accountType] || r.accountType,
      ];
      if (hasDateRange) base.push(r.openingBalance !== 0 ? Math.abs(r.openingBalance).toLocaleString() : "—");
      base.push(
        r.totalDebit > 0 ? r.totalDebit.toLocaleString() : "—",
        r.totalCredit > 0 ? r.totalCredit.toLocaleString() : "—",
        r.balance !== 0 ? Math.abs(r.balance).toLocaleString() : "—",
      );
      if (hasDateRange) base.push(r.closingBalance !== 0 ? Math.abs(r.closingBalance).toLocaleString() : "—");
      return base;
    });

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

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto px-4 pt-6 pb-8" dir="rtl">
      {/* Header */}
      <PageHeader title="ميزان المراجعة" breadcrumb={["المحاسبة", "التقارير", "ميزان المراجعة"]} />

      {/* Controls Card - matching Income Statement */}
      <Card className="border-0 shadow-sm rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePeriod("custom"); }} className="w-[140px] h-8 text-xs" />
            <span className="text-xs text-muted-foreground">—</span>
            <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePeriod("custom"); }} className="w-[140px] h-8 text-xs" />
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
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-[10px]">نوع الحساب:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-7 rounded-lg bg-muted/60 border-0 text-[11px] px-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {accountTypeOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="relative mr-auto">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم أو الكود..."
              className="h-7 pr-7 w-[180px] rounded-lg text-[11px]"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={handleExport} disabled={loading || filteredRows.length === 0}>
            <FileSpreadsheet className="h-3 w-3" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={handleExportPDF} disabled={loading || filteredRows.length === 0}>
            <Download className="h-3 w-3" /> PDF
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => window.print()} disabled={loading}>
            <Printer className="h-3 w-3" /> طباعة
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 mr-auto" onClick={fetchData}>
            <RefreshCw className="h-3 w-3" /> تحديث
          </Button>
        </div>
      </Card>

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
                  <th className="text-right px-4 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider min-w-[180px]">اسم الحساب</th>
                  <th className="text-right px-4 py-3.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider w-[100px]">النوع</th>
                  {dateFrom && (
                    <th className="text-left px-3 py-3.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider w-[110px]">رصيد افتتاحي</th>
                  )}
                  <th className="text-left px-4 py-3.5 text-[11px] font-bold text-primary uppercase tracking-wider w-[110px]">مدين (₪)</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-bold text-destructive uppercase tracking-wider w-[110px]">دائن (₪)</th>
                  <th className="text-left px-4 py-3.5 text-[11px] font-bold text-foreground uppercase tracking-wider w-[110px]">الرصيد (₪)</th>
                  {dateFrom && (
                    <th className="text-left px-3 py-3.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider w-[110px]">رصيد ختامي</th>
                  )}
                  {showComparison && (
                    <>
                      <th className="text-left px-3 py-3.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-[100px]">مدين سابق</th>
                      <th className="text-left px-3 py-3.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-[100px]">دائن سابق</th>
                      <th className="text-left px-3 py-3.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-[80px]">التغيير</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((group) => (
                  <>
                    {/* Group Header */}
                    <tr key={`group-${group.label}`} className="bg-muted/20">
                      <td colSpan={showComparison ? (dateFrom ? 11 : 9) : (dateFrom ? 8 : 6)} className="px-4 py-2.5">
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
                    {group.rows.map((row) => {
                      const balChange = showComparison && (row.prevBalance || 0) !== 0
                        ? ((row.balance - (row.prevBalance || 0)) / Math.abs(row.prevBalance || 1)) * 100 : null;
                      return (
                      <tr key={row.accountCode} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums font-mono">
                          {row.accountCode || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground font-medium">
                          {(row.totalDebit > 0 || row.totalCredit > 0) ? (
                            <button
                              onClick={() => navigate(`/account-statement?code=${row.accountCode}`)}
                              className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 text-xs font-medium"
                            >
                              {row.accountName}
                            </button>
                          ) : row.accountName}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${ACCOUNT_TYPE_COLORS[ACCOUNT_TYPE_LABELS[row.accountType] || ""] || "bg-muted text-muted-foreground"}`}>
                            {ACCOUNT_TYPE_LABELS[row.accountType] || row.accountType || "—"}
                          </span>
                        </td>
                        {dateFrom && (
                          <td className={`px-3 py-3 text-xs font-bold tabular-nums text-left ${row.openingBalance > 0 ? "text-amber-600 dark:text-amber-400" : row.openingBalance < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {row.openingBalance !== 0 ? `${row.openingBalance > 0 ? "" : "-"}${Math.abs(row.openingBalance).toLocaleString()}` : "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-xs font-bold text-primary tabular-nums text-left">
                          {row.totalDebit > 0 ? row.totalDebit.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-destructive tabular-nums text-left">
                          {row.totalCredit > 0 ? row.totalCredit.toLocaleString() : "—"}
                        </td>
                        <td className={`px-4 py-3 text-xs font-bold tabular-nums text-left ${row.balance > 0 ? "text-primary" : row.balance < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {row.balance !== 0 ? `${row.balance > 0 ? "" : "-"}${Math.abs(row.balance).toLocaleString()}` : "—"}
                        </td>
                        {dateFrom && (
                          <td className={`px-3 py-3 text-xs font-bold tabular-nums text-left ${row.closingBalance > 0 ? "text-emerald-600 dark:text-emerald-400" : row.closingBalance < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {row.closingBalance !== 0 ? `${row.closingBalance > 0 ? "" : "-"}${Math.abs(row.closingBalance).toLocaleString()}` : "—"}
                          </td>
                        )}
                        {showComparison && (
                          <>
                            <td className="px-3 py-3 text-[10px] text-muted-foreground tabular-nums text-left">
                              {(row.prevDebit || 0) > 0 ? (row.prevDebit || 0).toLocaleString() : "—"}
                            </td>
                            <td className="px-3 py-3 text-[10px] text-muted-foreground tabular-nums text-left">
                              {(row.prevCredit || 0) > 0 ? (row.prevCredit || 0).toLocaleString() : "—"}
                            </td>
                            <td className="px-3 py-3 text-[10px] tabular-nums text-left">
                              {balChange !== null ? (
                                <span className={`flex items-center gap-0.5 ${balChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  {balChange >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                                  {Math.abs(balChange).toFixed(1)}%
                                </span>
                              ) : "—"}
                            </td>
                          </>
                        )}
                      </tr>
                    );})}
                    {/* Group Subtotal */}
                    <tr key={`subtotal-${group.label}`} className="bg-muted/30 border-b border-border/40">
                      <td colSpan={3} className="px-4 py-2.5 text-xs font-bold text-muted-foreground text-right">
                        إجمالي {group.label}
                      </td>
                      {dateFrom && (
                        <td className="px-3 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums text-left">
                          {(() => { const ob = group.rows.reduce((s, r) => s + r.openingBalance, 0); return ob !== 0 ? `${ob > 0 ? "" : "-"}${Math.abs(ob).toLocaleString()}` : "—"; })()}
                        </td>
                      )}
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
                      {dateFrom && (
                        <td className="px-3 py-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums text-left">
                          {(() => { const cb = group.rows.reduce((s, r) => s + r.closingBalance, 0); return cb !== 0 ? `${cb > 0 ? "" : "-"}${Math.abs(cb).toLocaleString()}` : "—"; })()}
                        </td>
                      )}
                      {showComparison && <td colSpan={3}></td>}
                    </tr>
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 border-t-2 border-primary/30">
                  <td colSpan={3} className="px-4 py-4 text-sm font-bold text-foreground text-right">
                    الإجمالي الكلي
                  </td>
                  {dateFrom && (
                    <td className="px-3 py-4 text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums text-left">
                      ₪{(grandOpeningDebit - grandOpeningCredit) !== 0 ? Math.abs(grandOpeningDebit - grandOpeningCredit).toLocaleString() : "0"}
                    </td>
                  )}
                  <td className="px-4 py-4 text-sm font-bold text-primary tabular-nums text-left">
                    ₪{grandTotalDebit.toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-sm font-bold text-destructive tabular-nums text-left">
                    ₪{grandTotalCredit.toLocaleString()}
                  </td>
                  <td className={`px-4 py-4 text-sm font-bold tabular-nums text-left ${isBalanced ? "text-primary" : "text-destructive"}`}>
                    {isBalanced ? "✅ 0" : `₪${Math.abs(grandTotalDebit - grandTotalCredit).toLocaleString()}`}
                  </td>
                  {dateFrom && (
                    <td className="px-3 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums text-left">
                      ₪{(grandClosingDebit - grandClosingCredit) !== 0 ? Math.abs(grandClosingDebit - grandClosingCredit).toLocaleString() : "0"}
                    </td>
                  )}
                  {showComparison && (
                    <>
                      <td className="px-3 py-4 text-[10px] font-bold text-muted-foreground tabular-nums text-left">
                        ₪{prevGrandDebit.toLocaleString()}
                      </td>
                      <td className="px-3 py-4 text-[10px] font-bold text-muted-foreground tabular-nums text-left">
                        ₪{prevGrandCredit.toLocaleString()}
                      </td>
                      <td></td>
                    </>
                  )}
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
