import { Fragment, useState, useEffect, useMemo, useCallback } from "react";
import {
  ArrowRight, Loader2, RefreshCw, Search, FileSpreadsheet,
  Printer, ChevronLeft, ChevronDown, ChevronUp,
  Settings2, Eye, Send, X, Mail, MessageSquare, Link2,
  Filter, Download, AlertTriangle, Zap, Calculator,
  ArrowLeft,
} from "lucide-react";
import TransactionDetailDrawer from "@/components/account-statement/TransactionDetailDrawer";
import * as XLSX from "xlsx";
import { generateStatementPDF } from "@/utils/generateStatementPDF";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import StatementPrintViewClean from "@/components/StatementPrintViewClean";
import { buildAccountStatementPrintHTML } from "@/lib/reports/account-statement-print";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, differenceInDays, parseISO, subYears } from "date-fns";
import { ar } from "date-fns/locale";
import { cn, multiWordMatchAny } from "@/lib/utils";
import AdvancedEntitySearch from "@/components/account-statement/AdvancedEntitySearch";
import { setNextExportBranding } from "@/lib/excel-export";
import RtlDateField from "@/components/account-statement/RtlDateField";
import StatementViewOptionsPanel, { loadViewOptions, type StatementViewOptions } from "@/components/account-statement/StatementViewOptions";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import { useCostCenters } from "@/hooks/useCostCenters";
import { SmartTextCell } from "@/components/ui/smart-text-cell";

// ─── TYPES ───
interface Contact { id: string; contact_name: string; contact_type: string; phone: string | null; email: string | null; address: string | null; linked_account_code: string | null; credit_limit?: number; current_balance?: number; contact_class?: string; }
interface Account { id: string; account_code: string; account_name: string; account_type: string; }
interface EmployeeEntity { id: string; full_name: string; department: string | null; job_title: string | null; phone: string | null; base_salary: number; account_code: string | null; }
interface Transaction { id: string; description: string; transaction_type: string; amount: number; currency: string; transaction_date: string; debit_account_code: string; credit_account_code: string; reference: string | null; is_deleted: boolean; contact_id: string | null; payment_method: string | null; foreign_amount: number | null; exchange_rate: number | null; reversed_by_id?: string | null; cost_center_id?: string | null; }
interface Cheque { id: string; cheque_number: string | null; cheque_type: string; amount: number; currency: string; cheque_date: string; party_name: string; status: string; bank_name: string | null; }
interface StatementRow { date: string; description: string; transaction_type: string; reference: string; debit: number; credit: number; balance: number; transaction_id: string; currency: string; payment_method: string | null; dueDate?: string; foreignDetail?: string; isConverted?: boolean; isMismatch?: boolean; conversionRate?: number; usedHistoricRate?: boolean; isCancelled?: boolean; isLineItem?: boolean; lineItemDetail?: string; invoiceItems?: StatementInvoiceDetail[]; voucherDetail?: StatementVoucherDetail; voucherKind?: string; voucherAmount?: number; cost_center_id?: string | null; cost_center_name?: string; }
interface StatementInvoiceDetail { productName: string; quantity: number; unitPrice: number; discount: number; tax: number; total: number; unit?: string | null; }
interface StatementVoucherAccountLine { accountCode: string; accountName: string; debit: number; credit: number; }
interface StatementVoucherDetail { paymentMethod?: string | null; cashBox?: string | null; bank?: string | null; chequeNumber?: string | null; chequeDate?: string | null; chequeStatus?: string | null; notes?: string | null; accounts?: StatementVoucherAccountLine[]; }
interface StatementDetailsMap { invoiceDetailsById: Record<string, StatementInvoiceDetail[]>; voucherDetailsById: Record<string, StatementVoucherDetail>; agingSummary: ReturnType<typeof buildEmptyAging> | null; companySettings: typeof EMPTY_COMPANY_SETTINGS; }

type EntityTab = "customers" | "suppliers" | "employees" | "accounts" | "contacts";

const EMPTY_COMPANY_SETTINGS = { name: "", logo_url: "", address: "", phone: "", email: "", website: "", tax_number: "" };
const buildEmptyAging = () => ({ current: 0, d1_30: 0, d31_60: 0, d60plus: 0, total: 0 });
const emptyDetailsMap = (companySettings = EMPTY_COMPANY_SETTINGS): StatementDetailsMap => ({ invoiceDetailsById: {}, voucherDetailsById: {}, agingSummary: null, companySettings });
const paymentMethodLabel = (method?: string | null) => {
  const map: Record<string, string> = { cash: "نقدي", bank: "بنك", cheque: "شيك", check: "شيك", transfer: "تحويل", card: "بطاقة", credit: "آجل" };
  return method ? (map[method] || method) : "—";
};

