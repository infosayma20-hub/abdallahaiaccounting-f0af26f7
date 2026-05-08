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
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { generateProfessionalPDFHtml, openPrintWindow, useCompanyInfo } from "@/components/ReportPrintLayout";
import {
  fetchTransactions, fetchAccounts, buildAccountMap, getAccountNameOnly,
  SupabaseTransaction, SupabaseAccount,
} from "@/lib/supabase-data";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, startOfWeek, endOfWeek, subDays } from "date-fns";
import { multiWordMatchAny } from "@/lib/utils";

import { setNextExportBranding } from "@/lib/excel-export";
interface TrialBalanceRow {
  accountId: string;
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
  isChild?: boolean;
  parentCode?: string;
  depth: number;
  hasChildren: boolean;
  childrenCodes: string[];
  // Rolled-up values (sum of all descendants)
  rolledDebit: number;
  rolledCredit: number;
  rolledOpeningBalance: number;
  rolledClosingBalance: number;
}

const ACCOUNT_TYPE_ORDER: Record<string, number> = {
  "Asset": 1, "asset": 1, "assets": 1, "Assets": 1, "أصول": 1, "أصل": 1,
  "Liability": 2, "liability": 2, "liabilities": 2, "Liabilities": 2, "التزامات": 2, "التزام": 2, "خصوم": 2,
  "Owner's Equity": 3, "Equity": 3, "equity": 3, "حقوق ملكية": 3, "حقوق الملكية": 3, "رأس مال": 3,
  "Revenue": 4, "revenue": 4, "إيرادات": 4, "إيراد": 4, "دخل": 4,
  "Purchases": 5, "purchases": 5, "مشتريات": 5,
  "Expenses": 6, "مصروفات": 6, "مصروف": 6, "المصروفات": 6, "مصاريف": 6,
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  "Assets": "الأصول", "Asset": "الأصول", "asset": "الأصول", "assets": "الأصول",
  "Liabilities": "الالتزامات", "Liability": "الالتزامات", "liability": "الالتزامات", "liabilities": "الالتزامات",
  "Owner's Equity": "حقوق الملكية", "Equity": "حقوق الملكية", "equity": "حقوق الملكية",
  "Revenue": "الإيرادات", "revenue": "الإيرادات",
  "Purchases": "المشتريات", "purchases": "المشتريات",
  "Expenses": "المصروفات", "expenses": "المصروفات", "expense": "المصروفات",
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
  const { dataOwnerId } = useDataOwnerId();
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
  const [showDetailedAccounts, setShowDetailedAccounts] = useState(false);
  const [reportLevel, setReportLevel] = useState(4);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    if (!user || !dataOwnerId) return;
    setLoading(true);
    try {
      const [txData, accData, profileRes] = await Promise.all([
        fetchTransactions(dataOwnerId),
        fetchAccounts(dataOwnerId),
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

  useEffect(() => { fetchData(); }, [user, dataOwnerId]);

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

  // Build trial balance with hierarchy
  const { allRows, leafRows, grandTotalDebit, grandTotalCredit, isBalanced, prevGrandDebit, prevGrandCredit, grandOpeningDebit, grandOpeningCredit, grandClosingDebit, grandClosingCredit } = useMemo(() => {
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

    // Build children map from accounts
    const childrenByParent: Record<string, string[]> = {};
    for (const acc of accounts) {
      if (acc.parent_code) {
        if (!childrenByParent[acc.parent_code]) childrenByParent[acc.parent_code] = [];
        childrenByParent[acc.parent_code].push(acc.account_code);
      }
    }

    // Calculate depth for each account
    const depthMap: Record<string, number> = {};
    const calcDepth = (code: string): number => {
      if (depthMap[code] !== undefined) return depthMap[code];
      const acc = accountMap[code];
      if (!acc || !acc.parent_code || !accountMap[acc.parent_code]) {
        depthMap[code] = 1;
        return 1;
      }
      depthMap[code] = calcDepth(acc.parent_code) + 1;
      return depthMap[code];
    };
    accounts.forEach(acc => calcDepth(acc.account_code));

    // Build all rows for ALL accounts with transactions or zero-balance
    const allCodes = new Set([
      ...Object.keys(debitMap), ...Object.keys(creditMap),
      ...Object.keys(prevDebitMap), ...Object.keys(prevCreditMap),
      ...Object.keys(openingDebitMap), ...Object.keys(openingCreditMap),
    ]);
    if (showZeroAccounts) accounts.forEach(acc => allCodes.add(acc.account_code));
    // Always include parent accounts so hierarchy works
    for (const code of [...allCodes]) {
      let current = accountMap[code];
      while (current?.parent_code) {
        allCodes.add(current.parent_code);
        current = accountMap[current.parent_code];
      }
    }

    const rowMap: Record<string, TrialBalanceRow> = {};
    for (const code of allCodes) {
      const acc = accountMap[code];
      const totalDebit = debitMap[code] || 0;
      const totalCredit = creditMap[code] || 0;
      const openingDebit = openingDebitMap[code] || 0;
      const openingCredit = openingCreditMap[code] || 0;
      const openingBalance = openingDebit - openingCredit;
      const balance = totalDebit - totalCredit;
      const children = childrenByParent[code] || [];
      rowMap[code] = {
        accountId: acc?.id || code,
        accountName: acc ? acc.account_name : code,
        accountCode: code,
        accountType: acc ? acc.account_type : "",
        openingDebit, openingCredit, openingBalance,
        totalDebit, totalCredit, balance,
        closingBalance: openingBalance + balance,
        prevDebit: prevDebitMap[code] || 0,
        prevCredit: prevCreditMap[code] || 0,
        prevBalance: (prevDebitMap[code] || 0) - (prevCreditMap[code] || 0),
        isChild: !!(acc?.parent_code),
        parentCode: acc?.parent_code || undefined,
        depth: depthMap[code] || 1,
        hasChildren: children.length > 0,
        childrenCodes: children,
        rolledDebit: 0,
        rolledCredit: 0,
        rolledOpeningBalance: 0,
        rolledClosingBalance: 0,
      };
    }

    // Roll-up: sum children values into parents (bottom-up)
    const rollUp = (code: string): { debit: number; credit: number; openBal: number; closeBal: number } => {
      const row = rowMap[code];
      if (!row) return { debit: 0, credit: 0, openBal: 0, closeBal: 0 };
      const children = (childrenByParent[code] || []).filter(c => rowMap[c]);
      if (children.length === 0) {
        row.rolledDebit = row.totalDebit;
        row.rolledCredit = row.totalCredit;
        row.rolledOpeningBalance = row.openingBalance;
        row.rolledClosingBalance = row.closingBalance;
        return { debit: row.rolledDebit, credit: row.rolledCredit, openBal: row.rolledOpeningBalance, closeBal: row.rolledClosingBalance };
      }
      let sumD = row.totalDebit, sumC = row.totalCredit, sumOB = row.openingBalance, sumCB = row.closingBalance;
      for (const child of children) {
        const c = rollUp(child);
        sumD += c.debit;
        sumC += c.credit;
        sumOB += c.openBal;
        sumCB += c.closeBal;
      }
      row.rolledDebit = sumD;
      row.rolledCredit = sumC;
      row.rolledOpeningBalance = sumOB;
      row.rolledClosingBalance = sumCB;
      return { debit: sumD, credit: sumC, openBal: sumOB, closeBal: sumCB };
    };

    // Find root accounts and roll up
    const rootCodes = Object.keys(rowMap).filter(c => !rowMap[c].parentCode || !rowMap[rowMap[c].parentCode!]);
    rootCodes.forEach(c => rollUp(c));

    // Flatten tree in sorted order
    const allRows: TrialBalanceRow[] = [];
    const traverse = (code: string) => {
      const row = rowMap[code];
      if (!row) return;
      allRows.push(row);
      const children = (childrenByParent[code] || [])
        .filter(c => rowMap[c])
        .sort((a, b) => a.localeCompare(b));
      children.forEach(traverse);
    };
    rootCodes
      .sort((a, b) => {
        const orderA = ACCOUNT_TYPE_ORDER[rowMap[a]?.accountType] || 99;
        const orderB = ACCOUNT_TYPE_ORDER[rowMap[b]?.accountType] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
      })
      .forEach(traverse);

    // Leaf rows only (for grand totals — no double counting)
    const leafRows = allRows.filter(r => !r.hasChildren);
    const grandTotalDebit = leafRows.reduce((s, r) => s + r.totalDebit, 0);
    const grandTotalCredit = leafRows.reduce((s, r) => s + r.totalCredit, 0);
    const prevGrandDebit = leafRows.reduce((s, r) => s + (r.prevDebit || 0), 0);
    const prevGrandCredit = leafRows.reduce((s, r) => s + (r.prevCredit || 0), 0);
    const grandOpeningDebit = leafRows.reduce((s, r) => s + r.openingDebit, 0);
    const grandOpeningCredit = leafRows.reduce((s, r) => s + r.openingCredit, 0);
    const grandClosingDebit = leafRows.reduce((s, r) => s + (r.closingBalance > 0 ? r.closingBalance : 0), 0);
    const grandClosingCredit = leafRows.reduce((s, r) => s + (r.closingBalance < 0 ? Math.abs(r.closingBalance) : 0), 0);

    return { allRows, leafRows, grandTotalDebit, grandTotalCredit, isBalanced: Math.abs(grandTotalDebit - grandTotalCredit) < 0.01, prevGrandDebit, prevGrandCredit, grandOpeningDebit, grandOpeningCredit, grandClosingDebit, grandClosingCredit };
  }, [transactions, accounts, accountMap, dateFrom, dateTo, showZeroAccounts, showComparison, prevPeriod]);

  // Toggle expand/collapse for a parent account
  const toggleExpand = (code: string) => {
    setExpandedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // Filter rows by report level + expanded state
  const filteredRows = useMemo(() => {
    let result = allRows.filter(row => {
      // Always show rows at or above the selected level
      if (row.depth <= reportLevel) return true;
      // Show deeper rows if their parent is expanded
      // Walk up the tree to check if any ancestor at reportLevel is expanded
      let current = row;
      while (current.parentCode) {
        const parent = allRows.find(r => r.accountCode === current.parentCode);
        if (!parent) break;
        if (parent.depth >= reportLevel && expandedAccounts.has(parent.accountCode)) return true;
        current = parent;
      }
      return false;
    });

    // Remove zero-balance accounts if not showZeroAccounts
    if (!showZeroAccounts) {
      result = result.filter(r => {
        // Don't hide parent accounts that have non-zero rolled values
        if (r.hasChildren) {
          return r.rolledDebit !== 0 || r.rolledCredit !== 0 || r.rolledOpeningBalance !== 0;
        }
        return r.totalDebit !== 0 || r.totalCredit !== 0 || r.openingBalance !== 0;
      });
    }

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
  }, [allRows, reportLevel, expandedAccounts, searchQuery, typeFilter, showZeroAccounts]);

  // Group rows by account type — totals always from leaf rows only (no double counting)
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
    }

    // Calculate group totals from leaf rows in the FULL dataset (not filtered)
    // to avoid double counting regardless of report level
    for (const group of groups) {
      const groupLeaves = leafRows.filter(r => {
        const lbl = ACCOUNT_TYPE_LABELS[r.accountType] || r.accountType || "أخرى";
        return lbl === group.label;
      });
      group.totalDebit = groupLeaves.reduce((s, r) => s + r.totalDebit, 0);
      group.totalCredit = groupLeaves.reduce((s, r) => s + r.totalCredit, 0);
    }

    return groups;
  }, [filteredRows, leafRows]);

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
    setNextExportBranding({
      title: "ميزان المراجعة",
      currency: "شيكل ₪",
      period: dateFrom || dateTo ? `${dateFrom || "—"} → ${dateTo || "—"}` : "كل الفترات",
    });
    XLSX.writeFile(wb, `ميزان_المراجعة_${dateFrom || "all"}_${dateTo || "all"}.xlsx`);
  };

  // Export PDF
  const handleExportPDF = () => {
    const hasDateRange = !!dateFrom;
    const today = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
    const fmtN = (n: number) => n !== 0 ? Math.abs(n).toLocaleString() : "—";
    const fmtSigned = (n: number) => n !== 0 ? n.toLocaleString() : "—";

    // Format negative numbers
    const fmtAmount = (n: number) => {
      if (!n || n === 0) return '—';
      if (n < 0) return `<span style="color:#DC2626">(${Math.abs(n).toLocaleString()})</span>`;
      return n.toLocaleString();
    };

    // Net movement: positive = debit column, negative = credit column
    const fmtNetDebit = (d: number, c: number) => {
      const net = d - c;
      return net > 0 ? net.toLocaleString() : '—';
    };
    const fmtNetCredit = (d: number, c: number) => {
      const net = d - c;
      return net < 0 ? Math.abs(net).toLocaleString() : '—';
    };

    // Determine colspan based on columns
    const totalColspan = hasDateRange ? 10 : 6;

    // Build hierarchical table rows HTML
    let rowsHtml = "";
    for (const group of groupedRows) {
      // Group header row - navy dark
      rowsHtml += `<tr><td colspan="${totalColspan}" style="background:#0D1B2E;color:#FFFFFF;font-weight:700;padding:8px 16px;font-size:13px">${group.label} <span style="opacity:0.7;font-size:10px;margin-right:16px;float:left">${group.rows.length} حساب</span></td></tr>`;
      
      for (const r of group.rows) {
        const indent = r.isChild ? 'padding-right:28px;font-size:9px;color:#64748B' : 'font-weight:600';
        const openingD = r.openingDebit > 0 ? r.openingDebit.toLocaleString() : "—";
        const openingC = r.openingCredit > 0 ? r.openingCredit.toLocaleString() : "—";
        const movD = r.totalDebit > 0 ? r.totalDebit.toLocaleString() : "—";
        const movC = r.totalCredit > 0 ? r.totalCredit.toLocaleString() : "—";
        const closingD = r.closingBalance > 0 ? r.closingBalance.toLocaleString() : "—";
        const closingC = r.closingBalance < 0 ? Math.abs(r.closingBalance).toLocaleString() : "—";
        const typeLabel = ACCOUNT_TYPE_LABELS[r.accountType] || r.accountType || "—";

        rowsHtml += `<tr class="${r.isChild ? 'child-row' : ''}">
          <td style="font-family:monospace;font-size:10px">${r.isChild ? '' : r.accountCode}</td>
          <td style="${indent}">${r.isChild ? '└ ' : ''}${r.accountName}${r.isChild ? ' <span style="opacity:0.5;font-size:8px">(' + r.accountCode + ')</span>' : ''}</td>
          <td><span style="font-size:9px;padding:2px 6px;border-radius:4px;background:#F1F5F9">${typeLabel}</span></td>
          ${hasDateRange ? `<td style="color:#2563EB">${openingD}</td><td style="color:#DC2626">${openingC}</td>` : ''}
          <td style="color:#2563EB">${movD}</td>
          <td style="color:#DC2626">${movC}</td>
          <td style="font-weight:600">${fmtNetDebit(r.totalDebit, r.totalCredit) !== '—' ? `<span style="color:#2563EB">${fmtNetDebit(r.totalDebit, r.totalCredit)}</span>` : (fmtNetCredit(r.totalDebit, r.totalCredit) !== '—' ? `<span style="color:#DC2626">${fmtNetCredit(r.totalDebit, r.totalCredit)}-</span>` : '—')}</td>
          ${hasDateRange ? `<td style="color:#16A34A;font-weight:600">${closingD}</td><td style="color:#EF4444;font-weight:600">${closingC}</td>` : ''}
        </tr>`;
      }

      // Group subtotal row
      const gNetD = fmtNetDebit(group.totalDebit, group.totalCredit);
      const gNetC = fmtNetCredit(group.totalDebit, group.totalCredit);
      rowsHtml += `<tr class="subtotal-row">
        <td colspan="2" style="text-align:left;font-weight:700;color:#0D1B2E">إجمالي ${group.label}</td>
        <td></td>
        ${hasDateRange ? '<td></td><td></td>' : ''}
        <td style="color:#2563EB;font-weight:700">${group.totalDebit > 0 ? group.totalDebit.toLocaleString() : '—'}</td>
        <td style="color:#DC2626;font-weight:700">${group.totalCredit > 0 ? group.totalCredit.toLocaleString() : '—'}</td>
        <td style="font-weight:700">${gNetD !== '—' ? gNetD : (gNetC !== '—' ? gNetC + '-' : '—')}</td>
        ${hasDateRange ? '<td></td><td></td>' : ''}
      </tr>`;
    }

    // Grand total row
    const grandBalance = grandTotalDebit - grandTotalCredit;
    rowsHtml += `<tr class="totals-row">
      <td colspan="2">الإجمالي الكلي</td>
      <td>${isBalanced ? '✅' : '⚠️'}</td>
      ${hasDateRange ? '<td></td><td></td>' : ''}
      <td>₪${grandTotalDebit.toLocaleString()}</td>
      <td>₪${grandTotalCredit.toLocaleString()}</td>
      <td>${grandBalance === 0 ? '0' : fmtAmount(grandBalance)}</td>
      ${hasDateRange ? '<td></td><td></td>' : ''}
    </tr>`;

    const colHeaders = hasDateRange
      ? ['الكود', 'اسم الحساب', 'النوع', 'افتتاحي (م)', 'افتتاحي (د)', 'حركة (م)', 'حركة (د)', 'صافي الحركة', 'ختامي (م)', 'ختامي (د)']
      : ['الكود', 'اسم الحساب', 'النوع', 'مدين ₪', 'دائن ₪', 'صافي الحركة'];

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box;font-family:'Cairo',sans-serif}
body{background:#fff;color:#1f2937;font-size:11px;line-height:1.5}
@page{size:A4 landscape;margin:0}
.page{width:297mm;min-height:210mm;margin:0 auto;position:relative}
.header-bar{padding:20px 28px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0D1B2E;margin-bottom:0}
.header-bar .company{display:flex;align-items:center;gap:14px}
.header-bar .logo img{height:56px;object-fit:contain}
.header-bar .company-name{font-size:20px;font-weight:700;color:#0D1B2E}
.header-bar .title{text-align:left}
.header-bar .title h1{font-size:24px;font-weight:700;color:#0D1B2E}
.header-bar .title .en{font-size:11px;color:#94A3B8}
.header-bar .title .period{font-size:12px;color:#64748B;margin-top:2px}
.gold-line{height:3px;background:linear-gradient(90deg,#4A9EE8,#7BB8F0,#4A9EE8)}
.info{padding:14px 28px;display:flex;justify-content:space-between;border-bottom:1px solid #E5E7EB;font-size:10px}
.info .report-title{font-size:16px;font-weight:700;color:#1B3A5C}
.info .period{font-size:11px;color:#6B7280;margin-top:4px}
.summary{padding:12px 28px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.sbox{border:1px solid #E2E8F0;border-radius:8px;padding:10px 12px;text-align:center;background:#F8FAFC}
.sbox .lbl{font-size:9px;color:#6B7280;font-weight:600;margin-bottom:4px}
.sbox .val{font-size:14px;font-weight:700;font-feature-settings:'tnum'}
table{width:calc(100% - 56px);border-collapse:collapse;font-size:10px;margin:0 28px}
thead tr{background:#1B3A5C;color:#fff}
thead th{padding:8px 6px;font-weight:700;border-bottom:2px solid #4A9EE8;text-align:right;font-size:9px;white-space:nowrap}
tbody td{padding:6px 8px;border-bottom:1px solid #F3F4F6;text-align:right}
.child-row{background:#FAFBFC}
.child-row td{font-size:9px}
.subtotal-row{background:#F1F5F9}
.subtotal-row td{padding:6px 8px;border-top:2px solid #CBD5E1;border-bottom:2px solid #CBD5E1;color:#0D1B2E;font-weight:700}
.totals-row{background:#1B3A5C;color:#fff;font-weight:700;font-size:14px}
.totals-row td{padding:8px;border-top:3px solid #0D1B2E}
.notes{margin:16px 28px;font-size:9px;color:#6B7280;border-top:1px solid #E5E7EB;padding-top:10px;text-align:right;line-height:1.8}
.footer-section{margin:0 28px;padding:14px 0;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between}
.footer-section .contact{font-size:10px;color:#4B5563;line-height:1.8}
.footer-section .contact h4{font-weight:700;color:#1B3A5C;margin-bottom:6px}
.sig-box{text-align:center;min-width:180px}
.sig-box h4{font-size:10px;font-weight:700;color:#1B3A5C;margin-bottom:8px}
.sig-box .line{width:160px;height:60px;border:1px dashed #D1D5DB;border-radius:6px;margin:0 auto 6px}
.sig-box .lbl{font-size:8px;color:#9CA3AF}
.bottom-bar{background:#1B3A5C;color:rgba(255,255,255,0.7);padding:8px 28px;display:flex;justify-content:space-between;font-size:9px}
@media print{body{margin:0;padding:0}.page{width:100%!important}}
</style></head><body>
<div class="page">
  <div class="header-bar">
    <div class="company">
      ${companyInfo.logo_url ? `<div class="logo"><img src="${companyInfo.logo_url}" alt="Logo"></div>` : `<span class="company-name">${companyInfo.name}</span>`}
      ${companyInfo.logo_url ? `<span class="company-name">${companyInfo.name}</span>` : ''}
    </div>
    <div class="title">
      <h1>ميزان المراجعة</h1>
      <p class="en">TRIAL BALANCE</p>
      <p class="period">${dateRangeLabel}</p>
    </div>
  </div>
  <div class="gold-line"></div>
  <div class="info">
    <div class="meta" style="margin-right:auto">
      <div>تاريخ الإصدار: <strong>${today}</strong></div>
    </div>
  </div>
  <div class="summary">
    <div class="sbox"><div class="lbl">عدد الحسابات</div><div class="val" style="color:#1B3A5C">${filteredRows.length}</div></div>
    <div class="sbox"><div class="lbl">إجمالي المدين</div><div class="val" style="color:#2563EB">₪${grandTotalDebit.toLocaleString()}</div></div>
    <div class="sbox"><div class="lbl">إجمالي الدائن</div><div class="val" style="color:#DC2626">₪${grandTotalCredit.toLocaleString()}</div></div>
    <div class="sbox"><div class="lbl">حالة التوازن</div><div class="val" style="color:${isBalanced ? '#16A34A' : '#DC2626'}">${isBalanced ? '✅ متوازن' : '⚠️ فرق: ₪' + Math.abs(grandBalance).toLocaleString()}</div></div>
  </div>
  <table>
    <thead><tr>${colHeaders.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="notes">
    <p>أُعد هذا التقرير وفقاً لمعايير المحاسبة الدولية</p>
    <p>عدد الحسابات: ${filteredRows.length} حساب</p>
    <p>تاريخ الإصدار: ${today}</p>
  </div>
  <div class="footer-section">
    <div class="contact">
      <h4>للمطابقة والاستفسار:</h4>
      ${companyInfo.phone ? '<div>📞 ' + companyInfo.phone + '</div>' : ''}
      ${companyInfo.email ? '<div>✉️ ' + companyInfo.email + '</div>' : ''}
    </div>
    <div class="sig-box">
      <h4>ختم الشركة وتوقيع المحاسب:</h4>
      <div class="line"></div>
      <div class="lbl">اسم المحاسب وتوقيعه</div>
    </div>
  </div>
  <div class="bottom-bar">
    <span>طُبع بتاريخ: ${today}</span>
    <span style="color:#4A9EE8;font-weight:600">نظام أموالي للمحاسبة</span>
    <span>صفحة 1 من 1</span>
  </div>
</div>
</body></html>`;

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
        {/* Report Level Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">مستوى التقرير:</span>
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
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={showDetailedAccounts} onCheckedChange={(v) => setShowDetailedAccounts(!!v)} />
            <span className="text-muted-foreground">إظهار الحسابات التفصيلية</span>
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
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={handleExportPDF} disabled={loading || filteredRows.length === 0}>
            <Printer className="h-3 w-3" /> طباعة PDF
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
        <div className="bg-card rounded-xl shadow-card border border-border/40">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b-2 border-primary/20 bg-muted/60">
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
                      const isAtLevelBoundary = row.hasChildren && row.depth >= reportLevel;
                      const displayDebit = isAtLevelBoundary ? row.rolledDebit : row.totalDebit;
                      const displayCredit = isAtLevelBoundary ? row.rolledCredit : row.totalCredit;
                      const displayBalance = displayDebit - displayCredit;
                      const displayOpening = isAtLevelBoundary ? row.rolledOpeningBalance : row.openingBalance;
                      const displayClosing = isAtLevelBoundary ? row.rolledClosingBalance : row.closingBalance;
                      const indent = (row.depth - 1) * 24;
                      const canExpand = row.hasChildren && row.depth >= reportLevel;
                      const isExpanded = expandedAccounts.has(row.accountCode);
                      return (
                      <tr key={row.accountCode} className={`border-b border-border/20 hover:bg-muted/10 transition-colors ${row.depth === 1 ? "bg-muted/30" : row.depth === 2 ? "bg-muted/10" : ""}`}>
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums font-mono">
                          {row.accountCode || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground">
                          <div style={{ paddingRight: `${indent}px` }} className="flex items-center gap-1">
                            {canExpand && (
                              <button onClick={() => toggleExpand(row.accountCode)} className="p-0.5 hover:bg-muted rounded transition-colors">
                                <svg className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                              </button>
                            )}
                            {(displayDebit > 0 || displayCredit > 0) ? (
                              <button onClick={() => navigate(`/account-statement?code=${row.accountCode}`)}
                                className={`hover:underline cursor-pointer bg-transparent border-none p-0 text-xs text-primary ${row.depth === 1 ? "font-bold text-[13px]" : row.depth === 2 ? "font-semibold" : "font-medium"}`}>
                                {row.accountName}
                              </button>
                            ) : (
                              <span className={row.depth === 1 ? "font-bold text-[13px]" : row.depth === 2 ? "font-semibold" : "font-medium"}>{row.accountName}</span>
                            )}
                            {canExpand && !isExpanded && (
                              <span className="text-[9px] text-muted-foreground/50 mr-1">({row.childrenCodes.length} فرعي)</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${ACCOUNT_TYPE_COLORS[ACCOUNT_TYPE_LABELS[row.accountType] || ""] || "bg-muted text-muted-foreground"}`}>
                            {ACCOUNT_TYPE_LABELS[row.accountType] || row.accountType || "—"}
                          </span>
                        </td>
                        {dateFrom && (
                          <td className={`px-3 py-3 text-xs font-bold tabular-nums text-left ${displayOpening > 0 ? "text-amber-600 dark:text-amber-400" : displayOpening < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {displayOpening !== 0 ? `${displayOpening > 0 ? "" : "-"}${Math.abs(displayOpening).toLocaleString()}` : "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-xs font-bold text-primary tabular-nums text-left">
                          {displayDebit > 0 ? displayDebit.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-destructive tabular-nums text-left">
                          {displayCredit > 0 ? displayCredit.toLocaleString() : "—"}
                        </td>
                        <td className={`px-4 py-3 text-xs font-bold tabular-nums text-left ${displayBalance > 0 ? "text-primary" : displayBalance < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {displayBalance !== 0 ? `${displayBalance > 0 ? "" : "-"}${Math.abs(displayBalance).toLocaleString()}` : "—"}
                        </td>
                        {dateFrom && (
                          <td className={`px-3 py-3 text-xs font-bold tabular-nums text-left ${displayClosing > 0 ? "text-emerald-600 dark:text-emerald-400" : displayClosing < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {displayClosing !== 0 ? `${displayClosing > 0 ? "" : "-"}${Math.abs(displayClosing).toLocaleString()}` : "—"}
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
