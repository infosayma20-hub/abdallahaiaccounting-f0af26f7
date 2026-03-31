import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ArrowRight, Loader2, RefreshCw, Search, FileSpreadsheet,
  TrendingUp, TrendingDown, Wallet, Printer, Calendar,
  BookOpen, Users, Truck, UserCheck, ChevronLeft, LayoutGrid,
  Settings2, AlertTriangle, FileText, CreditCard, Send, X,
  Phone, Mail, MapPin, Clock, ChevronDown, Filter, Star,
  MessageSquare, Link2, Eye, Pencil, Receipt, User, Menu,
} from "lucide-react";
import * as XLSX from "xlsx";
import { generateStatementPDF } from "@/utils/generateStatementPDF";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, differenceInDays, parseISO, subYears, subMonths } from "date-fns";
import { ar } from "date-fns/locale";
import { cn, multiWordMatchAny } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import StatementPrintView from "@/components/StatementPrintView";
import AdvancedEntitySearch from "@/components/account-statement/AdvancedEntitySearch";

// ─── TYPES ───
interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  linked_account_code: string | null;
  credit_limit?: number;
  current_balance?: number;
  contact_class?: string;
}

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

interface EmployeeEntity {
  id: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  phone: string | null;
  base_salary: number;
  account_code: string | null;
}

interface Transaction {
  id: string;
  description: string;
  transaction_type: string;
  amount: number;
  currency: string;
  transaction_date: string;
  debit_account_code: string;
  credit_account_code: string;
  reference: string | null;
  is_deleted: boolean;
  contact_id: string | null;
  payment_method: string | null;
  foreign_amount: number | null;
  exchange_rate: number | null;
}

interface Cheque {
  id: string;
  cheque_number: string | null;
  cheque_type: string;
  amount: number;
  currency: string;
  cheque_date: string;
  party_name: string;
  status: string;
  bank_name: string | null;
}

interface InvoiceLineItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  unit_of_measure?: string | null;
  discount?: number | null;
}

interface StatementRow {
  date: string;
  description: string;
  transaction_type: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  transaction_id: string;
  currency: string;
  payment_method: string | null;
  dueDate?: string;
  isLineItem?: boolean;
  lineItemDetail?: string;
}

type EntityTab = "customers" | "suppliers" | "employees" | "accounts";
type DetailLevel = "summary" | "total" | "lineItems";

// ─── CONSTANTS ───
const ENTITY_TABS: { key: EntityTab; label: string; icon: any; color: string; accountCode: string; type: string }[] = [
  { key: "customers", label: "الزبائن", icon: Users, color: "text-blue-500", accountCode: "1130", type: "عميل" },
  { key: "suppliers", label: "الموردين", icon: Truck, color: "text-amber-500", accountCode: "2110", type: "مورد" },
  { key: "employees", label: "الموظفين", icon: UserCheck, color: "text-emerald-500", accountCode: "2180", type: "موظف" },
  { key: "accounts", label: "الحسابات", icon: LayoutGrid, color: "text-purple-500", accountCode: "", type: "account" },
];

const currentYear = new Date().getFullYear();
const FISCAL_YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const QUICK_PERIODS = [
  { label: "هذا الشهر", from: () => format(startOfMonth(new Date()), "yyyy-MM-dd"), to: () => format(endOfMonth(new Date()), "yyyy-MM-dd") },
  { label: "الشهر الماضي", from: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return format(startOfMonth(d), "yyyy-MM-dd"); }, to: () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return format(endOfMonth(d), "yyyy-MM-dd"); } },
  { label: "الربع الحالي", from: () => format(startOfQuarter(new Date()), "yyyy-MM-dd"), to: () => format(endOfQuarter(new Date()), "yyyy-MM-dd") },
  { label: "هذه السنة", from: () => format(startOfYear(new Date()), "yyyy-MM-dd"), to: () => format(endOfYear(new Date()), "yyyy-MM-dd") },
  { label: "كل الفترات", from: () => "2020-01-01", to: () => format(new Date(), "yyyy-MM-dd") },
];

const CURRENCIES = [
  { value: "all", label: "كل العملات" },
  { value: "شيكل", label: "₪ شيكل", aliases: ["ILS", "شيكل"] },
  { value: "دولار", label: "$ دولار", aliases: ["USD", "دولار"] },
  { value: "دينار", label: "د.أ دينار", aliases: ["JOD", "دينار"] },
  { value: "يورو", label: "€ يورو", aliases: ["EUR", "يورو"] },
  { value: "جنيه", label: "£ جنيه", aliases: ["EGP", "جنيه"] },
];

const normalizeCurrency = (c: string): string => {
  if (!c) return "شيكل";
  const map: Record<string, string> = {
    "ILS": "شيكل", "شيكل": "شيكل",
    "USD": "دولار", "دولار": "دولار",
    "JOD": "دينار", "دينار": "دينار",
    "EUR": "يورو", "يورو": "يورو",
    "EGP": "جنيه", "جنيه": "جنيه",
  };
  return map[c] || c;
};

const TX_TYPE_FILTERS = [
  { value: "all", label: "الكل" },
  { value: "sale", label: "فواتير مبيعات" },
  { value: "receipt", label: "سندات قبض" },
  { value: "payment", label: "سندات صرف" },
  { value: "journal", label: "قيود محاسبية" },
  { value: "purchase", label: "فواتير مشتريات" },
];

// ─── FORMAT HELPERS ───
const getCurrencySymbol = (c: string): string => {
  const norm = normalizeCurrency(c);
  if (norm === "دولار") return "$";
  if (norm === "دينار") return "د.أ";
  if (norm === "يورو") return "€";
  if (norm === "جنيه") return "£";
  return "₪";
};