// ─── HELPERS ───
const normalizeCurrency = (c: string): string => {
  if (!c) return "شيكل";
  const map: Record<string, string> = { ILS: "شيكل", شيكل: "شيكل", USD: "دولار", دولار: "دولار", JOD: "دينار", دينار: "دينار", EUR: "يورو", يورو: "يورو", EGP: "جنيه", جنيه: "جنيه" };
  return map[c] || c;
};
const getCurrencySymbol = (c: string): string => {
  const n = normalizeCurrency(c);
  if (n === "دولار") return "$"; if (n === "دينار") return "د.أ"; if (n === "يورو") return "€"; if (n === "جنيه") return "£"; return "₪";
};
const fmtAmount = (n: number, currency?: string) => {
  if (n === 0) return "—";
  const symbol = getCurrencySymbol(currency || "شيكل");
  return `${symbol}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtDate = (d: string) => { if (!d) return "—"; const p = d.split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; };
const getDayName = (d: string) => { try { const date = parseISO(d); const diff = differenceInDays(new Date(), date); if (diff === 0) return "اليوم"; if (diff === 1) return "أمس"; return format(date, "EEEE", { locale: ar }); } catch { return ""; } };

const getTypeBadge = (txType: string) => {
  if (txType === "reversal" || txType.includes("reverse")) return "قيد عكسي";
  if (txType.includes("pos")) return "مبيعات POS";
  if (txType.includes("sale") || txType.includes("فاتورة")) return "فاتورة مبيعات";
  if (txType.includes("receipt") || txType.includes("قبض")) return "سند قبض";
  if (txType.includes("payment") || txType.includes("صرف")) return "سند صرف";
  if (txType.includes("purchase") || txType.includes("مشتريات")) return "فاتورة مشتريات";
  if (txType.includes("journal") || txType.includes("قيد") || txType.includes("salary")) return "قيد محاسبي";
  if (txType.includes("cheque")) return "شيك";
  if (txType.includes("opening_balance")) return "رصيد افتتاحي";
  return "حركة";
};

const QUICK_PERIODS = [
  { label: "هذا الشهر", from: () => format(startOfMonth(new Date()), "yyyy-MM-dd"), to: () => format(endOfMonth(new Date()), "yyyy-MM-dd") },
  { label: "الشهر الماضي", from: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return format(startOfMonth(d), "yyyy-MM-dd"); }, to: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return format(endOfMonth(d), "yyyy-MM-dd"); } },
  { label: "الربع الحالي", from: () => format(startOfQuarter(new Date()), "yyyy-MM-dd"), to: () => format(endOfQuarter(new Date()), "yyyy-MM-dd") },
  { label: "هذه السنة", from: () => format(startOfYear(new Date()), "yyyy-MM-dd"), to: () => format(endOfYear(new Date()), "yyyy-MM-dd") },
  { label: "كل الفترات", from: () => "2020-01-01", to: () => format(new Date(), "yyyy-MM-dd") },
];

const DISPLAY_CURRENCIES = [
  { value: "ILS", label: "عرض بالشيكل ₪ (افتراضي)", symbol: "₪" },
  { value: "USD", label: "عرض بالدولار $", symbol: "$" },
  { value: "JOD", label: "عرض بالدينار د.أ", symbol: "د.أ" },
  { value: "EUR", label: "عرض باليورو €", symbol: "€" },
];
const codeToCurrencyName: Record<string, string> = { ILS: "شيكل", USD: "دولار", JOD: "دينار", EUR: "يورو" };
const currencyNameToCode: Record<string, string> = { "شيكل": "ILS", "دولار": "USD", "دينار": "JOD", "يورو": "EUR", "جنيه": "EGP" };

const TX_TYPE_FILTERS = [
  { value: "all", label: "الكل" },
  { value: "sale", label: "فواتير مبيعات" },
  { value: "receipt", label: "سندات قبض" },
  { value: "payment", label: "سندات صرف" },
  { value: "journal", label: "قيود محاسبية" },
  { value: "purchase", label: "فواتير مشتريات" },
];

// ─── COMPONENT ───
const AccountStatementV2Page = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const { toast } = useToast();
  const { data: costCenters = [] } = useCostCenters({ includeInactive: true });

  const urlContactId = searchParams.get("contact_id") || "";
  const urlContactType = searchParams.get("contact_type") || "";
  const urlEmployeeName = searchParams.get("employee_name") || "";
  const urlAccountCode = searchParams.get("code") || "";

  // State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [employeeEntities, setEmployeeEntities] = useState<EmployeeEntity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyInfo, setCompanyInfo] = useState({ name: "", logo_url: "", address: "", phone: "", email: "", website: "", tax_number: "" });

  const [activeTab, setActiveTab] = useState<EntityTab>(
    urlAccountCode ? "accounts" : urlEmployeeName ? "employees" : urlContactType === "مورد" ? "suppliers" : urlContactId ? "customers" : "contacts"
  );
  const [selectedEntityId, setSelectedEntityId] = useState(urlContactId);
  const [txSearch, setTxSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [activePeriod, setActivePeriod] = useState("");
  const [displayCurrency, setDisplayCurrency] = useState("ILS");
  const [currentExchangeRate, setCurrentExchangeRate] = useState<Record<string, number>>({});
  const [txTypeFilter, setTxTypeFilter] = useState("all");
  const [txCostCenter, setTxCostCenter] = useState("all");
  const [showYearComparison, setShowYearComparison] = useState(false);
  const [chequesOpen, setChequesOpen] = useState(false);
  const [agingOpen, setAgingOpen] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRow, setDrawerRow] = useState<StatementRow | null>(null);
  const [statementOptions, setStatementOptions] = useState<StatementViewOptions>(() => loadViewOptions());
  const [detailsMap, setDetailsMap] = useState<StatementDetailsMap>(() => emptyDetailsMap());
  const isAccountsTab = activeTab === "accounts";
  const isEmployeesTab = activeTab === "employees";

  // ─── FETCH DATA ───
  const fetchData = async () => {
    if (!user || !dataOwnerId) return;
    setLoading(true);
    try {
      const [{ data: contactData }, { data: accData }, { data: txData }, { data: empData }, { data: csData }, { data: chequeData }, { data: companyData }] = await Promise.all([
        supabase.from("contacts").select("id, contact_name, contact_type, phone, email, address, linked_account_code, credit_limit, current_balance, contact_class").eq("user_id", dataOwnerId).eq("is_active", true).order("contact_name"),
        supabase.from("accounts").select("id, account_code, account_name, account_type").eq("user_id", dataOwnerId).eq("is_active", true).order("account_code"),
        // ✅ Reversal-aware: include both active rows AND soft-deleted rows that were reversed
        // (so the original entry shows alongside its reversal, keeping the statement balanced)
        supabase.from("transactions").select("id, description, transaction_type, amount, currency, transaction_date, debit_account_code, credit_account_code, reference, is_deleted, contact_id, payment_method, foreign_amount, exchange_rate, reversed_by_id, cost_center_id").eq("user_id", dataOwnerId).or("is_deleted.eq.false,reversed_by_id.not.is.null").order("transaction_date", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("employees").select("id, full_name, department, job_title, phone, base_salary").eq("user_id", dataOwnerId).eq("is_active", true).order("full_name"),
        supabase.from("company_settings").select("company_name, logo_url, address, phone, email, website, tax_number, fiscal_year_start").eq("user_id", user.id).maybeSingle(),
        supabase.from("cheques").select("id, cheque_number, cheque_type, amount, currency, cheque_date, party_name, status, bank_name").eq("user_id", dataOwnerId).order("cheque_date", { ascending: false }),
        supabase.from("companies").select("id, name, logo_url, address, phone, email, tax_number").eq("owner_id", user.id).maybeSingle(),
      ]);

      setContacts((contactData as Contact[]) || []);
      setAccounts((accData as Account[]) || []);
      setTransactions((txData as Transaction[]) || []);
      setCheques((chequeData as Cheque[]) || []);

      const allAccounts = (accData as Account[]) || [];
      const normalizeArabicName = (v: string = "") => v.replace(/\s+/g, " ").replace(/عبدالله/g, "عبد الله").trim();
      const empList = ((empData as any[]) || []).map((emp: any) => {
        const nn = normalizeArabicName(emp.full_name);
        const linked = allAccounts.find(a => {
          const na = normalizeArabicName((a.account_name || "").replace(/^ذمم\s*موظف\s*[-–]\s*/, "").replace(/^ذمم\s+/, ""));
          return na === nn;
        });
        return { ...emp, account_code: linked?.account_code || null } as EmployeeEntity;
      });
      setEmployeeEntities(empList);

      const cs = csData as any;
      const comp = companyData as any;
      if (cs) {
        setCompanyInfo({ name: cs.company_name || comp?.name || "", logo_url: cs.logo_url || comp?.logo_url || "", address: cs.address || comp?.address || "", phone: cs.phone || comp?.phone || "", email: cs.email || comp?.email || "", website: cs.website || "", tax_number: cs.tax_number || comp?.tax_number || "" });
      } else if (comp) {
        setCompanyInfo({ name: comp.name || "", logo_url: comp.logo_url || "", address: comp.address || "", phone: comp.phone || "", email: comp.email || "", website: "", tax_number: comp.tax_number || "" });
      }

      if (urlEmployeeName && empList.length > 0) { const f = empList.find(e => e.full_name === urlEmployeeName); if (f) setSelectedEntityId(f.id); }
      if (urlAccountCode && allAccounts.length > 0) { const f = allAccounts.find(a => a.account_code === urlAccountCode); if (f) setSelectedEntityId(f.id); }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user, dataOwnerId]);

  useEffect(() => { setDetailsMap(prev => ({ ...prev, companySettings: companyInfo })); }, [companyInfo]);

  // ─── Realtime: auto-refresh on transaction changes ───
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('account_statement_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ─── Fetch exchange rates for ALL foreign currencies (needed for cross-currency conversion) ───
  useEffect(() => {
    if (!user) return;
    const fetchRates = async () => {
      const codes = ["USD", "JOD", "EUR"];
      const results = await Promise.all(
        codes.map(c => supabase.rpc("get_exchange_rate", { p_currency_code: c, p_rate_type: "mid" }))
      );
      const next: Record<string, number> = {};
      codes.forEach((c, i) => { if (results[i].data) next[c] = Number(results[i].data); });
      setCurrentExchangeRate(prev => ({ ...prev, ...next }));
    };
    fetchRates();
  }, [user]);

  // ─── Derived State ───
  const selectedAccount = useMemo(() => accounts.find(a => a.id === selectedEntityId), [accounts, selectedEntityId]);
  const selectedContact = useMemo(() => contacts.find(c => c.id === selectedEntityId), [contacts, selectedEntityId]);
  const selectedEmployee = useMemo(() => employeeEntities.find(e => e.id === selectedEntityId), [employeeEntities, selectedEntityId]);

  const selectedEntityName = isAccountsTab ? selectedAccount?.account_name || "" : isEmployeesTab ? selectedEmployee?.full_name || "" : selectedContact?.contact_name || "";
  const selectedEntityEmoji = selectedAccount ? "📊" : selectedContact ? (selectedContact.contact_type === "عميل" ? "👤" : "🚚") : selectedEmployee ? "👨‍💼" : "";
  const selectedEntityCode = isAccountsTab ? selectedAccount?.account_code || "" : selectedContact?.linked_account_code || selectedEmployee?.account_code || "";

  // Stable SOA number: based on entity + date range, doesn't change during session
  const stableSOANumber = useMemo(() => {
    const seed = `${selectedEntityName}|${dateFrom}|${dateTo}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    const num = Math.abs(hash) % 10000000000;
    return `SOA-${String(num).padStart(10, "0")}`;
  }, [selectedEntityName, dateFrom, dateTo]);

  const isDebitNature = useMemo(() => {
    if (isAccountsTab && selectedAccount) {
      const code = selectedAccount.account_code;
      if (code.startsWith("1") || code.startsWith("5")) return true;
      if (code.startsWith("2") || code.startsWith("3") || code.startsWith("4")) return false;
      return true;
    }
    if (isEmployeesTab) return true; // Employee advances = debit nature (مدين = لي = أخضر)
    if (activeTab === "customers") return true;
    return false;
  }, [isAccountsTab, isEmployeesTab, activeTab, selectedAccount]);

  // ─── BALANCES for search ───
  const { accountBalances, accountTxCounts } = useMemo(() => {
    const balMap: Record<string, number> = {}; const cntMap: Record<string, number> = {};
    for (const acc of accounts) { let b = 0, c = 0; for (const tx of transactions) { if (tx.debit_account_code === acc.account_code) { b += tx.amount || 0; c++; } if (tx.credit_account_code === acc.account_code) { b -= tx.amount || 0; c++; } } balMap[acc.id] = b; cntMap[acc.id] = c; }
    return { accountBalances: balMap, accountTxCounts: cntMap };
  }, [accounts, transactions]);

  const { contactBalances, contactTxCounts } = useMemo(() => {
    const balMap: Record<string, number> = {}; const cntMap: Record<string, number> = {};
    // Use account-family ROOT PREFIXES (not exact codes) so AR/AP sub-accounts
    // like 1131, 1135, 2111, 2115 are all included. This MUST match the same
    // prefix logic used when rendering the statement rows below — otherwise the
    // search dropdown shows "✓ مسدّد" while the statement shows a real balance.
    const rootsByType: Record<string, string[]> = {
      "عميل": ["113", "2115"],         // ذمم عملاء + دفعات مقدمة من العملاء
      "مورد": ["211", "1146"],         // ذمم موردين + دفعات مقدمة للموردين
      "موظف": ["2180"],
    };
    const matchesRoot = (code: string | null | undefined, roots: string[]) => {
      if (!code) return false;
      return roots.some(root => code === root || code.startsWith(root));
    };
    for (const c of contacts) {
      let b = 0, cnt = 0;
      const roots = rootsByType[c.contact_type] || ["2180"];
      for (const tx of transactions) {
        const matches = (tx.contact_id === c.id) || (!tx.contact_id && tx.description?.includes(c.contact_name?.trim()));
        if (!matches) continue;
        const isDr = matchesRoot(tx.debit_account_code, roots);
        const isCr = matchesRoot(tx.credit_account_code, roots);
        if (!isDr && !isCr) continue;
        cnt++;
        if (isDr) b += tx.amount || 0;
        if (isCr) b -= tx.amount || 0;
      }
      balMap[c.id] = b; cntMap[c.id] = cnt;
    }
    return { contactBalances: balMap, contactTxCounts: cntMap };
  }, [contacts, transactions]);

  const { employeeBalances, employeeTxCounts } = useMemo(() => {
    const balMap: Record<string, number> = {}; const cntMap: Record<string, number> = {};
    for (const emp of employeeEntities) { if (!emp.account_code) { balMap[emp.id] = 0; cntMap[emp.id] = 0; continue; } let b = 0, cnt = 0; for (const tx of transactions) { const m = tx.debit_account_code === emp.account_code || tx.credit_account_code === emp.account_code; if (!m) continue; cnt++; if (tx.debit_account_code === emp.account_code) b += tx.amount || 0; if (tx.credit_account_code === emp.account_code) b -= tx.amount || 0; } balMap[emp.id] = b; cntMap[emp.id] = cnt; }
    return { employeeBalances: balMap, employeeTxCounts: cntMap };
  }, [employeeEntities, transactions]);

  // ─── STATEMENT ROWS ───
  const { rows, openingBalance, closingBalance, totalDebit, totalCredit } = useMemo(() => {
    if (!selectedEntityId) return { rows: [] as StatementRow[], openingBalance: 0, closingBalance: 0, totalDebit: 0, totalCredit: 0 };

    let related: Transaction[];
    let resolveDebitCredit: (tx: Transaction) => { isDebit: boolean; isCredit: boolean };

    if (isAccountsTab && selectedAccount) {
      const code = selectedAccount.account_code;
      related = transactions.filter(tx => tx.debit_account_code === code || tx.credit_account_code === code);
      resolveDebitCredit = (tx) => ({ isDebit: tx.debit_account_code === code, isCredit: tx.credit_account_code === code });
    } else if (isEmployeesTab && selectedEmployee?.account_code) {
      const code = selectedEmployee.account_code;
      related = transactions.filter(tx => tx.debit_account_code === code || tx.credit_account_code === code);
      resolveDebitCredit = (tx) => ({ isDebit: tx.debit_account_code === code, isCredit: tx.credit_account_code === code });
    } else {
      const contactName = selectedContact?.contact_name?.trim() || "";
      const sameNameIds = new Set(contacts.filter(c => c.contact_name?.trim() === contactName).map(c => c.id));
      // Include full AR/AP account families so 1131/1135 and 2111/2115 remain visible.
      // Sales-rep & POS invoices may post to AR sub-accounts that are not text-prefixes of 1130.
      const contactAccountRoots = ["113", "211", "2180", "1146"];
      const matchesContactAccount = (code: string | null | undefined) => {
        if (!code) return false;
        return contactAccountRoots.some(root => code === root || code.startsWith(root));
      };
      related = transactions.filter(tx => (tx.contact_id && sameNameIds.has(tx.contact_id)) || (!tx.contact_id && contactName && tx.description?.includes(contactName)));
      resolveDebitCredit = (tx) => ({ isDebit: matchesContactAccount(tx.debit_account_code), isCredit: matchesContactAccount(tx.credit_account_code) });
    }

    const foreignCashAccounts = ["1111", "1112", "1113", "1114"];
    const isForeignCash = isAccountsTab && selectedAccount && foreignCashAccounts.includes(selectedAccount.account_code);
    const isForeignDisplay = displayCurrency !== "ILS" && !isForeignCash;
    const dispCurrName = codeToCurrencyName[displayCurrency] || "شيكل";
    const dispRate = currentExchangeRate[displayCurrency] || 1;

    // Get display amount based on currency mode
    const getDisplayAmt = (tx: Transaction): { amount: number; isConverted: boolean; isMismatch: boolean; conversionRate?: number; usedHistoricRate?: boolean } => {
      if (isForeignCash && tx.foreign_amount != null && tx.foreign_amount > 0) {
        return { amount: tx.foreign_amount, isConverted: false, isMismatch: false };
      }
      if (!isForeignDisplay) {
        return { amount: tx.amount || 0, isConverted: false, isMismatch: false };
      }
      // Foreign display mode
      const txCurrCode = currencyNameToCode[normalizeCurrency(tx.currency)] || "ILS";
      // Same currency: use original foreign amount, no conversion
      if (txCurrCode === displayCurrency && tx.foreign_amount && tx.foreign_amount > 0) {
        return { amount: tx.foreign_amount, isConverted: false, isMismatch: false };
      }
      // ILS source → display foreign: ILS / displayRate
      if (txCurrCode === "ILS" && dispRate > 0) {
        const rateToUse = (tx.exchange_rate && tx.exchange_rate > 0) ? tx.exchange_rate : dispRate;
        const usedHistoric = !!(tx.exchange_rate && tx.exchange_rate > 0);
        return { amount: (tx.amount || 0) / rateToUse, isConverted: true, isMismatch: false, conversionRate: rateToUse, usedHistoricRate: usedHistoric };
      }
      // Cross-currency: foreign source (e.g. USD) → other foreign display (e.g. JOD)
      // Convert via ILS: foreign_amount × tx.exchange_rate (= ILS) / dispRate (= display foreign)
      if (txCurrCode !== "ILS" && txCurrCode !== displayCurrency && dispRate > 0) {
        const txRate = (tx.exchange_rate && tx.exchange_rate > 0) ? tx.exchange_rate : (currentExchangeRate[txCurrCode] || 0);
        if (txRate > 0) {
          const ilsValue = (tx.foreign_amount && tx.foreign_amount > 0)
            ? tx.foreign_amount * txRate
            : (tx.amount || 0); // amount column already stores ILS equivalent
          return { amount: ilsValue / dispRate, isConverted: true, isMismatch: false, conversionRate: dispRate, usedHistoricRate: false };
        }
      }
      return { amount: tx.amount || 0, isConverted: false, isMismatch: true };
    };

    const getForeignDetail = (tx: Transaction): string | undefined => {
      if (isForeignCash || isForeignDisplay) return undefined;
      if (tx.foreign_amount && tx.foreign_amount > 0 && tx.exchange_rate && tx.exchange_rate !== 1 && normalizeCurrency(tx.currency) !== "شيكل") {
        const sym = getCurrencySymbol(tx.currency);
        return `(${sym}${tx.foreign_amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} × ${tx.exchange_rate})`;
      }
      return undefined;
    };

    let openBal = 0;
    const periodTx: Transaction[] = [];
    for (const tx of related) {
      const { isDebit, isCredit } = resolveDebitCredit(tx);
      if (!isDebit && !isCredit) continue;
      const { amount: amt } = getDisplayAmt(tx);
      if (dateFrom && tx.transaction_date < dateFrom) { if (isDebit) openBal += amt; if (isCredit) openBal -= amt; }
      else if (!dateTo || tx.transaction_date <= dateTo) periodTx.push(tx);
    }

    let running = openBal, sD = 0, sC = 0;
    const result: StatementRow[] = periodTx.map(tx => {
      const { isDebit } = resolveDebitCredit(tx);
      const { amount: amt, isConverted, isMismatch, conversionRate, usedHistoricRate } = getDisplayAmt(tx);
      const debit = isDebit ? amt : 0;
      const credit = !isDebit ? amt : 0;
      running += debit - credit; sD += debit; sC += credit;
      let dueDate: string | undefined;
      if (tx.reference?.startsWith("INV-") || tx.reference?.startsWith("PO-")) { try { const d = parseISO(tx.transaction_date); d.setDate(d.getDate() + 30); dueDate = format(d, "yyyy-MM-dd"); } catch {} }
      const rowCurrency = isMismatch ? "شيكل" : isForeignCash ? normalizeCurrency(tx.currency) : dispCurrName;
      return { date: tx.transaction_date, description: tx.description || tx.transaction_type || "—", transaction_type: tx.transaction_type || "", reference: tx.reference || "", debit, credit, balance: running, transaction_id: tx.id, currency: rowCurrency, payment_method: tx.payment_method || null, dueDate, foreignDetail: getForeignDetail(tx), isConverted, isMismatch, conversionRate, usedHistoricRate, isCancelled: !!tx.is_deleted };
    });
    return { rows: result, openingBalance: openBal, closingBalance: running, totalDebit: sD, totalCredit: sC };
  }, [transactions, selectedEntityId, dateFrom, dateTo, activeTab, selectedAccount, selectedEmployee, displayCurrency, currentExchangeRate, contacts, selectedContact]);

  const statementCurrency = useMemo(() => {
    if (rows.length > 0) { const f: Record<string, number> = {}; rows.forEach(r => { f[r.currency] = (f[r.currency] || 0) + 1; }); const s = Object.entries(f).sort((a, b) => b[1] - a[1]); return s[0]?.[0] || "شيكل"; }
    if (isAccountsTab && selectedAccount) { const nm = selectedAccount.account_name; if (nm.includes("دولار")) return "دولار"; if (nm.includes("دينار")) return "دينار"; }
    return "شيكل";
  }, [rows, isAccountsTab, selectedAccount]);

  const hasMixedCurrencies = useMemo(() => {
    if (displayCurrency === "ILS") return false;
    return rows.some(r => r.isConverted || r.isMismatch);
  }, [rows, displayCurrency]);

  const displayCurrencyLabel = useMemo(() => {
    const entry = DISPLAY_CURRENCIES.find(c => c.value === displayCurrency);
    return entry ? entry.label.replace("عرض بال", "").replace(" (افتراضي)", "") : "شيكل ₪";
  }, [displayCurrency]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (txTypeFilter !== "all") r = r.filter(x => x.transaction_type.includes(txTypeFilter));
    if (txSearch.trim()) r = r.filter(x => multiWordMatchAny(txSearch, x.description, x.reference));
    return r;
  }, [rows, txSearch, txTypeFilter]);

  // ─── RELATED CHEQUES ───
  const relatedCheques = useMemo(() => {
    if (!selectedEntityName) return [];
    return cheques.filter(c => c.party_name === selectedEntityName);
  }, [cheques, selectedEntityName]);

  // ─── AGING ───
  const agingData = useMemo(() => {
    if (!selectedEntityId || isAccountsTab) return null;
    const today = new Date();
    // FIFO net aging: credits (including reverse entries) consume the oldest debit lots first.
    // Anything netted to zero — including a reversed transaction — drops out of the buckets.
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const lots: { date: string; remaining: number }[] = [];
    let creditPool = 0;
    for (const row of sorted) {
      const d = Number(row.debit) || 0;
      const c = Number(row.credit) || 0;
      if (d > 0) lots.push({ date: row.date, remaining: d });
      if (c > 0) creditPool += c;
      // consume oldest debits with available credits
      while (creditPool > 0 && lots.length > 0) {
        const lot = lots[0];
        if (lot.remaining <= creditPool + 1e-6) {
          creditPool -= lot.remaining;
          lots.shift();
        } else {
          lot.remaining -= creditPool;
          creditPool = 0;
        }
      }
    }
    let current = 0, d1_30 = 0, d31_60 = 0, d60plus = 0;
    for (const lot of lots) {
      if (lot.remaining <= 0.005) continue;
      const days = differenceInDays(today, parseISO(lot.date));
      if (days <= 0) current += lot.remaining;
      else if (days <= 30) d1_30 += lot.remaining;
      else if (days <= 60) d31_60 += lot.remaining;
      else d60plus += lot.remaining;
    }
    const total = current + d1_30 + d31_60 + d60plus;
    return total === 0 ? null : { current, d1_30, d31_60, d60plus, total };
  }, [rows, selectedEntityId, isAccountsTab]);

  useEffect(() => { setDetailsMap(prev => ({ ...prev, agingSummary: agingData, companySettings: companyInfo })); }, [agingData, companyInfo]);

  useEffect(() => {
    if (!user || !dataOwnerId || filteredRows.length === 0 || (!statementOptions.showInvoiceDetails && !statementOptions.showVoucherDetails)) {
      setDetailsMap(emptyDetailsMap(companyInfo));
      return;
    }
    let cancelled = false;
    const loadDetailsMap = async () => {
      const refs = Array.from(new Set(filteredRows.map(r => r.reference).filter(Boolean)));
      const invoiceRefs = refs.filter(ref => ref.startsWith("INV-") || ref.startsWith("PO-") || ref.startsWith("PI-"));
      const voucherRefs = refs.filter(ref => ref.startsWith("REC-") || ref.startsWith("PAY-") || ref.startsWith("PV-") || ref.startsWith("QV-") || ref.startsWith("JV-"));
      const invoiceDetailsById: Record<string, StatementInvoiceDetail[]> = {};
      const voucherDetailsById: Record<string, StatementVoucherDetail> = {};

      if (statementOptions.showInvoiceDetails && invoiceRefs.length > 0) {
        const [{ data: saleInvoices }, { data: purchaseInvoices }] = await Promise.all([
          supabase.from("invoices").select("id, invoice_number").eq("user_id", dataOwnerId).in("invoice_number", invoiceRefs),
          supabase.from("purchase_invoices").select("id, invoice_number").eq("user_id", dataOwnerId).in("invoice_number", invoiceRefs),
        ]);
        const saleById: Record<string, string> = {}; (saleInvoices || []).forEach((inv: any) => { saleById[inv.id] = inv.invoice_number; });
        const purchaseById: Record<string, string> = {}; (purchaseInvoices || []).forEach((inv: any) => { purchaseById[inv.id] = inv.invoice_number; });
        const [saleItems, purchaseItems] = await Promise.all([
          Object.keys(saleById).length ? supabase.from("invoice_items").select("invoice_id, product_name, quantity, unit_price, discount, tax_rate, total_amount, unit_of_measure").in("invoice_id", Object.keys(saleById)) : Promise.resolve({ data: [] as any[] }),
          Object.keys(purchaseById).length ? supabase.from("purchase_invoice_items").select("invoice_id, product_name, quantity, unit_price, discount_pct, tax_pct, total_amount, unit").in("invoice_id", Object.keys(purchaseById)) : Promise.resolve({ data: [] as any[] }),
        ]);
        (saleItems.data || []).forEach((it: any) => {
          const ref = saleById[it.invoice_id]; if (!ref) return;
          (invoiceDetailsById[ref] ||= []).push({ productName: it.product_name, quantity: Number(it.quantity || 0), unitPrice: Number(it.unit_price || 0), discount: Number(it.discount || 0), tax: Number(it.tax_rate || 0), total: Number(it.total_amount || 0), unit: it.unit_of_measure });
        });
        (purchaseItems.data || []).forEach((it: any) => {
          const ref = purchaseById[it.invoice_id]; if (!ref) return;
          (invoiceDetailsById[ref] ||= []).push({ productName: it.product_name, quantity: Number(it.quantity || 0), unitPrice: Number(it.unit_price || 0), discount: Number(it.discount_pct || 0), tax: Number(it.tax_pct || 0), total: Number(it.total_amount || 0), unit: it.unit });
        });
      }

      if (statementOptions.showVoucherDetails && voucherRefs.length > 0) {
        const [{ data: receipts }, { data: vouchers }] = await Promise.all([
          supabase.from("receipt_vouchers").select("receipt_number, payment_method, bank_name, check_number, check_date, notes, cash_box_id, bank_account_id").eq("user_id", dataOwnerId).in("receipt_number", voucherRefs),
          supabase.from("vouchers").select("ref_number, payment_method, cheque_bank_name, cheque_number, cheque_due_date, notes, bank_account_id, cash_box_id").eq("user_id", dataOwnerId).in("ref_number", voucherRefs),
        ]);
        // Resolve cash box / bank account UUIDs → human names
        const cashBoxIds = Array.from(new Set([
          ...(receipts || []).map((v: any) => v.cash_box_id).filter(Boolean),
          ...(vouchers || []).map((v: any) => v.cash_box_id).filter(Boolean),
        ]));
        const bankAccountIds = Array.from(new Set([
          ...(receipts || []).map((v: any) => v.bank_account_id).filter(Boolean),
          ...(vouchers || []).map((v: any) => v.bank_account_id).filter(Boolean),
        ]));
        const [{ data: cashBoxesData }, { data: bankAccountsData }] = await Promise.all([
          cashBoxIds.length ? supabase.from("cash_boxes").select("id, name").eq("user_id", dataOwnerId).in("id", cashBoxIds) : Promise.resolve({ data: [] as any[] }),
          bankAccountIds.length ? supabase.from("bank_accounts").select("id, account_name, bank_name").eq("user_id", dataOwnerId).in("id", bankAccountIds) : Promise.resolve({ data: [] as any[] }),
        ]);
        const cashBoxMap: Record<string, string> = {}; (cashBoxesData || []).forEach((b: any) => { cashBoxMap[b.id] = b.name; });
        const bankAccountMap: Record<string, { name: string; bank: string }> = {};
        (bankAccountsData || []).forEach((b: any) => { bankAccountMap[b.id] = { name: b.account_name, bank: b.bank_name }; });
        // Cheque status lookup (already loaded into `cheques` state)
        const chequeStatusByNumber: Record<string, string> = {};
        cheques.forEach(c => { if (c.cheque_number) chequeStatusByNumber[c.cheque_number] = c.status; });

        (receipts || []).forEach((v: any) => {
          const ba = v.bank_account_id ? bankAccountMap[v.bank_account_id] : null;
          voucherDetailsById[v.receipt_number] = {
            paymentMethod: v.payment_method,
            bank: ba?.bank || v.bank_name || null,
            cashBox: v.cash_box_id ? (cashBoxMap[v.cash_box_id] || null) : null,
            chequeNumber: v.check_number,
            chequeDate: v.check_date,
            chequeStatus: v.check_number ? (chequeStatusByNumber[v.check_number] || null) : null,
            notes: v.notes,
          };
        });
        (vouchers || []).forEach((v: any) => {
          const ba = v.bank_account_id ? bankAccountMap[v.bank_account_id] : null;
          voucherDetailsById[v.ref_number] = {
            paymentMethod: v.payment_method,
            bank: ba?.bank || v.cheque_bank_name || null,
            cashBox: v.cash_box_id ? (cashBoxMap[v.cash_box_id] || null) : null,
            chequeNumber: v.cheque_number,
            chequeDate: v.cheque_due_date,
            chequeStatus: v.cheque_number ? (chequeStatusByNumber[v.cheque_number] || null) : null,
            notes: v.notes,
          };
        });
      }

      if (!cancelled) setDetailsMap({ invoiceDetailsById, voucherDetailsById, agingSummary: agingData, companySettings: companyInfo });
    };
    loadDetailsMap();
    return () => { cancelled = true; };
  }, [user, filteredRows, statementOptions.showInvoiceDetails, statementOptions.showVoucherDetails, agingData, companyInfo, cheques]);

  const statementRowsWithDetails = useMemo(() => {
    return filteredRows.flatMap((row) => {
      const nested: StatementRow[] = [];
      if (statementOptions.showInvoiceDetails) {
        const items = detailsMap.invoiceDetailsById[row.reference] || [];
        if (items.length > 0) {
          nested.push({
            ...row,
            transaction_id: `${row.transaction_id}-invoice-table`,
            description: "",
            debit: 0,
            credit: 0,
            isLineItem: true,
            lineItemDetail: "invoice-table",
            invoiceItems: items,
          });
        }
      }
      if (statementOptions.showVoucherDetails) {
        const detail = detailsMap.voucherDetailsById[row.reference];
        if (detail) {
          nested.push({
            ...row,
            transaction_id: `${row.transaction_id}-voucher-table`,
            description: "",
            debit: 0,
            credit: 0,
            isLineItem: true,
            lineItemDetail: "voucher-table",
            voucherDetail: detail,
            voucherKind: getTypeBadge(row.transaction_type),
            voucherAmount: row.debit + row.credit,
          });
        }
      }
      return [row, ...nested];
    });
  }, [filteredRows, statementOptions.showInvoiceDetails, statementOptions.showVoucherDetails, detailsMap]);

  // ─── YEAR COMPARISON ───
  const yearComparisonData = useMemo(() => {
    if (!showYearComparison || !selectedEntityId || !dateFrom || !dateTo) return null;

    const fromDate = parseISO(dateFrom);
    const toDate = parseISO(dateTo);
    const prevFrom = format(subYears(fromDate, 1), "yyyy-MM-dd");
    const prevTo = format(subYears(toDate, 1), "yyyy-MM-dd");
    const currentYear = fromDate.getFullYear();
    const prevYear = currentYear - 1;

    let related: Transaction[];
    let resolveDebitCredit: (tx: Transaction) => { isDebit: boolean; isCredit: boolean };

    if (isAccountsTab && selectedAccount) {
      const code = selectedAccount.account_code;
      related = transactions.filter(tx => tx.debit_account_code === code || tx.credit_account_code === code);
      resolveDebitCredit = (tx) => ({ isDebit: tx.debit_account_code === code, isCredit: tx.credit_account_code === code });
    } else if (isEmployeesTab && selectedEmployee?.account_code) {
      const code = selectedEmployee.account_code;
      related = transactions.filter(tx => tx.debit_account_code === code || tx.credit_account_code === code);
      resolveDebitCredit = (tx) => ({ isDebit: tx.debit_account_code === code, isCredit: tx.credit_account_code === code });
    } else {
      const contactName = selectedContact?.contact_name?.trim() || "";
      const sameNameIds = new Set(contacts.filter(c => c.contact_name?.trim() === contactName).map(c => c.id));
      const contactAccountRoots = ["113", "211", "2180", "1146"];
      const matchesContactAccount = (code: string | null | undefined) =>
        !!code && contactAccountRoots.some(root => code === root || code.startsWith(root));
      related = transactions.filter(tx => (tx.contact_id && sameNameIds.has(tx.contact_id)) || (!tx.contact_id && contactName && tx.description?.includes(contactName)));
      resolveDebitCredit = (tx) => ({ isDebit: matchesContactAccount(tx.debit_account_code), isCredit: matchesContactAccount(tx.credit_account_code) });
    }

    let curDebit = 0, curCredit = 0, curCount = 0;
    let prevDebit = 0, prevCredit = 0, prevCount = 0;

    for (const tx of related) {
      const { isDebit, isCredit } = resolveDebitCredit(tx);
      if (!isDebit && !isCredit) continue;
      const amt = tx.amount || 0;
      if (tx.transaction_date >= dateFrom && tx.transaction_date <= dateTo) {
        curCount++;
        if (isDebit) curDebit += amt;
        if (isCredit) curCredit += amt;
      } else if (tx.transaction_date >= prevFrom && tx.transaction_date <= prevTo) {
        prevCount++;
        if (isDebit) prevDebit += amt;
        if (isCredit) prevCredit += amt;
      }
    }

    const curNet = curDebit - curCredit;
    const prevNet = prevDebit - prevCredit;
    const debitChange = prevDebit > 0 ? ((curDebit - prevDebit) / prevDebit) * 100 : curDebit > 0 ? 100 : 0;
    const creditChange = prevCredit > 0 ? ((curCredit - prevCredit) / prevCredit) * 100 : curCredit > 0 ? 100 : 0;
    const netChange = prevNet !== 0 ? ((curNet - prevNet) / Math.abs(prevNet)) * 100 : curNet !== 0 ? 100 : 0;

    return {
      currentYear, prevYear,
      currentPeriod: `${fmtDate(dateFrom)} - ${fmtDate(dateTo)}`,
      prevPeriod: `${fmtDate(prevFrom)} - ${fmtDate(prevTo)}`,
      curDebit, curCredit, curNet, curCount,
      prevDebit, prevCredit, prevNet, prevCount,
      debitChange, creditChange, netChange,
    };
  }, [showYearComparison, selectedEntityId, dateFrom, dateTo, transactions, isAccountsTab, isEmployeesTab, selectedAccount, selectedEmployee, selectedContact, contacts]);

  // ─── EXPORT ───
  const handleExport = () => {
    if (!filteredRows.length || !selectedEntityName) return;
    const currencyDisplayName = displayCurrency !== "ILS"
      ? (DISPLAY_CURRENCIES.find(c => c.value === displayCurrency)?.label.replace("عرض ب", "").replace(" (افتراضي)", "") || statementCurrency)
      : statementCurrency;
    const currencySymbol = getCurrencySymbol(statementCurrency);
    const periodLabel = `${dateFrom ? fmtDate(dateFrom) : "—"}  →  ${dateTo ? fmtDate(dateTo) : "—"}`;

    // Build columns dynamically based on viewOptions (single source of truth)
    type ColDef = { key: string; label: string; width: number; value: (r: typeof filteredRows[number]) => string | number };
    const cols: ColDef[] = [
      { key: "date", label: "التاريخ", width: 12, value: (r) => fmtDate(r.date) },
      ...(statementOptions.showReference ? [{ key: "reference", label: "المرجع", width: 18, value: (r) => r.reference || "—" } as ColDef] : []),
      { key: "description", label: "البيان", width: 38, value: (r) => r.description },
      ...(statementOptions.showDueDate ? [{ key: "due", label: "الاستحقاق", width: 12, value: (r) => r.dueDate ? fmtDate(r.dueDate) : "—" } as ColDef] : []),
      ...(statementOptions.showType ? [{ key: "type", label: "النوع", width: 14, value: (r) => getTypeBadge(r.transaction_type) } as ColDef] : []),
      { key: "debit", label: `مدين (${currencySymbol})`, width: 16, value: (r) => r.debit || "" },
      { key: "credit", label: `دائن (${currencySymbol})`, width: 16, value: (r) => r.credit || "" },
      { key: "balance", label: `الرصيد (${currencySymbol})`, width: 18, value: (r) => r.balance },
    ];

    const header = [cols.map(c => c.label)];
    const data = statementRowsWithDetails.map(r => cols.map(c => c.value(r)));
    const totalsRow = cols.map(c => {
      if (c.key === "description") return "الإجمالي";
      if (c.key === "debit") return totalDebit;
      if (c.key === "credit") return totalCredit;
      if (c.key === "balance") return closingBalance;
      return "";
    });

    const sheet: (string | number)[][] = [...header, ...data, [], totalsRow];

    // Append aging analysis if enabled
    if (statementOptions.showAging && agingData) {
      sheet.push([], ["تحليل التقادم (Aging)"]);
      sheet.push(["جاري", "1-30 يوم", "31-60 يوم", "+60 يوم", "الإجمالي"]);
      sheet.push([agingData.current, agingData.d1_30, agingData.d31_60, agingData.d60plus, agingData.total]);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheet);
    ws["!cols"] = cols.map(c => ({ wch: c.width }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف الحساب");
    setNextExportBranding({
      title: `كشف حساب: ${selectedEntityName}${selectedEntityCode ? ` (${selectedEntityCode})` : ""}`,
      currency: `${currencyDisplayName} (${currencySymbol})`,
      period: periodLabel,
    });
    XLSX.writeFile(wb, `كشف-حساب-${selectedEntityName}-${currencyDisplayName}.xlsx`);
  };

  const selectEntity = (id: string) => setSelectedEntityId(id);

  // ─── PDF PREVIEW ───
  const handlePreviewPDF = useCallback(() => {
    if (!selectedEntityId || rows.length === 0) return;
    setShowPdfModal(true);
  }, [selectedEntityId, rows]);

  const handleDownloadPDF = useCallback(async () => {
    if (!selectedEntityId || filteredRows.length === 0) return;
    setPdfGenerating(true);
    try {
      const entityType = isAccountsTab ? "حساب" : isEmployeesTab ? "موظف" : activeTab === "customers" ? "عميل" : "مورد";
      const entityPhone = isAccountsTab ? undefined : isEmployeesTab ? selectedEmployee?.phone || undefined : selectedContact?.phone || undefined;
      const entityCode = isAccountsTab ? selectedAccount?.account_code : isEmployeesTab ? selectedEmployee?.account_code || undefined : selectedContact?.linked_account_code || undefined;

      const doc = generateStatementPDF(
        {
          entityName: selectedEntityName,
          entityType,
          entityPhone,
          entityCode,
          dateFrom,
          dateTo,
          statementNumber: stableSOANumber,
          currency: statementCurrency,
          openingBalance,
          closingBalance,
          totalDebit,
          totalCredit,
          rows: statementRowsWithDetails.map(r => ({
            date: r.date,
            description: r.description,
            reference: r.reference,
            debit: r.debit,
            credit: r.credit,
            balance: r.balance,
            dueDate: r.dueDate,
            transaction_type: r.transaction_type,
            isLineItem: r.isLineItem,
          })),
          agingData,
          detailsMap,
        },
        {
          name: companyInfo.name,
          phone: companyInfo.phone,
          email: companyInfo.email,
          address: companyInfo.address,
          tax_number: companyInfo.tax_number,
          logo_url: companyInfo.logo_url,
        },
        {
          showReference: statementOptions.showReference,
          showDueDate: statementOptions.showDueDate,
          showType: statementOptions.showType,
          showCompanyLogo: statementOptions.showCompanyLogo,
          showContactInfo: statementOptions.showContactInfo,
          showSignature: statementOptions.showSignature,
          showAging: statementOptions.showAging,
        }
      );

      doc.save(`كشف-حساب-${selectedEntityName}-${dateFrom}.pdf`);
      toast({ title: "تم تحميل PDF بنجاح ✓" });
    } catch (err) {
      console.error("PDF download error:", err);
      toast({ title: "خطأ في تحميل PDF", variant: "destructive" });
    } finally {
      setPdfGenerating(false);
    }
  }, [selectedEntityId, selectedEntityName, filteredRows, statementRowsWithDetails, dateFrom, dateTo, statementCurrency, openingBalance, closingBalance, totalDebit, totalCredit, agingData, detailsMap, companyInfo, isAccountsTab, isEmployeesTab, activeTab, selectedAccount, selectedEmployee, selectedContact, statementOptions, toast]);

  const handlePrintStatement = useCallback(() => {
    if (!selectedEntityId || filteredRows.length === 0) return;
    const html = buildAccountStatementPrintHTML({
      company: {
        name: companyInfo.name || "AMWALI",
        logo_url: companyInfo.logo_url,
        address: companyInfo.address,
        phone: companyInfo.phone,
        email: companyInfo.email,
        tax_number: companyInfo.tax_number,
      },
      contact: {
        name: selectedEntityName,
        type: selectedContact?.contact_type || (isEmployeesTab ? "موظف" : isAccountsTab ? "حساب" : ""),
        code: selectedEntityCode,
        phone: selectedContact?.phone || "",
      },
      rows: filteredRows.map((r) => ({
        date: r.date,
        description: r.description,
        transaction_type: r.transaction_type,
        reference: r.reference,
        debit: r.debit,
        credit: r.credit,
        balance: r.balance,
        transaction_id: r.transaction_id,
        dueDate: r.dueDate,
      })),
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance,
      dateFrom,
      dateTo,
      statementNumber: stableSOANumber,
      currencyLabel: statementCurrency || "شيكل إسرائيلي (₪)",
      currencySymbol: getCurrencySymbol(statementCurrency || "شيكل"),
      includeInvoiceDetails: !!statementOptions.showInvoiceDetails,
      invoiceDetailsByRef: detailsMap.invoiceDetailsById || {},
      showReference: !!statementOptions.showReference,
      showDueOrType: !!(statementOptions.showDueDate || statementOptions.showType),
    });
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch {} }, 700);
  }, [
    selectedEntityId, selectedEntityName, selectedEntityCode, selectedContact,
    isEmployeesTab, isAccountsTab,
    filteredRows, openingBalance, totalDebit, totalCredit, closingBalance,
    dateFrom, dateTo, stableSOANumber, statementCurrency,
    companyInfo, statementOptions, detailsMap,
  ]);

  // Balance color helper
  const balColor = (val: number) => {
    if (val === 0) return "#6B7280";
    const isNormal = val > 0 ? isDebitNature : !isDebitNature;
    return isNormal ? "#059669" : "#DC2626";
  };

  // ─── RENDER ───
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 52px)", overflow: "hidden" }} dir="rtl">
      {/* ═══ TOOLBAR ═══ */}
      <div className="shrink-0 border-b" style={{ borderColor: "#E5E7EB", padding: "10px 24px", background: "white" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* LEFT: breadcrumb + entity */}
            <div className="flex items-center gap-3">
            {(() => {
              const fromCode = new URLSearchParams(window.location.search).get("code");
              const backTo = fromCode ? "/trial-balance" : "/apps";
              return (
                <button onClick={() => navigate(backTo)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <ArrowRight className="w-5 h-5" style={{ color: "#374151" }} />
                </button>
              );
            })()}
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "#6B7280" }}>
              {new URLSearchParams(window.location.search).get("code") ? (
                <>
                  <button onClick={() => navigate("/apps")} className="hover:underline cursor-pointer">المحاسبة</button>
                  <ChevronLeft className="w-3 h-3" />
                  <button onClick={() => navigate("/trial-balance")} className="hover:underline cursor-pointer">ميزان المراجعة</button>
                  <ChevronLeft className="w-3 h-3" />
                  <span className="font-bold text-sm" style={{ color: "#111827" }}>كشف الحساب</span>
                </>
              ) : (
                <>
                  <span>المحاسبة</span>
                  <ChevronLeft className="w-3 h-3" />
                  <span className="font-bold text-sm" style={{ color: "#111827" }}>كشف الحساب</span>
                </>
              )}
            </div>
            {selectedEntityId && (
              <div className="flex items-center gap-2 mr-3 px-3 py-1.5 rounded-lg" style={{ background: "#F3F4F6" }}>
                <span className="text-sm">{selectedEntityEmoji}</span>
                <span className="text-sm font-semibold" style={{ color: "#111827" }}>{selectedEntityName}</span>
                {selectedEntityCode && <span className="text-xs" style={{ color: "#6B7280" }}>— {selectedEntityCode}</span>}
                {displayCurrency !== "ILS" && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#DBEAFE", color: "#1E40AF", fontWeight: 600 }}>— {displayCurrencyLabel}</span>}
                <button onClick={() => setSelectedEntityId("")} className="text-xs underline mr-1" style={{ color: "#1E40AF" }}>تغيير</button>
              </div>
            )}
          </div>

          {/* RIGHT: dates + actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 rounded-lg px-2 py-1" style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
              <RtlDateField label="من" ariaLabel="من تاريخ" value={dateFrom} onChange={(v) => { setDateFrom(v); setActivePeriod(""); }} />
              <div className="w-px h-4" style={{ background: "#D1D5DB" }} />
              <RtlDateField label="إلى" ariaLabel="إلى تاريخ" value={dateTo} onChange={(v) => { setDateTo(v); setActivePeriod(""); }} />
            </div>
            <StatementViewOptionsPanel value={statementOptions} onChange={setStatementOptions} />
            <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading} className="h-8 w-8">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button variant="outline" size="sm" onClick={handlePreviewPDF} disabled={!selectedEntityId || rows.length === 0 || pdfGenerating} className="h-8 gap-1.5 text-xs">
              {pdfGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              معاينة PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrintStatement} disabled={!selectedEntityId || rows.length === 0} className="h-8 gap-1.5 text-xs">
              <Printer className="w-3.5 h-3.5" /> طباعة
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!selectedEntityId || filteredRows.length === 0} className="h-8 gap-1.5 text-xs">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!selectedEntityId || filteredRows.length === 0} className="h-8 gap-1.5 text-xs">
                  <Send className="w-3.5 h-3.5" /> إرسال <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { if (selectedContact?.phone) { const msg = `كشف حساب - ${selectedEntityName}\nالرصيد: ${fmtAmount(closingBalance, statementCurrency)}`; window.open(`https://wa.me/${selectedContact.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}`); } }} disabled={!selectedContact?.phone}>
                  <MessageSquare className="w-4 h-4 ml-2 text-emerald-500" /> واتساب
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { if (selectedContact?.email) window.open(`mailto:${selectedContact.email}?subject=${encodeURIComponent(`كشف حساب - ${selectedEntityName}`)}`); }} disabled={!selectedContact?.email}>
                  <Mail className="w-4 h-4 ml-2 text-blue-500" /> إيميل
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto" style={{ background: "#F9FAFB", padding: "24px" }}>
        {/* Search bar when no entity selected */}
        {!selectedEntityId && (
          <div className="max-w-3xl mx-auto mb-6">
            <AdvancedEntitySearch
              entityList={[]}
              allContacts={contacts}
              allAccounts={accounts}
              allEmployees={employeeEntities}
              accountBalances={accountBalances}
              contactBalances={contactBalances}
              employeeBalances={employeeBalances}
              accountTxCounts={accountTxCounts}
              contactTxCounts={contactTxCounts}
              employeeTxCounts={employeeTxCounts}
              selectedEntityId={selectedEntityId}
              activeTab={activeTab}
              onSelect={(id, tab) => { if (tab) setActiveTab(tab as EntityTab); selectEntity(id); }}
              onClear={() => setSelectedEntityId("")}
              onTabFilter={(tab) => { setActiveTab(tab as EntityTab); setSelectedEntityId(""); }}
              loading={loading}
            />
          </div>
        )}

        {!selectedEntityId && (
          <div className="flex items-center justify-center py-32">
            <div className="text-center space-y-4">
              <Search className="w-12 h-12 mx-auto" style={{ color: "#D1D5DB" }} />
              <p className="text-sm font-medium" style={{ color: "#6B7280" }}>ابحث عن جهة لعرض كشف حسابها</p>
            </div>
          </div>
        )}

        {selectedEntityId && (
          <>
            {/* ─── MIXED CURRENCY WARNING ─── */}
            {hasMixedCurrencies && (
              <div className="rounded-lg mb-3 flex items-start gap-2" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", padding: "10px 16px" }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#D97706" }} />
                <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
                  <strong>تحذير:</strong> هذا الكشف يحتوي حركات بعملات مختلفة. الحركات غير المقيّمة بال{displayCurrencyLabel.split(" ")[0]} محوّلة بسعر صرف اليوم أو معروضة بالشيكل. الرصيد الإجمالي غير دقيق محاسبياً.
                </div>
              </div>
            )}

            {/* ─── FOREIGN DISPLAY NOTE ─── */}
            {displayCurrency !== "ILS" && !hasMixedCurrencies && (
              <div className="rounded-lg mb-3 flex items-center gap-2" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", padding: "8px 16px" }}>
                <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: "#2563EB" }} />
                <span style={{ fontSize: 11, color: "#1E40AF" }}>الكشف معروض بال{displayCurrencyLabel.split(" ")[0]}. الحركات المحوّلة محتسبة بسعر صرف يوم القيد (أو سعر اليوم إن لم يُحفظ سعر تاريخي).</span>
              </div>
            )}

            {/* ─── SUMMARY LINE ─── */}
            <div className="rounded-lg mb-4" style={{ background: "white", border: "1px solid #E5E7EB", padding: "12px 20px" }}>
              <div className="flex items-center gap-8 flex-wrap text-[13px]">
                <div><span style={{ color: "#6B7280" }}>رصيد افتتاحي: </span><span style={{ color: "#111827", fontWeight: 600 }}>{fmtAmount(openingBalance, statementCurrency)}</span></div>
                <div><span style={{ color: "#6B7280" }}>مدين: </span><span style={{ color: "#1E40AF", fontWeight: 600 }}>{hasMixedCurrencies ? "—" : fmtAmount(totalDebit, statementCurrency)}</span></div>
                <div><span style={{ color: "#6B7280" }}>دائن: </span><span style={{ color: "#065F46", fontWeight: 600 }}>{hasMixedCurrencies ? "—" : fmtAmount(totalCredit, statementCurrency)}</span></div>
                <div className="mr-auto">
                  {hasMixedCurrencies ? (
                    <span style={{ color: "#D97706", fontWeight: 600, fontSize: 12 }}>⚠️ عملات مختلطة — لا يمكن احتساب رصيد إجمالي</span>
                  ) : (
                    <><span style={{ color: "#6B7280" }}>الرصيد: </span><span style={{ color: balColor(closingBalance), fontWeight: 700, fontSize: 15 }}>{fmtAmount(closingBalance, statementCurrency)}</span><span className="text-[11px] mr-1" style={{ color: "#6B7280" }}>{closingBalance > 0 ? "(مدين)" : closingBalance < 0 ? "(دائن)" : ""}</span></>
                  )}
                </div>
              </div>
            </div>

            {/* ─── FILTER BAR ─── */}
            <div className="rounded-lg mb-4" style={{ background: "white", border: "1px solid #E5E7EB", padding: "10px 16px" }}>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Quick periods */}
                <div className="flex items-center gap-1">
                  {QUICK_PERIODS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => { setDateFrom(p.from()); setDateTo(p.to()); setActivePeriod(p.label); }}
                      className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
                      style={{
                        color: activePeriod === p.label ? "#1E40AF" : "#6B7280",
                        background: activePeriod === p.label ? "#EFF6FF" : "transparent",
                        borderBottom: activePeriod === p.label ? "2px solid #1E40AF" : "2px solid transparent",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="w-px h-5" style={{ background: "#E5E7EB" }} />

                {/* Currency display mode */}
                <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
                  <SelectTrigger className="h-7 w-40 text-[11px] border-gray-200"><SelectValue /></SelectTrigger>
                  <SelectContent>{DISPLAY_CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>

                {/* Type filter */}
                <Select value={txTypeFilter} onValueChange={setTxTypeFilter}>
                  <SelectTrigger className="h-7 w-32 text-[11px] border-gray-200"><SelectValue /></SelectTrigger>
                  <SelectContent>{TX_TYPE_FILTERS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>

                {/* Search */}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#9CA3AF" }} />
                  <input
                    value={txSearch}
                    onChange={e => setTxSearch(e.target.value)}
                    placeholder="بحث في الحركات..."
                    className="w-full h-7 pr-8 pl-3 rounded text-[11px] outline-none"
                    style={{ border: "1px solid #E5E7EB", background: "#F9FAFB" }}
                  />
                </div>

                {/* Year comparison toggle */}
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px]" style={{ color: "#6B7280" }}>
                  <input type="checkbox" checked={showYearComparison} onChange={e => setShowYearComparison(e.target.checked)} className="rounded" />
                  مقارنة سنوية
                </label>
              </div>
            </div>

            {/* ─── TRANSACTIONS TABLE ─── */}
            <div className="rounded-lg overflow-hidden mb-4" style={{ background: "white", border: "1px solid #E5E7EB" }}>
              {(() => {
                const screenCols: Array<{ key: string; label: string; width: string }> = [
                  { key: "date", label: "التاريخ", width: "10%" },
                  ...(statementOptions.showReference ? [{ key: "reference", label: "المرجع", width: "13%" }] : []),
                  { key: "description", label: "البيان", width: statementOptions.showReference ? "25%" : "38%" },
                  ...(statementOptions.showDueDate ? [{ key: "due", label: "الاستحقاق", width: "9%" }] : []),
                  ...(statementOptions.showType ? [{ key: "type", label: "النوع", width: "9%" }] : []),
                  { key: "debit", label: "مدين (عليه)", width: "11%" },
                  { key: "credit", label: "دائن (له)", width: "11%" },
                  { key: "balance", label: "الرصيد", width: "12%" },
                ];
                const colSpan = screenCols.length;
                return (
              <table className="w-full" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  {screenCols.map(c => <col key={c.key} style={{ width: c.width }} />)}
                </colgroup>
                <thead>
                  <tr style={{ background: "#F3F4F6", borderBottom: "2px solid #E5E7EB" }}>
                    {screenCols.map(c => (
                      <th key={c.key} className="text-right" style={{ padding: "10px 12px", fontSize: 11, fontWeight: 600, color: "#374151", whiteSpace: "normal", wordBreak: "keep-all" }}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                    {screenCols.map(c => {
                      if (c.key === "date") return <td key={c.key} style={{ padding: "8px 12px", fontSize: 11, color: "#6B7280", fontStyle: "italic" }}>{fmtDate(dateFrom)}</td>;
                      if (c.key === "reference") return <td key={c.key} style={{ padding: "8px 12px", fontSize: 11, color: "#6B7280" }}>—</td>;
                      if (c.key === "description") return <td key={c.key} style={{ padding: "8px 12px", fontSize: 11, color: "#6B7280", fontStyle: "italic" }}>رصيد أول المدة</td>;
                      if (c.key === "debit") return <td key={c.key} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#1E40AF", textAlign: "left", direction: "ltr" }}>{openingBalance > 0 ? fmtAmount(openingBalance, statementCurrency) : "—"}</td>;
                      if (c.key === "credit") return <td key={c.key} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#065F46", textAlign: "left", direction: "ltr" }}>{openingBalance < 0 ? fmtAmount(openingBalance, statementCurrency) : "—"}</td>;
                      if (c.key === "balance") return <td key={c.key} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: balColor(openingBalance), textAlign: "left", direction: "ltr" }}>{fmtAmount(openingBalance, statementCurrency)}</td>;
                      return <td key={c.key} style={{ padding: "8px 12px" }} />;
                    })}
                  </tr>

                  {loading ? (
                    <tr><td colSpan={colSpan} style={{ textAlign: "center", padding: 40, color: "#9CA3AF", fontSize: 13 }}><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />جاري التحميل...</td></tr>
                  ) : filteredRows.length === 0 ? (
                    <tr><td colSpan={colSpan} style={{ textAlign: "center", padding: 40, color: "#9CA3AF", fontSize: 13 }}>لا توجد حركات في هذه الفترة</td></tr>
                  ) : (
                    statementRowsWithDetails.map((row, i) => {
                      // ─── Nested Invoice Items Table (Document-aware) ───
                      if (row.lineItemDetail === "invoice-table" && row.invoiceItems && row.invoiceItems.length > 0) {
                        const items = row.invoiceItems;
                        const isSingle = items.length === 1;
                        const cardStyle: React.CSSProperties = {
                          background: "#F8FAFC",
                          borderRight: "3px solid #0D1B2E",
                          borderRadius: 8,
                          padding: "8px 12px",
                          margin: "4px 32px 8px 8px",
                        };
                        const headerStyle: React.CSSProperties = {
                          fontSize: 10,
                          color: "#FFFFFF",
                          fontWeight: 700,
                          marginBottom: 8,
                          padding: "6px 10px",
                          background: "#0D1B2E",
                          borderRadius: 6,
                        };
                        const chipStyle: React.CSSProperties = {
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          background: "#FFFFFF",
                          border: "1px solid #E2E8F0",
                          borderRadius: 6,
                          padding: "3px 8px",
                          fontSize: 10.5,
                          marginLeft: 6,
                          marginBottom: 3,
                        };
                        const chipLabel: React.CSSProperties = { color: "#94A3B8", fontWeight: 600, fontSize: 9.5 };
                        const chipValue: React.CSSProperties = { color: "#1F2937", fontWeight: 600, fontFamily: "tabular-nums", direction: "ltr" };
                        if (isSingle) {
                          const it = items[0];
                          return (
                            <tr key={row.transaction_id + "-" + i}>
                              <td colSpan={colSpan} style={{ padding: 0 }}>
                                <div style={cardStyle}>
                                   <div style={headerStyle}>
                                    تفاصيل الفاتورة <span style={{ fontFamily: "monospace", color: "#FFFFFF" }}>{row.reference}</span> · 1 صنف
                                  </div>
                                  <div style={{ display: "flex", flexWrap: "wrap" }}>
                                    <span style={{ ...chipStyle, background: "#0D1B2E", borderColor: "#0D1B2E", color: "#fff", fontWeight: 700 }}>
                                      {it.productName || "—"}
                                    </span>
                                    <span style={chipStyle}>
                                      <span style={chipLabel}>الكمية:</span>
                                      <span style={chipValue}>{it.quantity}{it.unit ? ` ${it.unit}` : ""}</span>
                                    </span>
                                    <span style={chipStyle}>
                                      <span style={chipLabel}>السعر:</span>
                                      <span style={chipValue}>{fmtAmount(it.unitPrice, row.currency)}</span>
                                    </span>
                                    <span style={{ ...chipStyle, ...(it.discount > 0 ? { background: "#FEF3C7", borderColor: "#FDE68A" } : {}) }}>
                                      <span style={chipLabel}>الخصم:</span>
                                      <span style={{ ...chipValue, color: it.discount > 0 ? "#B45309" : "#CBD5E1" }}>
                                        {it.discount > 0 ? it.discount : "—"}
                                      </span>
                                    </span>
                                    <span style={chipStyle}>
                                      <span style={chipLabel}>الضريبة:</span>
                                      <span style={{ ...chipValue, color: "#475569" }}>{it.tax > 0 ? `${it.tax}%` : "—"}</span>
                                    </span>
                                    <span style={{ ...chipStyle, background: "#ECFDF5", borderColor: "#A7F3D0" }}>
                                      <span style={chipLabel}>الإجمالي:</span>
                                      <span style={{ ...chipValue, color: "#065F46", fontWeight: 700 }}>{fmtAmount(it.total, row.currency)}</span>
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                        const subtotal = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
                        return (
                          <tr key={row.transaction_id + "-" + i}>
                            <td colSpan={colSpan} style={{ padding: 0 }}>
                              <div style={cardStyle}>
                                <div style={headerStyle}>
                                  تفاصيل الفاتورة <span style={{ fontFamily: "monospace", color: "#FFFFFF" }}>{row.reference}</span> · {items.length} أصناف
                                </div>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, background: "#fff", borderRadius: 6, overflow: "hidden", border: "1px solid #E2E8F0" }}>
                                  <thead>
                                    <tr style={{ background: "#0D1B2E", borderBottom: "1px solid #0D1B2E" }}>
                                      <th style={{ textAlign: "right", padding: "5px 8px", fontWeight: 700, color: "#FFFFFF", fontSize: 10 }}>الصنف</th>
                                      <th style={{ textAlign: "center", padding: "5px 8px", fontWeight: 700, color: "#FFFFFF", fontSize: 10, width: 60 }}>كمية</th>
                                      <th style={{ textAlign: "left", padding: "5px 8px", fontWeight: 700, color: "#FFFFFF", fontSize: 10, width: 80 }}>سعر</th>
                                      <th style={{ textAlign: "left", padding: "5px 8px", fontWeight: 700, color: "#FFFFFF", fontSize: 10, width: 60 }}>خصم</th>
                                      <th style={{ textAlign: "left", padding: "5px 8px", fontWeight: 700, color: "#FFFFFF", fontSize: 10, width: 55 }}>ضريبة</th>
                                      <th style={{ textAlign: "left", padding: "5px 8px", fontWeight: 700, color: "#FFFFFF", fontSize: 10, width: 90 }}>إجمالي</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((it, idx) => (
                                      <tr key={idx} style={{ background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC", borderBottom: idx === items.length - 1 ? "none" : "1px solid #F1F5F9" }}>
                                        <td style={{ padding: "3px 8px", color: "#1F2937", fontSize: 10.5 }}>{it.productName || "—"}</td>
                                        <td style={{ padding: "3px 8px", textAlign: "center", color: "#475569", fontFamily: "tabular-nums", fontSize: 10.5 }}>
                                          {it.quantity}{it.unit ? <span style={{ color: "#94A3B8", fontSize: 9, marginRight: 2 }}>{it.unit}</span> : null}
                                        </td>
                                        <td style={{ padding: "3px 8px", textAlign: "left", direction: "ltr", color: "#475569", fontFamily: "tabular-nums", fontSize: 10.5 }}>{fmtAmount(it.unitPrice, row.currency)}</td>
                                        <td style={{ padding: "3px 8px", textAlign: "left", direction: "ltr", color: it.discount > 0 ? "#B45309" : "#CBD5E1", fontFamily: "tabular-nums", fontSize: 10.5 }}>{it.discount > 0 ? `${it.discount}` : "—"}</td>
                                        <td style={{ padding: "3px 8px", textAlign: "left", direction: "ltr", color: "#64748B", fontFamily: "tabular-nums", fontSize: 10.5 }}>{it.tax > 0 ? `${it.tax}%` : "—"}</td>
                                        <td style={{ padding: "3px 8px", textAlign: "left", direction: "ltr", color: "#065F46", fontFamily: "tabular-nums", fontWeight: 600, fontSize: 10.5 }}>{fmtAmount(it.total, row.currency)}</td>
                                      </tr>
                                    ))}
                                    <tr style={{ background: "#ECFDF5" }}>
                                      <td colSpan={5} style={{ padding: "4px 8px", textAlign: "left", fontSize: 10, color: "#475569", fontWeight: 600 }}>الإجمالي</td>
                                      <td style={{ padding: "4px 8px", textAlign: "left", direction: "ltr", color: "#065F46", fontFamily: "tabular-nums", fontWeight: 700, fontSize: 11 }}>{fmtAmount(subtotal, row.currency)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      // ─── Nested Voucher Detail Table (Document-aware) ───
                      if (row.lineItemDetail === "voucher-table" && row.voucherDetail) {
                        const d = row.voucherDetail;
                        const isCheque = d.paymentMethod === "cheque" || d.paymentMethod === "check" || !!d.chequeNumber;
                        const chequeStatusMap: Record<string, string> = {
                          registered: "مسجل", deferred: "مؤجل", due: "مستحق",
                          deposited: "مودع بالبنك", under_collection: "برسم التحصيل",
                          collected: "محصّل", endorsed: "مجيّر لمورد",
                          returned: "مرتجع", return_to_customer: "مرتجع للعميل", rejected: "مرفوض",
                          paid: "مدفوع", cancelled: "ملغى",
                        };
                        const accountValue = isCheque ? (d.bank || "—") : (d.cashBox || d.bank || "—");
                        const accountLabel = isCheque ? "البنك" : (d.cashBox ? "صندوق" : (d.bank ? "البنك" : null));
                        const railStyle: React.CSSProperties = {
                          borderRight: "2px solid #CBD5E1",
                          background: "#F8FAFC",
                          marginRight: 32,
                          padding: "5px 12px 6px",
                          borderRadius: "0 4px 4px 0",
                        };
                        return (
                          <tr key={row.transaction_id + "-" + i}>
                            <td colSpan={colSpan} style={{ padding: "0 8px 6px" }}>
                              <div style={railStyle}>
                                <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, marginLeft: 6 }}>تفاصيل {row.reference}:</span>
                                <span style={{ fontSize: 11, color: "#1F2937", fontWeight: 600 }}>{paymentMethodLabel(d.paymentMethod)}</span>
                                {accountLabel && accountValue !== "—" && (
                                  <span style={{ fontSize: 10.5, color: "#6B7280" }}> · {accountLabel}: {accountValue}</span>
                                )}
                                {isCheque && d.chequeNumber && (
                                  <>
                                    <span style={{ fontSize: 10.5, color: "#6B7280" }}> · شيك </span>
                                    <span style={{ fontSize: 10.5, color: "#1F2937", fontWeight: 600, fontFamily: "monospace" }}>{d.chequeNumber}</span>
                                    {d.chequeDate && <span style={{ fontSize: 10.5, color: "#6B7280" }}> · استحقاق {fmtDate(d.chequeDate)}</span>}
                                    {d.chequeStatus && (
                                      <span style={{ fontSize: 10, color: "#92400E", background: "#FEF3C7", padding: "1px 6px", borderRadius: 3, marginRight: 6, fontWeight: 600 }}>
                                        {chequeStatusMap[d.chequeStatus] || d.chequeStatus}
                                      </span>
                                    )}
                                  </>
                                )}
                                {d.notes && (
                                  <div style={{ fontSize: 10, color: "#64748B", marginTop: 3, lineHeight: 1.4 }}>
                                    <span style={{ color: "#94A3B8", fontWeight: 600 }}>ملاحظات: </span>{d.notes}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      return (
                      <tr key={row.transaction_id + "-" + i} style={{ borderBottom: "1px solid #F3F4F6", cursor: row.isLineItem ? "default" : "pointer", background: row.isLineItem ? "#F9FAFB" : row.isCancelled ? "#F9FAFB" : undefined, opacity: row.isCancelled ? 0.7 : 1 }} className={row.isLineItem ? "" : "hover:bg-gray-50 transition-colors group"} onClick={() => { if (!row.isLineItem) { setDrawerRow(row); setDrawerOpen(true); } }}>
                        {screenCols.map(c => {
                          if (c.key === "date") return (
                            <td key={c.key} style={{ padding: "8px 12px", fontSize: 11, color: "#374151" }}>
                          <div>{fmtDate(row.date)}</div>
                          <div style={{ fontSize: 9, color: "#9CA3AF" }}>{getDayName(row.date)}</div>
                            </td>
                          );
                          if (c.key === "reference") return (
                            <td key={c.key} style={{ padding: "8px 12px", fontSize: 11, fontFamily: "monospace", wordBreak: "break-all" }}>
                          {row.reference ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDrawerRow(row); setDrawerOpen(true); }}
                              className="hover:underline text-left"
                              style={{ color: "#2563EB", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontFamily: "monospace", textDecoration: row.isCancelled ? "line-through" : "none" }}
                            >
                              {row.isLineItem ? "—" : row.reference}
                            </button>
                          ) : "—"}
                            </td>
                          );
                          if (c.key === "description") return (
                            <td key={c.key} style={{ padding: "8px 12px", fontSize: 11, color: "#111827", lineHeight: 1.5 }}>
                          {(row.transaction_type === "reversal" || row.transaction_type?.includes("reverse")) && (
                            <span style={{ display: "inline-block", padding: "1px 6px", marginLeft: 6, background: "#FFFBEB", color: "#B45309", border: "1px solid #FDE68A", borderRadius: 4, fontSize: 9, fontWeight: 600 }}>قيد عكسي</span>
                          )}
                          {row.isCancelled && (
                            <span style={{ display: "inline-block", padding: "2px 6px", marginLeft: 6, background: "#9CA3AF", color: "white", borderRadius: 4, fontSize: 9, fontWeight: 700 }}>ملغى</span>
                          )}
                          <span style={{ textDecoration: row.isCancelled ? "line-through" : "none", color: row.isLineItem ? "#4B5563" : undefined, fontWeight: row.isLineItem ? 600 : undefined }}>{row.description}</span>
                            </td>
                          );
                          if (c.key === "due") return (
                            <td key={c.key} style={{ padding: "8px 12px", fontSize: 10, color: "#9CA3AF" }}>{row.dueDate ? fmtDate(row.dueDate) : "—"}</td>
                          );
                          if (c.key === "type") return (
                            <td key={c.key} style={{ padding: "8px 12px", fontSize: 10, color: "#6B7280", fontWeight: 400 }}>{getTypeBadge(row.transaction_type)}</td>
                          );
                          if (c.key === "debit") return (
                            <td key={c.key} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: row.isMismatch ? "#D97706" : "#1E40AF", textAlign: "left", direction: "ltr", fontFamily: "tabular-nums" }}>
                          {row.debit > 0 ? fmtAmount(row.debit, row.currency) : "—"}
                          {row.debit > 0 && row.foreignDetail && <span style={{ fontSize: 9, color: "#9CA3AF", marginLeft: 4 }}>{row.foreignDetail}</span>}
                          {row.debit > 0 && row.isConverted && <span title={row.usedHistoricRate ? `محوّل بسعر يوم القيد: 1${getCurrencySymbol(row.currency)} = ₪${row.conversionRate?.toFixed(4) || "?"}` : `محوّل بسعر اليوم: 1${getCurrencySymbol(row.currency)} = ₪${row.conversionRate?.toFixed(4) || "?"}`} style={{ fontSize: 10, marginLeft: 3, cursor: "help" }}>⚡</span>}
                          {row.debit > 0 && row.isMismatch && <span title="عملة مختلفة — معروض بالشيكل" style={{ fontSize: 10, marginLeft: 3, cursor: "help" }}>⚠️</span>}
                            </td>
                          );
                          if (c.key === "credit") return (
                            <td key={c.key} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: row.isMismatch ? "#D97706" : "#065F46", textAlign: "left", direction: "ltr", fontFamily: "tabular-nums" }}>
                          {row.credit > 0 ? fmtAmount(row.credit, row.currency) : "—"}
                          {row.credit > 0 && row.foreignDetail && <span style={{ fontSize: 9, color: "#9CA3AF", marginLeft: 4 }}>{row.foreignDetail}</span>}
                          {row.credit > 0 && row.isConverted && <span title={row.usedHistoricRate ? `محوّل بسعر يوم القيد: 1${getCurrencySymbol(row.currency)} = ₪${row.conversionRate?.toFixed(4) || "?"}` : `محوّل بسعر اليوم: 1${getCurrencySymbol(row.currency)} = ₪${row.conversionRate?.toFixed(4) || "?"}`} style={{ fontSize: 10, marginLeft: 3, cursor: "help" }}>⚡</span>}
                          {row.credit > 0 && row.isMismatch && <span title="عملة مختلفة — معروض بالشيكل" style={{ fontSize: 10, marginLeft: 3, cursor: "help" }}>⚠️</span>}
                            </td>
                          );
                          if (c.key === "balance") return (
                            <td key={c.key} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, color: balColor(row.balance), textAlign: "left", direction: "ltr", fontFamily: "tabular-nums" }}>
                          <div className="flex items-center gap-1">
                            <span>
                              {fmtAmount(row.balance, row.currency)}
                              <span style={{ fontSize: 9, fontWeight: 400, color: "#9CA3AF", marginRight: 2 }}>{row.balance > 0 ? "م" : row.balance < 0 ? "د" : ""}</span>
                            </span>
                            <ArrowLeft className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" style={{ color: "#9CA3AF" }} />
                          </div>
                            </td>
                          );
                          return <td key={c.key} style={{ padding: "8px 12px" }} />;
                        })}
                      </tr>
                      );
                    })
                  )}

                  {/* Closing balance row */}
                  {filteredRows.length > 0 && (
                    <tr style={{ background: "#F3F4F6", borderTop: "2px solid #E5E7EB" }}>
                      {screenCols.map(c => {
                        if (c.key === "date") return <td key={c.key} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#111827" }}>—</td>;
                        if (c.key === "reference") return <td key={c.key} style={{ padding: "10px 12px", fontSize: 11 }}>—</td>;
                        if (c.key === "description") return <td key={c.key} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#111827" }}>{hasMixedCurrencies ? "⚠️ لا يمكن احتساب رصيد إجمالي عند وجود عملات مختلطة" : "رصيد الختام"}</td>;
                        if (c.key === "debit") return <td key={c.key} style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#1E40AF", textAlign: "left", direction: "ltr" }}>{hasMixedCurrencies ? "—" : fmtAmount(totalDebit, statementCurrency)}</td>;
                        if (c.key === "credit") return <td key={c.key} style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#065F46", textAlign: "left", direction: "ltr" }}>{hasMixedCurrencies ? "—" : fmtAmount(totalCredit, statementCurrency)}</td>;
                        if (c.key === "balance") return <td key={c.key} style={{ padding: "10px 12px", fontSize: 13, fontWeight: 800, color: hasMixedCurrencies ? "#D97706" : balColor(closingBalance), textAlign: "left", direction: "ltr" }}>{hasMixedCurrencies ? "—" : fmtAmount(closingBalance, statementCurrency)}</td>;
                        return <td key={c.key} style={{ padding: "10px 12px" }} />;
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
                );
              })()}
            </div>

            {/* ─── COLLAPSIBLE: CHEQUES ─── */}
            {relatedCheques.length > 0 && (
              <Collapsible open={chequesOpen} onOpenChange={setChequesOpen} className="rounded-lg mb-4" style={{ background: "white", border: "1px solid #E5E7EB" }}>
                <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold" style={{ color: "#374151" }}>
                  <span>الشيكات المرتبطة ({relatedCheques.length})</span>
                  {chequesOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div style={{ borderTop: "1px solid #E5E7EB" }}>
                    <table className="w-full">
                      <thead>
                        <tr style={{ background: "#F9FAFB" }}>
                          {["رقم الشيك", "النوع", "المبلغ", "التاريخ", "الحالة", "البنك"].map(h => (
                            <th key={h} className="text-right" style={{ padding: "8px 12px", fontSize: 10, fontWeight: 600, color: "#6B7280" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {relatedCheques.map(chq => (
                          <tr key={chq.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                            <td style={{ padding: "8px 12px", fontSize: 11, color: "#374151" }}>{chq.cheque_number || "—"}</td>
                            <td style={{ padding: "8px 12px", fontSize: 11, color: "#6B7280" }}>{chq.cheque_type}</td>
                            <td style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#111827" }}>{fmtAmount(chq.amount, chq.currency)}</td>
                            <td style={{ padding: "8px 12px", fontSize: 11, color: "#374151" }}>{fmtDate(chq.cheque_date)}</td>
                            <td style={{ padding: "8px 12px", fontSize: 11, color: chq.status === "مرتجع" ? "#DC2626" : "#6B7280" }}>{chq.status}</td>
                            <td style={{ padding: "8px 12px", fontSize: 11, color: "#6B7280" }}>{chq.bank_name || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* ─── COLLAPSIBLE: AGING ─── */}
            {statementOptions.showAging && agingData && (
              <Collapsible open={agingOpen} onOpenChange={setAgingOpen} className="rounded-lg mb-4" style={{ background: "white", border: "1px solid #E5E7EB" }}>
                <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold" style={{ color: "#374151" }}>
                  <span>تحليل التقادم (Aging)</span>
                  {agingOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div style={{ borderTop: "1px solid #E5E7EB", padding: "16px" }}>
                    <div className="grid grid-cols-5 gap-4 text-center">
                      {[
                        { label: "جاري", value: agingData.current, color: "#059669" },
                        { label: "1-30 يوم", value: agingData.d1_30, color: "#D97706" },
                        { label: "31-60 يوم", value: agingData.d31_60, color: "#EA580C" },
                        { label: "+60 يوم", value: agingData.d60plus, color: "#DC2626" },
                        { label: "الإجمالي", value: agingData.total, color: "#111827" },
                      ].map(a => (
                        <div key={a.label}>
                          <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 4 }}>{a.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: a.color }}>{fmtAmount(a.value, statementCurrency)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* ─── YEAR COMPARISON ─── */}
            {showYearComparison && yearComparisonData && (
              <div className="rounded-lg mb-4 overflow-hidden" style={{ background: "white", border: "1px solid #E5E7EB" }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  <span className="text-sm font-semibold" style={{ color: "#374151" }}>📊 مقارنة سنوية</span>
                  <span className="text-[10px]" style={{ color: "#9CA3AF" }}>{yearComparisonData.currentYear} مقابل {yearComparisonData.prevYear}</span>
                </div>
                <div style={{ padding: 16 }}>
                  <table className="w-full" style={{ tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                        <th className="text-right" style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#6B7280" }}>البيان</th>
                        <th className="text-center" style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#1E40AF" }}>{yearComparisonData.currentYear} (الحالي)</th>
                        <th className="text-center" style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#6B7280" }}>{yearComparisonData.prevYear} (السابق)</th>
                        <th className="text-center" style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#6B7280" }}>التغيير %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "إجمالي المدين", cur: yearComparisonData.curDebit, prev: yearComparisonData.prevDebit, change: yearComparisonData.debitChange },
                        { label: "إجمالي الدائن", cur: yearComparisonData.curCredit, prev: yearComparisonData.prevCredit, change: yearComparisonData.creditChange },
                        { label: "صافي الرصيد", cur: yearComparisonData.curNet, prev: yearComparisonData.prevNet, change: yearComparisonData.netChange },
                        { label: "عدد الحركات", cur: yearComparisonData.curCount, prev: yearComparisonData.prevCount, change: yearComparisonData.prevCount > 0 ? ((yearComparisonData.curCount - yearComparisonData.prevCount) / yearComparisonData.prevCount) * 100 : yearComparisonData.curCount > 0 ? 100 : 0 },
                      ].map((item, idx) => (
                        <tr key={item.label} style={{ borderBottom: idx < 3 ? "1px solid #F3F4F6" : "none", background: idx === 2 ? "#F9FAFB" : "transparent" }}>
                          <td className="text-right" style={{ padding: "10px 12px", fontSize: 11, fontWeight: idx === 2 ? 700 : 400, color: "#374151" }}>{item.label}</td>
                          <td className="text-center" style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: "#111827", fontFamily: "tabular-nums" }}>
                            {idx === 3 ? item.cur : fmtAmount(item.cur, statementCurrency)}
                          </td>
                          <td className="text-center" style={{ padding: "10px 12px", fontSize: 12, color: "#6B7280", fontFamily: "tabular-nums" }}>
                            {idx === 3 ? item.prev : fmtAmount(item.prev, statementCurrency)}
                          </td>
                          <td className="text-center" style={{ padding: "10px 12px", fontSize: 11, fontWeight: 600, fontFamily: "tabular-nums", color: item.change > 0 ? "#059669" : item.change < 0 ? "#DC2626" : "#6B7280" }}>
                            {item.change === 0 ? "—" : `${item.change > 0 ? "↑" : "↓"} ${Math.abs(item.change).toFixed(1)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-3 text-center" style={{ fontSize: 9, color: "#9CA3AF" }}>
                    الفترة الحالية: {yearComparisonData.currentPeriod} | الفترة السابقة: {yearComparisonData.prevPeriod}
                  </div>
                </div>
              </div>
            )}

            <div className="text-center" style={{ fontSize: 10, color: "#9CA3AF", padding: "12px 0" }}>
              إجمالي الحركات: {filteredRows.length} قيد{hasMixedCurrencies ? " | ⚠️ عملات مختلطة — الأرصدة غير دقيقة" : ` | مدين: ${fmtAmount(totalDebit, statementCurrency)} | دائن: ${fmtAmount(totalCredit, statementCurrency)} | الرصيد الختامي: ${fmtAmount(closingBalance, statementCurrency)} (${closingBalance > 0 ? "مدين" : closingBalance < 0 ? "دائن" : "مسدّد"})`} | تاريخ الطباعة: {fmtDate(format(new Date(), "yyyy-MM-dd"))}
              {displayCurrency !== "ILS" && currentExchangeRate[displayCurrency] && (
                <span> | * الحركات المعلّمة بـ ⚡ محوّلة بسعر صرف يوم القيد أو {currentExchangeRate[displayCurrency]} ₪ لكل {getCurrencySymbol(codeToCurrencyName[displayCurrency])}</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── TRANSACTION DETAIL DRAWER ─── */}
      <TransactionDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        row={drawerRow}
        userId={user?.id || ""}
      />

      {/* ─── PDF PREVIEW MODAL ─── */}
      {showPdfModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", display: "flex", flexDirection: "column" }}>
          <div style={{ background: "#1B3A5C", padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }} dir="rtl">
            <span style={{ color: "white", fontWeight: "bold", fontSize: 15 }}>
              <Eye className="w-4 h-4 inline-block ml-2" style={{ verticalAlign: "middle" }} />
              معاينة كشف الحساب
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDownloadPDF} disabled={pdfGenerating}>
                {pdfGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {pdfGenerating ? "جاري التحميل..." : "تحميل PDF"}
              </Button>
              <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-xs" onClick={handlePrintStatement}>
                <Printer className="w-3.5 h-3.5" /> طباعة
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => setShowPdfModal(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", background: "#e5e7eb", padding: "24px", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            {/* Use the SAME HTML as the actual print output, rendered inside an A4-sized iframe.
                This guarantees Preview === Print pixel-perfect. */}
            <div
              id="statement-preview-doc"
              style={{
                width: "210mm",
                minHeight: "297mm",
                background: "white",
                boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <iframe
                title="معاينة كشف الحساب"
                onLoad={(e) => {
                  try {
                    const f = e.currentTarget;
                    const doc = f.contentDocument;
                    if (!doc) return;
                    const h = Math.max(
                      doc.documentElement.scrollHeight,
                      doc.body?.scrollHeight || 0,
                      1123 // ≈ 297mm at 96dpi
                    );
                    f.style.height = h + "px";
                    const wrap = f.parentElement as HTMLElement | null;
                    if (wrap) wrap.style.minHeight = h + "px";
                  } catch {}
                }}
                srcDoc={buildAccountStatementPrintHTML({
                  company: {
                    name: companyInfo.name || "AMWALI",
                    logo_url: companyInfo.logo_url,
                    address: companyInfo.address,
                    phone: companyInfo.phone,
                    email: companyInfo.email,
                    tax_number: companyInfo.tax_number,
                  },
                  contact: {
                    name: selectedEntityName,
                    type: selectedContact?.contact_type || (isEmployeesTab ? "موظف" : isAccountsTab ? "حساب" : ""),
                    code: selectedEntityCode,
                    phone: selectedContact?.phone || "",
                  },
                  rows: filteredRows.map((r) => ({
                    date: r.date,
                    description: r.description,
                    transaction_type: r.transaction_type,
                    reference: r.reference,
                    debit: r.debit,
                    credit: r.credit,
                    balance: r.balance,
                    transaction_id: r.transaction_id,
                    dueDate: r.dueDate,
                  })),
                  openingBalance,
                  totalDebit,
                  totalCredit,
                  closingBalance,
                  dateFrom,
                  dateTo,
                  statementNumber: stableSOANumber,
                  currencyLabel: statementCurrency || "شيكل إسرائيلي (₪)",
                  currencySymbol: getCurrencySymbol(statementCurrency || "شيكل"),
                  includeInvoiceDetails: !!statementOptions.showInvoiceDetails,
                  invoiceDetailsByRef: detailsMap.invoiceDetailsById || {},
                  showReference: !!statementOptions.showReference,
                  showDueOrType: !!(statementOptions.showDueDate || statementOptions.showType),
                })}
                style={{
                  width: "100%",
                  height: "297mm",
                  border: "none",
                  display: "block",
                  background: "white",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountStatementV2Page;
