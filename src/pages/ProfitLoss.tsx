import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2, ChevronDown, ChevronUp,
  Download, FileSpreadsheet, Printer, Calendar, RefreshCw, Calculator, ExternalLink,
} from "lucide-react";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import * as XLSX from "xlsx";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, startOfWeek, endOfWeek, subDays } from "date-fns";
import { generateProfessionalPDFHtml, openPrintWindow, useCompanyInfo } from "@/components/ReportPrintLayout";
import { setNextExportBranding } from "@/lib/excel-export";
import {
  fetchTransactions, fetchAccounts, buildAccountMap, normalizeAccountType, getAccountNameOnly,
  SupabaseTransaction, SupabaseAccount, isOpeningBalance, getChildAccounts,
  classifyAccount, resolveContraAccountCodes,
} from "@/lib/supabase-data";

// ── Types ──
interface TxRecord {
  id: string;
  date: string;
  description: string;
  amount: number;
  debitCode: string;
  creditCode: string;
  debitAccountName: string;
  creditAccountName: string;
  debitType: string;
  creditType: string;
  transactionType: string;
  costCenterId: string | null;
}

interface StatementLine {
  label: string;
  amount: number;
  compareAmount?: number;
  level: 0 | 1 | 2 | 3;
  type: "header" | "item" | "subtotal" | "total" | "grand-total" | "spacer";
  section?: string;
  transactions?: TxRecord[];
  code?: string;
}