const fmtAmount = (n: number, currency?: string) => {
  if (n === 0) return "—";
  const symbol = getCurrencySymbol(currency || "شيكل");
  return `${symbol}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d: string) => {
  if (!d) return "—";
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
};

const getDayName = (d: string) => {
  try {
    const date = parseISO(d);
    const today = new Date();
    const diff = differenceInDays(today, date);
    if (diff === 0) return "اليوم";
    if (diff === 1) return "أمس";
    return format(date, "EEEE", { locale: ar });
  } catch { return ""; }
};

const PAYMENT_METHOD_AR: Record<string, string> = {
  cash: "نقدي", نقدي: "نقدي",
  credit: "آجل", آجل: "آجل",
  bank: "بنك", بنك: "بنك",
  cheque: "شيك", شيك: "شيك",
  check: "شيك",
  transfer: "تحويل", تحويل: "تحويل",
  card: "بطاقة", بطاقة: "بطاقة",
  employee_account: "حساب موظف",
};

const getTypeBadge = (txType: string) => {
  if (txType.includes("pos")) return { label: "مبيعات POS", color: "bg-teal-500/10 text-teal-600 border-teal-500/20" };
  if (txType.includes("sale") || txType.includes("فاتورة")) return { label: "فاتورة مبيعات", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" };
  if (txType.includes("receipt") || txType.includes("قبض")) return { label: "سند قبض", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };
  if (txType.includes("payment") || txType.includes("صرف")) return { label: "سند صرف", color: "bg-red-500/10 text-red-600 border-red-500/20" };
  if (txType.includes("purchase") || txType.includes("مشتريات")) return { label: "فاتورة مشتريات", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" };
  if (txType.includes("journal") || txType.includes("قيد") || txType.includes("salary")) return { label: "قيد محاسبي", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" };
  if (txType.includes("cheque")) return { label: "شيك", color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" };
  if (txType.includes("opening_balance")) return { label: "رصيد افتتاحي", color: "bg-muted text-muted-foreground border-border" };
  return { label: "حركة", color: "bg-muted text-muted-foreground border-border" };
};

// Display options type
interface DisplayOptions {
  showNotes: boolean;
  showPaymentMethod: boolean;
  showCurrency: boolean;
  showCheques: boolean;
  showVoucherDetails: boolean;
  showDueDate: boolean;
  showContactCode: boolean;
  showChildAccounts: boolean;
  showSalesOrder: boolean;
  includeBounced: boolean;
  includePDC: boolean;
}

const DEFAULT_DISPLAY_OPTIONS: DisplayOptions = {
  showNotes: false,
  showPaymentMethod: true,
  showCurrency: false,
  showCheques: true,
  showVoucherDetails: true,
  showDueDate: true,
  showContactCode: false,
  showChildAccounts: false,
  showSalesOrder: false,
  includeBounced: false,
  includePDC: false,
};

// Column config
interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: "date", label: "التاريخ", visible: true },
  { key: "reference", label: "المرجع", visible: true },
  { key: "description", label: "البيان", visible: true },
  { key: "dueDate", label: "الاستحقاق", visible: true },
  { key: "type", label: "النوع", visible: true },
  { key: "paymentMethod", label: "طريقة الدفع", visible: false },
  { key: "currency", label: "العملة", visible: false },
  { key: "contactCode", label: "كود الجهة", visible: false },
  { key: "debit", label: "مدين", visible: true },
  { key: "credit", label: "دائن", visible: true },
  { key: "balance", label: "الرصيد", visible: true },
  { key: "notes", label: "ملاحظات", visible: false },
];

// ─── ENTITY SEARCH COMBOBOX ───
interface EntitySearchComboboxProps {
  entities: { id: string; name: string; subtitle?: string; balance: number; accountCode?: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
}

const EntitySearchCombobox = ({ entities, selectedId, onSelect, placeholder }: EntitySearchComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedEntity = entities.find(e => e.id === selectedId);

  const filtered = useMemo(() => {
    if (!search.trim()) return entities;
    return entities.filter(e => multiWordMatchAny(search, e.name, e.accountCode, e.subtitle));
  }, [entities, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    onSelect(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex items-center gap-2 bg-muted/50 border border-border rounded-xl px-3 h-10 cursor-pointer transition-colors hover:border-primary/50",
          open && "border-primary ring-2 ring-primary/10"
        )}
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
      >
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        {open ? (
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={placeholder || "ابحث بالاسم..."}
            className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm truncate">
            {selectedEntity ? (
              <span className="flex items-center gap-2">
                <span className="text-foreground font-medium">✓ {selectedEntity.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder || "ابحث بالاسم..."}</span>
            )}
          </span>
        )}
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">لا توجد نتائج</div>
          ) : (
            filtered.map(e => (
              <button
                key={e.id}
                onClick={() => handleSelect(e.id)}
                className={cn(
                  "w-full text-right px-3 py-2.5 flex items-center justify-between hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0",
                  e.id === selectedId && "bg-primary/5"
                )}
              >
                <div className="flex flex-col items-start">
                  <span className={cn("text-sm font-medium", e.id === selectedId ? "text-primary" : "text-foreground")}>{e.name}</span>
                  {e.subtitle && <span className="text-[10px] text-muted-foreground">{e.subtitle}</span>}
                </div>
                <span className={cn("text-xs font-bold tabular-nums shrink-0 mr-2",
                  (() => {
                    const code = (e as any).accountCode || "";
                    const isAssetOrExpense = code.startsWith("1") || code.startsWith("5");
                    if (e.balance === 0) return "text-muted-foreground";
                    if (isAssetOrExpense) return e.balance > 0 ? "text-foreground" : "text-red-600";
                    return e.balance > 0 ? "text-red-600" : "text-emerald-600";
                  })()
                )}>
                  {e.balance === 0 ? "✓" : fmtAmount(e.balance)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ─── MAIN COMPONENT ───
const AccountStatementPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // URL params
  const urlContactId = searchParams.get("contact_id") || "";
  const urlContactType = searchParams.get("contact_type") || "";
  const urlEmployeeName = searchParams.get("employee_name") || "";
  const urlAccountCode = searchParams.get("code") || "";

  // Responsive sidebar
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1400);
  const sidebarCollapsed = windowWidth < 1280;
  const [showMobileEntitySheet, setShowMobileEntitySheet] = useState(false);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [employeeEntities, setEmployeeEntities] = useState<EmployeeEntity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [invoiceItemsMap, setInvoiceItemsMap] = useState<Record<string, InvoiceLineItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [companyInfo, setCompanyInfo] = useState({
    name: "", logo_url: "", address: "", phone: "", email: "", website: "", tax_number: "",
  });
  const [fiscalYearStart, setFiscalYearStart] = useState(1);
  const [activeTab, setActiveTab] = useState<EntityTab>(
    urlAccountCode ? "accounts" : urlEmployeeName ? "employees" : urlContactType === "مورد" ? "suppliers" : "customers"
  );
  const [selectedEntityId, setSelectedEntityId] = useState(urlContactId);
  const [entitySearch, setEntitySearch] = useState("");
  const [txSearch, setTxSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [activePeriod, setActivePeriod] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState("all");
  const [displayOptions, setDisplayOptions] = useState<DisplayOptions>(() => {
    try { const s = localStorage.getItem("stmt_display_options"); if (s) return { ...DEFAULT_DISPLAY_OPTIONS, ...JSON.parse(s) }; } catch {} return DEFAULT_DISPLAY_OPTIONS;
  });
  const [showCustomizePanel, setShowCustomizePanel] = useState(false);
  const [showPreviewDrawer, setShowPreviewDrawer] = useState(false);
  const [previewTxId, setPreviewTxId] = useState<string>("");
  const [txTypeFilter, setTxTypeFilter] = useState("all");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>(() => {
    try { const s = localStorage.getItem("stmt_detail_level"); if (s) return s as DetailLevel; } catch {} return "total";
  });
  const [showYearComparison, setShowYearComparison] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);

  // Load saved column prefs
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    try {
      const saved = localStorage.getItem("statement_columns_prefs");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults in case new columns were added
        const keys = parsed.map((c: ColumnConfig) => c.key);
        const merged = [...parsed];
        for (const def of DEFAULT_COLUMNS) {
          if (!keys.includes(def.key)) merged.push(def);
        }
        return merged;
      }
      return DEFAULT_COLUMNS;
    } catch { return DEFAULT_COLUMNS; }
  });

  const activeTabConfig = ENTITY_TABS.find(t => t.key === activeTab)!;
  const isAccountsTab = activeTab === "accounts";
  const isEmployeesTab = activeTab === "employees";

  // ─── FETCH DATA ───
  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: contactData }, { data: accData }, { data: txData }, profileRes, { data: empData }, { data: csData }, { data: chequeData }, { data: companyData }] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, contact_name, contact_type, phone, email, address, linked_account_code, credit_limit, current_balance, contact_class")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("contact_name"),
        supabase
          .from("accounts")
          .select("id, account_code, account_name, account_type")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("account_code"),
        supabase
          .from("transactions")
          .select("id, description, transaction_type, amount, currency, transaction_date, debit_account_code, credit_account_code, reference, is_deleted, contact_id, payment_method, foreign_amount, exchange_rate")
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .order("transaction_date", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase.from("profiles").select("company_name, display_name").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("employees")
          .select("id, full_name, department, job_title, phone, base_salary")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("full_name"),
        supabase
          .from("company_settings")
          .select("company_name, logo_url, address, phone, email, website, tax_number, fiscal_year_start")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("cheques")
          .select("id, cheque_number, cheque_type, amount, currency, cheque_date, party_name, status, bank_name")
          .eq("user_id", user.id)
          .order("cheque_date", { ascending: false }),
        supabase
          .from("companies")
          .select("id, name, logo_url, address, phone, email, tax_number")
          .eq("owner_id", user.id)
          .maybeSingle(),
      ]);

      setContacts((contactData as Contact[]) || []);
      setAccounts((accData as Account[]) || []);
      setTransactions((txData as Transaction[]) || []);
      setCheques((chequeData as Cheque[]) || []);

      // Fetch invoice line items for lineItems detail level
      const allTx = ((txData as Transaction[]) || []);
      const candidateTx = allTx.filter(tx => {
        const ref = tx.reference || "";
        return ref.startsWith("INV-") || ref.startsWith("PO-") || ref.startsWith("PUR-") || ref.startsWith("POS-");
      });

      const txIds = candidateTx.map(tx => tx.id);
      const invoiceRefs = Array.from(new Set(
        candidateTx
          .map(tx => (tx.reference || "").trim())
          .filter(Boolean)
      ));

      if (txIds.length === 0 && invoiceRefs.length === 0) {
        setInvoiceItemsMap({});
      } else {
        const limitedTxIds = txIds.slice(0, 500);
        const limitedRefs = invoiceRefs.slice(0, 500);

        const [salesInvByTxRes, salesInvByRefRes, purchaseInvByTxRes, purchaseInvByRefRes] = await Promise.all([
          limitedTxIds.length
            ? supabase
                .from("invoices")
                .select("id, linked_transaction_id, invoice_number")
                .eq("user_id", user.id)
                .in("linked_transaction_id", limitedTxIds)
            : Promise.resolve({ data: [] as any[] }),
          limitedRefs.length
            ? supabase
                .from("invoices")
                .select("id, linked_transaction_id, invoice_number")
                .eq("user_id", user.id)
                .in("invoice_number", limitedRefs)
            : Promise.resolve({ data: [] as any[] }),
          limitedTxIds.length
            ? supabase
                .from("purchase_invoices")
                .select("id, linked_transaction_id, invoice_number")
                .eq("user_id", user.id)
                .in("linked_transaction_id", limitedTxIds)
            : Promise.resolve({ data: [] as any[] }),
          limitedRefs.length
            ? supabase
                .from("purchase_invoices")
                .select("id, linked_transaction_id, invoice_number")
                .eq("user_id", user.id)
                .in("invoice_number", limitedRefs)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const invoiceById = new Map<string, any>();
        [
          ...(salesInvByTxRes.data || []),
          ...(salesInvByRefRes.data || []),
          ...(purchaseInvByTxRes.data || []),
          ...(purchaseInvByRefRes.data || []),
        ].forEach((inv: any) => {
          if (inv?.id) invoiceById.set(inv.id, inv);
        });

        const allInvoices = Array.from(invoiceById.values());
        const invoiceByTxId = new Map<string, any>();
        const invoiceByNumber = new Map<string, any>();

        allInvoices.forEach((inv: any) => {
          if (inv.linked_transaction_id) {
            invoiceByTxId.set(inv.linked_transaction_id, inv);
          }
          if (inv.invoice_number) {
            invoiceByNumber.set(String(inv.invoice_number).trim().toUpperCase(), inv);
          }
        });

        const txToInvId: Record<string, string> = {};
        candidateTx.forEach((tx) => {
          const refKey = (tx.reference || "").trim().toUpperCase();
          const matchedInvoice = invoiceByTxId.get(tx.id) || invoiceByNumber.get(refKey);
          if (matchedInvoice?.id) {
            txToInvId[tx.id] = matchedInvoice.id;
          }
        });

        const invoiceIds = Array.from(new Set(Object.values(txToInvId)));

        if (invoiceIds.length > 0) {
          const [{ data: salesItems }, { data: purchaseItems }] = await Promise.all([
            supabase
              .from("invoice_items")
              .select("invoice_id, product_name, quantity, unit_price, total_amount, unit_of_measure, discount")
              .in("invoice_id", invoiceIds),
            supabase
              .from("purchase_invoice_items")
              .select("invoice_id, product_name, quantity, unit_price, total_amount, unit, discount_pct")
              .in("invoice_id", invoiceIds),
          ]);

          const normalizedItems = [
            ...((salesItems || []) as any[]).map((item: any) => ({
              invoice_id: item.invoice_id,
              product_name: item.product_name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_amount: item.total_amount,
              unit_of_measure: item.unit_of_measure || null,
              discount: item.discount ?? null,
            })),
            ...((purchaseItems || []) as any[]).map((item: any) => ({
              invoice_id: item.invoice_id,
              product_name: item.product_name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_amount: item.total_amount,
              unit_of_measure: item.unit || null,
              discount: item.discount_pct ?? null,
            })),
          ];

          const itemsByInvoiceId: Record<string, InvoiceLineItem[]> = {};
          normalizedItems.forEach((item: any) => {
            if (!itemsByInvoiceId[item.invoice_id]) itemsByInvoiceId[item.invoice_id] = [];
            itemsByInvoiceId[item.invoice_id].push({
              product_name: item.product_name || "بند",
              quantity: Number(item.quantity || 0),
              unit_price: Number(item.unit_price || 0),
              total_amount: Number(item.total_amount || (Number(item.quantity || 0) * Number(item.unit_price || 0))),
              unit_of_measure: item.unit_of_measure || null,
              discount: item.discount,
            });
          });

          const itemsMap: Record<string, InvoiceLineItem[]> = {};
          Object.entries(txToInvId).forEach(([txId, invId]) => {
            itemsMap[txId] = itemsByInvoiceId[invId] || [];
          });

          setInvoiceItemsMap(itemsMap);
        } else {
          setInvoiceItemsMap({});
        }
      }

      if (profileRes.data?.company_name) setCompanyName(profileRes.data.company_name);

      const cs = csData as any;
      const comp = companyData as any;
      if (cs) {
        setCompanyInfo({
          name: cs.company_name || comp?.name || profileRes.data?.company_name || "",
          logo_url: cs.logo_url || comp?.logo_url || "",
          address: cs.address || comp?.address || "",
          phone: cs.phone || comp?.phone || "",
          email: cs.email || comp?.email || "",
          website: cs.website || "",
          tax_number: cs.tax_number || comp?.tax_number || "",
        });
        if (cs.fiscal_year_start) setFiscalYearStart(cs.fiscal_year_start);
      } else if (comp) {
        setCompanyInfo({
          name: comp.name || profileRes.data?.company_name || "",
          logo_url: comp.logo_url || "",
          address: comp.address || "",
          phone: comp.phone || "",
          email: comp.email || "",
          website: "",
          tax_number: comp.tax_number || "",
        });
      } else if (profileRes.data) {
        setCompanyInfo(prev => ({ ...prev, name: profileRes.data?.company_name || profileRes.data?.display_name || "" }));
      }

      const allAccounts = (accData as Account[]) || [];
      const normalizeArabicName = (value: string = "") => value.replace(/\s+/g, " ").replace(/عبدالله/g, "عبد الله").trim();
      const empList = ((empData as any[]) || []).map((emp: any) => {
        const normalizedEmployeeName = normalizeArabicName(emp.full_name);
        const linkedAcc = allAccounts.find((a) => {
          const isEmployeeReceivable = a.account_type === "أصول" || a.account_type === "asset";
          // Strip common prefixes: "ذمم موظف - ", "ذمم موظف ", "ذمم "
          const normalizedAccountName = normalizeArabicName(
            (a.account_name || "").replace(/^ذمم\s*موظف\s*[-–]\s*/, "").replace(/^ذمم\s+/, "")
          );
          return isEmployeeReceivable && normalizedAccountName === normalizedEmployeeName;
        });
        return { ...emp, account_code: linkedAcc?.account_code || null } as EmployeeEntity;
      });
      setEmployeeEntities(empList);

      if (urlEmployeeName && empList.length > 0) {
        const found = empList.find(e => e.full_name === urlEmployeeName);
        if (found) setSelectedEntityId(found.id);
      }
      if (urlAccountCode && allAccounts.length > 0) {
        const found = allAccounts.find(a => a.account_code === urlAccountCode);
        if (found) setSelectedEntityId(found.id);
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  // ─── FISCAL YEAR HELPER ───
  const setFiscalYear = (year: number) => {
    const startMonth = String(fiscalYearStart).padStart(2, "0");
    const from = `${year}-${startMonth}-01`;
    const endYear = fiscalYearStart > 1 ? year + 1 : year;
    const endMonth = fiscalYearStart > 1 ? fiscalYearStart - 1 : 12;
    const endDate = new Date(endYear, endMonth, 0);
    const to = format(endDate, "yyyy-MM-dd");
    setDateFrom(from);
    setDateTo(to);
    setActivePeriod(`سنة ${year}`);
  };

  // ─── FILTERED CONTACTS BY TAB ───
  const tabContacts = useMemo(() => {
    if (isAccountsTab || isEmployeesTab) return [];
    const type = activeTabConfig.type;
    return contacts.filter(c => c.contact_type === type);
  }, [contacts, activeTab]);

  // ─── ACCOUNT BALANCES ───
  const accountBalances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const acc of accounts) {
      let bal = 0;
      for (const tx of transactions) {
        if (tx.debit_account_code === acc.account_code) bal += tx.amount || 0;
        if (tx.credit_account_code === acc.account_code) bal -= tx.amount || 0;
      }
      map[acc.id] = bal;
    }
    return map;
  }, [accounts, transactions]);

  // ─── EMPLOYEE BALANCES ───
  const employeeBalances = useMemo(() => {
    const map: Record<string, number> = {};
    // Count how many employees share each account code
    const codeCount: Record<string, number> = {};
    for (const emp of employeeEntities) {
      if (emp.account_code) codeCount[emp.account_code] = (codeCount[emp.account_code] || 0) + 1;
    }
    for (const emp of employeeEntities) {
      if (!emp.account_code) { map[emp.id] = 0; continue; }
      const shared = (codeCount[emp.account_code] || 1) > 1;
      const empName = emp.full_name?.trim() || "";
      let bal = 0;
      for (const tx of transactions) {
        const matchesCode = tx.debit_account_code === emp.account_code || tx.credit_account_code === emp.account_code;
        if (!matchesCode) continue;
        if (shared && empName && !tx.description?.includes(empName)) continue;
        if (tx.debit_account_code === emp.account_code) bal += tx.amount || 0;
        if (tx.credit_account_code === emp.account_code) bal -= tx.amount || 0;
      }
      map[emp.id] = bal;
    }
    return map;
  }, [employeeEntities, transactions]);

  // ─── CONTACT BALANCES (all contacts, not just active tab) ───
  const contactBalances = useMemo(() => {
    const map: Record<string, number> = {};
    const nameToIds = new Map<string, Set<string>>();
    for (const c of contacts) {
      const name = c.contact_name?.trim();
      if (!nameToIds.has(name)) nameToIds.set(name, new Set());
      nameToIds.get(name)!.add(c.id);
    }
    for (const c of contacts) {
      let bal = 0;
      const name = c.contact_name?.trim();
      const relatedIds = nameToIds.get(name) || new Set([c.id]);
      // Use the correct account code based on contact type
      const accountCode = c.contact_type === "عميل" ? "1130" : c.contact_type === "مورد" ? "2110" : "2180";
      for (const tx of transactions) {
        const matches = (tx.contact_id && relatedIds.has(tx.contact_id)) ||
          (!tx.contact_id && tx.description?.includes(name));
        if (!matches) continue;
        if (tx.debit_account_code === accountCode) bal += tx.amount || 0;
        if (tx.credit_account_code === accountCode) bal -= tx.amount || 0;
      }
      map[c.id] = bal;
    }
    return map;
  }, [contacts, transactions]);

  // ─── COMBINED ENTITY LIST FOR LEFT PANEL ───
  const entityList = useMemo(() => {
    if (isAccountsTab) {
      const filtered = entitySearch.trim()
        ? accounts.filter(a => multiWordMatchAny(entitySearch, a.account_name, a.account_code))
        : accounts;
      return filtered.map(a => ({
        id: a.id,
        name: a.account_name,
        subtitle: `${a.account_code} · ${a.account_type}`,
        balance: accountBalances[a.id] || 0,
        accountCode: a.account_code,
      }));
    } else if (isEmployeesTab) {
      const filtered = entitySearch.trim()
        ? employeeEntities.filter(e => multiWordMatchAny(entitySearch, e.full_name, e.department))
        : employeeEntities;
      return filtered.map(e => ({
        id: e.id,
        name: e.full_name,
        subtitle: `${e.job_title || e.department || "—"} · ${e.account_code || "بدون حساب"}`,
        balance: employeeBalances[e.id] || 0,
        accountCode: e.account_code || "",
      }));
    } else {
      const filtered = entitySearch.trim()
        ? tabContacts.filter(c => multiWordMatchAny(entitySearch, c.contact_name, c.phone))
        : tabContacts;
      return filtered.map(c => ({
        id: c.id,
        name: c.contact_name,
        subtitle: c.phone || c.address || "—",
        balance: contactBalances[c.id] || 0,
        accountCode: "",
      }));
    }
  }, [isAccountsTab, isEmployeesTab, accounts, employeeEntities, tabContacts, entitySearch, accountBalances, employeeBalances, contactBalances]);

  const selectedContact = useMemo(
    () => contacts.find(c => c.id === selectedEntityId),
    [contacts, selectedEntityId]
  );

  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedEntityId),
    [accounts, selectedEntityId]
  );

  const selectedEmployee = useMemo(
    () => employeeEntities.find(e => e.id === selectedEntityId),
    [employeeEntities, selectedEntityId]
  );

  const selectedEntityName = isAccountsTab
    ? selectedAccount?.account_name || ""
    : isEmployeesTab
    ? selectedEmployee?.full_name || ""
    : selectedContact?.contact_name || "";

  const selectedEntityInfo = isAccountsTab
    ? { type: selectedAccount?.account_type || "", code: selectedAccount?.account_code || "", phone: "", address: "", email: "" }
    : isEmployeesTab
    ? { type: "موظف", code: selectedEmployee?.account_code || "", phone: selectedEmployee?.phone || "", address: selectedEmployee?.job_title || selectedEmployee?.department || "", email: "" }
    : { type: selectedContact?.contact_type || "", code: "", phone: selectedContact?.phone || "", address: selectedContact?.address || "", email: selectedContact?.email || "" };

  // ─── ACCOUNT NATURE (debit vs credit) for coloring ───
  const isDebitNature = useMemo(() => {
    if (isAccountsTab && selectedAccount) {
      const code = selectedAccount.account_code;
      const type = (selectedAccount.account_type || "").toLowerCase();
      // Assets (1xxx) and Expenses/Purchases (5xxx) are debit-nature
      if (code.startsWith("1") || code.startsWith("5")) return true;
      if (["asset", "أصول", "أصل", "expense", "expenses", "مصروفات", "مصروف", "مصاريف", "purchases", "مشتريات"].includes(type)) return true;
      // Liabilities (2xxx), Equity (3xxx), Revenue (4xxx) are credit-nature
      if (code.startsWith("2") || code.startsWith("3") || code.startsWith("4")) return false;
      if (["liability", "التزامات", "التزام", "خصوم", "equity", "حقوق ملكية", "حقوق الملكية", "رأس مال", "revenue", "إيرادات", "إيراد", "دخل"].includes(type)) return false;
      return true; // default debit
    }
    if (isEmployeesTab) return false; // employees mapped to 2180 (liability)
    // Contacts: customers = receivables (asset/debit), suppliers = payables (liability/credit)
    if (activeTab === "customers") return true;
    return false; // suppliers = credit nature
  }, [isAccountsTab, isEmployeesTab, activeTab, selectedAccount]);

  // ─── CREDIT LIMIT CHECK ───
  const creditLimitWarning = useMemo(() => {
    if (isAccountsTab || isEmployeesTab || !selectedContact) return null;
    const limit = selectedContact.credit_limit || 0;
    if (limit <= 0) return null;
    const balance = selectedContact.current_balance || 0;
    const pct = (balance / limit) * 100;
    if (pct >= 100) return { level: "exceeded" as const, pct, limit, balance };
    if (pct >= 80) return { level: "warning" as const, pct, limit, balance };
    return { level: "ok" as const, pct, limit, balance };
  }, [selectedContact, isAccountsTab, isEmployeesTab]);

  // ─── RELATED CHEQUES ───
  const relatedCheques = useMemo(() => {
    if (!displayOptions.showCheques || !selectedEntityName) return [];
    return cheques.filter(c => c.party_name === selectedEntityName);
  }, [cheques, selectedEntityName, displayOptions.showCheques]);

  // ─── PDC (Post-Dated Cheques) ───
  const pdcCheques = useMemo(() => {
    if (!selectedEntityName) return [];
    const today = format(new Date(), "yyyy-MM-dd");
    return cheques.filter(c =>
      c.party_name === selectedEntityName &&
      c.cheque_type === "وارد" &&
      (c.status === "مسجل" || c.status === "آجل" || c.status === "مستحق" || c.status === "مودع" || c.status === "بانتظار" || c.status === "registered" || c.status === "deposited") &&
      c.cheque_date > today
    );
  }, [cheques, selectedEntityName]);

  const pdcTotal = useMemo(() => {
    return pdcCheques.reduce((s, c) => s + c.amount, 0);
  }, [pdcCheques]);

  // ─── BOUNCED CHEQUES ───
  const bouncedCheques = useMemo(() => {
    if (!displayOptions.includeBounced || !selectedEntityName) return [];
    return cheques
      .filter(c =>
        c.party_name === selectedEntityName &&
        c.status === "مرتجع" &&
        (!dateFrom || c.cheque_date >= dateFrom) &&
        (!dateTo || c.cheque_date <= dateTo)
      )
      .map(c => ({
        date: c.cheque_date,
        reference: c.cheque_number || "",
        description: `شيك مرتجع #${c.cheque_number || "—"}`,
        amount: c.amount,
      }));
  }, [cheques, selectedEntityName, displayOptions.includeBounced, dateFrom, dateTo]);

  const bouncedTotal = useMemo(() => {
    return bouncedCheques.reduce((s, c) => s + c.amount, 0);
  }, [bouncedCheques]);

  // ─── STATEMENT ROWS ───
  const { rows, openingBalance, closingBalance, totalDebit, totalCredit } = useMemo(() => {
    if (!selectedEntityId) return { rows: [] as StatementRow[], openingBalance: 0, closingBalance: 0, totalDebit: 0, totalCredit: 0 };

    let related: Transaction[];
    let resolveDebitCredit: (tx: Transaction) => { isDebit: boolean; isCredit: boolean };

    if (isAccountsTab && selectedAccount) {
      const code = selectedAccount.account_code;
      related = transactions.filter(tx =>
        tx.debit_account_code === code || tx.credit_account_code === code
      );
      resolveDebitCredit = (tx) => ({
        isDebit: tx.debit_account_code === code,
        isCredit: tx.credit_account_code === code,
      });
    } else if (isEmployeesTab && selectedEmployee?.account_code) {
      const code = selectedEmployee.account_code;
      const empName = selectedEmployee.full_name?.trim() || "";
      // If multiple employees share the same account code, also filter by name
      const sameCodeCount = employeeEntities.filter(e => e.account_code === code).length;
      related = transactions.filter(tx => {
        const matchesCode = tx.debit_account_code === code || tx.credit_account_code === code;
        if (!matchesCode) return false;
        if (sameCodeCount <= 1) return true;
        // Multiple employees on same code: match by name in description
        return empName && tx.description?.includes(empName);
      });
      resolveDebitCredit = (tx) => ({
        isDebit: tx.debit_account_code === code,
        isCredit: tx.credit_account_code === code,
      });
    } else if (isEmployeesTab && !selectedEmployee?.account_code) {
      return { rows: [] as StatementRow[], openingBalance: 0, closingBalance: 0, totalDebit: 0, totalCredit: 0 };
    } else {
      const contactName = selectedContact?.contact_name?.trim() || "";
      const sameNameIds = new Set(
        contacts.filter(c => c.contact_name?.trim() === contactName).map(c => c.id)
      );
      // Check both receivables (1130) and payables (2110) for any contact
      const contactAccountCodes = ["1130", "2110", "2180"];
      related = transactions.filter(tx =>
        (tx.contact_id && sameNameIds.has(tx.contact_id)) ||
        (!tx.contact_id && contactName && tx.description?.includes(contactName))
      );
      resolveDebitCredit = (tx) => ({
        isDebit: contactAccountCodes.includes(tx.debit_account_code),
        isCredit: contactAccountCodes.includes(tx.credit_account_code),
      });
    }

    // Currency filter
    if (selectedCurrency !== "all") {
      related = related.filter(tx => normalizeCurrency(tx.currency) === selectedCurrency);
    }

    // Detect if this is a foreign currency cash account
    const foreignCashAccounts = ['1111', '1112', '1113', '1114'];
    const isForeignCashAccount = isAccountsTab && selectedAccount && foreignCashAccounts.includes(selectedAccount.account_code);

    // Helper to get the effective amount for a transaction on this account
    const getEffectiveAmount = (tx: Transaction): number => {
      // For foreign cash accounts, prefer foreign_amount when available
      if (isForeignCashAccount && tx.foreign_amount != null && tx.foreign_amount > 0) {
        return tx.foreign_amount;
      }
      return tx.amount || 0;
    };

    let openBal = 0;
    const periodTx: Transaction[] = [];

    for (const tx of related) {
      const { isDebit, isCredit } = resolveDebitCredit(tx);
      if (!isDebit && !isCredit) continue;
      const amount = getEffectiveAmount(tx);

      if (dateFrom && tx.transaction_date < dateFrom) {
        if (isDebit) openBal += amount;
        if (isCredit) openBal -= amount;
      } else if (!dateTo || tx.transaction_date <= dateTo) {
        periodTx.push(tx);
      }
    }

    let runningBalance = openBal;
    let sumDebit = 0;
    let sumCredit = 0;

    const rows: StatementRow[] = periodTx.map(tx => {
      const { isDebit } = resolveDebitCredit(tx);
      const amount = getEffectiveAmount(tx);
      const debit = isDebit ? amount : 0;
      const credit = !isDebit ? amount : 0;
      runningBalance += debit - credit;
      sumDebit += debit;
      sumCredit += credit;
      // Due date: for invoices, default +30 days
      let dueDate: string | undefined;
      if (tx.reference?.startsWith("INV-") || tx.reference?.startsWith("PO-")) {
        try {
          const d = parseISO(tx.transaction_date);
          d.setDate(d.getDate() + 30);
          dueDate = format(d, "yyyy-MM-dd");
        } catch {}
      }
      return {
        date: tx.transaction_date,
        description: tx.description || tx.transaction_type || "—",
        transaction_type: tx.transaction_type || "",
        reference: tx.reference || "",
        debit, credit,
        balance: runningBalance,
        transaction_id: tx.id,
        currency: normalizeCurrency(tx.currency),
        payment_method: tx.payment_method || null,
        dueDate,
      };
    });

    return { rows, openingBalance: openBal, closingBalance: runningBalance, totalDebit: sumDebit, totalCredit: sumCredit };
  }, [transactions, selectedEntityId, dateFrom, dateTo, activeTab, selectedAccount, selectedEmployee, selectedCurrency]);

  // ─── YEAR COMPARISON DATA ───
  const comparisonData = useMemo(() => {
    if (!showYearComparison || !selectedEntityId) return null;
    // Calculate same period last year
    try {
      const fromPrev = format(subYears(parseISO(dateFrom), 1), "yyyy-MM-dd");
      const toPrev = format(subYears(parseISO(dateTo), 1), "yyyy-MM-dd");

      let related: Transaction[];
      let resolveDebitCredit: (tx: Transaction) => { isDebit: boolean; isCredit: boolean };

      if (isAccountsTab && selectedAccount) {
        const code = selectedAccount.account_code;
        related = transactions.filter(tx => tx.debit_account_code === code || tx.credit_account_code === code);
        resolveDebitCredit = (tx) => ({ isDebit: tx.debit_account_code === code, isCredit: tx.credit_account_code === code });
      } else if (isEmployeesTab && selectedEmployee?.account_code) {
        const code = selectedEmployee.account_code;
        const empName = selectedEmployee.full_name?.trim() || "";
        const sameCodeCount = employeeEntities.filter(e => e.account_code === code).length;
        related = transactions.filter(tx => {
          const matchesCode = tx.debit_account_code === code || tx.credit_account_code === code;
          if (!matchesCode) return false;
          if (sameCodeCount <= 1) return true;
          return empName && tx.description?.includes(empName);
        });
        resolveDebitCredit = (tx) => ({ isDebit: tx.debit_account_code === code, isCredit: tx.credit_account_code === code });
      } else {
        const accountCode = activeTabConfig.accountCode;
        const contactName = selectedContact?.contact_name?.trim() || "";
        const sameNameIds = new Set(contacts.filter(c => c.contact_name?.trim() === contactName).map(c => c.id));
        related = transactions.filter(tx =>
          (tx.contact_id && sameNameIds.has(tx.contact_id)) || (!tx.contact_id && contactName && tx.description?.includes(contactName))
        );
        resolveDebitCredit = (tx) => ({ isDebit: tx.debit_account_code === accountCode, isCredit: tx.credit_account_code === accountCode });
      }

      let prevDebit = 0, prevCredit = 0;
      for (const tx of related) {
        if (tx.transaction_date < fromPrev || tx.transaction_date > toPrev) continue;
        const { isDebit, isCredit } = resolveDebitCredit(tx);
        if (isDebit) prevDebit += tx.amount || 0;
        if (isCredit) prevCredit += tx.amount || 0;
      }
      const prevBalance = prevDebit - prevCredit;
      const change = closingBalance - prevBalance;
      const changePct = prevBalance !== 0 ? ((change / Math.abs(prevBalance)) * 100) : 0;

      return { prevDebit, prevCredit, prevBalance, change, changePct, fromPrev, toPrev };
    } catch { return null; }
  }, [showYearComparison, selectedEntityId, dateFrom, dateTo, transactions, closingBalance]);

  // Determine the dominant currency for this statement
  const statementCurrency = useMemo(() => {
    if (rows.length > 0) {
      // Use the most common currency in the rows
      const freq: Record<string, number> = {};
      rows.forEach(r => { freq[r.currency] = (freq[r.currency] || 0) + 1; });
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      return sorted[0]?.[0] || "شيكل";
    }
    // For account tab, infer from account name
    if (isAccountsTab && selectedAccount) {
      const name = selectedAccount.account_name;
      if (name.includes("دولار") || name.includes("USD")) return "دولار";
      if (name.includes("دينار") || name.includes("JOD")) return "دينار";
      if (name.includes("يورو") || name.includes("EUR")) return "يورو";
      if (name.includes("جنيه") || name.includes("EGP")) return "جنيه";
    }
    return "شيكل";
  }, [rows, isAccountsTab, selectedAccount]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (txTypeFilter !== "all") {
      result = result.filter(r => r.transaction_type.includes(txTypeFilter));
    }
    if (txSearch.trim()) {
      result = result.filter(r => multiWordMatchAny(txSearch, r.description, r.reference));
    }
    // Summary mode: group by reference, keep only one row per reference
    if (detailLevel === "summary") {
      const grouped: StatementRow[] = [];
      const seen = new Set<string>();
      for (const r of result) {
        const key = r.reference || r.transaction_id;
        if (!seen.has(key)) {
          seen.add(key);
          grouped.push({ ...r, description: r.reference ? `${getTypeBadge(r.transaction_type).label} — ${r.reference}` : r.description });
        }
      }
      return grouped;
    }
    // Line items mode: expand invoice rows into per-item rows
    if (detailLevel === "lineItems") {
      const expanded: StatementRow[] = [];
      for (const r of result) {
        const items = invoiceItemsMap[r.transaction_id];
        if (items && items.length > 0) {
          // Parent row (invoice header)
          expanded.push(r);
          // Sub-rows for each line item
          for (const item of items) {
            const qty = item.quantity || 1;
            const unitLabel = item.unit_of_measure ? ` ${item.unit_of_measure}` : "";
            const discountLabel = item.discount ? ` (خصم ${item.discount})` : "";
            expanded.push({
              ...r,
              description: `   ↳ ${item.product_name} — ${qty}${unitLabel} × ${item.unit_price.toLocaleString("en-US")}${discountLabel}`,
              debit: r.debit > 0 ? item.total_amount : 0,
              credit: r.credit > 0 ? item.total_amount : 0,
              balance: 0, // sub-rows don't show running balance
              isLineItem: true,
              lineItemDetail: `${qty}${unitLabel} × ${item.unit_price.toLocaleString("en-US")}`,
            });
          }
        } else {
          expanded.push(r);
        }
      }
      return expanded;
    }
    return result;
  }, [rows, txSearch, txTypeFilter, detailLevel, invoiceItemsMap]);

  // Last transaction date for entity
  const lastTxDate = useMemo(() => {
    if (!rows.length) return null;
    return rows[rows.length - 1].date;
  }, [rows]);

  // Overdue alert
  const overdueAlert = useMemo(() => {
    if (isAccountsTab || !rows.length || closingBalance <= 0) return null;
    const oldestDebitRow = rows.find(r => r.debit > 0);
    if (!oldestDebitRow) return null;
    const days = differenceInDays(new Date(), parseISO(oldestDebitRow.date));
    if (days > 30) return { days, ref: oldestDebitRow.reference };
    return null;
  }, [rows, closingBalance, isAccountsTab]);

  // Statement number
  const statementNumber = useMemo(() => {
    const now = new Date();
    return `SOA-${now.getFullYear()}-${String(Date.now()).slice(-4).padStart(4, "0")}`;
  }, [selectedEntityId]);

  // Aging analysis data
  const agingData = useMemo(() => {
    if (!selectedEntityId || isAccountsTab) return null;
    const today = new Date();
    let current = 0, d1_30 = 0, d31_60 = 0, d60plus = 0;
    for (const row of rows) {
      if (row.debit <= 0) continue;
      const days = differenceInDays(today, parseISO(row.date));
      const net = row.debit; // outstanding debit
      if (days <= 0) current += net;
      else if (days <= 30) d1_30 += net;
      else if (days <= 60) d31_60 += net;
      else d60plus += net;
    }
    const total = current + d1_30 + d31_60 + d60plus;
    if (total === 0) return null;
    return { current, d1_30, d31_60, d60plus, total };
  }, [rows, selectedEntityId, isAccountsTab]);

  // Oldest open invoice for contact
  const oldestOpenInvoice = useMemo(() => {
    if (!rows.length || isAccountsTab) return null;
    const invoiceRows = rows.filter(r => r.reference?.startsWith("INV-") || r.reference?.startsWith("PO-"));
    if (!invoiceRows.length) return null;
    const oldest = invoiceRows[0];
    const days = differenceInDays(new Date(), parseISO(oldest.date));
    return { ref: oldest.reference, days };
  }, [rows, isAccountsTab]);

  // Preview transaction data
  const previewTx = useMemo(() => {
    if (!previewTxId) return null;
    const tx = transactions.find(t => t.id === previewTxId);
    if (!tx) return null;
    const row = rows.find(r => r.transaction_id === previewTxId);
    return { ...tx, row };
  }, [previewTxId, transactions, rows]);

  // ─── PDF PREVIEW (HTML-based modal) ───
  const handlePreviewPDF = useCallback(() => {
    if (!selectedEntityId || rows.length === 0) return;
    setShowPdfModal(true);
  }, [selectedEntityId, rows]);

  const handleDownloadPDF = useCallback(async () => {
    if (!selectedEntityId || filteredRows.length === 0) return;
    setPdfGenerating(true);
    try {
      const entityType = isAccountsTab ? "حساب" : isEmployeesTab ? "موظف" : activeTabConfig.type;
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
          statementNumber,
          currency: statementCurrency,
          openingBalance,
          closingBalance,
          totalDebit,
          totalCredit,
          rows: filteredRows.map(r => ({
            date: r.date,
            description: r.description,
            reference: r.reference,
            debit: r.debit,
            credit: r.credit,
            balance: r.balance,
            isLineItem: r.isLineItem,
          })),
          agingData,
        },
        {
          name: companyInfo.name,
          phone: companyInfo.phone,
          email: companyInfo.email,
          address: companyInfo.address,
          tax_number: companyInfo.tax_number,
          logo_url: companyInfo.logo_url,
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
  }, [selectedEntityId, selectedEntityName, filteredRows, dateFrom, dateTo, statementNumber, statementCurrency, openingBalance, closingBalance, totalDebit, totalCredit, agingData, companyInfo, isAccountsTab, isEmployeesTab, activeTabConfig, selectedAccount, selectedEmployee, selectedContact, toast]);

  const handlePrintStatement = useCallback(() => {
    // No browser print dialog — use PDF export
    /* no browser print — use PDF export */
  }, []);

  // ─── EXPORT (XLSX/SheetJS) ───
  const handleExport = () => {
    if (!filteredRows.length || !selectedEntityName) return;
    try {
      const isDetailMode = detailLevel === "lineItems";

      // Build header rows
      const rows: any[][] = [];
      rows.push([companyInfo.name || companyName || "AMWALI أموالي"]);
      rows.push(["كشف الحساب — Statement of Account"]);
      rows.push(["العميل:", selectedEntityName, "", "", "من:", fmtDate(dateFrom)]);
      rows.push(["الهاتف:", selectedEntityInfo.phone || "—", "", "", "إلى:", fmtDate(dateTo)]);
      rows.push(["الرقم الضريبي:", companyInfo.tax_number || "—", "", "", "تاريخ الطباعة:", fmtDate(format(new Date(), "yyyy-MM-dd"))]);
      rows.push([]);

      // Column headers
      const cols = [
        "التاريخ", "المرجع", "البيان",
        ...(!isDetailMode ? ["الاستحقاق", "طريقة الدفع"] : []),
        "النوع", "مدين ₪", "دائن ₪", "الرصيد ₪",
      ];
      rows.push(cols);

      // Opening balance
      const obRow: any[] = [fmtDate(dateFrom), "—", "رصيد أول المدة"];
      if (!isDetailMode) { obRow.push("—", "—"); }
      obRow.push("", openingBalance > 0 ? openingBalance : "", openingBalance < 0 ? Math.abs(openingBalance) : "", openingBalance);
      rows.push(obRow);

      // Data rows
      filteredRows.forEach(tx => {
        const isItemLine = !!tx.isLineItem;
        const badge = getTypeBadge(tx.transaction_type);
        const row: any[] = [
          isItemLine ? "" : fmtDate(tx.date),
          isItemLine ? "" : (tx.reference || "—"),
          isItemLine ? `    ↳ ${tx.description.replace(/^\s*↳\s*/, "")}` : tx.description,
        ];
        if (!isDetailMode) {
          row.push(isItemLine ? "" : (tx.dueDate ? fmtDate(tx.dueDate) : "—"));
          row.push(isItemLine ? "" : (PAYMENT_METHOD_AR[tx.payment_method || ""] || tx.payment_method || "—"));
        }
        row.push(isItemLine ? "بند" : badge.label);
        row.push(tx.debit > 0 ? tx.debit : "");
        row.push(tx.credit > 0 ? tx.credit : "");
        row.push(!isItemLine ? tx.balance : "");
        rows.push(row);
      });

      // Closing balance
      rows.push([]);
      const closingRow: any[] = ["—", "—", "الرصيد الختامي"];
      if (!isDetailMode) { closingRow.push("", ""); }
      closingRow.push("", totalDebit, totalCredit, closingBalance);
      rows.push(closingRow);

      // PDC rows
      if (displayOptions.includePDC && pdcTotal > 0) {
        rows.push([]);
        rows.push(["", "", "شيكات واردة برسم التحصيل (PDC)"]);
        pdcCheques.forEach(chk => {
          rows.push(["", chk.cheque_number || "—", `شيك بنك ${chk.bank_name || "—"}`, fmtDate(chk.cheque_date), "", "", "", chk.amount, ""]);
        });
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const colCount = cols.length;
      ws["!cols"] = Array.from({ length: colCount }, (_, i) => {
        if (i === 2) return { wch: isDetailMode ? 40 : 30 };
        if (i === 1) return { wch: 18 };
        if (cols[i]?.includes("الرصيد")) return { wch: 16 };
        if (cols[i]?.includes("مدين") || cols[i]?.includes("دائن")) return { wch: 14 };
        return { wch: 14 };
      });

      // Merge title rows
      const lastColLetter = XLSX.utils.encode_col(colCount - 1);
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
      ];

      // AutoFilter on header row (row index 6)
      ws["!autofilter"] = { ref: `A7:${lastColLetter}${rows.length}` };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "كشف الحساب");
      XLSX.writeFile(wb, `كشف-حساب-${selectedEntityName}-${dateFrom}.xlsx`);
    } catch (err) {
      console.error("Excel export error:", err);
      handleExportFallback();
    }
  };

  // Fallback export with xlsx library
  const handleExportFallback = () => {
    const headerRows = [
      [companyInfo.name || companyName || "كشف حساب"],
      [`كشف حساب - ${selectedEntityName}`],
      [`الفترة: من ${fmtDate(dateFrom)} إلى ${fmtDate(dateTo)}`],
      [],
    ];
    const cols = ["التاريخ", "المرجع", "البيان", "الاستحقاق", "النوع", "مدين ₪", "دائن ₪", "الرصيد ₪"];
    headerRows.push(cols);
    const dataRows = [
      ["", "", "رصيد أول المدة", "", "", openingBalance > 0 ? openingBalance : "", openingBalance < 0 ? Math.abs(openingBalance) : "", openingBalance],
      ...filteredRows.map(r => [r.date, r.reference || "", r.description, r.dueDate ? fmtDate(r.dueDate) : "—", r.debit > 0 ? "مدين" : "دائن", r.debit || "", r.credit || "", r.balance]),
      ["", "", "الإجمالي", "", "", totalDebit, totalCredit, closingBalance],
    ];
    const allRows = [...headerRows, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(allRows);
    ws["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 38 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
    const wbk = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbk, ws, "كشف الحساب");
    XLSX.writeFile(wbk, `كشف-حساب-${selectedEntityName}-${dateFrom}.xlsx`);
  };

  const allBalances = isAccountsTab ? accountBalances : isEmployeesTab ? employeeBalances : contactBalances;
  const totalBalance = useMemo(() => Object.values(allBalances).reduce((s, b) => s + b, 0), [allBalances]);
  const debitCount = useMemo(() => Object.values(allBalances).filter(b => b > 0).length, [allBalances]);
  const creditCount = useMemo(() => Object.values(allBalances).filter(b => b < 0).length, [allBalances]);

  // Max balance for progress bar scaling
  const maxBalance = useMemo(() => {
    const vals = Object.values(allBalances).map(Math.abs);
    return vals.length ? Math.max(...vals, 1) : 1;
  }, [allBalances]);

  // Navigate to voucher/journal
  const navigateToReference = (ref: string, txId: string) => {
    if (!ref) return;
    if (ref.startsWith("RV-") || ref.startsWith("PV-") || ref.startsWith("QV-")) {
      navigate(`/finance/vouchers?edit=${txId}`);
    } else if (ref.startsWith("INV-")) {
      navigate(`/invoices?edit=${txId}`);
    } else if (ref.startsWith("PO-") || ref.startsWith("PUR-")) {
      navigate(`/invoices?edit=${txId}`);
    } else {
      navigate("/journal-entries");
    }
  };

  const openPreview = (txId: string) => {
    setPreviewTxId(txId);
    setShowPreviewDrawer(true);
  };

  // Save column prefs
  const saveColumns = (newCols: ColumnConfig[]) => {
    setColumns(newCols);
    localStorage.setItem("statement_columns_prefs", JSON.stringify(newCols));
  };

  const isColVisible = (key: string) => {
    const col = columns.find(c => c.key === key);
    if (col) return col.visible;
    // Fallback to displayOptions for columns not in the columns array
    if (key === "dueDate") return displayOptions.showDueDate;
    if (key === "paymentMethod") return displayOptions.showPaymentMethod;
    if (key === "contactCode") return displayOptions.showContactCode;
    if (key === "currency") return displayOptions.showCurrency;
    if (key === "notes") return displayOptions.showNotes;
    return false;
  };

  // Send via WhatsApp
  const sendWhatsApp = () => {
    if (!selectedContact?.phone) return;
    const phone = selectedContact.phone.replace(/\D/g, "");
    const balType = closingBalance >= 0 ? "مدين" : "دائن";
    const msg = `السلام عليكم ${selectedEntityName}،\nنرفق كشف حسابكم للفترة من ${fmtDate(dateFrom)} إلى ${fmtDate(dateTo)}\nالرصيد الحالي: ${fmtAmount(closingBalance, statementCurrency)} (${balType})\n${companyInfo.name}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const selectEntity = (id: string) => {
    setSelectedEntityId(id);
    setShowMobileEntitySheet(false);
  };

  // ─── SIDEBAR CONTENT (reusable) ───
  const renderSidebarContent = () => (
    <>
      <div className="p-3 border-b border-border space-y-2.5">
        <div className="relative">
          <Search className="absolute right-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={isAccountsTab ? "ابحث بالاسم أو الكود..." : "ابحث بالاسم أو الرقم..."}
            value={entitySearch}
            onChange={e => setEntitySearch(e.target.value)}
            className="pr-9 h-9 text-xs bg-muted/50 border-0 rounded-lg"
          />
        </div>
        <div className="bg-muted/30 rounded-lg p-2.5 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">الرصيد الإجمالي:</span>
            <span className={cn("font-bold tabular-nums", isAccountsTab ? "text-foreground" : totalBalance > 0 ? "text-red-600" : totalBalance < 0 ? "text-emerald-600" : "text-foreground")}>
              {fmtAmount(totalBalance)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-red-500">+{debitCount} مدين</span>
            <span className="text-emerald-500">+{creditCount} دائن</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-2">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : entityList.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">لا توجد نتائج</div>
        ) : (
          entityList.map(entity => {
            const isActive = entity.id === selectedEntityId;
            const balPct = Math.min((Math.abs(entity.balance) / maxBalance) * 100, 100);
            return (
              <button
                key={entity.id}
                onClick={() => selectEntity(entity.id)}
                className={cn(
                  "w-full text-right px-3 py-3 border-b border-border/30 transition-all hover:bg-muted/30",
                  isActive && "bg-primary/5 border-r-2 border-r-primary"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn("text-xs font-semibold truncate", isActive ? "text-primary" : "text-foreground")}>
                    {entity.name}
                  </span>
                  <span className={cn("text-xs font-bold tabular-nums shrink-0 mr-2",
                    (() => {
                      const code = entity.accountCode || "";
                      const isAssetOrExpense = code.startsWith("1") || code.startsWith("5");
                      if (entity.balance === 0) return "text-muted-foreground";
                      if (isAssetOrExpense) return entity.balance > 0 ? "text-foreground" : "text-red-600";
                      return entity.balance > 0 ? "text-red-600" : "text-emerald-600";
                    })()
                  )}>
                    {entity.balance === 0 ? "✓ مسدَّد" : fmtAmount(entity.balance)}
                  </span>
                </div>
                {entity.balance !== 0 && (
                  <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", (() => {
                        const code = entity.accountCode || "";
                        const isAssetOrExpense = code.startsWith("1") || code.startsWith("5");
                        if (isAssetOrExpense) return entity.balance > 0 ? "bg-primary" : "bg-red-500";
                        return entity.balance > 0 ? "bg-red-500" : "bg-emerald-500";
                      })())}
                      style={{ width: `${balPct}%` }}
                    />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );

  // ─── RENDER ───
  return (
    <div className="min-h-screen flex flex-col" dir="rtl" style={{ background: "#F5F7FA" }}>
      {/* ─── TOP BAR ─── */}
      <div className="sticky top-0 z-50 no-print" style={{ background: "#ffffff", borderBottom: "1px solid #E2E8F0", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", padding: "12px 24px" }}>
        {/* Row 1: Nav + Actions + Date Range */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/finance"); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <ArrowRight className="w-5 h-5 text-foreground" />
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>المحاسبة</span>
              <ChevronLeft className="w-3 h-3" />
              <span className="text-foreground font-bold text-base">كشف الحساب</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Date range */}
            <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1">
              <label className="text-[10px] text-muted-foreground font-semibold">من</label>
              <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePeriod(""); }} className="h-7 w-32 text-xs bg-transparent border-0 p-0 shadow-none focus-visible:ring-0" />
              <div className="w-px h-4 bg-border" />
              <label className="text-[10px] text-muted-foreground font-semibold">إلى</label>
              <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePeriod(""); }} className="h-7 w-32 text-xs bg-transparent border-0 p-0 shadow-none focus-visible:ring-0" />
            </div>

            <div className="h-6 w-px bg-border" />

            <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading} className="h-8 w-8">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCustomizePanel(true)}
              className="h-8 gap-1.5 text-xs"
              style={{ background: "#1B3A5C" }}
            >
              <Settings2 className="w-3.5 h-3.5" /> تخصيص
            </Button>
            <Button variant="outline" size="sm" onClick={handlePreviewPDF} disabled={!selectedEntityId || rows.length === 0 || pdfGenerating} className="h-8 gap-1.5 text-xs">
              {pdfGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              معاينة PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrintStatement} disabled={!selectedEntityId || rows.length === 0} className="h-8 gap-1.5 text-xs">
              <Printer className="w-3.5 h-3.5" /> طباعة
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!selectedEntityId || rows.length === 0} className="h-8 gap-1.5 text-xs">
                  <Send className="w-3.5 h-3.5" /> إرسال <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={sendWhatsApp} disabled={!selectedContact?.phone}>
                  <MessageSquare className="w-4 h-4 ml-2 text-emerald-500" /> واتساب
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  if (selectedContact?.email) {
                    const subject = `كشف حساب - ${selectedEntityName}`;
                    window.open(`mailto:${selectedContact.email}?subject=${encodeURIComponent(subject)}`);
                  }
                }} disabled={!selectedContact?.email}>
                  <Mail className="w-4 h-4 ml-2 text-blue-500" /> إيميل
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast({ title: "تم نسخ الرابط ✅" });
                }}>
                  <Link2 className="w-4 h-4 ml-2" /> نسخ رابط الكشف
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!selectedEntityId || rows.length === 0} className="h-8 gap-1.5 text-xs">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </Button>
          </div>
        </div>
      </div>
      {/* ─── ADVANCED SEARCH BAR (sticky below toolbar) ─── */}
      <div className="sticky z-40 no-print" style={{ top: 57, background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", padding: "10px 24px" }}>
          <AdvancedEntitySearch
            entityList={entityList}
            allContacts={contacts}
            allAccounts={accounts}
            allEmployees={employeeEntities}
            accountBalances={accountBalances}
            contactBalances={contactBalances}
            employeeBalances={employeeBalances}
            selectedEntityId={selectedEntityId}
            activeTab={activeTab}
            onSelect={(id, tab) => {
              if (tab && tab !== activeTab) {
                setActiveTab(tab);
              }
              selectEntity(id);
            }}
            onClear={() => { setSelectedEntityId(""); }}
            onTabFilter={(tab) => { setActiveTab(tab); setSelectedEntityId(""); }}
            loading={loading}
          />
      </div>

      {/* ─── BODY: Full width main content ─── */}
      <div className="flex flex-1 min-h-0">

        {/* ─── MAIN CONTENT ─── */}
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={printRef} className="print-area flex-1">

            {/* Professional Print View (hidden until print/PDF) */}
            <div id="statement-print-wrapper" className="print-only">
              <StatementPrintView
                company={companyInfo}
                contact={{
                  name: selectedEntityName,
                  type: selectedEntityInfo.type,
                  phone: selectedEntityInfo.phone,
                  address: selectedEntityInfo.address,
                  email: selectedContact?.email || "",
                }}
                rows={filteredRows}
                openingBalance={openingBalance}
                closingBalance={closingBalance}
                totalDebit={totalDebit}
                totalCredit={totalCredit}
                dateFrom={dateFrom}
                dateTo={dateTo}
                columns={columns}
                contactCode={selectedEntityInfo.code}
                detailLevel={detailLevel}
                pdcCheques={pdcCheques}
                pdcTotal={pdcTotal}
                bouncedCheques={bouncedCheques}
                bouncedTotal={bouncedTotal}
                includeBounced={displayOptions.includeBounced}
                includePDC={displayOptions.includePDC}
              />
            </div>

            {/* Mobile: Contact selector */}
            {isMobile && (
              <div className="px-4 pt-3 no-print space-y-2">
                <div className="flex items-center bg-muted/50 rounded-lg p-0.5 w-full">
                  {ENTITY_TABS.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => { setActiveTab(tab.key); setSelectedEntityId(""); setEntitySearch(""); }}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-md text-[11px] font-semibold transition-all",
                        activeTab === tab.key
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <tab.icon className={cn("w-3.5 h-3.5", activeTab === tab.key && tab.color)} />
                      {tab.label}
                    </button>
                  ))}
                </div>
                <EntitySearchCombobox
                  entities={entityList}
                  selectedId={selectedEntityId}
                  onSelect={selectEntity}
                  placeholder={isAccountsTab ? "ابحث بالاسم أو الكود..." : isEmployeesTab ? "ابحث عن موظف..." : activeTab === "suppliers" ? "ابحث عن مورد..." : "ابحث عن زبون..."}
                />
              </div>
            )}

            {!selectedEntityId ? (
              <div className="flex-1 flex items-center justify-center py-32">
                <div className="text-center space-y-5">
                  <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                    <Search className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">ابحث عن جهة لعرض كشف حسابها</p>
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => { setActiveTab("customers"); setSelectedEntityId(""); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted/60 hover:bg-muted text-xs font-semibold text-muted-foreground transition-colors">
                      👤 زبائن
                    </button>
                    <button onClick={() => { setActiveTab("suppliers"); setSelectedEntityId(""); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted/60 hover:bg-muted text-xs font-semibold text-muted-foreground transition-colors">
                      🚚 موردين
                    </button>
                    <button onClick={() => { setActiveTab("accounts"); setSelectedEntityId(""); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted/60 hover:bg-muted text-xs font-semibold text-muted-foreground transition-colors">
                      📊 حسابات
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground/50">اضغط للتصفح بدون بحث</p>
                </div>
              </div>
            ) : (
              <>
                {/* ─── CREDIT LIMIT WARNING ─── */}
                {creditLimitWarning && creditLimitWarning.level !== "ok" && (
                  <div className={cn(
                    "mx-5 mt-4 rounded-xl border px-4 py-2.5 flex items-center gap-3 no-print",
                    creditLimitWarning.level === "exceeded"
                      ? "bg-red-500/10 border-red-500/30 text-red-600"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-600"
                  )}>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <div className="text-xs">
                      <strong>{creditLimitWarning.level === "exceeded" ? "⚠️ تم تجاوز سقف الائتمان!" : "⚠️ اقتراب من سقف الائتمان"}</strong>
                      <span className="mr-2">
                        الرصيد: {fmtAmount(creditLimitWarning.balance)} من {fmtAmount(creditLimitWarning.limit)} ({Math.round(creditLimitWarning.pct)}%)
                      </span>
                    </div>
                  </div>
                )}

                {/* ─── OVERDUE ALERT ─── */}
                {overdueAlert && (
                  <div className="mx-5 mt-4 rounded-xl border px-4 py-2.5 flex items-center gap-3 no-print bg-amber-500/10 border-amber-500/30 text-amber-700">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <div className="text-xs">
                      <strong>⚠️ يوجد رصيد متأخر السداد</strong>
                      <span className="mr-2">
                        أقدم حركة مدينة منذ {overdueAlert.days} يوم {overdueAlert.ref && `(${overdueAlert.ref})`}
                      </span>
                    </div>
                  </div>
                )}

                {/* ─── ZERO BALANCE NOTICE ─── */}
                {selectedEntityId && !loading && closingBalance === 0 && rows.length > 0 && (
                  <div className="mx-5 mt-4 rounded-xl border px-4 py-2.5 flex items-center gap-3 no-print bg-emerald-500/10 border-emerald-500/30 text-emerald-700">
                    <span className="text-base">✅</span>
                    <span className="text-xs font-semibold">لا توجد مديونية على هذا الحساب — الرصيد مسدَّد بالكامل</span>
                  </div>
                )}

                {/* ─── DOCUMENT CARD ─── */}
                <div className="p-5">
                  <div className="bg-white dark:bg-card rounded-xl border border-border" style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>

                    {/* Document Header */}
                    <div className="rounded-t-xl p-6 border-b border-border" style={{ background: "#1B3A5C" }}>
                      <div className="flex items-start justify-between">
                        {/* Right: Company info */}
                        <div className="flex items-center gap-3">
                          {companyInfo.logo_url && (
                            <img src={companyInfo.logo_url} alt="logo" className="w-14 h-14 object-contain rounded-lg bg-white p-1" />
                          )}
                          <div>
                            <h3 className="text-white font-bold text-base">{companyInfo.name || "AMWALI"}</h3>
                            {companyInfo.email && <p className="text-white/60 text-[11px] flex items-center gap-1"><Mail className="w-3 h-3" />{companyInfo.email}</p>}
                            {companyInfo.phone && <p className="text-white/60 text-[11px] flex items-center gap-1"><Phone className="w-3 h-3" />{companyInfo.phone}</p>}
                          </div>
                        </div>
                        {/* Left: Statement title */}
                        <div className="text-left">
                          <h2 className="text-white font-bold text-lg">كشف حساب</h2>
                          <p className="text-white/50 text-xs">STATEMENT OF ACCOUNT</p>
                          <p className="text-amber-300 text-[11px] font-mono mt-1">{statementNumber}</p>
                        </div>
                      </div>
                    </div>

                    {/* Entity info + metadata */}
                    <div className="p-5 border-b border-border">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[10px] text-muted-foreground font-semibold mb-1">صادر إلى</p>
                          <h2 className="text-lg font-bold text-foreground mb-1">{selectedEntityName}</h2>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={cn("text-[10px]", (() => {
                              const type = isAccountsTab ? selectedAccount?.account_type : isEmployeesTab ? "موظف" : selectedContact?.contact_type;
                              const t = (type || "").toLowerCase();
                              if (["asset", "أصول", "أصل"].includes(t)) return "bg-blue-500/10 text-blue-700 border-blue-500/30";
                              if (["liability", "التزامات", "التزام", "خصوم"].includes(t)) return "bg-orange-500/10 text-orange-700 border-orange-500/30";
                              if (["equity", "owner's equity", "حقوق ملكية", "حقوق الملكية", "رأس مال"].includes(t)) return "bg-purple-500/10 text-purple-700 border-purple-500/30";
                              if (["revenue", "إيرادات", "إيراد", "دخل"].includes(t)) return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
                              if (["purchases", "مشتريات"].includes(t)) return "bg-amber-500/10 text-amber-700 border-amber-500/30";
                              if (["expenses", "expense", "مصروفات", "مصروف", "المصروفات", "مصاريف"].includes(t)) return "bg-red-500/10 text-red-700 border-red-500/30";
                              return "bg-muted text-muted-foreground";
                            })())}>
                              {(() => {
                                const type = isAccountsTab ? selectedAccount?.account_type : isEmployeesTab ? "موظف" : selectedContact?.contact_type;
                                const t = (type || "").toLowerCase();
                                if (["asset", "أصول", "أصل"].includes(t)) return "أصول";
                                if (["liability", "التزامات", "التزام", "خصوم"].includes(t)) return "التزامات";
                                if (["equity", "owner's equity", "حقوق ملكية", "حقوق الملكية", "رأس مال"].includes(t)) return "حقوق ملكية";
                                if (["revenue", "إيرادات", "إيراد", "دخل"].includes(t)) return "إيرادات";
                                if (["purchases", "مشتريات"].includes(t)) return "مشتريات";
                                if (["expenses", "expense", "مصروفات", "مصروف", "المصروفات", "مصاريف"].includes(t)) return "مصروفات";
                                return type || "—";
                              })()}
                            </Badge>
                            {selectedContact?.contact_class && (
                              <Badge className={cn("text-[10px]",
                                selectedContact.contact_class === "A" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" :
                                selectedContact.contact_class === "B" ? "bg-blue-500/10 text-blue-600 border-blue-500/30" :
                                selectedContact.contact_class === "C" ? "bg-amber-500/10 text-amber-600 border-amber-500/30" :
                                "bg-red-500/10 text-red-600 border-red-500/30"
                              )} variant="outline">
                                <Star className="w-3 h-3 ml-1" />
                                {selectedContact.contact_class === "A" ? "ممتاز" : selectedContact.contact_class === "B" ? "جيد" : selectedContact.contact_class === "C" ? "عادي" : "مخاطرة"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap mt-2">
                            {selectedEntityInfo.code && (
                              <span className="font-mono bg-muted/50 px-2 py-0.5 rounded text-[11px]">{selectedEntityInfo.code}</span>
                            )}
                            {selectedEntityInfo.phone && (
                              <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{selectedEntityInfo.phone}</span>
                            )}
                            {selectedEntityInfo.email && (
                              <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{selectedEntityInfo.email}</span>
                            )}
                            {selectedEntityInfo.address && (
                              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{selectedEntityInfo.address}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-left space-y-1.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-2 justify-end">
                            <span>رقم الكشف:</span>
                            <span className="font-mono text-foreground font-semibold">{statementNumber}</span>
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <span>تاريخ الإصدار:</span>
                            <span className="text-foreground">{fmtDate(format(new Date(), "yyyy-MM-dd"))}</span>
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <span>من:</span>
                            <span className="text-foreground">{fmtDate(dateFrom)}</span>
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <span>إلى:</span>
                            <span className="text-foreground">{fmtDate(dateTo)}</span>
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <span>العملة:</span>
                            <span className="text-foreground">{getCurrencySymbol(statementCurrency)} {statementCurrency}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 4 KPI Cards — redesigned with colored left border */}
                    <div className="sticky z-10 bg-background border-b border-border shadow-sm" style={{ top: "112px", padding: "12px 20px" }}>
                      <div className={cn("grid gap-4", isMobile ? "grid-cols-2" : "grid-cols-4")}>
                        {/* Opening Balance */}
                        <div className="bg-white dark:bg-card overflow-hidden" style={{ borderRadius: "10px", padding: "16px 20px", borderRight: "4px solid #94A3B8", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <BookOpen className="w-4 h-4 text-muted-foreground" />
                            <span className="text-[12px] text-muted-foreground">رصيد افتتاحي</span>
                          </div>
                          <p className="font-bold tabular-nums text-foreground" style={{ fontSize: "26px" }}>{fmtAmount(openingBalance, statementCurrency)}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{openingBalance >= 0 ? "مدين" : "دائن"}</p>
                        </div>

                        {/* Total Debit */}
                        <div className="bg-white dark:bg-card overflow-hidden" style={{ borderRadius: "10px", padding: "16px 20px", borderRight: `4px solid ${isDebitNature ? "#22C55E" : "#EF4444"}`, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <TrendingUp className={cn("w-4 h-4", isDebitNature ? "text-emerald-500" : "text-red-500")} />
                            <span className="text-[12px] text-muted-foreground">إجمالي المدين</span>
                          </div>
                          <p className={cn("font-bold tabular-nums", isDebitNature ? "text-emerald-600" : "text-red-600")} style={{ fontSize: "26px" }}>{fmtAmount(totalDebit, statementCurrency)}</p>
                        </div>

                        {/* Total Credit */}
                        <div className="bg-white dark:bg-card overflow-hidden" style={{ borderRadius: "10px", padding: "16px 20px", borderRight: `4px solid ${isDebitNature ? "#EF4444" : "#22C55E"}`, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <TrendingDown className={cn("w-4 h-4", isDebitNature ? "text-red-500" : "text-emerald-500")} />
                            <span className="text-[12px] text-muted-foreground">إجمالي الدائن</span>
                          </div>
                          <p className={cn("font-bold tabular-nums", isDebitNature ? "text-red-600" : "text-emerald-600")} style={{ fontSize: "26px" }}>{fmtAmount(totalCredit, statementCurrency)}</p>
                        </div>

                        {/* Closing Balance */}
                        <div className="bg-white dark:bg-card overflow-hidden" style={{ borderRadius: "10px", padding: "16px 20px", borderRight: `4px solid ${(() => {
                          if (closingBalance === 0) return "#94A3B8";
                          const isNormalSide = closingBalance > 0 ? isDebitNature : !isDebitNature;
                          return isNormalSide ? "#22C55E" : "#EF4444";
                        })()}`, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                          <div className="flex items-center gap-1.5 mb-2">
                            {closingBalance !== 0 ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <Wallet className="w-4 h-4 text-muted-foreground" />}
                            <span className="text-[12px] text-muted-foreground">الرصيد المستحق</span>
                          </div>
                          <p className={cn("font-bold tabular-nums", (() => {
                            if (closingBalance === 0) return "text-emerald-600";
                            const isNormalSide = closingBalance > 0 ? isDebitNature : !isDebitNature;
                            return isNormalSide ? "text-emerald-600" : "text-red-600";
                          })())} style={{ fontSize: "26px" }}>
                            {fmtAmount(closingBalance, statementCurrency)}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {closingBalance > 0 ? "🔴 مدين (عليه)" : closingBalance < 0 ? "🟢 دائن (له)" : "مسدَّد ✅"}
                          </p>
                          {oldestOpenInvoice && (
                            <p className="text-[9px] text-muted-foreground mt-1 border-t border-border/50 pt-1">
                              ⏰ أقدم فاتورة: {oldestOpenInvoice.ref} ({oldestOpenInvoice.days} يوم)
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ─── FILTER BAR ─── */}
                    <div className="px-5 py-3 border-b border-border bg-muted/20 no-print">
                      <div className="flex items-center gap-3 flex-wrap">
                        {QUICK_PERIODS.map(p => (
                          <button
                            key={p.label}
                            onClick={() => { setDateFrom(p.from()); setDateTo(p.to()); setActivePeriod(p.label); }}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border",
                              activePeriod === p.label
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                        <div className="h-5 w-px bg-border" />
                        <Select value={txTypeFilter} onValueChange={setTxTypeFilter}>
                          <SelectTrigger className="h-8 w-40 text-xs bg-card border-border rounded-lg">
                            <Filter className="w-3 h-3 ml-1 text-muted-foreground" />
                            <SelectValue placeholder="النوع" />
                          </SelectTrigger>
                          <SelectContent>
                            {TX_TYPE_FILTERS.map(f => (
                              <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                          <SelectTrigger className="h-8 w-32 text-xs bg-card border-border rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CURRENCIES.map(c => (
                              <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={showYearComparison} onCheckedChange={(v) => setShowYearComparison(!!v)} className="h-3.5 w-3.5" />
                          <span className="text-[11px] text-muted-foreground">مقارنة سنوية</span>
                        </label>
                        <div className="flex-1" />
                        <div className="relative">
                          <Search className="absolute right-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
                          <Input
                            placeholder="🔍 بحث في الحركات..."
                            value={txSearch}
                            onChange={e => setTxSearch(e.target.value)}
                            className="pr-8 h-8 w-52 text-xs bg-card border-border rounded-lg"
                          />
                        </div>
                      </div>
                    </div>

                    {/* ─── YEAR COMPARISON CARDS ─── */}
                    {showYearComparison && comparisonData && (
                      <div className="px-5 py-3 border-b border-border no-print">
                        <h4 className="text-xs font-bold text-muted-foreground mb-3">📊 مقارنة بنفس الفترة من السنة الماضية ({fmtDate(comparisonData.fromPrev)} — {fmtDate(comparisonData.toPrev)})</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr>
                                  <th className="text-right py-1 text-muted-foreground font-semibold"></th>
                                  <th className="text-left py-1 text-muted-foreground font-semibold">{fmtDate(dateFrom).slice(-4)}</th>
                                  <th className="text-left py-1 text-muted-foreground font-semibold">{fmtDate(comparisonData.fromPrev).slice(-4)}</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b border-border/30">
                                  <td className="py-1.5 text-muted-foreground">إجمالي مدين</td>
                                  <td className={cn("py-1.5 text-left tabular-nums font-semibold", isDebitNature ? "text-emerald-600" : "text-red-600")}>{fmtAmount(totalDebit, statementCurrency)}</td>
                                  <td className={cn("py-1.5 text-left tabular-nums font-semibold", isDebitNature ? "text-emerald-400" : "text-red-400")}>{fmtAmount(comparisonData.prevDebit, statementCurrency)}</td>
                                </tr>
                                <tr className="border-b border-border/30">
                                  <td className="py-1.5 text-muted-foreground">إجمالي دائن</td>
                                  <td className={cn("py-1.5 text-left tabular-nums font-semibold", isDebitNature ? "text-red-600" : "text-emerald-600")}>{fmtAmount(totalCredit, statementCurrency)}</td>
                                  <td className={cn("py-1.5 text-left tabular-nums font-semibold", isDebitNature ? "text-red-400" : "text-emerald-400")}>{fmtAmount(comparisonData.prevCredit, statementCurrency)}</td>
                                </tr>
                                <tr>
                                  <td className="py-1.5 font-bold text-foreground">رصيد ختامي</td>
                                  <td className="py-1.5 text-left tabular-nums font-bold">{fmtAmount(closingBalance, statementCurrency)}</td>
                                  <td className="py-1.5 text-left tabular-nums font-bold">{fmtAmount(comparisonData.prevBalance, statementCurrency)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          <div className="flex items-center justify-center">
                            <div className={cn(
                              "rounded-xl p-4 text-center border",
                              comparisonData.change > 0 ? "bg-red-500/5 border-red-500/20" : "bg-emerald-500/5 border-emerald-500/20"
                            )}>
                              <p className="text-[10px] text-muted-foreground mb-1">التغيير</p>
                              <p className={cn("text-lg font-bold tabular-nums", comparisonData.change > 0 ? "text-red-600" : "text-emerald-600")}>
                                {comparisonData.change > 0 ? "+" : ""}{fmtAmount(comparisonData.change, statementCurrency)}
                              </p>
                              {comparisonData.changePct !== 0 && (
                                <p className={cn("text-xs font-semibold", comparisonData.change > 0 ? "text-red-500" : "text-emerald-500")}>
                                  ({comparisonData.changePct > 0 ? "+" : ""}{Math.round(comparisonData.changePct)}%)
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ─── CHEQUES SECTION ─── */}
                    {displayOptions.showCheques && relatedCheques.length > 0 && (
                      <div className="px-5 py-3 border-b border-border no-print">
                        <Collapsible>
                          <CollapsibleTrigger className="w-full">
                            <div className="flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer py-1">
                              <div className="flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-muted-foreground" />
                                <span className="text-xs font-semibold text-foreground">الشيكات المرتبطة</span>
                                <Badge variant="secondary" className="text-[10px]">{relatedCheques.length}</Badge>
                              </div>
                              <div className="flex items-center gap-3 text-[10px]">
                                <span className="text-emerald-500">واردة: {fmtAmount(relatedCheques.filter(c => c.cheque_type === "وارد").reduce((s, c) => s + c.amount, 0))}</span>
                                <span className="text-red-400">صادرة: {fmtAmount(relatedCheques.filter(c => c.cheque_type === "صادر").reduce((s, c) => s + c.amount, 0))}</span>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-2 overflow-hidden rounded-lg border border-border">
                              <div className="overflow-x-auto">
                                <table className="w-full text-[12px]" style={{ minWidth: "500px" }}>
                                  <thead>
                                    <tr style={{ background: "#0D1B2A" }}>
                                      <th className="text-right px-3 py-2 text-[10px] font-bold text-white">رقم الشيك</th>
                                      <th className="text-center px-3 py-2 text-[10px] font-bold text-white">النوع</th>
                                      <th className="text-left px-3 py-2 text-[10px] font-bold text-white">المبلغ</th>
                                      <th className="text-right px-3 py-2 text-[10px] font-bold text-white">التاريخ</th>
                                      <th className="text-center px-3 py-2 text-[10px] font-bold text-white">الحالة</th>
                                      <th className="text-right px-3 py-2 text-[10px] font-bold text-white">البنك</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {relatedCheques.map((c, i) => (
                                      <tr key={c.id} className={cn("border-b border-border/30 hover:bg-muted/20 transition-colors", i % 2 === 1 && "bg-muted/10")}>
                                        <td className="px-3 py-2 text-right">
                                          <button onClick={() => navigate("/cheques")} className="text-primary hover:underline font-mono text-[11px]">{c.cheque_number || "—"}</button>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", c.cheque_type === "وارد" ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/5" : "border-red-500/30 text-red-500 bg-red-500/5")}>{c.cheque_type}</span>
                                        </td>
                                        <td className="px-3 py-2 text-left font-mono font-semibold">{fmtAmount(c.amount)}</td>
                                        <td className="px-3 py-2 text-right text-muted-foreground">{fmtDate(c.cheque_date)}</td>
                                        <td className="px-3 py-2 text-center"><Badge variant="outline" className="text-[9px]">{c.status}</Badge></td>
                                        <td className="px-3 py-2 text-right text-muted-foreground">{c.bank_name || "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )}

                    {/* ─── AGING ANALYSIS ─── */}
                    {agingData && (
                      <div className="px-5 py-3 border-b border-border no-print">
                        <Collapsible>
                          <CollapsibleTrigger className="w-full">
                            <div className="flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer py-1">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <span className="text-xs font-semibold text-foreground">تحليل التقادم (Aging)</span>
                              </div>
                              <div className="flex items-center gap-3 text-[10px]">
                                <span className="text-muted-foreground">الإجمالي:</span>
                                <span className="font-bold text-red-600 tabular-nums">{fmtAmount(agingData.total)}</span>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-2 overflow-hidden rounded-lg border border-border">
                              <div className={cn("grid gap-px bg-border", isMobile ? "grid-cols-2" : "grid-cols-5")}>
                                {[
                                  { label: "جاري (حالي)", value: agingData.current, color: "text-emerald-600", bg: "bg-emerald-500/5" },
                                  { label: "1 - 30 يوم", value: agingData.d1_30, color: "text-amber-600", bg: "bg-amber-500/5" },
                                  { label: "31 - 60 يوم", value: agingData.d31_60, color: "text-orange-600", bg: "bg-orange-500/5" },
                                  { label: "+60 يوم", value: agingData.d60plus, color: "text-red-600", bg: "bg-red-500/5" },
                                  { label: "الإجمالي", value: agingData.total, color: "text-foreground font-bold", bg: "bg-muted/30" },
                                ].map((col, i) => (
                                  <div key={i} className={cn("p-3 text-center", col.bg)}>
                                    <div className="text-[10px] text-muted-foreground font-semibold mb-1">{col.label}</div>
                                    <div className={cn("text-sm font-bold tabular-nums", col.color)}>
                                      {col.value > 0 ? fmtAmount(col.value) : "—"}
                                    </div>
                                    {agingData.total > 0 && col.value > 0 && col.label !== "الإجمالي" && (
                                      <div className="mt-1">
                                        <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                                          <div
                                            className={cn("h-full rounded-full",
                                              i === 0 ? "bg-emerald-500" : i === 1 ? "bg-amber-500" : i === 2 ? "bg-orange-500" : "bg-red-500"
                                            )}
                                            style={{ width: `${Math.round((col.value / agingData.total) * 100)}%` }}
                                          />
                                        </div>
                                        <div className="text-[9px] text-muted-foreground mt-0.5">
                                          {Math.round((col.value / agingData.total) * 100)}%
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    )}

                    {/* ─── TRANSACTIONS TABLE ─── */}
                    <div className="no-print">
                      {loading ? (
                        <div className="p-5 space-y-2">
                          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                        </div>
                      ) : rows.length === 0 ? (
                        <div className="py-16 text-center">
                          <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                          <p className="text-sm text-muted-foreground font-medium">لا توجد حركات في هذه الفترة</p>
                          <button onClick={() => { setDateFrom("2020-01-01"); setDateTo(format(new Date(), "yyyy-MM-dd")); setActivePeriod("كل الفترات"); }}
                            className="mt-2 text-xs text-primary hover:underline">
                            عرض كل الفترات
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="overflow-x-auto overflow-hidden" style={{ WebkitOverflowScrolling: "touch" }}>
                            <table className="w-full text-[13px]" style={{ tableLayout: "fixed", minWidth: "880px" }}>
                              <colgroup>
                                {isColVisible("date") && <col style={{ width: "110px" }} />}
                                {isColVisible("reference") && <col style={{ width: "110px" }} />}
                                {isColVisible("description") && <col />}
                                {isColVisible("dueDate") && <col style={{ width: "110px" }} />}
                                {isColVisible("type") && <col style={{ width: "90px" }} />}
                                {isColVisible("paymentMethod") && <col style={{ width: "85px" }} />}
                                {isColVisible("currency") && <col style={{ width: "65px" }} />}
                                {isColVisible("contactCode") && <col style={{ width: "80px" }} />}
                                {isColVisible("debit") && <col style={{ width: "110px" }} />}
                                {isColVisible("credit") && <col style={{ width: "110px" }} />}
                                {isColVisible("balance") && <col style={{ width: "120px" }} />}
                              </colgroup>
                              <thead className="sticky top-0 z-10">
                                <tr style={{ background: "#0D1B2A" }}>
                                  {isColVisible("date") && <th className="text-right px-3 py-3 text-[11px] font-bold text-white">التاريخ</th>}
                                  {isColVisible("reference") && <th className="text-right px-3 py-3 text-[11px] font-bold text-white">المرجع</th>}
                                  {isColVisible("description") && <th className="text-right px-3 py-3 text-[11px] font-bold text-white">البيان</th>}
                                  {isColVisible("dueDate") && <th className="text-right px-3 py-3 text-[11px] font-bold text-white">الاستحقاق</th>}
                                  {isColVisible("type") && <th className="text-center px-3 py-3 text-[11px] font-bold text-white">النوع</th>}
                                  {isColVisible("paymentMethod") && <th className="text-center px-3 py-3 text-[11px] font-bold text-white">الدفع</th>}
                                  {isColVisible("currency") && <th className="text-center px-3 py-3 text-[11px] font-bold text-white">العملة</th>}
                                  {isColVisible("contactCode") && <th className="text-center px-3 py-3 text-[11px] font-bold text-white">كود الجهة</th>}
                                  {isColVisible("debit") && <th className={cn("text-left px-3 py-3 text-[11px] font-bold", isDebitNature ? "text-emerald-300" : "text-red-300")}>مدين (عليه)</th>}
                                  {isColVisible("credit") && <th className={cn("text-left px-3 py-3 text-[11px] font-bold", isDebitNature ? "text-red-300" : "text-emerald-300")}>دائن (له)</th>}
                                  {isColVisible("balance") && <th className="text-left px-3 py-3 text-[11px] font-bold text-white">الرصيد</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {/* Opening balance */}
                                <tr style={{ background: "#F8F9FA" }} className="border-b-2 border-border/60">
                                  {isColVisible("date") && <td className="px-3 py-2.5 text-xs text-muted-foreground italic whitespace-nowrap">{(() => { try { const d = new Date(dateFrom); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; } catch { return dateFrom; } })()}</td>}
                                  {isColVisible("reference") && <td className="px-3 py-2.5 text-xs text-muted-foreground">—</td>}
                                  {isColVisible("description") && <td className="px-3 py-2.5 text-xs font-bold text-foreground italic">رصيد أول المدة</td>}
                                  {isColVisible("dueDate") && <td className="px-3 py-2.5"></td>}
                                  {isColVisible("type") && <td className="px-3 py-2.5"></td>}
                                  {isColVisible("paymentMethod") && <td className="px-3 py-2.5"></td>}
                                  {isColVisible("currency") && <td className="px-3 py-2.5"></td>}
                                  {isColVisible("contactCode") && <td className="px-3 py-2.5"></td>}
                                  {isColVisible("debit") && <td className="px-3 py-2.5 text-xs text-left tabular-nums text-muted-foreground">{openingBalance > 0 ? fmtAmount(openingBalance, statementCurrency) : "—"}</td>}
                                  {isColVisible("credit") && <td className="px-3 py-2.5 text-xs text-left tabular-nums text-muted-foreground">{openingBalance < 0 ? fmtAmount(openingBalance, statementCurrency) : "—"}</td>}
                                  {isColVisible("balance") && <td className="px-3 py-2.5 text-left"><BalanceCell value={openingBalance} currency={statementCurrency} isDebitNature={isDebitNature} /></td>}
                                </tr>

                                {/* Transaction rows */}
                                {filteredRows.map((row, i) => {
                                  const badge = getTypeBadge(row.transaction_type);
                                  const isSubRow = row.isLineItem;
                                  return (
                                    <tr
                                      key={`${row.transaction_id}-${i}`}
                                      className={cn(
                                        "border-b border-border/30 transition-colors",
                                        isSubRow
                                          ? "bg-primary/[0.03] hover:bg-primary/[0.06]"
                                          : cn("hover:bg-primary/5 cursor-pointer", i % 2 === 1 && "bg-muted/10")
                                      )}
                                      onClick={() => !isSubRow && openPreview(row.transaction_id)}
                                      style={{ height: isSubRow ? "36px" : "44px" }}
                                    >
                                      {isColVisible("date") && (
                                        <td className="px-3 py-2">
                                          {!isSubRow ? (
                                            <>
                                              <div className="text-xs tabular-nums text-foreground">{fmtDate(row.date)}</div>
                                              <div className="text-[9px] text-muted-foreground">{getDayName(row.date)}</div>
                                            </>
                                          ) : <span className="text-[10px] text-muted-foreground/50">↳</span>}
                                        </td>
                                      )}
                                      {isColVisible("reference") && (
                                        <td className="px-3 py-2 text-xs">
                                          {!isSubRow && row.reference ? (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); openPreview(row.transaction_id); }}
                                              className="text-primary hover:underline font-mono text-[11px] font-semibold"
                                            >
                                              {row.reference}
                                            </button>
                                          ) : <span className="text-muted-foreground">{isSubRow ? "" : "—"}</span>}
                                        </td>
                                      )}
                                      {isColVisible("description") && (
                                        <td className={cn("px-3 py-2 text-xs truncate", isSubRow ? "text-muted-foreground pr-6" : "text-foreground")}>
                                          {row.description}
                                        </td>
                                      )}
                                      {isColVisible("dueDate") && (
                                        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                                          {!isSubRow && row.dueDate ? fmtDate(row.dueDate) : isSubRow ? "" : "—"}
                                        </td>
                                      )}
                                      {isColVisible("type") && (
                                        <td className="px-3 py-2 text-center">
                                          {!isSubRow ? (
                                            <span className={cn("inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md border", badge.color)}>
                                              {badge.label}
                                            </span>
                                          ) : <span className="text-[9px] text-muted-foreground">بند</span>}
                                        </td>
                                      )}
                                      {isColVisible("paymentMethod") && <td className="px-3 py-2 text-center text-[10px] text-muted-foreground">{!isSubRow ? (PAYMENT_METHOD_AR[row.payment_method || ""] || row.payment_method || "—") : ""}</td>}
                                      {isColVisible("currency") && <td className="px-3 py-2 text-center text-[10px] text-muted-foreground">{!isSubRow ? row.currency : ""}</td>}
                                      {isColVisible("contactCode") && <td className="px-3 py-2 text-center text-[10px] text-muted-foreground font-mono">{!isSubRow ? (selectedEntityInfo.code || "—") : ""}</td>}
                                      {isColVisible("debit") && (
                                        <td className={cn("px-3 py-2 text-left tabular-nums whitespace-nowrap", isSubRow ? `text-[10px] ${isDebitNature ? "text-emerald-500/70" : "text-red-500/70"}` : `font-semibold ${isDebitNature ? "text-emerald-600" : "text-red-600"}`)}>
                                          {row.debit > 0 ? fmtAmount(row.debit, row.currency) : "—"}
                                        </td>
                                      )}
                                      {isColVisible("credit") && (
                                        <td className={cn("px-3 py-2 text-left tabular-nums whitespace-nowrap", isSubRow ? `text-[10px] ${isDebitNature ? "text-red-500/70" : "text-emerald-500/70"}` : `font-semibold ${isDebitNature ? "text-red-600" : "text-emerald-600"}`)}>
                                          {row.credit > 0 ? fmtAmount(row.credit, row.currency) : "—"}
                                        </td>
                                      )}
                                      {isColVisible("balance") && (
                                        <td className="px-3 py-2 text-left whitespace-nowrap">
                                          {!isSubRow ? <BalanceCell value={row.balance} bold currency={row.currency} isDebitNature={isDebitNature} /> : <span className="text-muted-foreground/30">—</span>}
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}

                                {/* Closing balance */}
                                <tr style={{ background: "#0D1B2E", color: "white", fontWeight: 700 }}>
                                  {isColVisible("date") && <td className="px-3 py-3.5 text-xs font-bold text-white">—</td>}
                                  {isColVisible("reference") && <td className="px-3 py-3.5 text-xs font-bold text-white">—</td>}
                                  {isColVisible("description") && <td className="px-3 py-3.5 text-sm font-bold text-white">رصيد الختام</td>}
                                  {isColVisible("dueDate") && <td className="px-3 py-3.5"></td>}
                                  {isColVisible("type") && <td className="px-3 py-3.5"></td>}
                                  {isColVisible("paymentMethod") && <td className="px-3 py-3.5"></td>}
                                  {isColVisible("currency") && <td className="px-3 py-3.5"></td>}
                                  {isColVisible("contactCode") && <td className="px-3 py-3.5"></td>}
                                  {isColVisible("debit") && <td className={cn("px-3 py-3.5 text-left tabular-nums font-bold text-sm whitespace-nowrap", isDebitNature ? "text-emerald-300" : "text-red-300")}>{fmtAmount(totalDebit, statementCurrency)}</td>}
                                  {isColVisible("credit") && <td className={cn("px-3 py-3.5 text-left tabular-nums font-bold text-sm whitespace-nowrap", isDebitNature ? "text-red-300" : "text-emerald-300")}>{fmtAmount(totalCredit, statementCurrency)}</td>}
                                  {isColVisible("balance") && (
                                    <td className="px-3 py-3.5 text-left whitespace-nowrap">
                                      <span className={cn("text-sm font-bold tabular-nums px-2 py-1 rounded",
                                        (() => {
                                          if (closingBalance === 0) return "text-white/70";
                                          const isNormalSide = closingBalance > 0 ? isDebitNature : !isDebitNature;
                                          return isNormalSide ? "text-emerald-300 bg-emerald-500/20" : "text-red-300 bg-red-500/20";
                                        })()
                                      )}>
                                        {fmtAmount(closingBalance, statementCurrency)}
                                      </span>
                                    </td>
                                  )}
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* Footer summary */}
                          <div className="bg-muted/60 border-t border-border px-5 py-3 space-y-2">
                            <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                              <span className="text-muted-foreground">
                                إجمالي الحركات: <strong className="text-foreground">{filteredRows.length} قيد</strong>
                              </span>
                              <div className="flex items-center gap-4 flex-wrap">
                                <span>إجمالي مدين: <strong className="text-red-600 tabular-nums">{fmtAmount(totalDebit, statementCurrency)}</strong></span>
                                <span>إجمالي دائن: <strong className="text-emerald-600 tabular-nums">{fmtAmount(totalCredit, statementCurrency)}</strong></span>
                                <Separator orientation="vertical" className="h-4" />
                                <span>
                                  الرصيد الختامي: <strong className={cn("tabular-nums", closingBalance > 0 ? "text-red-600" : closingBalance < 0 ? "text-emerald-600" : "text-foreground")}>
                                    {fmtAmount(closingBalance, statementCurrency)}
                                  </strong> ({closingBalance >= 0 ? "مدين" : "دائن"})
                                </span>
                              </div>
                            </div>

                            {pdcTotal > 0 && (
                              <div className="flex items-center gap-4 text-xs border-t border-border/50 pt-2 flex-wrap">
                                <span className="text-muted-foreground">إجمالي شيكات آجلة (PDC):</span>
                                <strong className="text-emerald-600 tabular-nums">{fmtAmount(pdcTotal)}</strong>
                                <Separator orientation="vertical" className="h-4" />
                                <span className="text-muted-foreground">الرصيد مع PDC:</span>
                                <strong className={cn("tabular-nums", (closingBalance + pdcTotal) > 0 ? "text-red-600" : "text-emerald-600")}>
                                  {fmtAmount(closingBalance + pdcTotal)}
                                </strong>
                              </div>
                            )}

                            <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/50 pt-2">
                              <span>أساس المحاسبة: الاستحقاق</span>
                              <span>تاريخ الطباعة: {fmtDate(format(new Date(), "yyyy-MM-dd"))}</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Document Footer */}
                    <div className="rounded-b-xl p-5 border-t border-border" style={{ background: "#F8F9FA" }}>
                      <div className="flex items-start justify-between mb-4">
                        <div className="text-xs text-muted-foreground">
                          <p className="font-semibold mb-1">للمطابقة والاستفسار:</p>
                          {companyInfo.email && <p className="flex items-center gap-1"><Mail className="w-3 h-3" /> {companyInfo.email}</p>}
                          {companyInfo.phone && <p className="flex items-center gap-1"><Phone className="w-3 h-3" /> {companyInfo.phone}</p>}
                        </div>
                      </div>
                      <div className="flex items-end justify-between gap-8">
                        <div className="flex-1 text-center border border-border/50 rounded-lg py-6 px-4">
                          <p className="text-[10px] text-muted-foreground mt-1">ختم الشركة وتوقيع المحاسب</p>
                        </div>
                        <div className="flex-1 text-center border border-border/50 rounded-lg py-6 px-4">
                          <p className="text-[10px] text-muted-foreground mt-1">اعتماد العميل</p>
                        </div>
                      </div>
                      <div className="mt-3 text-center text-[10px] text-muted-foreground">
                        <p>يرجى الإشارة إلى رقم الكشف عند التواصل</p>
                        <p className="mt-1">طُبع بتاريخ: {fmtDate(format(new Date(), "yyyy-MM-dd"))} — {companyInfo.name || "AMWALI"}</p>
                      </div>
                    </div>

                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── MOBILE ENTITY SHEET (Bottom Sheet) ─── */}
      <Sheet open={showMobileEntitySheet} onOpenChange={setShowMobileEntitySheet}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl" dir="rtl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <User className="w-5 h-5" /> اختر جهة
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col h-full mt-3">
            {renderSidebarContent()}
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── CUSTOMIZE PANEL (Sheet from right) ─── */}
      <Sheet open={showCustomizePanel} onOpenChange={setShowCustomizePanel}>
        <SheetContent side="right" className="w-[360px] overflow-y-auto" dir="rtl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" /> تخصيص الكشف
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6 mt-6">
            {/* Detail level */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase">مستوى التفصيل</h4>
              <RadioGroup value={detailLevel} onValueChange={(v) => setDetailLevel(v as DetailLevel)} className="space-y-2">
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="summary" id="summary" />
                  <div>
                    <Label htmlFor="summary" className="text-sm font-medium cursor-pointer">ملخص</Label>
                    <p className="text-[10px] text-muted-foreground">عرض ملخص بدون تفاصيل</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="total" id="total" />
                  <div>
                    <Label htmlFor="total" className="text-sm font-medium cursor-pointer">إجمالي</Label>
                    <p className="text-[10px] text-muted-foreground">كل حركة في سطر واحد</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="lineItems" id="lineItems" />
                  <div>
                    <Label htmlFor="lineItems" className="text-sm font-medium cursor-pointer">تفصيل البنود</Label>
                    <p className="text-[10px] text-muted-foreground">كل صنف في الفاتورة في سطر منفصل</p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <Separator />

            {/* Column toggles */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase">الأعمدة المعروضة</h4>
              {columns.map((col, idx) => (
                <label key={col.key} className="flex items-center gap-3 cursor-pointer py-1">
                  <Checkbox
                    checked={col.visible}
                    onCheckedChange={(v) => {
                      const newCols = [...columns];
                      newCols[idx] = { ...col, visible: !!v };
                      saveColumns(newCols);
                    }}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-foreground">{col.label}</span>
                </label>
              ))}
            </div>

            <Separator />

            {/* Additional display options */}
             <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase">── إضافي ──</h4>
              {[
                { key: "showSalesOrder" as const, label: "إظهار أرقام أوامر البيع (SO)", colKey: "" },
                { key: "showContactCode" as const, label: "إظهار كود العميل/رقمه في كل سطر", colKey: "contactCode" },
                { key: "showDueDate" as const, label: "إظهار تاريخ الاستحقاق", colKey: "dueDate" },
                { key: "showPaymentMethod" as const, label: "إظهار طريقة الدفع", colKey: "paymentMethod" },
                { key: "showCurrency" as const, label: "إظهار العملة", colKey: "currency" },
                { key: "showCheques" as const, label: "الشيكات المرتبطة", colKey: "" },
                { key: "showVoucherDetails" as const, label: "تفاصيل السندات", colKey: "" },
                { key: "showChildAccounts" as const, label: "إظهار الحسابات الفرعية (Show Child)", colKey: "" },
                { key: "showNotes" as const, label: "الملاحظات", colKey: "notes" },
                { key: "includeBounced" as const, label: "⚙️ أضف الشيكات المرتجعة للرصيد", colKey: "" },
                { key: "includePDC" as const, label: "📅 أظهر الشيكات الواردة برسم التحصيل (PDC)", colKey: "" },
              ].map(opt => (
                <label key={opt.key} className="flex items-center gap-3 cursor-pointer py-1">
                  <Checkbox
                    checked={displayOptions[opt.key]}
                    onCheckedChange={(v) => {
                      setDisplayOptions(prev => ({ ...prev, [opt.key]: !!v }));
                      if (opt.colKey) {
                        const newCols = columns.map(c =>
                          c.key === opt.colKey ? { ...c, visible: !!v } : c
                        );
                        saveColumns(newCols);
                      }
                    }}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-foreground">{opt.label}</span>
                </label>
              ))}
            </div>

            <Separator />

            {/* Fiscal year */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-muted-foreground uppercase">السنة المالية</h4>
              <div className="flex flex-wrap gap-1.5">
                {FISCAL_YEARS.map(y => (
                  <button
                    key={y}
                    onClick={() => setFiscalYear(y)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                      activePeriod === `سنة ${y}`
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:text-foreground"
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            <Button size="sm" className="w-full" onClick={() => {
              localStorage.setItem("stmt_display_options", JSON.stringify(displayOptions));
              localStorage.setItem("stmt_detail_level", detailLevel);
              toast({ title: "تم حفظ خياراتك بنجاح ✅" });
            }}>
              💾 احفظ خياراتي
            </Button>

            <Button variant="outline" size="sm" className="w-full" onClick={() => {
              saveColumns(DEFAULT_COLUMNS);
              setDisplayOptions(DEFAULT_DISPLAY_OPTIONS);
              setDetailLevel("total");
              localStorage.removeItem("stmt_display_options");
              localStorage.removeItem("stmt_detail_level");
              localStorage.removeItem("statement_columns_prefs");
            }}>
              إعادة الضبط الافتراضي
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── TRANSACTION PREVIEW DRAWER (Sheet from left) ─── */}
      <Sheet open={showPreviewDrawer} onOpenChange={setShowPreviewDrawer}>
        <SheetContent side="left" className="w-[420px] p-0" dir="rtl">
          {previewTx ? (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-border" style={{ background: "#0D1B2A" }}>
                <div className="flex items-center justify-between mb-2">
                  <Badge className={getTypeBadge(previewTx.transaction_type).color + " text-[11px]"}>
                    {getTypeBadge(previewTx.transaction_type).label}
                  </Badge>
                  <button onClick={() => setShowPreviewDrawer(false)} className="text-white/60 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <h3 className="text-white font-bold text-base">{previewTx.reference || "بدون مرجع"}</h3>
                <p className="text-white/60 text-xs mt-1">{fmtDate(previewTx.transaction_date)}</p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">البيان</span>
                    <span className="text-foreground font-medium text-right max-w-[250px]">{previewTx.description}</span>
                  </div>
                  {!isAccountsTab && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">الجهة</span>
                      <span className="text-foreground font-medium">{selectedEntityName}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">الحالة</span>
                    <Badge variant={previewTx.row && previewTx.row.balance > 0 ? "destructive" : "default"} className="text-[10px]">
                      {previewTx.row && previewTx.row.balance > 0 ? "غير مسدّدة" : "مسدّدة"}
                    </Badge>
                  </div>
                  {previewTx.payment_method && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">طريقة الدفع</span>
                      <span className="text-foreground">{previewTx.payment_method}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">حساب مدين</span>
                      <span className="text-xs font-mono text-foreground">{previewTx.debit_account_code}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">حساب دائن</span>
                      <span className="text-xs font-mono text-foreground">{previewTx.credit_account_code}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">المبلغ</span>
                      <span className="text-base font-bold tabular-nums text-primary">{fmtAmount(previewTx.amount)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-border flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => {
                    if (previewTx.reference) navigateToReference(previewTx.reference, previewTx.id);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" /> تعديل
                </Button>
                <Button
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => {
                    if (previewTx.reference) navigateToReference(previewTx.reference, previewTx.id);
                  }}
                >
                  <Eye className="w-3.5 h-3.5" /> عرض المستند
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── PDF PREVIEW MODAL (in-page, no popup) ─── */}
      {showPdfModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              background: "#1B3A5C",
              padding: "10px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
            dir="rtl"
          >
            <span style={{ color: "white", fontWeight: "bold", fontSize: 15 }}>
              <Eye className="w-4 h-4 inline-block ml-2" style={{ verticalAlign: "middle" }} />
              معاينة كشف الحساب
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDownloadPDF} disabled={pdfGenerating}>
                {pdfGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
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

          <div style={{ flex: 1, overflow: "auto", background: "#e5e7eb", padding: "20px", display: "flex", justifyContent: "center" }}>
            <div id="statement-preview-doc" style={{ width: "794px", minHeight: "1123px", background: "white", boxShadow: "0 4px 20px rgba(0,0,0,0.2)" }}>
              <StatementPrintView
                isPreview
                company={companyInfo}
                contact={{
                  name: selectedEntityName,
                  type: selectedEntityInfo.type,
                  phone: selectedEntityInfo.phone,
                  address: selectedEntityInfo.address,
                  email: selectedContact?.email || "",
                }}
                rows={filteredRows}
                openingBalance={openingBalance}
                closingBalance={closingBalance}
                totalDebit={totalDebit}
                totalCredit={totalCredit}
                dateFrom={dateFrom}
                dateTo={dateTo}
                columns={columns}
                contactCode={selectedEntityInfo.code}
                detailLevel={detailLevel}
                pdcCheques={pdcCheques}
                pdcTotal={pdcTotal}
                bouncedCheques={bouncedCheques}
                bouncedTotal={bouncedTotal}
                includeBounced={displayOptions.includeBounced}
                includePDC={displayOptions.includePDC}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// ─── SUB-COMPONENTS ───

function BalanceCell({ value, bold, currency, isDebitNature = true }: { value: number; bold?: boolean; currency?: string; isDebitNature?: boolean }) {
  // For debit-nature accounts: positive balance (debit) = normal (green), negative (credit) = abnormal (red)
  // For credit-nature accounts: negative balance (credit) = normal (green), positive (debit) = abnormal (red)
  const getColor = () => {
    if (value === 0) return "text-muted-foreground";
    const isNormalSide = value > 0 ? isDebitNature : !isDebitNature;
    return isNormalSide ? "text-emerald-600 bg-emerald-500/10" : "text-red-600 bg-red-500/10";
  };
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs tabular-nums",
      bold ? "font-bold text-sm" : "font-semibold",
      getColor()
    )}>
      {fmtAmount(value, currency)}
      <span className="text-[9px] font-normal opacity-70">{value > 0 ? "م" : value < 0 ? "د" : ""}</span>
    </span>
  );
}

export default AccountStatementPage;
