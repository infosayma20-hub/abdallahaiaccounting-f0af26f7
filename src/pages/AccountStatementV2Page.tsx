import { Fragment, useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight, Loader2, RefreshCw, Search, FileSpreadsheet,
  Printer, ChevronLeft, ChevronDown, ChevronUp,
  Settings2, Eye, Send, X, Mail, MessageSquare, Link2,
  Filter, Download, AlertTriangle, Zap, Calculator,
  ArrowLeft, Maximize2, Minimize2, ChevronsDown, ChevronsUp,
} from "lucide-react";
import TransactionDetailDrawer from "@/components/account-statement/TransactionDetailDrawer";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import StatementPrintViewClean from "@/components/StatementPrintViewClean";
import { buildAccountStatementPrintHTML } from "@/lib/reports/account-statement-print";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePageScrollRestoration } from "@/hooks/usePageSessionState";
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
import { useTaxEnabled } from "@/hooks/useTaxEnabled";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { onCrossTabChange } from "@/lib/crossTabSync";
import { usePosShiftData } from "@/hooks/usePosShiftData";
import { groupRowsByShift, type PosShiftInfo } from "@/lib/pos-shift-grouping";
import { Package, ChevronRight } from "lucide-react";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { getStatementBalanceColor, resolveStatementDebitCredit } from "@/lib/accounting/statement-side";
import { resolveDocumentRoute } from "@/lib/account-statement/resolveDocumentRoute";

// ─── Reference label formatting ───
// Shortens long internal references (UUIDs etc.) into Arabic-friendly labels.
function formatReferenceLabel(ref: string | null | undefined): string {
  if (!ref) return "—";
  const r = String(ref).trim();
  if (/^OB-CONTACT/i.test(r)) return "رصيد افتتاحي";
  if (/^OB-/i.test(r)) return "رصيد افتتاحي";
  if (/^INV-/i.test(r)) return r; // invoice numbers are already short/clean
  if (/^PO-/i.test(r)) return r;
  if (/^RV-|^PV-|^JV-|^QV-|^REC-/i.test(r)) return r;
  // Generic long reference: keep first 12 chars + ellipsis
  if (r.length > 16) return r.slice(0, 12) + "…";
  return r;
}

// ─── TYPES ───
interface Contact { id: string; contact_name: string; contact_type: string; phone: string | null; email: string | null; address: string | null; linked_account_code: string | null; credit_limit?: number; current_balance?: number; contact_class?: string; }
interface Account { id: string; account_code: string; account_name: string; account_type: string; }
interface EmployeeEntity { id: string; full_name: string; department: string | null; job_title: string | null; phone: string | null; base_salary: number; account_code: string | null; }
interface Transaction { id: string; description: string; transaction_type: string; amount: number; currency: string; transaction_date: string; debit_account_code: string; credit_account_code: string; reference: string | null; is_deleted: boolean; contact_id: string | null; payment_method: string | null; foreign_amount: number | null; exchange_rate: number | null; reversed_by_id?: string | null; cost_center_id?: string | null; }
interface Cheque { id: string; cheque_number: string | null; cheque_type: string; amount: number; currency: string; cheque_date: string; party_name: string; status: string; bank_name: string | null; }
interface StatementRow { date: string; description: string; transaction_type: string; reference: string; debit: number; credit: number; balance: number; transaction_id: string; currency: string; payment_method: string | null; dueDate?: string; foreignDetail?: string; isConverted?: boolean; isMismatch?: boolean; conversionRate?: number; usedHistoricRate?: boolean; isCancelled?: boolean; reversedById?: string | null; isLineItem?: boolean; lineItemDetail?: string; invoiceItems?: StatementInvoiceDetail[]; voucherDetail?: StatementVoucherDetail; voucherKind?: string; voucherAmount?: number; cost_center_id?: string | null; cost_center_name?: string; isShiftSummary?: boolean; isShiftChild?: boolean; shiftSessionId?: string; shiftMeta?: PosShiftInfo | null; }
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

const txTypeMatchesFilter = (transactionType: string, filter: string) => {
  if (filter === "all") return true;
  const type = (transactionType || "").toLowerCase();
  if (filter === "journal") {
    return type.includes("journal") || type.includes("قيد") || type.includes("salary") || type === "manual";
  }
  if (filter === "sale") return type.includes("sale") || type.includes("فاتورة");
  if (filter === "receipt") return type.includes("receipt") || type.includes("قبض");
  if (filter === "payment") return type.includes("payment") || type.includes("صرف");
  if (filter === "purchase") return type.includes("purchase") || type.includes("مشتريات");
  return type.includes(filter);
};