// ── Constants ──
const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

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
const fmtAmount = (n: number) => {
  if (n === 0) return "₪ 0";
  const abs = Math.abs(n);
  const formatted = `₪ ${abs.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (n < 0) return `(${formatted})`;
  return formatted;
};

const pctChange = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
};

// Account classification — driven by `account_type` from the chart of accounts
// (single source of truth shared with Trial Balance and Balance Sheet), with a
// safe code-prefix fallback for legacy accounts that have a missing type.
// Contra codes (returns/discounts) are still detected by their well-known
// codes so they show as explicit deduction lines on the statement.
const makeClassifier = (accMap: Record<string, SupabaseAccount>) => {
  const catOf = (code: string) => {
    const acc = accMap[code];
    return acc ? classifyAccount(acc) : "Other";
  };
  const contra = resolveContraAccountCodes(Object.values(accMap));
  return {
    // Revenue lines exclude contra-revenue (returns + allowed discounts) and
    // exclude earned purchase discounts (a contra-COGS line of its own).
    isRevenue: (code: string) =>
      catOf(code) === "Revenue" &&
      !contra.salesReturns.has(code) &&
      !contra.salesDiscounts.has(code) &&
      !contra.purchaseDiscounts.has(code),
    isSalesReturn: (code: string) => contra.salesReturns.has(code),
    isSalesDiscount: (code: string) => contra.salesDiscounts.has(code),
    isPurchaseReturn: (code: string) => contra.purchaseReturns.has(code),
    isDiscountEarned: (code: string) => contra.purchaseDiscounts.has(code),
    isPurchases: (code: string) =>
      catOf(code) === "Purchases" &&
      !contra.purchaseReturns.has(code) &&
      !contra.purchaseDiscounts.has(code),
    isExpense: (code: string) => catOf(code) === "Expenses",
  };
};

// ── Main Component ──
const ProfitLoss = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyInfo = useCompanyInfo();
  const { settings: companySettings } = useCompanySettings();
  const periodicEnabled = !!companySettings?.periodic_inventory_enabled;
  const disclosureMethod = companySettings?.periodic_disclosure_method || "weighted_avg";
  const [allTxRecords, setAllTxRecords] = useState<TxRecord[]>([]);
  const [allAccounts, setAllAccounts] = useState<SupabaseAccount[]>([]);
  const [accountMap, setAccountMap] = useState<Record<string, SupabaseAccount>>({});
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [activePeriod, setActivePeriod] = useState("this-month");
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [showPercentages, setShowPercentages] = useState(true);
  const [showComparison, setShowComparison] = useState(false);
  const [showZeroAccounts, setShowZeroAccounts] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [drillDownAccount, setDrillDownAccount] = useState<{ label: string; txs: TxRecord[] } | null>(null);
  const [detailLevel, setDetailLevel] = useState(2);
  const [costCenters, setCostCenters] = useState<Array<{ id: string; name: string }>>([]);
  const [costCenterFilter, setCostCenterFilter] = useState<string>("all");

  // Resolve the actual data owner (team owner) so employees/cashiers see the company books
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    supabase.rpc("get_team_owner_id", { _user_id: user.id }).then(({ data }) => {
      setDataOwnerId((data as string) || user.id);
    });
  }, [user?.id]);

  // Fetch data from Supabase — company_name is scoped to the data owner so
  // employees/cashiers see the *company* name, not their personal profile.
  useEffect(() => {
    if (!dataOwnerId) return;
    supabase.from("profiles").select("company_name").eq("user_id", dataOwnerId).maybeSingle()
      .then(({ data }) => { if (data?.company_name) setCompanyName(data.company_name); });
  }, [dataOwnerId]);

  useEffect(() => {
    if (!user || !dataOwnerId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [txs, accounts] = await Promise.all([
          fetchTransactions(dataOwnerId),
          fetchAccounts(dataOwnerId),
        ]);
        const accMap = buildAccountMap(accounts);
        setAllAccounts(accounts);
        setAccountMap(accMap);

        const records: TxRecord[] = txs
          .filter(tx => !tx.is_deleted && !isOpeningBalance(tx))
          .map(tx => ({
            id: tx.id,
            date: tx.transaction_date,
            description: tx.description || "",
            amount: tx.amount || 0,
            debitCode: tx.debit_account_code || "",
            creditCode: tx.credit_account_code || "",
            debitAccountName: getAccountNameOnly(tx.debit_account_code || "", accMap),
            creditAccountName: getAccountNameOnly(tx.credit_account_code || "", accMap),
            debitType: normalizeAccountType(accMap[tx.debit_account_code || ""]?.account_type || ""),
            creditType: normalizeAccountType(accMap[tx.credit_account_code || ""]?.account_type || ""),
            transactionType: tx.transaction_type || "",
            costCenterId: (tx as any).cost_center_id || null,
          }));

        setAllTxRecords(records);
      } catch (err) {
        console.error("Error fetching P&L data:", err);
      } finally {
        setLoading(false);
      }
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

  const handleQuickPeriod = useCallback((key: string) => {
    setActivePeriod(key);
    const [from, to] = getQuickPeriod(key);
    setDateFrom(format(from, "yyyy-MM-dd"));
    setDateTo(format(to, "yyyy-MM-dd"));
  }, []);

  // Filter transactions by date range
  const plTransactions = useMemo(() => {
    return allTxRecords.filter(tx => {
      if (tx.date < dateFrom || tx.date > dateTo) return false;
      if (costCenterFilter === "all") return true;
      if (costCenterFilter === "none") return !tx.costCenterId;
      return tx.costCenterId === costCenterFilter;
    });
  }, [allTxRecords, dateFrom, dateTo, costCenterFilter]);

  // Previous period transactions
  const prevPeriodTxs = useMemo(() => {
    if (!showComparison) return [];
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    const duration = toDate.getTime() - fromDate.getTime();
    const prevFrom = format(new Date(fromDate.getTime() - duration - 86400000), "yyyy-MM-dd");
    const prevTo = format(new Date(fromDate.getTime() - 86400000), "yyyy-MM-dd");
    return allTxRecords.filter(tx => {
      if (tx.date < prevFrom || tx.date > prevTo) return false;
      if (costCenterFilter === "all") return true;
      if (costCenterFilter === "none") return !tx.costCenterId;
      return tx.costCenterId === costCenterFilter;
    });
  }, [allTxRecords, dateFrom, dateTo, showComparison, costCenterFilter]);

  // ── Compute P&L ──
  const computePL = useCallback((txs: TxRecord[]) => {
    const cls = makeClassifier(accountMap);
    const calc = (filter: (tx: TxRecord) => boolean) => ({
      total: txs.filter(filter).reduce((s, tx) => s + tx.amount, 0),
      txs: txs.filter(filter),
    });

    // Revenue: credit to 4xxx accounts (except returns 4400, 4500)
    const salesData = calc(tx => cls.isRevenue(tx.creditCode));

    // Sales returns (debit to 4400)
    const salesReturnData = calc(tx => cls.isSalesReturn(tx.debitCode));

    // Sales discount (خصم مسموح) — debit to the standard contra-revenue code
    // so we don't miss journal entries whose description doesn't match.
    const salesDiscountData = calc(tx => cls.isSalesDiscount(tx.debitCode));

    // Purchases (debit to 51xx)
    // Exclude 5101 (opening inventory adjustment) and 5102 (contra) so they
    // are shown as their own IAS 2 lines instead of being lumped as purchases.
    const purchasesData = calc(tx =>
      cls.isPurchases(tx.debitCode) && tx.debitCode !== "5101" && tx.debitCode !== "5102"
    );

    // Periodic Inventory adjustment entries (IAS 2 §34)
    //   Opening: Dr 5101 / Cr 1148  → adds to COGS
    //   Closing: Dr 1149 / Cr 5102  → reduces COGS
    const openingInventoryData = calc(tx => tx.debitCode === "5101");
    const closingInventoryData = calc(tx => tx.creditCode === "5102");

    // Purchase returns (credit to 4500 or description)
    const purchaseReturnData = calc(tx => cls.isPurchaseReturn(tx.creditCode));

    // Purchase discount (خصم مكتسب - credit to 4350)
    const purchaseDiscountData = calc(tx => cls.isDiscountEarned(tx.creditCode));

    // Operating expenses by account (5xxx except 51xx) — with hierarchy
    const expenseByAccount = new Map<string, { total: number; txs: TxRecord[]; code: string; name: string }>();
    txs.forEach(tx => {
      if (!cls.isExpense(tx.debitCode)) return;
      const code = tx.debitCode;
      const name = tx.debitAccountName || code;
      const curr = expenseByAccount.get(code) || { total: 0, txs: [], code, name };
      curr.total += tx.amount;
      curr.txs.push(tx);
      expenseByAccount.set(code, curr);
    });

    // Revenue by account — with hierarchy
    const revenueByAccount = new Map<string, { total: number; txs: TxRecord[]; code: string; name: string }>();
    txs.forEach(tx => {
      if (!cls.isRevenue(tx.creditCode)) return;
      const code = tx.creditCode;
      const name = tx.creditAccountName || code;
      const curr = revenueByAccount.get(code) || { total: 0, txs: [], code, name };
      curr.total += tx.amount;
      curr.txs.push(tx);
      revenueByAccount.set(code, curr);
    });

    const expenseEntries = Array.from(expenseByAccount.entries()).map(([, v]) => [v.name, v] as [string, typeof v]).sort((a, b) => b[1].total - a[1].total);
    const revenueEntries = Array.from(revenueByAccount.entries()).map(([, v]) => [v.name, v] as [string, typeof v]).sort((a, b) => b[1].total - a[1].total);
    const totalOpExpenses = expenseEntries.reduce((s, [, v]) => s + v.total, 0);

    // Other income/expenses
    const otherIncome = calc(tx => {
      const desc = tx.description.toLowerCase();
      return desc.includes("فوائد بنكية") || desc.includes("أرباح فروقات") || desc.includes("إيرادات أخرى");
    });
    const otherExpenses = calc(tx => {
      const desc = tx.description.toLowerCase();
      return desc.includes("خسائر فروقات") || desc.includes("مصاريف فوائد") || desc.includes("خسائر بيع");
    });

    const totalRevenue = salesData.total - salesDiscountData.total - salesReturnData.total;
    const totalCOGS =
      openingInventoryData.total +
      purchasesData.total -
      purchaseDiscountData.total -
      purchaseReturnData.total -
      closingInventoryData.total;
    const grossProfit = totalRevenue - totalCOGS;
    const operatingProfit = grossProfit - totalOpExpenses;
    const netOther = otherIncome.total - otherExpenses.total;
    const netProfit = operatingProfit + netOther;

    return {
      salesData, salesDiscountData, salesReturnData,
      purchasesData, purchaseDiscountData, purchaseReturnData,
      openingInventoryData, closingInventoryData,
      expenseEntries, revenueEntries, totalOpExpenses,
      otherIncome, otherExpenses,
      totalRevenue, totalCOGS, grossProfit, operatingProfit, netOther, netProfit,
      expenseByAccount, revenueByAccount,
    };
  }, [accountMap]);

  const current = useMemo(() => computePL(plTransactions), [plTransactions, computePL]);
  const previous = useMemo(() => showComparison ? computePL(prevPeriodTxs) : null, [prevPeriodTxs, showComparison, computePL]);

  const margin = current.totalRevenue > 0 ? (current.netProfit / current.totalRevenue) * 100 : 0;
  const grossMarginPct = current.totalRevenue > 0 ? (current.grossProfit / current.totalRevenue) * 100 : 0;

  // ── Build statement lines ──
  // Helper: build sub-account lines for a section
  const buildSubAccountLines = useCallback((
    accountDataMap: Map<string, { total: number; txs: TxRecord[]; code: string; name: string }>,
    addLine: (label: string, amount: number, level: StatementLine["level"], type: StatementLine["type"], section?: string, txs?: TxRecord[], compareAmt?: number, code?: string) => void,
    section: string,
    prevEntries?: typeof current.expenseEntries,
  ) => {
    if (detailLevel === 1) {
      // Just show aggregated total per *root* account (walk up the whole
      // parent chain — the previous version stopped at the immediate parent
      // which mis-grouped 3+ level trees).
      const rootMap = new Map<string, { total: number; txs: TxRecord[]; name: string }>();
      accountDataMap.forEach((data) => {
        let rootCode = data.code;
        let rootName = data.name;
        let cursor = allAccounts.find(a => a.account_code === data.code);
        while (cursor?.parent_code) {
          const parent = allAccounts.find(a => a.account_code === cursor!.parent_code);
          if (!parent) break;
          rootCode = parent.account_code;
          rootName = parent.account_name;
          cursor = parent;
        }
        const curr = rootMap.get(rootCode) || { total: 0, txs: [], name: rootName };
        curr.total += data.total;
        curr.txs.push(...data.txs);
        rootMap.set(rootCode, curr);
      });
      Array.from(rootMap.entries()).sort((a, b) => b[1].total - a[1].total).forEach(([rootCode, data]) => {
        const prevVal = prevEntries?.find(([n]) => n === data.name)?.[1]?.total;
        addLine(data.name, data.total, 2, "item", section, data.txs, prevVal, rootCode);
      });
    } else {
      // Show individual accounts with hierarchy
      // Group by parent
      const parentMap = new Map<string, { name: string; code: string; children: { name: string; code: string; total: number; txs: TxRecord[] }[]; total: number; txs: TxRecord[] }>();
      
      accountDataMap.forEach((data) => {
        const acc = allAccounts.find(a => a.account_code === data.code);
        const parentCode = acc?.parent_code;
        
        if (parentCode && detailLevel >= 2) {
          const parent = allAccounts.find(a => a.account_code === parentCode);
          if (parent) {
            const existing = parentMap.get(parentCode) || { name: parent.account_name, code: parentCode, children: [], total: 0, txs: [] };
            existing.children.push({ name: data.name, code: data.code, total: data.total, txs: data.txs });
            existing.total += data.total;
            existing.txs.push(...data.txs);
            parentMap.set(parentCode, existing);
            return;
          }
        }
        
        // No parent or level 1 - show directly
        if (!parentMap.has(data.code)) {
          parentMap.set(data.code, { name: data.name, code: data.code, children: [], total: data.total, txs: data.txs });
        }
      });

      Array.from(parentMap.values()).sort((a, b) => b.total - a.total).forEach(group => {
        if (group.children.length > 0) {
          // Parent account as header-like item
          addLine(group.name, group.total, 2, "item", section, group.txs, undefined, group.code);
          if (detailLevel >= 2) {
            group.children.sort((a, b) => b.total - a.total).forEach(child => {
              if (!showZeroAccounts && child.total === 0) return;
              addLine(`${child.code} - ${child.name}`, child.total, 3 as any, "item", section, child.txs, undefined, child.code);
            });
          }
        } else {
          const prevVal = prevEntries?.find(([n]) => n === group.name)?.[1]?.total;
          addLine(group.name, group.total, 2, "item", section, group.txs, prevVal, group.code);
        }
      });
    }
  }, [detailLevel, allAccounts, showZeroAccounts]);

  const statementLines = useMemo((): StatementLine[] => {
    const lines: StatementLine[] = [];

    const addLine = (label: string, amount: number, level: StatementLine["level"], type: StatementLine["type"], section?: string, txs?: TxRecord[], compareAmt?: number, code?: string) => {
      if (!showZeroAccounts && type === "item" && amount === 0) return;
      lines.push({ label, amount, level, type, section, transactions: txs, compareAmount: compareAmt, code });
    };

    // When showZeroAccounts is on, ensure all matching accounts are in the maps
    let revenueByAccount = current.revenueByAccount;
    let expenseByAccount = current.expenseByAccount;

    if (showZeroAccounts) {
      const cls = makeClassifier(accountMap);
      // Clone maps and add missing zero-balance accounts
      revenueByAccount = new Map(current.revenueByAccount);
      allAccounts.forEach(acc => {
        if (cls.isRevenue(acc.account_code) && !revenueByAccount.has(acc.account_code)) {
          revenueByAccount.set(acc.account_code, { total: 0, txs: [], code: acc.account_code, name: acc.account_name });
        }
      });

      expenseByAccount = new Map(current.expenseByAccount);
      allAccounts.forEach(acc => {
        if (cls.isExpense(acc.account_code) && !expenseByAccount.has(acc.account_code)) {
          expenseByAccount.set(acc.account_code, { total: 0, txs: [], code: acc.account_code, name: acc.account_name });
        }
      });
    }

    // Revenue
    addLine("الإيرادات", 0, 0, "header", "revenue");
    if (detailLevel >= 2 && (revenueByAccount.size >= 1 || showZeroAccounts)) {
      buildSubAccountLines(revenueByAccount, addLine, "revenue");
    } else {
      addLine("إيرادات المبيعات", current.salesData.total, 2, "item", "revenue", current.salesData.txs, previous?.salesData.total, "4100");
    }
    if (current.salesDiscountData.total > 0) addLine("(-) خصم مسموح به", -current.salesDiscountData.total, 2, "item", "revenue", current.salesDiscountData.txs);
    if (current.salesReturnData.total > 0) addLine("(-) مردود مبيعات", -current.salesReturnData.total, 2, "item", "revenue", current.salesReturnData.txs);
    addLine("إجمالي الإيرادات", current.totalRevenue, 1, "subtotal", "revenue", undefined, previous?.totalRevenue);

    lines.push({ label: "", amount: 0, level: 0, type: "spacer" });

    // COGS
    addLine("تكلفة المبيعات", 0, 0, "header", "cogs");
    if (periodicEnabled || current.openingInventoryData.total > 0) {
      addLine("بضاعة أول المدة", current.openingInventoryData.total, 2, "item", "cogs", current.openingInventoryData.txs, previous?.openingInventoryData.total, "5101");
    }
    addLine("المشتريات", current.purchasesData.total, 2, "item", "cogs", current.purchasesData.txs, previous?.purchasesData.total, "5110");
    if (current.purchaseDiscountData.total > 0) addLine("(-) خصم مكتسب", -current.purchaseDiscountData.total, 2, "item", "cogs", current.purchaseDiscountData.txs);
    if (current.purchaseReturnData.total > 0) addLine("(-) مردود مشتريات", -current.purchaseReturnData.total, 2, "item", "cogs", current.purchaseReturnData.txs);
    if (periodicEnabled || current.closingInventoryData.total > 0) {
      addLine("(-) بضاعة آخر المدة", -current.closingInventoryData.total, 2, "item", "cogs", current.closingInventoryData.txs, previous ? -previous.closingInventoryData.total : undefined, "5102");
    }
    addLine("إجمالي تكلفة المبيعات", current.totalCOGS, 1, "subtotal", "cogs", undefined, previous?.totalCOGS);

    lines.push({ label: "", amount: 0, level: 0, type: "spacer" });
    addLine("مجمل الربح", current.grossProfit, 0, "total", undefined, undefined, previous?.grossProfit);
    lines.push({ label: "", amount: 0, level: 0, type: "spacer" });

    // Operating Expenses
    addLine("المصروفات التشغيلية", 0, 0, "header", "opex");
    buildSubAccountLines(expenseByAccount, addLine, "opex", previous?.expenseEntries);
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

    addLine("صافي الربح / (الخسارة)", current.netProfit, 0, "grand-total", undefined, undefined, previous?.netProfit);

    return lines;
  }, [current, previous, showZeroAccounts, detailLevel, buildSubAccountLines, allAccounts, accountMap, periodicEnabled]);

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
    setNextExportBranding({
      title: "قائمة الدخل (الأرباح والخسائر)",
      currency: "شيكل ₪",
      period: `${dateFrom || "—"} → ${dateTo || "—"}`,
    });
    XLSX.writeFile(wb, `قائمة_الدخل_${dateFrom}_${dateTo}.xlsx`);
  };

  // ── Export PDF ──
  const handleExportPDF = () => {
    const rows = statementLines.filter(l => l.type !== "spacer" && l.type !== "header");
    const tableHeaders = ["البند", "المبلغ", ...(showPercentages ? ["%"] : []), ...(showComparison ? ["الفترة السابقة"] : [])];
    const tableRows = rows.map(l => {
      const isNeg = l.amount < 0;
      const pctVal = current.totalRevenue > 0 ? ((l.amount / current.totalRevenue) * 100).toFixed(1) + "%" : "";
      const indent = l.level * 16;
      const isBold = l.type === "subtotal" || l.type === "total" || l.type === "grand-total";
      const style = isBold ? 'font-weight:700;' : '';
      const bgStyle = l.type === "grand-total" ? 'background:#F0FDF4;' : l.type === "total" ? 'background:#F8FAFC;' : '';
      return [
        `<span style="padding-right:${indent}px;${style}">${l.label}</span>`,
        `<span style="${style}${isNeg ? 'color:#DC2626;' : ''}">${l.type === "header" ? "" : fmtAmount(l.amount)}</span>`,
        ...(showPercentages ? [pctVal] : []),
        ...(showComparison && l.compareAmount !== undefined ? [fmtAmount(l.compareAmount)] : showComparison ? [""] : []),
      ];
    });

    const company = companyInfo.name ? companyInfo : { name: companyName, logo_url: "", address: "", phone: "", email: "", website: "", tax_number: "" };
    const html = generateProfessionalPDFHtml({
      company,
      reportTitle: "قائمة الدخل",
      reportTitleEn: "INCOME STATEMENT",
      periodLabel: `للفترة من ${dateFrom} إلى ${dateTo} (المبالغ بالشيكل الإسرائيلي)`,
      summaryItems: [
        { label: "إجمالي الإيرادات", value: fmtAmount(current.totalRevenue), color: "#2563EB" },
        { label: "إجمالي المصروفات", value: fmtAmount(current.totalCOGS + current.totalOpExpenses), color: "#DC2626" },
        { label: current.netProfit >= 0 ? "صافي الربح" : "صافي الخسارة", value: fmtAmount(current.netProfit), color: current.netProfit >= 0 ? "#16A34A" : "#DC2626" },
        { label: "هامش الربح", value: `${margin.toFixed(1)}%`, color: "#7C3AED" },
      ],
      tableHeaders,
      tableRows: tableRows.map(r => r.map(String)),
      notes: [
        "أُعدت هذه القائمة وفقاً لمعايير المحاسبة الدولية (IAS 1)",
        "المبالغ بين أقواس تمثل مبالغ سالبة",
        "تم استبعاد الأرصدة الافتتاحية من هذه القائمة",
      ],
    });
    openPrintWindow(html);
  };

  const periodLabel = `${dateFrom} — ${dateTo}`;

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
              const [txs, accounts] = await Promise.all([fetchTransactions(dataOwnerId), fetchAccounts(dataOwnerId)]);
              const accMap = buildAccountMap(accounts);
              setAllAccounts(accounts);
              setAllTxRecords(
                txs.filter(tx => !tx.is_deleted && !isOpeningBalance(tx)).map(tx => ({
                  id: tx.id, date: tx.transaction_date, description: tx.description || "",
                  amount: tx.amount || 0, debitCode: tx.debit_account_code || "", creditCode: tx.credit_account_code || "",
                  debitAccountName: getAccountNameOnly(tx.debit_account_code || "", accMap),
                  creditAccountName: getAccountNameOnly(tx.credit_account_code || "", accMap),
                  debitType: normalizeAccountType(accMap[tx.debit_account_code || ""]?.account_type || ""),
                  creditType: normalizeAccountType(accMap[tx.credit_account_code || ""]?.account_type || ""),
                  transactionType: tx.transaction_type || "",
                  costCenterId: (tx as any).cost_center_id || null,
                }))
              );
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
  }]), [user, dataOwnerId, loading, navigate, handleExportPDF, handleExportExcel]);

  return (
    <FinanceShell
      title="قائمة الدخل"
      subtitle="الإيرادات − تكلفة المبيعات − المصروفات = صافي الربح (IAS 1)"
      breadcrumb={[
        { label: "المالية", href: "/accounting-center" },
        { label: "التقارير" },
        { label: "قائمة الدخل" },
      ]}
      actionTabs={actionTabs}
      rightSlot={
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePeriod("custom"); }} className="w-[140px] h-8 text-xs" />
          <span className="text-xs text-muted-foreground">—</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePeriod("custom"); }} className="w-[140px] h-8 text-xs" />
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
          {costCenters.length > 0 && (
            <div className="flex items-center gap-1.5 mr-4">
              <span className="text-muted-foreground text-[10px]">الفرع / مركز التكلفة:</span>
              <select
                value={costCenterFilter}
                onChange={(e) => setCostCenterFilter(e.target.value)}
                className="h-7 rounded-md border border-input bg-background px-2 text-[11px]"
              >
                <option value="all">الكل</option>
                <option value="none">بدون مركز تكلفة</option>
                {costCenters.map(cc => (
                  <option key={cc.id} value={cc.id}>{cc.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* ── KPI Cards ── */}
          {/* Monochrome summary strip — Dynamics/SAP style */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border border-border rounded-sm bg-card divide-x divide-x-reverse divide-border">
            {[
              { label: "إجمالي الإيرادات", value: fmtAmount(current.totalRevenue) },
              { label: "إجمالي المصروفات", value: fmtAmount(current.totalCOGS + current.totalOpExpenses) },
              { label: current.netProfit >= 0 ? "صافي الربح" : "صافي الخسارة", value: fmtAmount(current.netProfit) },
              { label: "هامش الربح الصافي", value: `${margin.toFixed(1)}%` },
            ].map((c, i) => (
              <div key={i} className="px-4 py-2.5">
                <p className="text-[10.5px] text-muted-foreground mb-0.5">{c.label}</p>
                <p className="text-[15px] font-semibold tabular-nums text-foreground">{c.value}</p>
              </div>
            ))}
          </div>

          {/* ── Statement Table ── */}
          <div className="border border-border rounded-sm bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[13px] font-semibold text-foreground text-center">{companyName || "النظام المالي"}</p>
              <p className="text-[11px] text-muted-foreground text-center mt-0.5">قائمة الدخل — {periodLabel}</p>
              <p className="text-[10.5px] text-muted-foreground text-center">(المبالغ بالشيكل الإسرائيلي)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2 text-right font-semibold text-foreground text-[11.5px] uppercase tracking-wide" style={{ width: "55%" }}>البند</th>
                    <th className="px-4 py-2 text-left font-semibold text-foreground text-[11.5px] uppercase tracking-wide">المبلغ</th>
                    {showPercentages && <th className="px-3 py-2 text-center font-semibold text-foreground text-[11.5px] uppercase tracking-wide w-16">%</th>}
                    {showComparison && <th className="px-4 py-2 text-left font-semibold text-foreground text-[11.5px] uppercase tracking-wide">السابقة</th>}
                    {showComparison && <th className="px-3 py-2 text-center font-semibold text-foreground text-[11.5px] uppercase tracking-wide w-20">التغير</th>}
                  </tr>
                </thead>
                <tbody>
                  {statementLines.map((line, i) => {
                    if (line.type === "spacer") return <tr key={i}><td colSpan={5} className="h-2" /></tr>;
                    const isCollapsed = line.section && collapsedSections.has(line.section);
                    if (line.type === "item" && isCollapsed) return null;

                    const pctVal = current.totalRevenue > 0 && line.type !== "header" ? ((line.amount / current.totalRevenue) * 100).toFixed(1) : "";
                    const change = showComparison && line.compareAmount !== undefined ? pctChange(line.amount, line.compareAmount) : null;
                    const indent = line.level * 16;

                    const rowCls =
                      line.type === "header" ? "font-semibold text-foreground uppercase text-[11.5px] tracking-wide" :
                      line.type === "subtotal" ? "border-t border-border font-semibold text-foreground" :
                      line.type === "total" ? "border-t border-border font-bold text-foreground" :
                      line.type === "grand-total" ? "border-t-2 border-b-2 border-double border-foreground font-bold text-foreground" :
                      "hover:bg-muted/20";

                    return (
                      <tr key={i} className={`${rowCls} transition-colors`}>
                        <td className="px-4 py-1.5" style={{ paddingRight: `${16 + indent}px` }}>
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
                            {line.code && (
                              <button
                                type="button"
                                title={`كشف حساب ${line.code} للتدقيق`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/account-statement?code=${encodeURIComponent(line.code!)}`);
                                }}
                                className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-1.5 text-left tabular-nums text-foreground">
                          {line.type === "header" ? "" : fmtAmount(line.amount)}
                        </td>
                        {showPercentages && <td className="px-3 py-1.5 text-center tabular-nums text-muted-foreground">{line.type === "header" ? "" : pctVal ? `${pctVal}%` : ""}</td>}
                        {showComparison && (
                          <td className="px-4 py-1.5 text-left tabular-nums text-muted-foreground">
                            {line.compareAmount !== undefined ? fmtAmount(line.compareAmount) : ""}
                          </td>
                        )}
                        {showComparison && (
                          <td className="px-3 py-1.5 text-center tabular-nums text-muted-foreground">
                            {change !== null ? (
                              <span className="inline-flex items-center gap-0.5 text-[10.5px]">
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
          </div>

          {/* ── Charts ── */}
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
                      <td className="p-2">{tx.date || "-"}</td>
                      <td className="p-2">{tx.description || "-"}</td>
                      <td className="p-2 font-medium tabular-nums">{fmtAmount(tx.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border font-bold bg-muted/30">
                    <td className="p-2" colSpan={2}>المجموع</td>
                    <td className="p-2 tabular-nums">{fmtAmount(drillDownAccount.txs.reduce((s, tx) => s + tx.amount, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
      </div>
    </FinanceShell>
  );
};

export default ProfitLoss;