// ─── COMPONENT ───
const AccountStatementV2Page = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { taxEnabled } = useTaxEnabled();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;
  const { toast } = useToast();
  const { data: costCenters = [] } = useCostCenters({ includeInactive: true });

  const urlContactId = searchParams.get("contact_id") || searchParams.get("contact") || "";
  const urlContactType = searchParams.get("contact_type") || "";
  const urlEmployeeName = searchParams.get("employee_name") || "";
  const urlAccountCode = searchParams.get("code") || searchParams.get("account") || "";

  // ─── Persistent view state (survives tab switches / navigation) ───
  // Stored in sessionStorage so filters, selected entity, dates and tab are
  // restored on return without touching URL semantics or reloading data twice.
  const PERSIST_KEY = "soa:v2:view-state";
  const hasUrlSelection = Boolean(urlContactId || urlEmployeeName || urlAccountCode);
  const persisted = (() => {
    if (typeof window === "undefined") return null as any;
    if (hasUrlSelection) return null; // URL params always win
    try {
      const raw = sessionStorage.getItem(PERSIST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })();
  const pick = <T,>(key: string, fallback: T): T =>
    persisted && persisted[key] !== undefined && persisted[key] !== null ? (persisted[key] as T) : fallback;

  // State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [employeeEntities, setEmployeeEntities] = useState<EmployeeEntity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  // Sales reps: contact_id → extra GL codes that belong to the rep's ledger
  // (their custody cash box). Rep sales/collections post to the customer's own
  // AR sub-account, so the rep's real balance lives in their cash box account.
  const [repExtraCodes, setRepExtraCodes] = useState<Record<string, string[]>>({});
  // Authoritative contact balances (customers / suppliers / reps) straight from
  // the DB. The client-side scan below can only see the transactions window
  // that was fetched for the *selected* entity, so before picking anyone the
  // search dropdown had no balances at all — suppliers looked like they had
  // none. This RPC is cheap and covers every contact regardless of the window.
  const [serverContactBalances, setServerContactBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true); // initial full-page loader only
  const [isRefreshing, setIsRefreshing] = useState(false); // silent background refresh indicator
  // Full-screen mode for wide tables (client request)
  const [isFullscreen, setIsFullscreen] = useState(false);
  usePageScrollRestoration();
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn("[fullscreen] toggle failed", e);
    }
  }, []);
  const hasLoadedOnceRef = useRef(false);
  // Scroll container ref + jump helpers (End / Home shortcuts + floating buttons)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const getStatementScrollTarget = useCallback((): HTMLElement | null => {
    const start = scrollContainerRef.current;
    if (!start) return (document.scrollingElement as HTMLElement | null) || document.documentElement;

    let el: HTMLElement | null = start;
    while (el) {
      const style = window.getComputedStyle(el);
      const canScroll = /(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 4;
      if (canScroll) return el;
      el = el.parentElement;
    }

    const doc = (document.scrollingElement as HTMLElement | null) || document.documentElement;
    return doc.scrollHeight > doc.clientHeight + 4 ? doc : null;
  }, []);
  const scrollToTop = useCallback(() => {
    const el = getStatementScrollTarget();
    el?.scrollTo({ top: 0, behavior: "smooth" });
  }, [getStatementScrollTarget]);
  const scrollToBottom = useCallback(() => {
    const el = getStatementScrollTarget();
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight - el.clientHeight, behavior: "smooth" });
  }, [getStatementScrollTarget]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const editable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t as any)?.isContentEditable;
      // Modifier combos (Ctrl/Cmd/Alt + End/Home) ALWAYS work — even inside inputs
      const withModifier = e.ctrlKey || e.metaKey || e.altKey;
      if (withModifier && (e.key === "End" || e.key === "PageDown")) {
        e.preventDefault();
        scrollToBottom();
        return;
      }
      if (withModifier && (e.key === "Home" || e.key === "PageUp")) {
        e.preventDefault();
        scrollToTop();
        return;
      }
      // Plain End / Home only when NOT typing in a field
      if (editable) return;
      if (e.key === "End") { e.preventDefault(); scrollToBottom(); }
      else if (e.key === "Home") { e.preventDefault(); scrollToTop(); }
    };
    window.addEventListener("keydown", onKey, true); // capture phase so inputs don't swallow it
    return () => window.removeEventListener("keydown", onKey, true);
  }, [scrollToBottom, scrollToTop]);
  const [companyInfo, setCompanyInfo] = useState({ name: "", logo_url: "", address: "", phone: "", email: "", website: "", tax_number: "" });

  const [activeTab, setActiveTab] = useState<EntityTab>(
    urlAccountCode ? "accounts" : urlEmployeeName ? "employees" : urlContactType === "مورد" ? "suppliers" : urlContactId ? "customers" : pick<EntityTab>("activeTab", "contacts")
  );
  const [selectedEntityId, setSelectedEntityId] = useState(urlContactId || pick<string>("selectedEntityId", ""));
  const [txSearch, setTxSearch] = useState(pick<string>("txSearch", ""));
  const debouncedTxSearch = useDebouncedValue(txSearch, 300);
  const [dateFrom, setDateFrom] = useState(pick<string>("dateFrom", format(startOfYear(new Date()), "yyyy-MM-dd")));
  const [dateTo, setDateTo] = useState(pick<string>("dateTo", format(endOfMonth(new Date()), "yyyy-MM-dd")));
  const [activePeriod, setActivePeriod] = useState(pick<string>("activePeriod", ""));
  const [displayCurrency, setDisplayCurrency] = useState(pick<string>("displayCurrency", "ILS"));
  const [currentExchangeRate, setCurrentExchangeRate] = useState<Record<string, number>>({});
  const [txTypeFilter, setTxTypeFilter] = useState(pick<string>("txTypeFilter", "all"));
  const [txCostCenter, setTxCostCenter] = useState(pick<string>("txCostCenter", "all"));
  const [showYearComparison, setShowYearComparison] = useState(pick<boolean>("showYearComparison", false));
  const [chequesOpen, setChequesOpen] = useState(false);
  const [agingOpen, setAgingOpen] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRow, setDrawerRow] = useState<StatementRow | null>(null);
  const [navigatingRowId, setNavigatingRowId] = useState<string | null>(null);
  const [statementOptions, setStatementOptions] = useState<StatementViewOptions>(() => loadViewOptions());
  const [detailsMap, setDetailsMap] = useState<StatementDetailsMap>(() => emptyDetailsMap());
  // ─── POS Shift Grouping ───
  // When viewing a POS cash-box account, collapse sale rows per shift.
  // Default: grouped ON (user preference — accountants see one line per shift).
  const [posGroupMode, setPosGroupMode] = useState<'grouped' | 'detailed'>(() => {
    try { return (localStorage.getItem('as.posGroupMode') as any) || 'grouped'; } catch { return 'grouped'; }
  });
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());
  useEffect(() => { try { localStorage.setItem('as.posGroupMode', posGroupMode); } catch {} }, [posGroupMode]);
  const toggleShiftExpanded = useCallback((sid: string) => {
    setExpandedShifts(prev => {
      const n = new Set(prev);
      if (n.has(sid)) n.delete(sid); else n.add(sid);
      return n;
    });
  }, []);
  const isAccountsTab = activeTab === "accounts";
  const isEmployeesTab = activeTab === "employees";

  // Persist relevant view state so returning to the page restores exact context.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(PERSIST_KEY, JSON.stringify({
        activeTab, selectedEntityId, txSearch, dateFrom, dateTo, activePeriod,
        displayCurrency, txTypeFilter, txCostCenter, showYearComparison,
      }));
    } catch { /* quota — ignore */ }
  }, [activeTab, selectedEntityId, txSearch, dateFrom, dateTo, activePeriod, displayCurrency, txTypeFilter, txCostCenter, showYearComparison]);

  // ─── Smart row navigation ───
  // Resolves a statement row to its source document and navigates directly to
  // the view page (read-only). Falls back to opening the detail drawer when
  // no source document can be matched (e.g. opening balances, POS lines).
  const openRowDocument = useCallback(async (row: StatementRow) => {
    if (row.isLineItem) return;
    // Shift summary rows expand/collapse instead of navigating.
    if (row.isShiftSummary && row.shiftSessionId) {
      toggleShiftExpanded(row.shiftSessionId);
      return;
    }
    if (!dataOwnerId) { setDrawerRow(row); setDrawerOpen(true); return; }
    setNavigatingRowId(row.transaction_id);
    try {
      const route = await resolveDocumentRoute({
        ownerId: dataOwnerId,
        reference: row.reference,
        transactionType: row.transaction_type,
        transactionId: row.transaction_id,
      });
      if (route) { navigate(route); return; }
      // ── No source document → drawer ──
      setDrawerRow(row); setDrawerOpen(true);
    } catch (err) {
      console.error("Row navigation failed:", err);
      setDrawerRow(row); setDrawerOpen(true);
    } finally {
      setNavigatingRowId(null);
    }
  }, [dataOwnerId, navigate, toggleShiftExpanded]);

  // ─── FETCH DATA ───
  // Server-side filtered transactions fetch. Composes the account/contact
  // filter with the existing "is_deleted=false OR reversed_by_id NOT NULL"
  // clause. Paginated (PostgREST caps at 1000 rows/query).
  // NOTE: multiple .or() calls compose with AND, which is what we want:
  //   (is_deleted=false OR reversed) AND (debit=X OR credit=X OR contact=Y)
  const fetchTxServerFiltered = async (
    filter: { accountCode?: string; accountCodes?: string[]; contactId?: string },
    signal?: AbortSignal,
  ) => {
    const PAGE = 1000;
    const all: any[] = [];
    // Build entity filter (server-side). If unset → no filter → old behavior.
    const entityParts: string[] = [];
    const codes = Array.from(new Set([filter.accountCode, ...(filter.accountCodes || [])].filter(Boolean) as string[]));
    // ⚡ HARD GUARD: never pull the whole tenant ledger. With no entity resolved
    // (e.g. right after pressing "تغيير الاسم") the old code fell through to an
    // unfiltered pull of every transaction (~88k rows / 89 pages) and froze the
    // tab. An empty statement needs no rows at all.
    if (!codes.length && !filter.contactId) return [] as Transaction[];

    for (const code of codes) {
      entityParts.push(`debit_account_code.eq.${code}`);
      entityParts.push(`credit_account_code.eq.${code}`);
    }
    if (filter.contactId) {
      entityParts.push(`contact_id.eq.${filter.contactId}`);
    }
    const entityInner = entityParts.length ? entityParts.join(",") : null;
    // IMPORTANT: chaining .or() twice on the same builder does NOT AND them —
    // the second call silently replaces the first at the URL layer. We compose
    // both conditions into ONE .or() using PostgREST nested syntax:
    //   or=(and(is_deleted.eq.false,or(entity…)),and(reversed_by_id.not.is.null,or(entity…)))
    // This preserves the original semantic:
    //   (NOT soft-deleted OR row-is-a-reversal) AND (row touches viewed entity)
    const composedOr = entityInner
      ? `and(is_deleted.eq.false,or(${entityInner})),and(reversed_by_id.not.is.null,or(${entityInner}))`
      : `is_deleted.eq.false,reversed_by_id.not.is.null`;
    for (let from = 0; ; from += PAGE) {
      if (signal?.aborted) return all as Transaction[];
      let q = supabase
        .from("transactions")
        .select("id, description, transaction_type, amount, currency, transaction_date, debit_account_code, credit_account_code, reference, is_deleted, contact_id, payment_method, foreign_amount, exchange_rate, reversed_by_id, cost_center_id")
        .eq("user_id", dataOwnerId!)
        .or(composedOr)
        .order("transaction_date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (signal) q = q.abortSignal(signal) as typeof q;
      const { data, error } = await q;
      if (error) {
        if (signal?.aborted) return all as Transaction[];
        throw error;
      }
      const chunk = data || [];
      all.push(...chunk);
      if (chunk.length < PAGE) break;
    }

    return all as Transaction[];
  };

  const fetchData = async (opts: { silent?: boolean } = {}) => {
    if (!user || !dataOwnerId) return;
    const silent = opts.silent === true && hasLoadedOnceRef.current;
    if (silent) setIsRefreshing(true);
    else setLoading(true);
    try {
      // ─── Phase A: ONLY the small tables needed to resolve the viewed entity ───
      // ⚡ Perf: contacts (7k+ rows, paginated) and cheques used to block here and
      // delayed the statement by several seconds when opened from an employee card.
      // They are now loaded in the background (Phase C) — the statement itself only
      // needs accounts + employees to resolve an account_code.
      const fetchAllContacts = async (): Promise<Contact[]> => {
        const PAGE = 1000;
        const all: Contact[] = [];
        // ⚡ Perf: keyset paging on contact_name (UNIQUE per tenant, never NULL)
        // instead of OFFSET — deep OFFSET pages forced the DB to re-scan every
        // preceding row (11k+ rows for Malaki). Same rows, same order.
        for (let page = 0; page < 50; page++) {
          const cursor = all.length ? all[all.length - 1].contact_name : null;
          let q = supabase
            .from("contacts")
            .select("id, contact_name, contact_type, phone, email, address, linked_account_code, credit_limit, current_balance, contact_class")
            .eq("user_id", dataOwnerId)
            .eq("is_active", true)
            .order("contact_name")
            .limit(PAGE);
          if (cursor) q = q.gt("contact_name", cursor);
          const { data, error } = await q;
          if (error) throw error;
          const rows = (data as Contact[]) || [];
          all.push(...rows);
          if (rows.length < PAGE) break;
        }
        return all;
      };
      const [{ data: accData }, { data: empData }, { data: seedContactData }] = await Promise.all([
        supabase.from("accounts").select("id, account_code, account_name, account_type").eq("user_id", dataOwnerId).eq("is_active", true).order("account_code"),
        supabase.from("employees").select("id, full_name, department, job_title, phone, base_salary").eq("user_id", dataOwnerId).eq("is_active", true).order("full_name"),
        // Only the single contact we may need up-front (statement opened for a contact).
        urlContactId
          ? supabase.from("contacts").select("id, contact_name, contact_type, phone, email, address, linked_account_code, credit_limit, current_balance, contact_class").eq("id", urlContactId).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      const contactData: Contact[] = seedContactData ? [seedContactData as Contact] : [];
      if (contactData.length) setContacts(contactData);
      setAccounts((accData as Account[]) || []);

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

      // ─── Phase C (background, non-blocking): contacts list, cheques, company info ───
      // These feed the search dropdown / print header / cheque rows. Rendering the
      // statement no longer waits on them.
      void (async () => {
        try {
          const [allContacts, { data: chequeData }, { data: csData }, { data: companyData }] = await Promise.all([
            fetchAllContacts(),
            supabase.from("cheques").select("id, cheque_number, cheque_type, amount, currency, cheque_date, party_name, status, bank_name").eq("user_id", dataOwnerId).order("cheque_date", { ascending: false }),
            supabase.from("company_settings").select("company_name, logo_url, address, phone, email, website, tax_number, fiscal_year_start").eq("user_id", ownerId).maybeSingle(),
            supabase.from("companies").select("id, name, logo_url, address, phone, email, tax_number").eq("owner_id", user.id).maybeSingle(),
          ]);
          setContacts(allContacts || []);
          setCheques((chequeData as Cheque[]) || []);
          try {
            const { data: balRows, error: balErr } = await supabase.rpc("get_contacts_balances_bulk", {
              p_user_id: dataOwnerId,
            });
            if (balErr) throw balErr;
            const bmap: Record<string, number> = {};
            for (const r of ((balRows as any[]) || [])) bmap[r.contact_id] = Number(r.balance) || 0;
            setServerContactBalances(bmap);
          } catch (e) { console.warn("contact balances load failed:", e); }
          // Sales reps → their custody cash-box GL account (رصيد المندوب)
          try {
            const { data: repRows } = await supabase
              .from("sales_representatives")
              .select("id, contact_id, cash_box_id")
              .eq("user_id", dataOwnerId);
            const reps = (repRows as any[]) || [];
            const boxIds = Array.from(new Set(reps.map(r => r.cash_box_id).filter(Boolean)));
            let boxMap: Record<string, string> = {};
            if (boxIds.length) {
              const { data: boxes } = await supabase
                .from("cash_boxes")
                .select("id, gl_account_code")
                .in("id", boxIds as string[]);
              for (const b of ((boxes as any[]) || [])) {
                if (b.gl_account_code) boxMap[b.id] = b.gl_account_code;
              }
            }
            const map: Record<string, string[]> = {};
            for (const r of reps) {
              if (!r.contact_id) continue;
              const codes = [r.cash_box_id ? boxMap[r.cash_box_id] : null].filter(Boolean) as string[];
              if (codes.length) map[r.contact_id] = codes;
            }
            setRepExtraCodes(map);
          } catch (e) { console.warn("rep custody accounts load failed:", e); }
          const cs = csData as any;
          const comp = companyData as any;
          if (cs) {
            setCompanyInfo({ name: cs.company_name || comp?.name || "", logo_url: cs.logo_url || comp?.logo_url || "", address: cs.address || comp?.address || "", phone: cs.phone || comp?.phone || "", email: cs.email || comp?.email || "", website: cs.website || "", tax_number: cs.tax_number || comp?.tax_number || "" });
          } else if (comp) {
            setCompanyInfo({ name: comp.name || "", logo_url: comp.logo_url || "", address: comp.address || "", phone: comp.phone || "", email: comp.email || "", website: "", tax_number: comp.tax_number || "" });
          }
        } catch (e) {
          console.error("background statement data failed:", e);
        }
      })();

      if (urlEmployeeName && empList.length > 0) { const f = empList.find(e => e.full_name === urlEmployeeName); if (f) setSelectedEntityId(f.id); }
      if (urlAccountCode && allAccounts.length > 0) { const f = allAccounts.find(a => a.account_code === urlAccountCode); if (f) setSelectedEntityId(f.id); }

      // ─── Phase B: transactions (server-side filtered if entity resolved) ───
      // Resolve current entity from freshly-loaded static arrays. If we can pin
      // it to an account_code / contact_id, ask Postgres to return only rows
      // that touch it (uses existing idx_transactions_user_debit / _user_credit
      // / _contact indexes). Fallback: full paginated pull (preserves old UX).
      let resolvedAccountCode: string | undefined;
      let resolvedContactId: string | undefined;
      // Prefer the entity we're about to auto-select from URL, else current state.
      const entityIdForFilter =
        (urlEmployeeName && empList.find(e => e.full_name === urlEmployeeName)?.id) ||
        (urlAccountCode && allAccounts.find(a => a.account_code === urlAccountCode)?.id) ||
        selectedEntityId;
      if (entityIdForFilter) {
        const acct = allAccounts.find(a => a.id === entityIdForFilter);
        const cont = ((contactData as Contact[]) || []).find(c => c.id === entityIdForFilter);
        const emp = empList.find(e => e.id === entityIdForFilter);
        resolvedAccountCode = acct?.account_code || cont?.linked_account_code || emp?.account_code || undefined;
        resolvedContactId = cont?.id || undefined;
      }
      // ⚡ Perf: if no entity is resolved yet (user hasn't picked one),
      // skip the transactions pull entirely. Otherwise we would drag every
      // transaction in the tenant (~10k+ rows) just to render an empty
      // statement + a search dropdown. Balances in the search will render
      // as blank until an entity is selected — a fair trade for instant UX.
      if (resolvedAccountCode || resolvedContactId) {
        const txData = await fetchTxServerFiltered({ accountCode: resolvedAccountCode, contactId: resolvedContactId });
        setTransactions(txData);
      } else {
        setTransactions([]);
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      hasLoadedOnceRef.current = true;
      if (silent) setIsRefreshing(false);
      else setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user, dataOwnerId]);

  // ─── URL → state sync (fix stale tab reuse) ───
  // When the account-statement tab is already open and the user clicks
  // "كشف حساب" for a different contact from ContactsPage, react-router
  // updates the search params but our `selectedEntityId` state was
  // initialised only once. Without this effect the page keeps showing the
  // previous entity (or an empty statement). Re-sync whenever the URL
  // selection changes.
  useEffect(() => {
    if (!urlContactId && !urlEmployeeName && !urlAccountCode) return;
    if (urlAccountCode) setActiveTab("accounts");
    else if (urlEmployeeName) setActiveTab("employees");
    else if (urlContactType === "مورد") setActiveTab("suppliers");
    else if (urlContactId) setActiveTab("customers");
    if (urlContactId) setSelectedEntityId(urlContactId);
    if (urlAccountCode && accounts.length > 0) {
      const f = accounts.find(a => a.account_code === urlAccountCode);
      if (f) setSelectedEntityId(f.id);
    }
    if (urlEmployeeName && employeeEntities.length > 0) {
      const f = employeeEntities.find(e => e.full_name === urlEmployeeName);
      if (f) setSelectedEntityId(f.id);
    }
  }, [urlContactId, urlContactType, urlEmployeeName, urlAccountCode, accounts, employeeEntities]);

  // Listen for Alt+K shortcut → reset to "no entity selected" (same as pressing تغيير)
  useEffect(() => {
    const handler = () => {
      setSelectedEntityId("");
      try { sessionStorage.removeItem("selectedEntityId"); } catch {}
    };
    window.addEventListener("app:account-statement-reset", handler);
    return () => window.removeEventListener("app:account-statement-reset", handler);
  }, []);

  // ─── Silent server-side refetch when the viewed entity changes ───
  // Reuses the same helper as Phase B above. Runs only AFTER the first full
  // load, so URL/session-restored entities are handled by fetchData itself.
  // If the entity is cleared (تغيير الاسم) → we simply drop the rows; we never
  // fall back to an unfiltered full-ledger pull.
  const lastTxFilterKeyRef = useRef<string>("");
  const txAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!hasLoadedOnceRef.current || !user || !dataOwnerId) return;
    const acct = accounts.find(a => a.id === selectedEntityId);
    const cont = contacts.find(c => c.id === selectedEntityId);
    const emp = employeeEntities.find(e => e.id === selectedEntityId);
    const accountCode = acct?.account_code || cont?.linked_account_code || emp?.account_code || undefined;
    const contactId = cont?.id || undefined;
    const extraCodes = (cont?.id && repExtraCodes[cont.id]) || [];
    const key = `${accountCode || ""}|${extraCodes.join(",")}|${contactId || ""}`;
    if (key === lastTxFilterKeyRef.current) return;
    lastTxFilterKeyRef.current = key;
    // Any previous in-flight paginated pull is now stale (entity switched, or
    // rep custody codes arrived late) → abort it instead of letting it keep
    // hammering the DB page after page.
    txAbortRef.current?.abort();
    txAbortRef.current = null;
    if (!accountCode && !contactId && !extraCodes.length) {
      setTransactions([]);
      setIsRefreshing(false);
      return;
    }
    const ctrl = new AbortController();
    txAbortRef.current = ctrl;
    setIsRefreshing(true);
    fetchTxServerFiltered({ accountCode, accountCodes: extraCodes, contactId }, ctrl.signal)
      .then(rows => { if (!ctrl.signal.aborted) setTransactions(rows); })
      .catch(err => { if (!ctrl.signal.aborted) console.error("targeted tx fetch failed:", err); })
      .finally(() => {
        if (txAbortRef.current === ctrl) txAbortRef.current = null;
        if (!ctrl.signal.aborted) setIsRefreshing(false);
      });
  }, [selectedEntityId, accounts, contacts, employeeEntities, user, dataOwnerId, repExtraCodes]);


  useEffect(() => { setDetailsMap(prev => ({ ...prev, companySettings: companyInfo })); }, [companyInfo]);

  // ─── Realtime: auto-refresh on transaction changes ───
  // Perf hardening (Solution B — Silent + Smart):
  //   1) Scope Realtime by tenant (user_id=eq.<owner>).
  //   2) SMART FILTER: only refetch when the changed transaction actually
  //      touches the currently-viewed account/contact. POS bursts on other
  //      accounts are ignored — no more infinite "loading…" loop on cashier
  //      statements at high-volume branches (Malaki).
  //   3) SILENT refresh: after the first successful load, subsequent updates
  //      run in the background and never blank the table.
  //   4) Debounce 800ms to coalesce bursts.
  const selectedAccountCodeRef = useRef<string>("");
  const selectedContactIdRef = useRef<string>("");
  const selectedExtraCodesRef = useRef<string[]>([]);
  useEffect(() => {
    const acct = accounts.find(a => a.id === selectedEntityId);
    const cont = contacts.find(c => c.id === selectedEntityId);
    const emp = employeeEntities.find(e => e.id === selectedEntityId);
    selectedAccountCodeRef.current =
      acct?.account_code || cont?.linked_account_code || emp?.account_code || "";
    selectedContactIdRef.current = cont?.id || "";
    selectedExtraCodesRef.current = (cont?.id && repExtraCodes[cont.id]) || [];
  }, [selectedEntityId, accounts, contacts, employeeEntities, repExtraCodes]);

  // ⚡ Live updates refetch ONLY the viewed entity's transactions.
  // Previously every realtime/cross-tab ping ran the whole fetchData pipeline
  // (12 pages of contacts + all cheques + the balances RPC), which is what made
  // the page stutter on busy tenants. Static data doesn't change on a posting.
  const liveRefreshInFlightRef = useRef(false);
  const refreshTransactionsOnly = useCallback(async () => {
    if (!user || !dataOwnerId) return;
    const accountCode = selectedAccountCodeRef.current || undefined;
    const contactId = selectedContactIdRef.current || undefined;
    const extraCodes = selectedExtraCodesRef.current;
    if (!accountCode && !contactId && !extraCodes.length) return;
    if (liveRefreshInFlightRef.current) return;
    liveRefreshInFlightRef.current = true;
    setIsRefreshing(true);
    try {
      const rows = await fetchTxServerFiltered({ accountCode, accountCodes: extraCodes, contactId });
      // Guard against a late response after the user switched entity.
      if (
        (selectedAccountCodeRef.current || undefined) === accountCode &&
        (selectedContactIdRef.current || undefined) === contactId
      ) {
        setTransactions(rows);
      }
    } catch (e) {
      console.error("live tx refresh failed:", e);
    } finally {
      liveRefreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [user, dataOwnerId]);


  useEffect(() => {
    if (!user || !dataOwnerId) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`account_statement_realtime-${dataOwnerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${dataOwnerId}` },
        (payload: any) => {
          // Smart filter — ignore events that don't affect the viewed entity.
          const acctCode = selectedAccountCodeRef.current;
          const contactId = selectedContactIdRef.current;
          const extraCodes = selectedExtraCodesRef.current;
          if (!acctCode && !contactId && !extraCodes.length) return; // nothing on screen
          const rec: any = payload?.new || payload?.old || {};
          const codes = [acctCode, ...extraCodes].filter(Boolean) as string[];
          const touchesAccount = codes.some(c => rec.debit_account_code === c || rec.credit_account_code === c);
          const touchesContact = !!contactId && rec.contact_id === contactId;
          if (!touchesAccount && !touchesContact) return;
          if (timeoutId) return; // coalesce bursts
          timeoutId = setTimeout(() => {
            timeoutId = null;
            void refreshTransactionsOnly();
          }, 800);
        },
      )
      .subscribe();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [user, dataOwnerId, refreshTransactionsOnly]);

  // ─── Cross-tab sync: refresh instantly when a voucher/invoice is saved in another tab ───
  useEffect(() => {
    if (!user || !dataOwnerId) return;
    const REFRESH_ENTITIES = new Set([
      "journal_entry", "transaction", "receipt_voucher", "payment_voucher",
      "invoice", "purchase_invoice",
    ]);
    let t: ReturnType<typeof setTimeout> | null = null;
    let tContacts: ReturnType<typeof setTimeout> | null = null;
    const unsub = onCrossTabChange((ev) => {
      // A new/edited contact changes the search list → full (silent) reload.
      if (ev.entity === "contact") {
        if (tContacts) return;
        tContacts = setTimeout(() => { tContacts = null; fetchData({ silent: true }); }, 1500);
        return;
      }
      if (!REFRESH_ENTITIES.has(ev.entity)) return;
      if (t) return;
      // Only the ledger can change here → targeted refetch, not the whole pipeline.
      t = setTimeout(() => { t = null; void refreshTransactionsOnly(); }, 400);
    });
    return () => {
      if (t) clearTimeout(t);
      if (tContacts) clearTimeout(tContacts);
      unsub();
    };

  }, [user, dataOwnerId, refreshTransactionsOnly]);


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

  const selectedEntityLatestTxDate = useMemo(() => {
    if (!selectedEntityId) return "";

    let entityTxs: Transaction[] = [];
    if (isAccountsTab && selectedAccount) {
      const code = selectedAccount.account_code;
      entityTxs = transactions.filter(tx => tx.debit_account_code === code || tx.credit_account_code === code);
    } else if (isEmployeesTab && selectedEmployee?.account_code) {
      const code = selectedEmployee.account_code;
      entityTxs = transactions.filter(tx => tx.debit_account_code === code || tx.credit_account_code === code);
    } else if (selectedContact) {
      const contactName = selectedContact.contact_name?.trim() || "";
      const sameNameIds = new Set(contacts.filter(c => c.contact_name?.trim() === contactName).map(c => c.id));
      const linkedCodes = new Set<string>(
        [selectedContact?.linked_account_code || "", ...((selectedContact?.id && repExtraCodes[selectedContact.id]) || [])].filter(Boolean)
      );
      entityTxs = transactions.filter(tx =>
        (tx.contact_id && sameNameIds.has(tx.contact_id)) ||
        linkedCodes.has(tx.debit_account_code) || linkedCodes.has(tx.credit_account_code) ||
        (!tx.contact_id && contactName && tx.description?.includes(contactName))
      );
    }

    return entityTxs.reduce((latest, tx) => (tx.transaction_date > latest ? tx.transaction_date : latest), "");
  }, [selectedEntityId, isAccountsTab, isEmployeesTab, selectedAccount, selectedEmployee, selectedContact, transactions, contacts, repExtraCodes]);

  const hasTransactionsAfterDateTo = Boolean(dateTo && selectedEntityLatestTxDate && selectedEntityLatestTxDate > dateTo);

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
    for (const c of contacts) {
      let b = 0, cnt = 0;
      const ownCodes = [c.linked_account_code];
      for (const tx of transactions) {
        const linkedCode = c.linked_account_code || "";
        const matches =
          (tx.contact_id === c.id) ||
          (!!linkedCode && (tx.debit_account_code === linkedCode || tx.credit_account_code === linkedCode)) ||
          (!tx.contact_id && tx.description?.includes(c.contact_name?.trim()));
        if (!matches) continue;
        const { isDebit, isCredit, isAmbiguous } = resolveStatementDebitCredit(tx, ownCodes);
        if ((!isDebit && !isCredit) || isAmbiguous) continue;
        cnt++;
        if (isDebit) b += tx.amount || 0;
        if (isCredit) b -= tx.amount || 0;
      }
      // Server balance wins: it covers the contact's whole ledger, while the
      // local scan only sees the currently fetched transactions window.
      balMap[c.id] = c.id in serverContactBalances ? serverContactBalances[c.id] : b;
      cntMap[c.id] = cnt;
    }
    return { contactBalances: balMap, contactTxCounts: cntMap };
  }, [contacts, transactions, serverContactBalances]);

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
      const linkedCodes = new Set<string>(
        [selectedContact?.linked_account_code || "", ...((selectedContact?.id && repExtraCodes[selectedContact.id]) || [])].filter(Boolean)
      );
      related = transactions.filter(tx =>
        (tx.contact_id && sameNameIds.has(tx.contact_id)) ||
        linkedCodes.has(tx.debit_account_code) || linkedCodes.has(tx.credit_account_code) ||
        (!tx.contact_id && contactName && tx.description?.includes(contactName))
      );
      // Own account codes belonging to the selected contact (and any same-name aliases).
      // Used to disambiguate JEs whose BOTH sides fall in contact-family roots
      // (e.g. transfer between two customer sub-accounts) so we don't credit the wrong side.
      const ownCodes = new Set<string>(linkedCodes);
      for (const c of contacts) {
        if (sameNameIds.has(c.id) && (c as any).linked_account_code) ownCodes.add((c as any).linked_account_code);
      }
      resolveDebitCredit = (tx) => {
        const resolved = resolveStatementDebitCredit(tx, ownCodes);
        return { isDebit: resolved.isDebit, isCredit: resolved.isCredit };
      };
      // Hybrid helper exposed via closure for the row-builder below: cash sales / cash payments
      // touch the contact_id but don't post to AR/AP. We surface them as INFO rows (debit & credit
      // both equal to the amount → balance unchanged) so the user sees the activity in the ledger.
      (resolveDebitCredit as any).__isContactBranch = true;
      (resolveDebitCredit as any).__sameNameIds = sameNameIds;
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
    const infoTxIds = new Set<string>(); // tx that affect contact info but not balance (cash sale/pay)
    for (const tx of related) {
      const { isDebit, isCredit } = resolveDebitCredit(tx);
      if (!isDebit && !isCredit) {
        // Contact-branch only: include as info row when contact_id matches (cash sales/payments)
        if ((resolveDebitCredit as any).__isContactBranch && tx.contact_id && (resolveDebitCredit as any).__sameNameIds?.has(tx.contact_id)) {
          if (!dateFrom || tx.transaction_date >= dateFrom) {
            if (!dateTo || tx.transaction_date <= dateTo) {
              periodTx.push(tx);
              infoTxIds.add(tx.id);
            }
          }
        }
        continue;
      }
      const { amount: amt } = getDisplayAmt(tx);
      if (dateFrom && tx.transaction_date < dateFrom) { if (isDebit) openBal += amt; if (isCredit) openBal -= amt; }
      else if (!dateTo || tx.transaction_date <= dateTo) periodTx.push(tx);
    }

    // Opening-balance entries must always lead the statement, regardless of the
    // date they were recorded on (they are often entered later than the period start).
    const isOpeningTx = (tx: Transaction) =>
      /^OB-/i.test(tx.reference || "") ||
      (tx.transaction_type || "").includes("opening_balance") ||
      (tx.description || "").includes("رصيد افتتاحي");
    periodTx.sort((a, b) => {
      const ao = isOpeningTx(a) ? 0 : 1;
      const bo = isOpeningTx(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return String(a.transaction_date).localeCompare(String(b.transaction_date));
    });

    let running = openBal, sD = 0, sC = 0;
    const result: StatementRow[] = periodTx.map(tx => {
      const { isDebit, isCredit } = resolveDebitCredit(tx);
      const { amount: amt, isConverted, isMismatch, conversionRate, usedHistoricRate } = getDisplayAmt(tx);
      const isInfo = infoTxIds.has(tx.id);
      const debit = isInfo ? amt : (isDebit ? amt : 0);
      const credit = isInfo ? amt : (isCredit ? amt : 0);
      // Info rows (cash sales/payments) do NOT change the running balance.
      if (!isInfo) { running += debit - credit; sD += debit; sC += credit; }
      let dueDate: string | undefined;
      if (tx.reference?.startsWith("INV-") || tx.reference?.startsWith("PO-")) { try { const d = parseISO(tx.transaction_date); d.setDate(d.getDate() + 30); dueDate = format(d, "yyyy-MM-dd"); } catch {} }
      const rowCurrency = isMismatch ? "شيكل" : isForeignCash ? normalizeCurrency(tx.currency) : dispCurrName;
      const descBase = tx.description || tx.transaction_type || "—";
      const description = isInfo ? `${descBase} — معاملة نقدية (لا تؤثر على الذمة)` : descBase;
      return { date: tx.transaction_date, description, transaction_type: tx.transaction_type || "", reference: tx.reference || "", debit, credit, balance: running, transaction_id: tx.id, currency: rowCurrency, payment_method: tx.payment_method || null, dueDate, foreignDetail: getForeignDetail(tx), isConverted, isMismatch, conversionRate, usedHistoricRate, isCancelled: !!tx.is_deleted, reversedById: tx.reversed_by_id || null, cost_center_id: tx.cost_center_id || null };
    });
    return { rows: result, openingBalance: openBal, closingBalance: running, totalDebit: sD, totalCredit: sC };
  }, [transactions, selectedEntityId, dateFrom, dateTo, activeTab, selectedAccount, selectedEmployee, displayCurrency, currentExchangeRate, contacts, selectedContact, repExtraCodes]);

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

  const ccMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of costCenters) m.set(c.id, `${c.code} - ${c.name_ar || c.name}`);
    return m;
  }, [costCenters]);
  const ccLabel = useCallback((id?: string | null) => id ? (ccMap.get(id) || "—") : "بدون مركز تكلفة", [ccMap]);

  // ─── POS Shift Data (loaded when a POS cash-box account is selected) ───
  const posShiftEnabled = !!(isAccountsTab && selectedAccount);
  // Fallback date range for the shift RPC (the user often leaves "from" blank
  // when opening a statement — we still want the grouping toggle to appear).
  const posShiftFromDate = dateFrom || '2000-01-01';
  const posShiftToDate = dateTo || new Date().toISOString().slice(0, 10);
  const {
    shifts: posShifts,
    orderToSession: posOrderToSession,
    isPosBox,
    loading: posShiftLoading,
  } = usePosShiftData(
    dataOwnerId || undefined,
    posShiftEnabled ? (selectedAccount?.account_code || undefined) : undefined,
    posShiftFromDate,
    posShiftToDate,
    posShiftEnabled,
  );

  // ─── Grouped rows (POS shift collapsing) ───
  // Runs AFTER the raw rows are built and BEFORE filtering/rendering, so all
  // downstream code (search, cost-center filter, print, export) transparently
  // sees the collapsed representation.
  const groupedRows = useMemo<StatementRow[]>(() => {
    if (!isPosBox || posGroupMode !== 'grouped' || posShifts.size === 0) return rows;
    return groupRowsByShift(rows as any, {
      shifts: posShifts,
      orderToSession: posOrderToSession,
      expandedSessions: expandedShifts,
      enabled: true,
    }) as StatementRow[];
  }, [rows, isPosBox, posGroupMode, posShifts, posOrderToSession, expandedShifts]);

  const filteredRows = useMemo(() => {
    let r = groupedRows;
    if (txTypeFilter !== "all") r = r.filter(x => txTypeMatchesFilter(x.transaction_type, txTypeFilter));
    if (txCostCenter !== "all") {
      r = txCostCenter === "__none__"
        ? r.filter(x => !x.cost_center_id)
        : r.filter(x => x.cost_center_id === txCostCenter);
    }
    if (statementOptions.hideCancelledEntries) {
      r = r.filter(x => !x.isCancelled);
    }
    if (statementOptions.hideReversalEntries) {
      // A reversal row's `reversedById` points at the ORIGINAL voucher it cancels.
      // Hiding a reversal without hiding its original leaves the ledger showing
      // a live entry that has actually been neutralized — misleading and unsafe.
      // So collect every original id referenced by any reversal row in view, and
      // hide both sides together.
      const cancelledOriginalIds = new Set<string>();
      for (const x of r) {
        const t = (x.transaction_type || "").toLowerCase();
        if ((t === "reversal" || t.includes("reverse")) && x.reversedById) {
          cancelledOriginalIds.add(x.reversedById);
        }
      }
      r = r.filter(x => {
        const t = (x.transaction_type || "").toLowerCase();
        if (t === "reversal" || t.includes("reverse")) return false;
        if (cancelledOriginalIds.has(x.transaction_id)) return false;
        return true;
      });
    }
    // Perf hardening (Solution D): debounce the search term so every keystroke
    // does NOT rebuild filteredRows + statementRowsWithDetails for thousands of
    // rows. The input stays instantly responsive; results settle after 300ms.
    if (debouncedTxSearch.trim()) r = r.filter(x => multiWordMatchAny(debouncedTxSearch, x.description, x.reference));
    // Recompute running balance and totals so they reflect only the visible
    // rows (hidden reversals / cancelled entries must not leak into totals).
    let running = openingBalance;
    let sD = 0, sC = 0;
    const withBalances = r.map(x => {
      const d = Number(x.debit) || 0;
      const c = Number(x.credit) || 0;
      // Info rows (cash sales/payments) do NOT change the running balance —
      // preserve the same rule used when the rows were first built.
      const isInfo = d > 0 && c > 0 && Math.abs(d - c) < 1e-6;
      if (!isInfo) { running += d - c; sD += d; sC += c; }
      return { ...x, balance: running };
    });
    (withBalances as any).__totalDebit = sD;
    (withBalances as any).__totalCredit = sC;
    (withBalances as any).__closingBalance = running;
    return withBalances;
  }, [groupedRows, debouncedTxSearch, txTypeFilter, txCostCenter, statementOptions.hideCancelledEntries, statementOptions.hideReversalEntries, openingBalance]);

  // Totals that follow the currently visible rows (respect hide filters).
  const displayTotalDebit = (filteredRows as any).__totalDebit ?? totalDebit;
  const displayTotalCredit = (filteredRows as any).__totalCredit ?? totalCredit;
  const displayClosingBalance = (filteredRows as any).__closingBalance ?? closingBalance;

  // ─── COLUMN SORTING (display only) ───
  // IMPORTANT: the running balance is computed chronologically in `filteredRows`
  // BEFORE this sort runs, and each row keeps its own balance value. Sorting only
  // re-orders the rows on screen — the balance travels glued to its own row and
  // no accounting figure is recalculated. Totals / closing balance stay untouched.
  const [sortState, setSortState] = useState<{ key: string | null; dir: "asc" | "desc" }>({ key: null, dir: "asc" });
  const toggleSort = useCallback((key: string) => {
    setSortState(cur => {
      if (cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  }, []);

  const sortedRows = useMemo(() => {
    if (!sortState.key) return filteredRows;
    const getVal = (r: StatementRow): string | number => {
      switch (sortState.key) {
        case "date": return r.date || "";
        case "reference": return r.reference || "";
        case "description": return r.description || "";
        case "due": return r.dueDate || "";
        case "type": return getTypeBadge(r.transaction_type) || "";
        case "cost_center": return r.cost_center_name || ccLabel(r.cost_center_id);
        case "debit": return Number(r.debit) || 0;
        case "credit": return Number(r.credit) || 0;
        default: return "";
      }
    };
    // Keep POS shift children attached to their parent row: sort blocks, not rows.
    const blocks: StatementRow[][] = [];
    for (const r of filteredRows) {
      if (r.isShiftChild && blocks.length > 0) blocks[blocks.length - 1].push(r);
      else blocks.push([r]);
    }
    const dir = sortState.dir === "asc" ? 1 : -1;
    const sorted = blocks
      .map((b, i) => ({ b, i }))
      .sort((x, y) => {
        const va = getVal(x.b[0]);
        const vb = getVal(y.b[0]);
        let cmp: number;
        if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
        else cmp = String(va).localeCompare(String(vb), "ar", { numeric: true });
        if (cmp === 0) return x.i - y.i; // stable
        return cmp * dir;
      })
      .flatMap(x => x.b);
    // preserve the totals attached to filteredRows
    (sorted as any).__totalDebit = (filteredRows as any).__totalDebit;
    (sorted as any).__totalCredit = (filteredRows as any).__totalCredit;
    (sorted as any).__closingBalance = (filteredRows as any).__closingBalance;
    return sorted;
  }, [filteredRows, sortState, ccLabel]);

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
    return sortedRows.flatMap((row) => {
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
  }, [sortedRows, statementOptions.showInvoiceDetails, statementOptions.showVoucherDetails, detailsMap]);

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
      const linkedCodes = new Set<string>(
        [selectedContact?.linked_account_code || "", ...((selectedContact?.id && repExtraCodes[selectedContact.id]) || [])].filter(Boolean)
      );
      related = transactions.filter(tx =>
        (tx.contact_id && sameNameIds.has(tx.contact_id)) ||
        linkedCodes.has(tx.debit_account_code) || linkedCodes.has(tx.credit_account_code) ||
        (!tx.contact_id && contactName && tx.description?.includes(contactName))
      );
      const ownCodes = new Set<string>(linkedCodes);
      for (const c of contacts) {
        if (sameNameIds.has(c.id) && (c as any).linked_account_code) ownCodes.add((c as any).linked_account_code);
      }
      resolveDebitCredit = (tx) => {
        const resolved = resolveStatementDebitCredit(tx, ownCodes);
        return { isDebit: resolved.isDebit, isCredit: resolved.isCredit };
      };
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
  }, [showYearComparison, selectedEntityId, dateFrom, dateTo, transactions, isAccountsTab, isEmployeesTab, selectedAccount, selectedEmployee, selectedContact, contacts, repExtraCodes]);

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
      if (c.key === "debit") return displayTotalDebit;
      if (c.key === "credit") return displayTotalCredit;
      if (c.key === "balance") return displayClosingBalance;
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
  const buildCurrentStatementPrintHTML = useCallback(() => buildAccountStatementPrintHTML({
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
      reference: formatReferenceLabel(r.reference),
      debit: r.debit,
      credit: r.credit,
      balance: r.balance,
      transaction_id: r.transaction_id,
      dueDate: r.dueDate,
    })),
    openingBalance,
    totalDebit: displayTotalDebit,
    totalCredit: displayTotalCredit,
    closingBalance: displayClosingBalance,
    dateFrom,
    dateTo,
    statementNumber: stableSOANumber,
    currencyLabel: statementCurrency || "شيكل إسرائيلي (₪)",
    currencySymbol: getCurrencySymbol(statementCurrency || "شيكل"),
    includeInvoiceDetails: !!statementOptions.showInvoiceDetails,
    invoiceDetailsByRef: detailsMap.invoiceDetailsById || {},
    showReference: !!statementOptions.showReference,
    showDueOrType: !!(statementOptions.showDueDate || statementOptions.showType),
    taxEnabled,
  }), [
    companyInfo, selectedEntityName, selectedContact, isEmployeesTab, isAccountsTab,
    selectedEntityCode, filteredRows, openingBalance, displayTotalDebit, displayTotalCredit,
    displayClosingBalance, dateFrom, dateTo, stableSOANumber, statementCurrency,
    statementOptions, detailsMap.invoiceDetailsById, taxEnabled,
  ]);

  const handlePreviewPDF = useCallback(() => {
    if (!selectedEntityId || rows.length === 0) return;
    setShowPdfModal(true);
  }, [selectedEntityId, rows]);

  const handleDownloadPDF = useCallback(async () => {
    if (!selectedEntityId || filteredRows.length === 0) return;
    setPdfGenerating(true);
    let iframe: HTMLIFrameElement | null = null;
    let createdIframe = false;
    try {
      // Prefer the already-rendered preview iframe (fonts + layout already settled).
      const existing = document.querySelector<HTMLIFrameElement>(
        "#statement-preview-doc iframe"
      );
      if (existing && existing.contentDocument?.body) {
        iframe = existing;
      } else {
        iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.left = "-10000px";
        iframe.style.top = "0";
        iframe.style.width = "210mm";
        iframe.style.height = "297mm";
        iframe.style.border = "0";
        iframe.style.background = "white";
        createdIframe = true;
        const loaded = new Promise<void>((resolve) => {
          const fallback = window.setTimeout(resolve, 2500);
          iframe!.onload = () => {
            window.clearTimeout(fallback);
            resolve();
          };
        });
        document.body.appendChild(iframe);
        iframe.srcdoc = buildCurrentStatementPrintHTML();
        await loaded;
      }

      const idoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!idoc?.body) throw new Error("PDF preview document was not ready");
      await (idoc as any).fonts?.ready?.catch?.(() => undefined);
      await Promise.all(Array.from(idoc.images).map((img) => img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      })));
      // Extra settle time for Arabic fonts + RTL layout.
      await new Promise<void>((resolve) => setTimeout(resolve, 350));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const target = idoc.body;
      const captureWidth = Math.max(
        Math.ceil(Math.max(target.scrollWidth, idoc.documentElement.scrollWidth, target.offsetWidth)),
        794 // ≈ 210mm @ 96dpi fallback
      );
      const captureHeight = Math.max(
        Math.ceil(Math.max(target.scrollHeight, idoc.documentElement.scrollHeight, target.offsetHeight)),
        1123 // ≈ 297mm @ 96dpi fallback
      );
      const canvas = await html2canvas(target, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: captureWidth,
        height: captureHeight,
        windowWidth: captureWidth,
        windowHeight: captureHeight,
        scrollX: 0,
        scrollY: 0,
      });

      if (!canvas.width || !canvas.height) {
        throw new Error("لم يتم توليد صورة صالحة للـ PDF");
      }

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      // JPEG keeps PDF size small and avoids browser toDataURL PNG size limits.
      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, imgHeight, undefined, "FAST");
      let remaining = imgHeight - pageHeight;
      let pageIndex = 1;
      while (remaining > 0.5) {
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, -pageHeight * pageIndex, pageWidth, imgHeight, undefined, "FAST");
        remaining -= pageHeight;
        pageIndex += 1;
      }

      pdf.save(`كشف-حساب-${selectedEntityName}-${dateFrom}.pdf`);
      toast({ title: "تم تحميل PDF بنجاح ✓" });
    } catch (err) {
      console.error("PDF download error:", err);
      const msg = err instanceof Error ? err.message : "خطأ غير معروف";
      toast({ title: "خطأ في تحميل PDF", description: msg, variant: "destructive" });
    } finally {
      if (createdIframe) iframe?.remove();
      setPdfGenerating(false);
    }
  }, [selectedEntityId, filteredRows.length, buildCurrentStatementPrintHTML, selectedEntityName, dateFrom, toast]);

  const handlePrintStatement = useCallback(() => {
    if (!selectedEntityId || filteredRows.length === 0) return;
    const html = buildCurrentStatementPrintHTML();
    // Print via hidden iframe to avoid the "about:blank" footer that
    // appears when using window.open("","_blank").
    const existing = document.getElementById("__soa_print_iframe__");
    if (existing) existing.remove();
    const iframe = document.createElement("iframe");
    iframe.id = "__soa_print_iframe__";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    const triggerPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error("print error", e);
      }
    };
    // Wait for fonts/images
    setTimeout(triggerPrint, 700);
  }, [selectedEntityId, filteredRows.length, buildCurrentStatementPrintHTML]);

  // Balance color helper
  const balColor = (val: number) => {
    return getStatementBalanceColor(val);
  };

  // ─── RENDER ───
  const actionTabs: ActionTab[] = ([{
    key: "general",
    label: "عام",
    groups: [
      { key: "actions", label: "إجراءات", items: [
        { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: () => fetchData() },
        { key: "center", label: "فتح مركز المالية", icon: Calculator, onClick: () => navigate("/accounting-center") },
      ]},
      { key: "print", label: "طباعة", items: [
        { key: "preview", label: "معاينة PDF", icon: Eye, onClick: handlePreviewPDF, disabled: !selectedEntityId || rows.length === 0 || pdfGenerating },
        { key: "print", label: "طباعة", icon: Printer, onClick: handlePrintStatement, disabled: !selectedEntityId || rows.length === 0 },
      ]},
      { key: "export", label: "تصدير", items: [
        { key: "excel", label: "Excel", icon: FileSpreadsheet, onClick: handleExport, disabled: !selectedEntityId || filteredRows.length === 0 },
      ]},
      { key: "send", label: "إرسال", items: [
        { key: "wa", label: "واتساب", icon: MessageSquare, onClick: () => { if (selectedContact?.phone) { const msg = `كشف حساب - ${selectedEntityName}\nالرصيد: ${fmtAmount(displayClosingBalance, statementCurrency)}`; window.open(`https://wa.me/${selectedContact.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}`); } }, disabled: !selectedContact?.phone },
        { key: "mail", label: "إيميل", icon: Mail, onClick: () => { if (selectedContact?.email) window.open(`mailto:${selectedContact.email}?subject=${encodeURIComponent(`كشف حساب - ${selectedEntityName}`)}`); }, disabled: !selectedContact?.email },
      ]},
    ],
  }]);

  return (
    <FinanceShell
      title="كشف الحساب"
      subtitle="حركة حساب أو جهة خلال فترة محددة"
      breadcrumb={[
        { label: "المالية", href: "/accounting-center" },
        { label: "كشف الحساب" },
      ]}
      actionTabs={actionTabs}
      rightSlot={
        <div className="flex items-center gap-2" dir="rtl">
          {isRefreshing && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>يتم التحديث…</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-lg px-2 py-1 bg-muted/40 border border-border/40 shrink-0">
            <RtlDateField label="من" ariaLabel="من تاريخ" value={dateFrom} onChange={(v) => { setDateFrom(v); setActivePeriod(""); }} />
            <div className="w-px h-4 bg-border" />
            <RtlDateField label="إلى" ariaLabel="إلى تاريخ" value={dateTo} onChange={(v) => { setDateTo(v); setActivePeriod(""); }} />
          </div>
          <StatementViewOptionsPanel value={statementOptions} onChange={setStatementOptions} />
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors bg-white hover:bg-muted shrink-0"
            style={{ borderColor: '#0D1B2E', color: '#0D1B2E' }}
            title={isFullscreen ? 'الخروج من ملء الشاشة (Esc)' : 'ملء الشاشة'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {isFullscreen ? 'خروج' : 'ملء الشاشة'}
          </button>
          {isPosBox && posShifts.size > 0 && (
            <button
              onClick={() => setPosGroupMode(m => m === 'grouped' ? 'detailed' : 'grouped')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors shrink-0"
              style={{
                background: posGroupMode === 'grouped' ? '#0D1B2E' : 'white',
                color: posGroupMode === 'grouped' ? 'white' : '#0D1B2E',
                borderColor: '#0D1B2E',
              }}
              title={posGroupMode === 'grouped' ? 'انقر للعرض المفصّل (كل طلب سطر)' : 'انقر للتجميع بالوردية'}
            >
              <Package className="w-3.5 h-3.5" />
              {posGroupMode === 'grouped'
                ? `مُجمّع بالوردية (${posShifts.size})`
                : 'عرض مفصّل'}
              {posShiftLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            </button>
          )}
        </div>
      }
    >
      <div data-print-area className="flex flex-col" dir="rtl">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative" style={{ background: "#F9FAFB", padding: 0 }}>
        {/* Search bar when no entity selected */}
        {!selectedEntityId && (
          <div className="w-full">
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
          <div className="flex items-center justify-center py-16">
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
              <div className="rounded-lg mb-1 flex items-start gap-2" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", padding: "6px 10px" }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#D97706" }} />
                <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
                  <strong>تحذير:</strong> هذا الكشف يحتوي حركات بعملات مختلفة. الحركات غير المقيّمة بال{displayCurrencyLabel.split(" ")[0]} محوّلة بسعر صرف اليوم أو معروضة بالشيكل. الرصيد الإجمالي غير دقيق محاسبياً.
                </div>
              </div>
            )}

            {/* ─── FOREIGN DISPLAY NOTE ─── */}
            {displayCurrency !== "ILS" && !hasMixedCurrencies && (
              <div className="rounded-lg mb-1 flex items-center gap-2" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", padding: "4px 10px" }}>
                <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: "#2563EB" }} />
                <span style={{ fontSize: 11, color: "#1E40AF" }}>الكشف معروض بال{displayCurrencyLabel.split(" ")[0]}. الحركات المحوّلة محتسبة بسعر صرف يوم القيد (أو سعر اليوم إن لم يُحفظ سعر تاريخي).</span>
              </div>
            )}

            {/* ─── SUMMARY LINE ─── */}
            <div className="rounded-lg" style={{ background: "white", border: "1px solid #E5E7EB", padding: "4px 8px" }}>
              <div className="flex items-center gap-6 flex-wrap text-[13px]">
                {selectedEntityId && (
                  <div className="flex items-center gap-2 pl-3 border-l border-border/60">
                    <span className="text-sm">{selectedEntityEmoji}</span>
                    <span className="text-sm font-semibold text-foreground">{selectedEntityName}</span>
                    {selectedEntityCode && <span className="text-xs text-muted-foreground">— {selectedEntityCode}</span>}
                    <button onClick={() => setSelectedEntityId("")} className="text-xs underline mr-1 text-primary">تغيير</button>
                  </div>
                )}
                <div><span style={{ color: "#6B7280" }}>رصيد افتتاحي: </span><span style={{ color: "#111827", fontWeight: 600 }}>{fmtAmount(openingBalance, statementCurrency)}</span></div>
                <div><span style={{ color: "#6B7280" }}>مدين: </span><span style={{ color: "#1E40AF", fontWeight: 600 }}>{hasMixedCurrencies ? "—" : fmtAmount(displayTotalDebit, statementCurrency)}</span></div>
                <div><span style={{ color: "#6B7280" }}>دائن: </span><span style={{ color: "#065F46", fontWeight: 600 }}>{hasMixedCurrencies ? "—" : fmtAmount(displayTotalCredit, statementCurrency)}</span></div>
                <div className="mr-auto">
                  {hasMixedCurrencies ? (
                    <span style={{ color: "#D97706", fontWeight: 600, fontSize: 12 }}>⚠️ عملات مختلطة — لا يمكن احتساب رصيد إجمالي</span>
                  ) : (
                    <><span style={{ color: "#6B7280" }}>الرصيد: </span><span style={{ color: balColor(displayClosingBalance), fontWeight: 700, fontSize: 15 }}>{fmtAmount(displayClosingBalance, statementCurrency)}</span><span className="text-[11px] mr-1" style={{ color: "#6B7280" }}>{displayClosingBalance > 0 ? "(مدين)" : displayClosingBalance < 0 ? "(دائن)" : ""}</span></>
                  )}
                </div>
              </div>
            </div>

            {hasTransactionsAfterDateTo && (
              <div className="rounded-lg mb-1 flex items-start gap-2" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", padding: "6px 10px" }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#D97706" }} />
                <div className="text-xs leading-6" style={{ color: "#92400E" }}>
                  يوجد حركات أحدث لهذه الجهة بتاريخ {fmtDate(selectedEntityLatestTxDate)}، لكن فلتر "إلى" الحالي ينتهي في {fmtDate(dateTo)}.
                  <button
                    type="button"
                    onClick={() => { setDateTo(selectedEntityLatestTxDate); setActivePeriod(""); }}
                    className="underline font-semibold mx-1"
                    style={{ color: "#92400E" }}
                  >
                    اعرض حتى آخر حركة
                  </button>
                </div>
              </div>
            )}

            {/* ─── FILTER BAR ─── */}
            <div className="rounded-lg" style={{ background: "white", border: "1px solid #E5E7EB", padding: "4px 8px" }}>
              <div className="flex items-center gap-2 flex-wrap">
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

                {/* Cost center filter */}
                <Select value={txCostCenter} onValueChange={setTxCostCenter}>
                  <SelectTrigger className="h-7 w-44 text-[11px] border-gray-200"><SelectValue placeholder="مركز التكلفة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل مراكز التكلفة</SelectItem>
                    <SelectItem value="__none__">بدون مركز تكلفة</SelectItem>
                    {costCenters.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.code} - {c.name_ar || c.name}</SelectItem>
                    ))}
                  </SelectContent>
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
              </div>
            </div>

            {/* ─── TRANSACTIONS TABLE ─── */}
            <div className="rounded-lg overflow-hidden" style={{ background: "white", border: "1px solid #E5E7EB" }}>
              {(() => {
                const screenCols: Array<{ key: string; label: string; width: string }> = [
                  { key: "date", label: "التاريخ", width: "10%" },
                  ...(statementOptions.showReference ? [{ key: "reference", label: "المرجع", width: "13%" }] : []),
                  { key: "description", label: "البيان", width: statementOptions.showReference ? "22%" : "32%" },
                  ...(statementOptions.showDueDate ? [{ key: "due", label: "الاستحقاق", width: "9%" }] : []),
                  ...(statementOptions.showType ? [{ key: "type", label: "النوع", width: "9%" }] : []),
                  { key: "cost_center", label: "مركز التكلفة", width: "11%" },
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
                  <tr style={{ background: "#0D1B2E", borderBottom: "1px solid #0D1B2E" }}>
                    {screenCols.map(c => {
                      const numeric = c.key === "debit" || c.key === "credit" || c.key === "balance";
                      const sortable = c.key !== "balance";
                      const active = sortState.key === c.key;
                      const Icon = active ? (sortState.dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                      return (
                        <th key={c.key} style={{ padding: "2px 6px", fontSize: 10, lineHeight: 1.15, fontWeight: 700, color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", height: 24, textAlign: numeric ? "left" : "right", direction: numeric ? "ltr" : undefined }}>
                          {sortable ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(c.key)}
                              title="انقر للترتيب (تصاعدي / تنازلي / إلغاء)"
                              className="inline-flex items-center gap-1 hover:opacity-80"
                              style={{ color: "#FFFFFF", fontWeight: active ? 700 : 600 }}
                            >
                              <span>{c.label}</span>
                              <Icon style={{ width: 12, height: 12, opacity: active ? 1 : 0.35 }} />
                            </button>
                          ) : c.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                    {screenCols.map(c => {
                      if (c.key === "date") return <td key={c.key} style={{ padding: "3px 8px", fontSize: 11, color: "#6B7280", fontStyle: "italic" }}>{fmtDate(dateFrom)}</td>;
                      if (c.key === "reference") return <td key={c.key} style={{ padding: "3px 8px", fontSize: 11, color: "#6B7280" }}>—</td>;
                      if (c.key === "description") return <td key={c.key} style={{ padding: "3px 8px", fontSize: 11, color: "#6B7280", fontStyle: "italic" }}>رصيد أول المدة</td>;
                      if (c.key === "debit") return <td key={c.key} style={{ padding: "3px 8px", fontSize: 11, fontWeight: 600, color: "#1E40AF", textAlign: "left", direction: "ltr" }}>{openingBalance > 0 ? fmtAmount(openingBalance, statementCurrency) : "—"}</td>;
                      if (c.key === "credit") return <td key={c.key} style={{ padding: "3px 8px", fontSize: 11, fontWeight: 600, color: "#065F46", textAlign: "left", direction: "ltr" }}>{openingBalance < 0 ? fmtAmount(openingBalance, statementCurrency) : "—"}</td>;
                      if (c.key === "balance") return <td key={c.key} style={{ padding: "3px 8px", fontSize: 11, fontWeight: 600, color: balColor(openingBalance), textAlign: "left", direction: "ltr" }}>{fmtAmount(openingBalance, statementCurrency)}</td>;
                      return <td key={c.key} style={{ padding: "3px 8px" }} />;
                    })}
                  </tr>

                  {loading && statementRowsWithDetails.length === 0 ? (
                    <tr><td colSpan={colSpan} style={{ textAlign: "center", padding: 40, color: "#9CA3AF", fontSize: 13 }}><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />جاري التحميل...</td></tr>
                  ) : filteredRows.length === 0 ? (
                    <tr><td colSpan={colSpan} style={{ textAlign: "center", padding: 40, color: "#9CA3AF", fontSize: 13 }}>لا توجد حركات في هذه الفترة</td></tr>
                  ) : (
                    statementRowsWithDetails.map((row, i) => {
                      // ─── POS Shift Summary Row (Collapsible) ───
                      if (row.isShiftSummary) {
                        const meta = row.shiftMeta;
                        const isOpen = row.shiftSessionId ? expandedShifts.has(row.shiftSessionId) : false;
                        const variance = meta?.cash_variance;
                        const varianceLabel = variance == null ? null
                          : Math.abs(variance) < 0.005 ? 'مطابق'
                          : variance > 0 ? `+${fmtAmount(variance, row.currency)} زيادة`
                          : `${fmtAmount(variance, row.currency)} عجز`;
                        const varianceColor = variance == null || Math.abs(variance) < 0.005 ? '#065F46' : variance > 0 ? '#B45309' : '#B91C1C';
                        return (
                          <tr
                            key={row.transaction_id + '-' + i}
                            onClick={() => row.shiftSessionId && toggleShiftExpanded(row.shiftSessionId)}
                            style={{
                              borderBottom: '1px solid #E5E7EB',
                              background: isOpen ? '#EFF6FF' : '#F8FAFC',
                              cursor: 'pointer',
                            }}
                            className="hover:bg-blue-50 transition-colors"
                          >
                            {screenCols.map(c => {
                              if (c.key === 'date') return (
                                <td key={c.key} style={{ padding: '4px 8px', fontSize: 11, color: '#0D1B2E', fontWeight: 700 }}>
                                  <div>{fmtDate(row.date)}</div>
                                  <div style={{ fontSize: 9, color: '#6B7280', fontWeight: 500 }}>{getDayName(row.date)}</div>
                                </td>
                              );
                              if (c.key === 'reference') return (
                                <td key={c.key} style={{ padding: '4px 8px', fontSize: 10, fontFamily: 'monospace', color: '#475569', fontWeight: 600 }}>
                                  {row.reference}
                                </td>
                              );
                              if (c.key === 'description') return (
                                <td key={c.key} style={{ padding: '4px 8px', fontSize: 11.5, color: '#0D1B2E', fontWeight: 600 }}>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <ChevronRight
                                      className="w-3.5 h-3.5 shrink-0 transition-transform"
                                      style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', color: '#0D1B2E' }}
                                    />
                                    <span>{row.description}</span>
                                    {meta?.state === 'open' && (
                                      <span style={{ background: '#DBEAFE', color: '#1E40AF', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>مفتوحة</span>
                                    )}
                                    {varianceLabel && (
                                      <span style={{ background: '#F1F5F9', color: varianceColor, padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>
                                        {`النقد: ${varianceLabel}`}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                              if (c.key === 'due') return <td key={c.key} style={{ padding: '4px 8px' }} />;
                              if (c.key === 'type') return (
                                <td key={c.key} style={{ padding: '4px 8px', fontSize: 9.5 }}>
                                  <span style={{ background: '#0D1B2E', color: 'white', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>وردية POS</span>
                                </td>
                              );
                              if (c.key === 'cost_center') return <td key={c.key} style={{ padding: '4px 8px' }} />;
                              if (c.key === 'debit') return (
                                <td key={c.key} style={{ padding: '4px 8px', fontSize: 12, fontWeight: 700, color: '#1E40AF', textAlign: 'left', direction: 'ltr', fontFamily: 'tabular-nums' }}>
                                  {row.debit > 0 ? fmtAmount(row.debit, row.currency) : '—'}
                                </td>
                              );
                              if (c.key === 'credit') return (
                                <td key={c.key} style={{ padding: '4px 8px', fontSize: 12, fontWeight: 700, color: '#065F46', textAlign: 'left', direction: 'ltr', fontFamily: 'tabular-nums' }}>
                                  {row.credit > 0 ? fmtAmount(row.credit, row.currency) : '—'}
                                </td>
                              );
                              if (c.key === 'balance') return (
                                <td key={c.key} style={{ padding: '4px 8px', fontSize: 12, fontWeight: 800, color: balColor(row.balance), textAlign: 'left', direction: 'ltr', fontFamily: 'tabular-nums' }}>
                                  {fmtAmount(row.balance, row.currency)}
                                  <span style={{ fontSize: 9, fontWeight: 400, color: '#9CA3AF', marginRight: 2 }}>{row.balance > 0 ? 'م' : row.balance < 0 ? 'د' : ''}</span>
                                </td>
                              );
                              return <td key={c.key} style={{ padding: '4px 8px' }} />;
                            })}
                          </tr>
                        );
                      }
                      // ─── Nested Invoice Items Table (Document-aware) ───
                      if (row.lineItemDetail === "invoice-table" && row.invoiceItems && row.invoiceItems.length > 0) {
                        const items = row.invoiceItems;
                        const isSingle = items.length === 1;
                        const cardStyle: React.CSSProperties = {
                          background: "#F8FAFC",
                          borderRight: "3px solid #0D1B2E",
                          borderRadius: 8,
                          padding: "3px 8px",
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
                                    {taxEnabled && (
                                      <span style={chipStyle}>
                                        <span style={chipLabel}>الضريبة:</span>
                                        <span style={{ ...chipValue, color: "#475569" }}>{it.tax > 0 ? `${it.tax}%` : "—"}</span>
                                      </span>
                                    )}
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
                                      {taxEnabled && (
                                        <th style={{ textAlign: "left", padding: "5px 8px", fontWeight: 700, color: "#FFFFFF", fontSize: 10, width: 55 }}>ضريبة</th>
                                      )}
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
                                        {taxEnabled && (
                                          <td style={{ padding: "3px 8px", textAlign: "left", direction: "ltr", color: "#64748B", fontFamily: "tabular-nums", fontSize: 10.5 }}>{it.tax > 0 ? `${it.tax}%` : "—"}</td>
                                        )}
                                        <td style={{ padding: "3px 8px", textAlign: "left", direction: "ltr", color: "#065F46", fontFamily: "tabular-nums", fontWeight: 600, fontSize: 10.5 }}>{fmtAmount(it.total, row.currency)}</td>
                                      </tr>
                                    ))}
                                     <tr style={{ background: "#ECFDF5" }}>
                                      <td colSpan={taxEnabled ? 5 : 4} style={{ padding: "4px 8px", textAlign: "left", fontSize: 10, color: "#475569", fontWeight: 600 }}>الإجمالي</td>
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
                      <tr key={row.transaction_id + "-" + i} style={{ borderBottom: "1px solid #F3F4F6", cursor: row.isLineItem ? "default" : "pointer", background: row.isShiftChild ? "#FAFBFC" : row.isLineItem ? "#F9FAFB" : row.isCancelled ? "#F9FAFB" : undefined, opacity: navigatingRowId === row.transaction_id ? 0.6 : (row.isCancelled ? 0.7 : 1) }} className={row.isLineItem ? "" : "hover:bg-gray-50 transition-colors group"} onClick={() => { if (!row.isLineItem) openRowDocument(row); }}>
                        {screenCols.map(c => {
                          if (c.key === "date") return (
                            <td key={c.key} style={{ padding: "3px 8px", fontSize: 11, color: "#374151" }}>
                          <span style={{ whiteSpace: "nowrap" }}>{fmtDate(row.date)}</span>
                          <span style={{ fontSize: 9, color: "#9CA3AF", marginRight: 4 }}>{getDayName(row.date)}</span>
                            </td>
                          );
                          if (c.key === "reference") return (
                            <td key={c.key} style={{ padding: "3px 8px", fontSize: 11, fontFamily: "monospace", wordBreak: "break-all" }}>
                          {row.reference ? (
                             <button
                               onClick={(e) => { e.stopPropagation(); openRowDocument(row); }}
                               className="hover:underline text-left"
                               title={row.reference}
                               style={{ color: "#2563EB", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontFamily: "monospace", textDecoration: row.isCancelled ? "line-through" : "none", whiteSpace: "nowrap" }}
                             >
                               {row.isLineItem ? "—" : formatReferenceLabel(row.reference)}
                             </button>
                          ) : "—"}
                            </td>
                          );
                          if (c.key === "description") return (
                            <td key={c.key} style={{ padding: "3px 8px", fontSize: 11, color: "#111827", lineHeight: 1.35 }}>
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
                            <td key={c.key} style={{ padding: "3px 8px", fontSize: 10, color: "#9CA3AF" }}>{row.dueDate ? fmtDate(row.dueDate) : "—"}</td>
                          );
                          if (c.key === "type") return (
                            <td key={c.key} style={{ padding: "3px 8px", fontSize: 10, color: "#6B7280", fontWeight: 400 }}>{getTypeBadge(row.transaction_type)}</td>
                          );
                          if (c.key === "cost_center") return (
                            <td key={c.key} style={{ padding: "3px 8px", fontSize: 10 }}>
                              {row.cost_center_id ? (
                                <span className="inline-block bg-primary/10 text-primary rounded px-1 text-[10px] font-medium max-w-full truncate align-middle" title={ccLabel(row.cost_center_id)}>
                                  {ccLabel(row.cost_center_id)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/60 text-[10px]">بدون مركز</span>
                              )}
                            </td>
                          );
                          if (c.key === "debit") return (
                            <td key={c.key} style={{ padding: "3px 8px", fontSize: 11, fontWeight: 600, color: row.isMismatch ? "#D97706" : "#1E40AF", textAlign: "left", direction: "ltr", fontFamily: "tabular-nums" }}>
                          {row.debit > 0 ? fmtAmount(row.debit, row.currency) : "—"}
                          {row.debit > 0 && row.foreignDetail && <span style={{ fontSize: 9, color: "#9CA3AF", marginLeft: 4 }}>{row.foreignDetail}</span>}
                          {row.debit > 0 && row.isConverted && <span title={row.usedHistoricRate ? `محوّل بسعر يوم القيد: 1${getCurrencySymbol(row.currency)} = ₪${row.conversionRate?.toFixed(4) || "?"}` : `محوّل بسعر اليوم: 1${getCurrencySymbol(row.currency)} = ₪${row.conversionRate?.toFixed(4) || "?"}`} style={{ fontSize: 10, marginLeft: 3, cursor: "help" }}>⚡</span>}
                          {row.debit > 0 && row.isMismatch && <span title="عملة مختلفة — معروض بالشيكل" style={{ fontSize: 10, marginLeft: 3, cursor: "help" }}>⚠️</span>}
                            </td>
                          );
                          if (c.key === "credit") return (
                            <td key={c.key} style={{ padding: "3px 8px", fontSize: 11, fontWeight: 600, color: row.isMismatch ? "#D97706" : "#065F46", textAlign: "left", direction: "ltr", fontFamily: "tabular-nums" }}>
                          {row.credit > 0 ? fmtAmount(row.credit, row.currency) : "—"}
                          {row.credit > 0 && row.foreignDetail && <span style={{ fontSize: 9, color: "#9CA3AF", marginLeft: 4 }}>{row.foreignDetail}</span>}
                          {row.credit > 0 && row.isConverted && <span title={row.usedHistoricRate ? `محوّل بسعر يوم القيد: 1${getCurrencySymbol(row.currency)} = ₪${row.conversionRate?.toFixed(4) || "?"}` : `محوّل بسعر اليوم: 1${getCurrencySymbol(row.currency)} = ₪${row.conversionRate?.toFixed(4) || "?"}`} style={{ fontSize: 10, marginLeft: 3, cursor: "help" }}>⚡</span>}
                          {row.credit > 0 && row.isMismatch && <span title="عملة مختلفة — معروض بالشيكل" style={{ fontSize: 10, marginLeft: 3, cursor: "help" }}>⚠️</span>}
                            </td>
                          );
                          if (c.key === "balance") return (
                            <td key={c.key} style={{ padding: "3px 8px", fontSize: 11, fontWeight: 700, color: balColor(row.balance), textAlign: "left", direction: "ltr", fontFamily: "tabular-nums" }}>
                          <div className="flex items-center gap-1">
                            <span>
                              {Number.isFinite(row.balance) ? fmtAmount(row.balance, row.currency) : "—"}
                              {Number.isFinite(row.balance) && <span style={{ fontSize: 9, fontWeight: 400, color: "#9CA3AF", marginRight: 2 }}>{row.balance > 0 ? "م" : row.balance < 0 ? "د" : ""}</span>}
                            </span>
                            <ArrowLeft className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" style={{ color: "#9CA3AF" }} />
                          </div>
                            </td>
                          );
                          return <td key={c.key} style={{ padding: "3px 8px" }} />;
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
                        if (c.key === "debit") return <td key={c.key} style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#1E40AF", textAlign: "left", direction: "ltr" }}>{hasMixedCurrencies ? "—" : fmtAmount(displayTotalDebit, statementCurrency)}</td>;
                        if (c.key === "credit") return <td key={c.key} style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#065F46", textAlign: "left", direction: "ltr" }}>{hasMixedCurrencies ? "—" : fmtAmount(displayTotalCredit, statementCurrency)}</td>;
                        if (c.key === "balance") return <td key={c.key} style={{ padding: "10px 12px", fontSize: 13, fontWeight: 800, color: hasMixedCurrencies ? "#D97706" : balColor(displayClosingBalance), textAlign: "left", direction: "ltr" }}>{hasMixedCurrencies ? "—" : fmtAmount(displayClosingBalance, statementCurrency)}</td>;
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
              إجمالي الحركات: {filteredRows.length} قيد{hasMixedCurrencies ? " | ⚠️ عملات مختلطة — الأرصدة غير دقيقة" : ` | مدين: ${fmtAmount(displayTotalDebit, statementCurrency)} | دائن: ${fmtAmount(displayTotalCredit, statementCurrency)} | الرصيد الختامي: ${fmtAmount(displayClosingBalance, statementCurrency)} (${displayClosingBalance > 0 ? "مدين" : displayClosingBalance < 0 ? "دائن" : "مسدّد"})`} | تاريخ الطباعة: {fmtDate(format(new Date(), "yyyy-MM-dd"))}
              {displayCurrency !== "ILS" && currentExchangeRate[displayCurrency] && (
                <span> | * الحركات المعلّمة بـ ⚡ محوّلة بسعر صرف يوم القيد أو {currentExchangeRate[displayCurrency]} ₪ لكل {getCurrencySymbol(codeToCurrencyName[displayCurrency])}</span>
              )}
            </div>
          </>
        )}

        {/* ─── FLOATING JUMP-TO-TOP / JUMP-TO-BOTTOM ─── */}
        {selectedEntityId && filteredRows.length > 10 && (
          createPortal(
            <div
              className="flex flex-col gap-2 print:hidden pointer-events-auto"
              style={{ position: "fixed", bottom: 24, insetInlineStart: 100, zIndex: 9998 }}
              dir="ltr"
            >
              <button
                type="button"
                onClick={scrollToTop}
                title="الصعود لأعلى الكشف (Ctrl+Home)"
                aria-label="الصعود لأعلى الكشف"
                className="h-11 w-11 rounded-full shadow-lg ring-2 ring-background border border-border bg-background hover:bg-accent flex items-center justify-center transition-colors"
              >
                <ChevronsUp className="w-5 h-5 text-foreground" />
              </button>
              <button
                type="button"
                onClick={scrollToBottom}
                title="النزول لآخر الكشف (Ctrl+End)"
                aria-label="النزول لآخر الكشف"
                className="h-11 w-11 rounded-full shadow-lg ring-2 ring-background bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center transition-colors"
              >
                <ChevronsDown className="w-5 h-5" />
              </button>
            </div>,
            document.body
          )
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
                srcDoc={buildCurrentStatementPrintHTML()}
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
    </FinanceShell>
  );
};

export default AccountStatementV2Page;
