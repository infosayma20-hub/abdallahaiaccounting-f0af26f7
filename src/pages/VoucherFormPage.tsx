import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { ArrowRight, FileText, Search, CheckCircle, AlertTriangle, Info, Printer, Save, Landmark, CreditCard, Building2, Receipt as ReceiptIcon, Banknote, User, Users, UserCheck, Plus, BookOpen, X, RefreshCw, Upload, Trash2, Paperclip, ChevronDown, Wrench, ArrowLeftRight, Eye, Pencil, Lock, Copy, ChevronRight, ChevronLeft, ListChecks, Calculator, Wallet, Utensils, TrendingDown, ShoppingCart, Truck, ShieldAlert, NotebookPen, Pin, PinOff, Tag } from "lucide-react";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import DeductionMonthPicker, { toSalaryPeriod, formatMonthLabel, monthOf } from "@/components/finance/DeductionMonthPicker";
import EndorseChequeModal, { type EndorsedCheque } from "@/components/EndorseChequeModal";
import VoucherCancelModal from "@/components/VoucherCancelModal";
import VoucherNavToolbar from "@/components/VoucherNavToolbar";
import DuplicateBanner from "@/components/DuplicateBanner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllAccountsForOwner } from "@/lib/fetchAllAccounts";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { useAuth } from "@/hooks/useAuth";
import { resolveBankAccountCode } from "@/lib/resolveBankCode";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useCompany } from "@/hooks/useCompanyContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import PageHeader from "@/components/layout/PageHeader";
import { multiWordMatchAny } from "@/lib/utils";
import { broadcastChange } from "@/lib/crossTabSync";
import ChequeAllBankSelect from "@/components/ChequeAllBankSelect";
import SmartFormScope from "@/components/forms/SmartFormScope";
import useFormDraft from "@/hooks/useFormDraft";
import DraftRestoreBanner from "@/components/forms/DraftRestoreBanner";
import SmartAllocationPanel from "@/components/voucher/SmartAllocationPanel";
import CompactChequeRow from "@/components/voucher/CompactChequeRow";
import {
  syncChequesOnEdit,
  wipeUnreferencedCheques,
  insertChequesForVoucher,
  validateChequeRows,
} from "@/lib/voucher-cheques-sync";
import SmartSummaryPanel from "@/components/voucher/SmartSummaryPanel";
import MobileSummaryBar from "@/components/voucher/MobileSummaryBar";
import { useFastEntryMode } from "@/hooks/useFastEntryMode";
import {
  isVouchersRpcEnabled,
  callCreateReceiptRpc,
  callCreatePaymentRpc,
  callAllocateVoucherRpc,
  callCreateMixedVoucherRpc,
} from "@/lib/voucher-rpc";
import { openOfficialVoucherWindow } from "@/lib/print/buildOfficialVoucher";
import {
  AllocationMode,
  autoAllocate as engineAutoAllocate,
  checkPostingGuards,
  classifyVoucher as engineClassify,
  computeSummary as engineSummary,
} from "@/lib/voucher-allocation";
import RelatedJournalPanel from "@/components/accounting/RelatedJournalPanel";
import { fetchContactStatementBalance } from "@/lib/contact-balance";
import CostCenterCombobox from "@/components/cost-centers/CostCenterCombobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDbError } from "@/lib/db-error-toast";

// Lightweight in-memory cache for exchange rates. Same currency is often
// re-fetched on every focus/rerender; a short TTL avoids repeated round-trips
// without changing any business logic. Cleared on page reload.
const EXCHANGE_RATE_TTL_MS = 5 * 60 * 1000;
const exchangeRateCache = new Map<string, { rate: number; ts: number }>();

// Wave 2 · lookup caches (per owner, 2-minute TTL). These lists are read-only
// inside the voucher form and rarely change mid-session; TTL kept short so any
// newly-added cash box / bank account appears within 2 min or on reload.
const VOUCHER_LOOKUP_TTL_MS = 2 * 60 * 1000;
const cashBoxesCache = new Map<string, { data: any[]; ts: number }>();
const bankAccountsCache = new Map<string, { data: any[]; ts: number }>();

interface Contact {
  id: string;
  contact_name: string;
  contact_type?: string;
  current_balance: number;
  ledger_balance?: number;
  open_invoices_balance?: number;
  unapplied_credit?: number;
}

interface Invoice {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number | null;
  remaining_amount: number | null;
  status: string | null;
  currency?: string;
  exchange_rate?: number;
  selected?: boolean;
  allocatedAmount?: number;
}

interface CashBox {
  id: string;
  name: string;
  gl_account_code: string | null;
  /**
   * Native currency of this cash box (e.g. "دولار", "دينار", "شيكل").
   * Used to auto-align the voucher's `currency` state so a cashier who
   * picks a foreign-currency box can't accidentally post the entry as ILS
   * — the historical root cause of mixed-currency corruption on statements.
   */
  currency?: string | null;
}

interface BankAccount {
  id: string;
  name: string;
  bank_name: string;
  gl_account_code: string | null;
  incoming_checks_account_code?: string | null;
  outgoing_checks_account_code?: string | null;
  currency?: string | null;
}

interface Employee {
  id: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
}

interface GLAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

const PAYMENT_METHODS = [
  { value: "نقدي", label: "نقدي", icon: Banknote },
  { value: "شيك", label: "شيك", icon: ReceiptIcon },
  { value: "مختلط", label: "نقدي + شيكات", icon: ReceiptIcon },
  { value: "تحويل", label: "تحويل بنكي", icon: Building2 },
  { value: "بطاقة", label: "بطاقة", icon: CreditCard },
];

const EMP_TRANSACTION_CATEGORIES = [
  { value: "سلفة", label: "سلفة", icon: Wallet },
  { value: "رواتب", label: "رواتب وأجور", icon: Banknote },
  { value: "أكل", label: "أكل / وجبات", icon: Utensils },
  { value: "عجز", label: "عجز صندوق", icon: TrendingDown },
  { value: "مشتريات", label: "مشتريات", icon: ShoppingCart },
  { value: "توصيل", label: "توصيل", icon: Truck },
  { value: "مخالفة", label: "مخالفة", icon: ShieldAlert },
  { value: "أخرى", label: "أخرى", icon: NotebookPen },
];

// B3.4: Map the Arabic empCategory chosen on the voucher form to the
// employee_financial_movements.category enum (B3.1).
// "رواتب" is excluded — payroll postings are out of scope for B3.x.
function mapEmpCategoryToSubLedger(empCategory: string): string | null {
  switch (empCategory) {
    case "سلفة":     return "advance";
    case "أكل":      return "food";
    case "عجز":      return "cash_shortage";
    case "مشتريات":  return "purchase";
    case "توصيل":    return "transport";
    case "مخالفة":   return "penalty";
    case "أخرى":     return "other";
    case "رواتب":    return null; // do not mirror salary payments here
    default:          return "other";
  }
}

const CURRENCIES = [
  { value: "ILS", label: "شيكل", symbol: "₪" },
  { value: "USD", label: "دولار", symbol: "$" },
  { value: "JOD", label: "دينار", symbol: "د.ا" },
  { value: "EUR", label: "يورو", symbol: "€" },
];

type VoucherType = "receipt" | "payment";
type PartyType = "contact" | "employee" | "account";

interface VoucherFormPageProps {
  voucherType?: VoucherType;
}

const VoucherFormPage = ({ voucherType = "receipt" }: VoucherFormPageProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: editId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = (dataOwnerId ?? user?.id) as string;
  const { company } = useCompany();
  const { settings } = useCompanySettings();

  const fromDuplicate = searchParams.get("from_duplicate") === "true";
  const [duplicateSourceRef, setDuplicateSourceRef] = useState<string | null>(null);
  const isEditMode = !!editId;

  // Prefill from "Mark invoice as paid" flow on InvoicesPage
  const prefillInvoiceId = searchParams.get("invoice_id");
  const prefillContactName = searchParams.get("contact_name");
  const prefillContactId = searchParams.get("contact_id");
  const prefillAmount = searchParams.get("amount");
  const prefillNotes = searchParams.get("notes");
  const prefillOrderRef = searchParams.get("order_ref");
  const prefillOrderId = searchParams.get("order_id");
  const [prefillConsumed, setPrefillConsumed] = useState(false);

  // One-time prefill of amount/notes when navigating from Orders (or any deep-link)
  useEffect(() => {
    if (isEditMode) return;
    if (prefillAmount && !amount) {
      const n = Number(prefillAmount);
      if (!isNaN(n) && n > 0) setAmount(String(n));
    }
    if ((prefillNotes || prefillOrderRef) && !notes) {
      const parts: string[] = [];
      if (prefillOrderRef) parts.push(`دفعة على طلبية ${prefillOrderRef}`);
      if (prefillNotes) parts.push(prefillNotes);
      setNotes(parts.join(" • "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isReceipt = voucherType === "receipt";
  const isPayment = voucherType === "payment";
  /** Phase 1/2: both receipt & payment now use the FinanceShell + ActionPane. */
  const useFinanceShell = isReceipt || isPayment;
  const pageTitle = isEditMode 
    ? (isReceipt ? "تعديل سند قبض" : "تعديل سند صرف")
    : (isReceipt ? "سند قبض جديد" : "سند صرف جديد");
  const pageDesc = isEditMode
    ? (isReceipt ? "تعديل بيانات سند القبض" : "تعديل بيانات سند الصرف")
    : (isReceipt ? "تسجيل دفعة من زبون وربطها بالفواتير" : "تسجيل دفعة لمورد وربطها بالفواتير");
  const contactLabel = isReceipt ? "الزبون / المورد" : "المورد / الجهة";
  const contactPlaceholder = isReceipt ? "ابحث عن زبون..." : "ابحث عن مورد...";
  const amountLabel = isReceipt ? "المبلغ المقبوض" : "المبلغ المدفوع";
  const listPath = isReceipt ? "/finance/receipts" : "/finance/payments";
  const voucherLabel = isReceipt ? "سند القبض" : "سند الصرف";
  const [editLoading, setEditLoading] = useState(false);
  const [editVoucherStatus, setEditVoucherStatus] = useState<string | null>(null);

  // Form state
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [refNumber, setRefNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("نقدي");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [cheques, setCheques] = useState<{ number: string; date: string; bank: string; amount: string; accountNumber: string; notes: string }[]>([]);
  const [endorsedCheques, setEndorsedCheques] = useState<EndorsedCheque[]>([]);
  const [showEndorseModal, setShowEndorseModal] = useState(false);

  // For "مختلط" (نقدي + شيكات) — how much of the total is cash
  const [mixedCashAmount, setMixedCashAmount] = useState<string>("");

  const [focusChequeIndex, setFocusChequeIndex] = useState<number | null>(null);

  const addCheque = useCallback((sourceIndex?: number) => setCheques(prev => {
    const source = typeof sourceIndex === "number" && prev[sourceIndex] ? prev[sourceIndex] : prev[prev.length - 1];
    const lastNum = source?.number || "";
    const lastDate = source?.date || "";
    const lastBank = source?.bank || "";
    const lastAcct = source?.accountNumber || "";
    // Auto-increment cheque number
    const match = lastNum.match(/(\d+)$/);
    const nextNum = match ? lastNum.replace(/(\d+)$/, String(Number(match[1]) + 1).padStart(match[1].length, "0")) : "";
    // Auto-increment date by 1 month (clamped to end of month if needed)
    let nextDate = lastDate;
    if (lastDate) {
      const d = new Date(lastDate);
      const day = d.getDate();
      d.setMonth(d.getMonth() + 1);
      // If day rolled over (e.g. Jan 31 -> Mar 3), clamp to last day of target month
      if (d.getDate() !== day) d.setDate(0);
      nextDate = d.toISOString().split("T")[0];
    }
    const nextCheque = { number: nextNum, date: nextDate, bank: lastBank, amount: "", accountNumber: lastAcct, notes: "" };
    if (typeof sourceIndex === "number" && sourceIndex >= 0 && sourceIndex < prev.length - 1) {
      return [...prev.slice(0, sourceIndex + 1), nextCheque, ...prev.slice(sourceIndex + 1)];
    }
    return [...prev, nextCheque];
  }), []);

  const addChequeAndFocus = useCallback((sourceIndex?: number) => {
    setFocusChequeIndex(currentCount => currentCount);
    setCheques(prev => {
      const source = typeof sourceIndex === "number" && prev[sourceIndex] ? prev[sourceIndex] : prev[prev.length - 1];
      const lastNum = source?.number || "";
      const lastDate = source?.date || "";
      const lastBank = source?.bank || "";
      const lastAcct = source?.accountNumber || "";
      const match = lastNum.match(/(\d+)$/);
      const nextNum = match ? lastNum.replace(/(\d+)$/, String(Number(match[1]) + 1).padStart(match[1].length, "0")) : "";
      let nextDate = lastDate;
      if (lastDate) {
        const d = new Date(lastDate);
        const day = d.getDate();
        d.setMonth(d.getMonth() + 1);
        if (d.getDate() !== day) d.setDate(0);
        nextDate = d.toISOString().split("T")[0];
      }
      const nextCheque = { number: nextNum, date: nextDate, bank: lastBank, amount: "", accountNumber: lastAcct, notes: "" };
      if (typeof sourceIndex === "number" && sourceIndex >= 0 && sourceIndex < prev.length - 1) {
        setFocusChequeIndex(sourceIndex + 1);
        return [...prev.slice(0, sourceIndex + 1), nextCheque, ...prev.slice(sourceIndex + 1)];
      }
      setFocusChequeIndex(prev.length);
      return [...prev, nextCheque];
    });
  }, []);
  const removeCheque = (idx: number) => setCheques(prev => prev.filter((_, i) => i !== idx));
  const updateCheque = (idx: number, field: string, value: string) => setCheques(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));

  // Backward compat helpers
  const checkNumber = cheques[0]?.number || "";
  const checkDate = cheques[0]?.date || "";
  const checkBank = cheques[0]?.bank || "";

  // Currency
  const [currency, setCurrency] = useState("ILS");
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [fetchingRate, setFetchingRate] = useState(false);

  // Contact
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [computedBalance, setComputedBalance] = useState<number | null>(null);
  // Original saved amount when editing — used to exclude this voucher's own
  // effect from the ledger so the side panel shows "balance BEFORE this voucher".
  const [originalAmount, setOriginalAmount] = useState<number>(0);
  const contactDropdownRef = useRef<HTMLDivElement>(null);
  const [creatingContact, setCreatingContact] = useState(false);

  // Link receipt to a specific customer order (icon next to payment method).
  // Initialised from `?order_id=` prefill so deep-links keep working.
  const [linkedOrderId, setLinkedOrderId] = useState<string | null>(prefillOrderId || null);
  const [linkedOrderInfo, setLinkedOrderInfo] = useState<{ id: string; order_number: string; manual_ref?: string | null; total: number; remaining: number } | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Array<{ id: string; order_number: string; manual_ref?: string | null; order_date: string | null; total: number; paid: number; remaining: number; status: string | null; payment_status: string | null }>>([]);
  const [ordersPopoverOpen, setOrdersPopoverOpen] = useState(false);
  const [loadingCustomerOrders, setLoadingCustomerOrders] = useState(false);

  // GL Account (for "account" party type)
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([]);
  const [glAccountSearch, setGlAccountSearch] = useState("");
  const [selectedGlAccount, setSelectedGlAccount] = useState<GLAccount | null>(null);
  const [showGlAccountDropdown, setShowGlAccountDropdown] = useState(false);
  const glAccountDropdownRef = useRef<HTMLDivElement>(null);

  // Deposit
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [depositType, setDepositType] = useState<"cash_box" | "bank">("cash_box");
  const [selectedCashBox, setSelectedCashBox] = useState("");
  const [selectedBankAccount, setSelectedBankAccount] = useState("");

  // Force bank deposit when payment method is bank transfer.
  useEffect(() => {
    if (paymentMethod === "تحويل" && depositType !== "bank") {
      setDepositType("bank");
    }
  }, [paymentMethod, depositType]);

  // 🌍 Multi-currency safety guard — auto-align voucher `currency` to the
  // native currency of the chosen cash box / bank account. Without this,
  // picking "خزينة سفيان – دولار" while `currency` still says "شيكل" would
  // silently post foreign amounts under an ILS label — the historical
  // root cause of the "عملات مختلطة" warning on account statements.
  // We ONLY change `currency` when the target account has a real native
  // currency set; ILS boxes leave the current selection alone so the user
  // is still free to enter a foreign-currency voucher against an ILS box
  // (rare, but supported when they explicitly override).
  useEffect(() => {
    const codeMap: Record<string, string> = { ILS: "ILS", USD: "USD", JOD: "JOD", EUR: "EUR" };
    let targetCode: string | null = null;
    if (depositType === "cash_box" && selectedCashBox) {
      const cb = cashBoxes.find(c => c.id === selectedCashBox);
      const raw = (cb?.currency || "").toString().trim().toUpperCase();
      if (raw && codeMap[raw] && raw !== "ILS") targetCode = codeMap[raw];
    } else if (depositType === "bank" && selectedBankAccount) {
      const ba = bankAccounts.find(b => b.id === selectedBankAccount);
      const raw = (ba?.currency || "").toString().trim().toUpperCase();
      if (raw && codeMap[raw] && raw !== "ILS") targetCode = codeMap[raw];
    }
    if (targetCode && targetCode !== currency) {
      setCurrency(targetCode);
    }
    // Intentionally NOT resetting `currency` to ILS when the box is ILS —
    // that would fight against legitimate manual FX overrides. The sync is
    // one-directional: foreign box ⇒ foreign voucher.
  }, [depositType, selectedCashBox, selectedBankAccount, cashBoxes, bankAccounts, currency]);

  // Cheque bank account selection
  const [selectedChequeBankAccount, setSelectedChequeBankAccount] = useState("");

  // Invoices
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [saving, setSaving] = useState(false);
  // Synchronous re-entry guard — prevents double-submit before React re-renders.
  const savingRef = useRef(false);
  const [saved, setSaved] = useState(false);
  const [savedReceiptNumber, setSavedReceiptNumber] = useState("");
  // Bug #6: amount input ref + highlight after contact selection
  const amountInputRef = useRef<HTMLInputElement>(null);
  // Ref always pointing to the latest handleSave (defined far below).
  // ActionPane onClick handlers must call through this ref because the
  // ActionPane tabs are memoized and would otherwise capture a stale
  // handleSave closure with amount="" → "الرجاء إدخال المبلغ" bug.
  const handleSaveRef = useRef<((asDraft?: boolean) => void) | null>(null);
  // Holds a freshly-created transaction id that is not yet attached to a
  // receipt/payment voucher. If the voucher insert fails, the transaction is
  // rolled back (soft-deleted) so retries can't leave duplicate GL entries.
  const orphanTxRef = useRef<string | null>(null);
  // Ref number reserved for the CURRENT save attempt. Cached so that a retry
  // (double-click / failed save) reuses the same number and the same
  // deterministic idempotency key instead of creating a duplicate entry.
  const reservedRefRef = useRef<string | null>(null);
  const handlePrintRef = useRef<(() => void) | null>(null);
  const newVoucherRef = useRef<(() => void) | null>(null);
  const [highlightAmount, setHighlightAmount] = useState(false);
  // Focus + highlight helper used by contact pickers
  const focusAmountField = useCallback(() => {
    setTimeout(() => {
      amountInputRef.current?.focus();
      amountInputRef.current?.select?.();
      setHighlightAmount(true);
      setTimeout(() => setHighlightAmount(false), 1400);
    }, 50);
  }, []);
  const [fastEntryEnabled] = useFastEntryMode();
  const reserveVoucherRefNumber = useCallback(async () => {
    if (!ownerId) return refNumber || "";
    const table = isReceipt ? "receipt_vouchers" : "vouchers";
    const prefix = isReceipt ? "REC" : "PV";
    const numberColumn = isReceipt ? "receipt_number" : "ref_number";
    const year = new Date(paymentDate || new Date()).getFullYear();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data } = isReceipt
        ? await supabase
            .from(table as any)
            .select(numberColumn)
            .eq("user_id", ownerId)
            .like(numberColumn, `${prefix}-${year}-%`)
            .order("created_at", { ascending: false })
            .limit(50)
        : await supabase
            .from(table as any)
            .select(numberColumn)
            .eq("user_id", ownerId)
            .eq("type", "payment")
            .like(numberColumn, `${prefix}-${year}-%`)
            .order("created_at", { ascending: false })
            .limit(50);

      const maxNum = (data || []).reduce((max: number, row: any) => {
        const match = String(row?.[numberColumn] || "").match(/(\d+)$/);
        return match ? Math.max(max, parseInt(match[1], 10) || 0) : max;
      }, 0);
      const candidate = `${prefix}-${year}-${String(maxNum + 1 + attempt).padStart(4, "0")}`;

      const { data: exists } = isReceipt
        ? await supabase
            .from(table as any)
            .select("id")
            .eq("user_id", ownerId)
            .eq(numberColumn, candidate)
            .maybeSingle()
        : await supabase
            .from(table as any)
            .select("id")
            .eq("user_id", ownerId)
            .eq("type", "payment")
            .eq(numberColumn, candidate)
            .maybeSingle();
      if (!exists) {
        setRefNumber(candidate);
        return candidate;
      }
    }

    const fallback = `${prefix}-${year}-${Date.now().toString().slice(-6)}`;
    setRefNumber(fallback);
    return fallback;
  }, [ownerId, isReceipt, paymentDate, refNumber]);

  const [autoAllocate, setAutoAllocate] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  // Smart allocation mode (auto / manual / advance / refund)
  const [allocationMode, setAllocationMode] = useState<AllocationMode>("auto");
  const isCancelled = editVoucherStatus === "cancelled";

  // When invoice-link feature is disabled at company level, force "advance"
  // mode so vouchers are always saved as open credit on the contact account.
  useEffect(() => {
    if (settings.enable_voucher_invoice_link === false && allocationMode !== "advance") {
      setAllocationMode("advance");
    }
  }, [settings.enable_voucher_invoice_link, allocationMode]);

  // Attachments
  const [attachments, setAttachments] = useState<{ name: string; url: string; size: number; type: string; uploaded_at: string }[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Employee party type (for payment vouchers)
  const [partyType, setPartyType] = useState<PartyType>("contact");
  const [employeeList, setEmployeeList] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [empCategory, setEmpCategory] = useState("سلفة");
  const [empCategoryCustom, setEmpCategoryCustom] = useState("");
  const [violationReason, setViolationReason] = useState("");
  // شهر الخصم من الراتب ("YYYY-MM"). فاضي = نفس شهر تاريخ السند.
  const [deductionMonth, setDeductionMonth] = useState("");
  const employeeDropdownRef = useRef<HTMLDivElement>(null);

  // Workshop / Cost Center
  const [workshopList, setWorkshopList] = useState<{ id: string; name: string; customer_name: string | null; status: string }[]>([]);
  const [selectedWorkshop, setSelectedWorkshop] = useState<{ id: string; name: string; customer_name: string | null } | null>(null);
  const [workshopSearch, setWorkshopSearch] = useState("");
  const [showWorkshopDropdown, setShowWorkshopDropdown] = useState(false);
  const workshopDropdownRef = useRef<HTMLDivElement>(null);

  // Cost center (Financial Dimension) — independent of legacy workshop_id
  const [costCenterId, setCostCenterId] = useState<string | null>(null);

  // ─── Read-only / view-mode (FinanceShell wrap) ───
  // When editing an existing receipt/payment voucher, open in read-only
  // until the user clicks "تعديل" — mirrors JournalNewPage behavior.
  const [isReadOnly, setIsReadOnly] = useState<boolean>(isEditMode && useFinanceShell);

  // ─── Prev/Next navigation between vouchers (receipt OR payment) ───
  // Declared up here (before any early returns) so React hook order stays stable.
  const goToAdjacentVoucher = async (direction: "prev" | "next") => {
    if (!useFinanceShell || !ownerId) return;
    const table = isReceipt ? "receipt_vouchers" : "vouchers";
    const numberField = isReceipt ? "receipt_number" : "ref_number";
    const routePrefix = isReceipt ? "/finance/receipt" : "/finance/payment";
    try {
      // Always fetch the current voucher's created_at as the cursor so navigation
      // stays consistent after moving between vouchers (do NOT rely on a stale
      // window global which only reflected the first-loaded voucher).
      let cursor: string | null = null;
      if (editId) {
        const { data: cur } = await supabase
          .from(table as any)
          .select("created_at")
          .eq("id", editId)
          .maybeSingle();
        cursor = (cur as any)?.created_at ?? null;
      }
      let q = supabase
        .from(table as any)
        .select(`id, ${numberField}, created_at`)
        .eq("user_id", ownerId);
      if (cursor) {
        if (direction === "prev") {
          q = q.lt("created_at", cursor).order("created_at", { ascending: false });
        } else {
          q = q.gt("created_at", cursor).order("created_at", { ascending: true });
        }
      } else {
        q = q.order("created_at", { ascending: direction !== "prev" });
      }
      const { data, error } = await q.limit(1);
      if (error) throw error;
      const target = (data as any[] | null || [])[0];
      if (!target) {
        toast.info(direction === "prev" ? "لا يوجد سند سابق" : "لا يوجد سند تالٍ");
        return;
      }
      navigate(`${routePrefix}/${target.id}/edit`);
    } catch (err: any) {
      toast.error(err.message || "تعذر التنقل بين السندات");
    }
  };

  // ─── Action Pane tabs (FinanceShell) — receipt + payment ───
  // CRITICAL: this useMemo must live ABOVE the editLoading/saved early
  // returns so React always sees the same hook count across renders.
  // Handler refs are wrapped in lazy arrows so TDZ on consts declared
  // further down is never hit (onClick fires only after full render).
  const voucherActionTabs: ActionTab[] = useMemo(() => {
    if (!useFinanceShell) return [];
    const newRoute = isReceipt ? "/finance/receipt/new" : "/finance/payment/new";
    const listRoute = isReceipt ? "/finance/receipts" : "/finance/payments";
    const newLabel = isReceipt ? "سند قبض جديد" : "سند صرف جديد";
    const inEdit = isEditMode;
    const newGroup = {
      key: "new", label: "جديد", items: [
        { key: "new", label: newLabel, icon: Plus, variant: "primary" as const,
          onClick: () => newVoucherRef.current?.() },
        ...(inEdit ? [{ key: "duplicate", label: "إنشاء مشابه", icon: Copy,
          onClick: () => handleNewSimilar() }] : []),
      ],
    };
    const saveGroup = inEdit
      ? { key: "save", label: "حفظ", items: [
          { key: "edit", label: isReadOnly ? "تعديل" : "إلغاء التعديل", icon: isReadOnly ? Pencil : Lock,
            variant: isReadOnly ? ("primary" as const) : undefined,
            onClick: () => setIsReadOnly(prev => !prev) },
          { key: "update", label: "حفظ التعديلات", icon: Save, variant: "primary" as const,
            onClick: () => handleSaveRef.current?.(false), disabled: isReadOnly || saving,
            tooltip: isReadOnly ? "اضغط تعديل أولاً" : undefined },
          { key: "delete", label: "إلغاء السند", icon: Trash2,
            onClick: () => setShowCancelModal(true) },
        ]}
      : { key: "save", label: "حفظ", items: [
          { key: "draft", label: "حفظ مسودة", icon: Save,
            onClick: () => handleSaveRef.current?.(true), disabled: saving },
          { key: "post", label: "حفظ وترحيل", icon: CheckCircle, variant: "primary" as const,
            onClick: () => handleSaveRef.current?.(false), disabled: saving },
        ]};
    const viewGroup = { key: "view", label: "عرض", items: [
      { key: "preview", label: "معاينة", icon: Eye, onClick: () => handlePrintRef.current?.() },
      { key: "print", label: "طباعة", icon: Printer, onClick: () => handlePrintRef.current?.() },
    ]};
    const navGroup = { key: "nav", label: "تنقل", items: [
      { key: "prev", label: "السابق", icon: ChevronRight, onClick: () => goToAdjacentVoucher("prev") },
      { key: "next", label: "التالي", icon: ChevronLeft, onClick: () => goToAdjacentVoucher("next") },
      { key: "inquiry", label: "استعلام", icon: ListChecks, onClick: () => navigate(listRoute) },
      { key: "center", label: "فتح مركز المالية", icon: Calculator, onClick: () => navigate("/accounting-center") },
    ]};
    return [{ key: "general", label: "عام", groups: [newGroup, saveGroup, viewGroup, navGroup] }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useFinanceShell, isReceipt, isEditMode, isReadOnly, saving]);

  // ─── Auto-Draft (السندات) ───
  const draftFormId = `voucher_${voucherType}_new`;
  const draftRoutePath = isReceipt ? "/finance/receipt/new" : "/finance/payment/new";
  const draftSnapshot = useMemo(() => ({
    paymentDate, refNumber, paymentMethod, amount, notes,
    cheques, endorsedCheques: endorsedCheques.map(c => ({ id: c.id })),
    currency, exchangeRate,
    contactId: selectedContact?.id || null,
    contactName: selectedContact?.contact_name || null,
    glAccountCode: selectedGlAccount?.account_code || null,
    employeeId: selectedEmployee?.id || null,
    depositType, selectedCashBox, selectedBankAccount, selectedChequeBankAccount,
    partyType, empCategory, empCategoryCustom, violationReason, deductionMonth,
    workshopId: selectedWorkshop?.id || null,
    workshopName: selectedWorkshop?.name || null,
    invoices: invoices.filter(i => i.selected).map(i => ({ id: i.id, allocatedAmount: i.allocatedAmount })),
    attachments,
  }), [paymentDate, refNumber, paymentMethod, amount, notes, cheques, endorsedCheques, currency, exchangeRate, selectedContact, selectedGlAccount, selectedEmployee, depositType, selectedCashBox, selectedBankAccount, selectedChequeBankAccount, partyType, empCategory, empCategoryCustom, violationReason, deductionMonth, selectedWorkshop, invoices, attachments]);

  const applyVoucherDraft = useCallback((d: any) => {
    if (d.paymentDate) setPaymentDate(d.paymentDate);
    if (d.refNumber) setRefNumber(d.refNumber);
    if (d.paymentMethod) setPaymentMethod(d.paymentMethod);
    if (d.amount !== undefined) setAmount(d.amount);
    if (d.notes !== undefined) setNotes(d.notes);
    if (Array.isArray(d.cheques)) setCheques(d.cheques);
    if (d.currency) setCurrency(d.currency);
    if (d.exchangeRate) setExchangeRate(d.exchangeRate);
    if (d.depositType) setDepositType(d.depositType);
    if (d.selectedCashBox) setSelectedCashBox(d.selectedCashBox);
    if (d.selectedBankAccount) setSelectedBankAccount(d.selectedBankAccount);
    if (d.selectedChequeBankAccount) setSelectedChequeBankAccount(d.selectedChequeBankAccount);
    if (d.partyType) setPartyType(d.partyType);
    if (d.empCategory) setEmpCategory(d.empCategory);
    if (d.empCategoryCustom) setEmpCategoryCustom(d.empCategoryCustom);
    if (d.violationReason) setViolationReason(d.violationReason);
    if (d.deductionMonth) setDeductionMonth(d.deductionMonth);
    if (Array.isArray(d.attachments)) setAttachments(d.attachments);
    if (d.contactId) (window as any).__duplicateContactId = d.contactId;
    if (d.glAccountCode) (window as any).__duplicateGlAccountCode = d.glAccountCode;
    if (d.employeeId) (window as any).__duplicateEmployeeId = d.employeeId;
    toast.success("تم استعادة المسودة");
  }, []);

  const isVoucherDraftEmpty = useCallback((d: any) => {
    return !d.amount && !d.notes && !d.contactId && !d.employeeId && !d.glAccountCode && (!d.cheques || d.cheques.length === 0);
  }, []);

  // Bug #7: Ctrl+Enter / Cmd+Enter → حفظ وترحيل (or حفظ التعديلات in edit mode).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "Enter") return;
      e.preventDefault();
      if (saving || isReadOnly) return;
      handleSaveRef.current?.(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, isReadOnly]);

  const { hasDraft, restoreDraft, clearDraft, draftSavedAt } = useFormDraft(
    draftFormId,
    draftSnapshot,
    applyVoucherDraft,
    {
      enabled: !isEditMode && !fromDuplicate,
      version: 1,
      isEmpty: isVoucherDraftEmpty,
      routePath: draftRoutePath,
      scope: [user?.id || "anon", company?.id || "no-company", draftRoutePath, voucherType, "new"].join(":"),
      ready: draftReady,
    }
  );

  // Reset form fields for fast-entry mode (preserves date/currency/last-used context).
  const resetForFastEntry = useCallback(() => {
    setAmount("");
    setNotes("");
    setSelectedContact(null);
    setSelectedGlAccount(null);
    setSelectedEmployee(null);
    setInvoices([]);
    setCheques([]);
    setEndorsedCheques([]);
    setAttachments([]);
    setContactSearch("");
    setEmployeeSearch("");
    setGlAccountSearch("");
    setInvoiceSearch("");
    setEmpCategory("سلفة");
    setEmpCategoryCustom("");
    setViolationReason("");
    setSavedReceiptNumber("");
    reservedRefRef.current = null;
    void reserveVoucherRefNumber();
    // Keep: paymentDate, currency, exchangeRate, paymentMethod, depositType,
    //       selectedCashBox, selectedBankAccount, partyType — these are the
    //       "last-used context" the accountant typically reuses.
    // Refocus the first important field after the form re-renders.
    requestAnimationFrame(() => {
      const first = document.querySelector<HTMLElement>("[data-smart-first]");
      first?.focus();
    });
  }, [reserveVoucherRefNumber]);

  // Handler for "New Voucher" toolbar button — clears draft + resets fields even when
  // already on the /new route (where navigate() would be a no-op).
  newVoucherRef.current = () => {
    const newRoute = isReceipt ? "/finance/receipt/new" : "/finance/payment/new";
    try { clearDraft(); } catch {}
    reservedRefRef.current = null;
    if (isEditMode || typeof window === "undefined" || window.location.pathname !== newRoute) {
      navigate(newRoute);
    } else {
      resetForFastEntry();
      toast.success("تم بدء سند جديد");
    }
  };

  // Click-outside handler for all dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contactDropdownRef.current && !contactDropdownRef.current.contains(e.target as Node)) {
        setShowContactDropdown(false);
      }
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target as Node)) {
        setShowEmployeeDropdown(false);
      }
      if (glAccountDropdownRef.current && !glAccountDropdownRef.current.contains(e.target as Node)) {
        setShowGlAccountDropdown(false);
      }
      if (workshopDropdownRef.current && !workshopDropdownRef.current.contains(e.target as Node)) {
        setShowWorkshopDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ─── Load Duplicate Data ───
  useEffect(() => {
    if (!fromDuplicate) return;
    const draftKey = `draft_${voucherType}_new`;
    const draft = localStorage.getItem(draftKey);
    if (!draft) return;
    try {
      const data = JSON.parse(draft);
      localStorage.removeItem(draftKey);
      setDuplicateSourceRef(data._sourceRef || null);
      if (data.paymentDate) setPaymentDate(data.paymentDate);
      if (data.paymentMethod) setPaymentMethod(data.paymentMethod);
      if (data.amount) setAmount(data.amount);
      if (data.currency) setCurrency(data.currency);
      if (data.exchangeRate) setExchangeRate(data.exchangeRate);
      if (data.notes) setNotes(data.notes);
      if (data.depositType) setDepositType(data.depositType);
      if (data.selectedCashBox) setSelectedCashBox(data.selectedCashBox);
      if (data.selectedBankAccount) setSelectedBankAccount(data.selectedBankAccount);
      if (data.partyType) setPartyType(data.partyType as PartyType);
      if (data.contactId) {
        (window as any).__duplicateContactId = data.contactId;
      }
      if (data.selectedGlAccountCode) {
        (window as any).__duplicateGlAccountCode = data.selectedGlAccountCode;
      }
      if (data.selectedEmployeeId) {
        (window as any).__duplicateEmployeeId = data.selectedEmployeeId;
      }
    } catch (e) { /* ignore */ }
  }, [fromDuplicate, voucherType]);

  // ─── Auto-switch to bank when card payment is selected ───
  useEffect(() => {
    if (paymentMethod !== "بطاقة") return;
    const cardBankId = settings?.card_bank_account_id;
    if (cardBankId && bankAccounts.some(b => b.id === cardBankId)) {
      setDepositType("bank");
      setSelectedBankAccount(cardBankId);
    } else if (bankAccounts.length > 0) {
      setDepositType("bank");
      toast.warning("⚠️ لم يتم تعريف حساب بنكي للبطاقة — يرجى تحديده من الإعدادات → المالية");
    }
  }, [paymentMethod, bankAccounts, settings?.card_bank_account_id]);

  // Load contacts
  useEffect(() => {
    if (!user || !ownerId) return;
    Promise.all([
      fetchAllRows<Contact>((from, to) =>
        supabase
          .from("contacts")
          .select("id, contact_name, contact_type, current_balance")
          .eq("user_id", ownerId)
          .eq("is_archived", false)
          .order("contact_name")
          .range(from, to) as any
      ).then((data) => ({ data, error: null })),
      fetchAllRows<any>((from, to) =>
        (supabase
          .from("invoices")
          .select("contact_id, remaining_amount, total_amount, paid_amount")
          .eq("user_id", ownerId)
          .in("payment_status", ["unpaid", "partial"]) as any)
          .neq("status", "cancelled")
          .not("status", "in", '("مسودة","draft")')
          .range(from, to)
      ).then((data) => ({ data, error: null })),
    ])
      .then(([contactsRes, openInvoicesRes]) => {
        const openInvoiceMap: Record<string, number> = {};
        for (const inv of (openInvoicesRes.data || [])) {
          if (!inv.contact_id) continue;
          const remaining = Math.max(0, Number(inv.remaining_amount ?? (Number(inv.total_amount || 0) - Number(inv.paid_amount || 0))));
          openInvoiceMap[inv.contact_id] = (openInvoiceMap[inv.contact_id] || 0) + remaining;
        }

        const contactsList = ((contactsRes.data as Contact[]) || []).map((c) => ({
          ...c,
          current_balance: c.current_balance ?? 0,
          ledger_balance: c.current_balance ?? 0,
          open_invoices_balance: openInvoiceMap[c.id] ?? 0,
          unapplied_credit: 0,
        }));

        setContacts(contactsList);
        const dupContactId = (window as any).__duplicateContactId;
        if (dupContactId) {
          const found = contactsList.find(c => c.id === dupContactId);
          if (found) {
            setSelectedContact(found);
            setContactSearch(found.contact_name);
          }
          delete (window as any).__duplicateContactId;
        }
        // Prefill contact when navigating from "Mark invoice as paid" flow
        if (prefillInvoiceId && prefillContactName && !selectedContact) {
          const found = contactsList.find(c => c.contact_name === prefillContactName);
          if (found) {
            setSelectedContact(found);
            setContactSearch(found.contact_name);
          }
        }
        // Prefill contact when navigating from Orders → New Receipt Voucher
        if (!selectedContact && (prefillContactId || (prefillContactName && !prefillInvoiceId))) {
          const found = prefillContactId
            ? contactsList.find(c => c.id === prefillContactId)
            : contactsList.find(c => c.contact_name === prefillContactName);
          if (found) {
            setSelectedContact(found);
            setContactSearch(found.contact_name);
          }
        }
      })
      .then(() => setDraftReady(true), () => setDraftReady(true));
  }, [user, ownerId]);

  // Load GL accounts (for "account" party type)
  useEffect(() => {
    if (!user || !ownerId) return;
    fetchAllAccountsForOwner<{ id: string; account_code: string; account_name: string; account_type: string }>(
      ownerId,
      "id, account_code, account_name, account_type",
      { activeOnly: true }
    ).then((data) => setGlAccounts(data));
  }, [user, ownerId]);

  // Load employees (for payment vouchers) — LAZY: only when user actually
  // switches partyType to "employee" (or edit-mode already set it). Saves a
  // needless roundtrip on every payment-voucher open. Selected employee for
  // edit mode is fetched by its own .eq("id") query elsewhere and is unaffected.
  const employeesLoadedRef = useRef(false);
  useEffect(() => {
    if (!user || !ownerId || isReceipt) return;
    if (partyType !== "employee") return;
    if (employeesLoadedRef.current) return;
    employeesLoadedRef.current = true;
    supabase.from("employees")
      .select("id, full_name, department, job_title")
      .eq("user_id", ownerId)
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setEmployeeList(data || []));
  }, [user, ownerId, isReceipt, partyType]);

  // Load workshops for cost center selector — LAZY: only when the user opens
  // the workshop picker or types in its search box. Prefill of a linked
  // workshop in edit mode uses a separate .eq("id") query and is unaffected.
  const workshopsLoadedRef = useRef(false);
  useEffect(() => {
    if (!user || !ownerId) return;
    if (!showWorkshopDropdown && !workshopSearch) return;
    if (workshopsLoadedRef.current) return;
    workshopsLoadedRef.current = true;
    supabase.from("workshops")
      .select("id, name, customer_name, status")
      .eq("user_id", ownerId)
      .in("status", ["active", "completed"])
      .order("name")
      .then(({ data }) => setWorkshopList(data || []));
  }, [user, ownerId, showWorkshopDropdown, workshopSearch]);

  useEffect(() => {
    if (currency === "ILS") {
      setExchangeRate(1);
      return;
    }
    if (!user) return;
    setFetchingRate(true);
    const fetchRate = async () => {
      try {
        // Cache hit: skip network entirely.
        const rateType = isReceipt ? "buy" : "sell";
        const cacheKey = `${currency}|${rateType}`;
        const cached = exchangeRateCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < EXCHANGE_RATE_TTL_MS && cached.rate > 0) {
          setExchangeRate(cached.rate);
          setFetchingRate(false);
          return;
        }
        // Try getting rate from currencies + exchange_rates tables
        const { data: currRows } = await supabase.from("currencies")
          .select("id")
          .eq("code", currency)
          .limit(1);
        const currData = currRows?.[0];
        if (currData) {
          const { data: rateRows } = await supabase.from("exchange_rates")
            .select("sell_rate, buy_rate, mid_rate")
            .eq("currency_id", currData.id)
            .order("rate_date", { ascending: false })
            .limit(1);
          const rateData = rateRows?.[0];
          if (rateData) {
            const rate = isReceipt
              ? (rateData.buy_rate || rateData.sell_rate || rateData.mid_rate || 1)
              : (rateData.sell_rate || rateData.buy_rate || rateData.mid_rate || 1);
            if (Number(rate) > 0) {
              setExchangeRate(Number(rate));
              exchangeRateCache.set(cacheKey, { rate: Number(rate), ts: Date.now() });
              setFetchingRate(false);
              return;
            }
          }
        }
        // Fallback: use get_exchange_rate DB function
        const { data: dbRate } = await supabase.rpc("get_exchange_rate", {
          p_currency_code: currency,
          p_rate_type: rateType,
        });
        if (dbRate && Number(dbRate) > 0) {
          setExchangeRate(Number(dbRate));
          exchangeRateCache.set(cacheKey, { rate: Number(dbRate), ts: Date.now() });
        }
      } catch (e) { console.warn("Exchange rate fetch failed:", e); }
      setFetchingRate(false);
    };
    fetchRate();
  }, [currency, user, isReceipt]);

  // ─── Compute real balance from transactions (SOA parity) ───
  // Mirrors AccountStatementV2Page exactly:
  //   - filter: is_deleted=false OR reversed_by_id IS NOT NULL
  //     (so cancelled originals + their reversals both contribute and cancel out)
  //   - balance = Σ(display amount where Dr matches root) − Σ(display amount where Cr matches root)
  //   - when voucher currency is foreign, convert the same ledger rows into that
  //     display currency instead of filtering out ILS opening balances.
  useEffect(() => {
    if (!selectedContact || !user) { setComputedBalance(null); return; }
    setComputedBalance(null);
    let cancelled = false;
    fetchContactStatementBalance({
      contactId: selectedContact.id,
      userId: ownerId,
      contactType: selectedContact.contact_type,
      displayCurrency: currency,
      displayExchangeRate: exchangeRate,
    })
      .then((ledger) => {
        if (cancelled) return;
        setComputedBalance(ledger);
      });
    return () => { cancelled = true; };
  }, [selectedContact, user, ownerId, isReceipt, currency, exchangeRate]);

  // ─── Load existing voucher for editing ───
  useEffect(() => {
    if (!editId || !user) return;
    setEditLoading(true);
    const loadVoucher = async () => {
      try {
        if (isReceipt) {
          const { data } = await supabase
            .from("receipt_vouchers")
            .select("*")
            .eq("id", editId)
            .eq("user_id", ownerId)
            .single();
          if (data) {
            setPaymentDate(data.payment_date || new Date().toISOString().split("T")[0]);
            setRefNumber(data.receipt_number || "");
            setPaymentMethod(data.payment_method || "نقدي");
            setAmount(String(data.amount || ""));
            setOriginalAmount(Number(data.amount) || 0);
            setNotes(data.notes || "");
            // Load cheques from the dedicated cheques table (multi-cheque safe)
            if ((data.payment_method || "") === "شيك") {
              const { data: chList } = await supabase
                .from("cheques")
                .select("cheque_number, cheque_date, bank_name, amount, account_number, notes")
                .eq("user_id", ownerId)
                .or(`voucher_id.eq.${editId},receipt_voucher_id.eq.${editId}`)
                .order("created_at", { ascending: true });
              if (chList && chList.length > 0) {
                setCheques(chList.map((c: any) => ({
                  number: c.cheque_number || "",
                  date: c.cheque_date || "",
                  bank: c.bank_name || "",
                  amount: String(c.amount ?? ""),
                  accountNumber: c.account_number || "",
                  notes: c.notes || "",
                })));
              } else if (data.check_number) {
                // Legacy fallback: single cheque stored on the header.
                setCheques([{ number: data.check_number || "", date: data.check_date || "", bank: data.bank_name || "", amount: String(data.amount || ""), accountNumber: "", notes: "" }]);
              }
            }
            setEditVoucherStatus(data.status || "posted");
            if (data.cash_box_id) { setDepositType("cash_box"); setSelectedCashBox(data.cash_box_id); }
            if ((data as any).cash_box_id) { setDepositType("cash_box"); setSelectedCashBox((data as any).cash_box_id); }
            if (data.bank_account_id) { setDepositType("bank"); setSelectedBankAccount(data.bank_account_id); }
            if (data.contact_id) {
              const { data: c } = await supabase.from("contacts").select("id, contact_name, current_balance").eq("id", data.contact_id).single();
              if (c) { setSelectedContact(c); setContactSearch(c.contact_name); }
            }
            if ((data as any).workshop_id) {
              const { data: ws } = await supabase.from("workshops").select("id, name, customer_name").eq("id", (data as any).workshop_id).single();
              if (ws) setSelectedWorkshop(ws);
            }
            // receipt_vouchers لا يحمل cost_center_id — نجلبه من القيد المرتبط
            if ((data as any).linked_transaction_id) {
              const { data: tx } = await supabase
                .from("transactions")
                .select("cost_center_id, currency, exchange_rate")
                .eq("id", (data as any).linked_transaction_id)
                .maybeSingle();
              if (tx && (tx as any).cost_center_id) setCostCenterId((tx as any).cost_center_id);
              // receipt_vouchers has no currency column — restore it from the
              // linked journal entry. transactions.currency is stored as the
              // Arabic label (e.g. "يورو") so map it back to CURRENCIES.value.
              const txCur = (tx as any)?.currency as string | undefined;
              if (txCur) {
                const match = CURRENCIES.find(c => c.value === txCur || c.label === txCur);
                if (match) {
                  setCurrency(match.value);
                  const rate = Number((tx as any)?.exchange_rate);
                  if (rate && rate > 0) setExchangeRate(rate);
                }
              }
            }
          }
        } else {
          const { data } = await supabase
            .from("vouchers")
            .select("*")
            .eq("id", editId)
            .eq("user_id", ownerId)
            .single();
          if (data) {
            setPaymentDate(data.date || new Date().toISOString().split("T")[0]);
            setRefNumber(data.ref_number || "");
            const methodMap: Record<string, string> = { cash: "نقدي", cheque: "شيك", transfer: "تحويل", card: "بطاقة" };
            setPaymentMethod(methodMap[data.payment_method] || data.payment_method || "نقدي");
            setAmount(String(data.amount || data.amount_ils || ""));
            setOriginalAmount(Number(data.amount || data.amount_ils) || 0);
            setNotes(data.notes || data.description || "");
            // Load cheques from the dedicated cheques table (multi-cheque safe)
            if (((methodMap[data.payment_method] || data.payment_method || "") === "شيك")) {
              const { data: chList } = await supabase
                .from("cheques")
                .select("cheque_number, cheque_date, bank_name, amount, account_number, notes")
                .eq("user_id", ownerId)
                .eq("voucher_id", editId)
                .order("created_at", { ascending: true });
              if (chList && chList.length > 0) {
                setCheques(chList.map((c: any) => ({
                  number: c.cheque_number || "",
                  date: c.cheque_date || "",
                  bank: c.bank_name || "",
                  amount: String(c.amount ?? ""),
                  accountNumber: c.account_number || "",
                  notes: c.notes || "",
                })));
              } else if (data.cheque_number) {
                // Legacy fallback: single cheque stored on the header.
                setCheques([{ number: data.cheque_number || "", date: data.cheque_due_date || "", bank: data.cheque_bank_name || "", amount: String(data.amount || data.amount_ils || ""), accountNumber: "", notes: "" }]);
              }
            }
            setEditVoucherStatus(data.status || "posted");
            if (data.bank_account_id) { setDepositType("bank"); setSelectedBankAccount(data.bank_account_id); }
            if (data.currency && data.currency !== "ILS") {
              setCurrency(data.currency);
              setExchangeRate(data.exchange_rate || 1);
            }
            // ─── Restore employee state if voucher has employee_id ───
            if ((data as any).employee_id) {
              const { data: emp } = await supabase.from("employees")
                .select("id, full_name, department, job_title")
                .eq("id", (data as any).employee_id)
                .single();
              if (emp) {
                setPartyType("employee");
                setSelectedEmployee(emp);
                setEmployeeSearch(emp.full_name);
                // Try to restore category from transaction description
                const desc = data.description || "";
                if (desc.includes("سلفة")) setEmpCategory("سلفة");
                else if (desc.includes("رواتب") || desc.includes("راتب")) setEmpCategory("رواتب");
                else if (desc.includes("مخالفة")) setEmpCategory("مخالفة");
                else if (desc.includes("عهدة")) setEmpCategory("عهدة");
                else setEmpCategory("سلفة");
                // استرجاع شهر الخصم المحفوظ على حركة الموظف (إن وُجد)
                const { data: mv } = await supabase
                  .from("employee_financial_movements")
                  .select("salary_month, salary_year")
                  .eq("source_id", editId)
                  .eq("source_type", "finance_manual")
                  .limit(1)
                  .maybeSingle();
                if ((mv as any)?.salary_month && (mv as any)?.salary_year) {
                  setDeductionMonth(`${(mv as any).salary_year}-${String((mv as any).salary_month).padStart(2, "0")}`);
                }
              }
            } else if (data.contact_id) {
              const { data: c } = await supabase.from("contacts").select("id, contact_name, current_balance").eq("id", data.contact_id).single();
              if (c) { setSelectedContact(c); setContactSearch(c.contact_name); }
            } else if ((data as any).linked_transaction_id) {
              // Account-based payment vouchers do not have contact_id/employee_id.
              // Restore the selected GL account from the linked journal entry so
              // editing a plain expense/payment note never asks for a "جهة" again.
              const { data: tx } = await supabase
                .from("transactions")
                .select("debit_account_code, credit_account_code")
                .eq("id", (data as any).linked_transaction_id)
                .maybeSingle();
              if (!(data as any).cash_box_id && !data.bank_account_id && (tx as any)?.credit_account_code) {
                const { data: cb } = await supabase
                  .from("cash_boxes")
                  .select("id")
                  .eq("user_id", ownerId)
                  .eq("gl_account_code", (tx as any).credit_account_code)
                  .eq("is_active", true)
                  .order("created_at", { ascending: true })
                  .limit(1)
                  .maybeSingle();
                if (cb?.id) { setDepositType("cash_box"); setSelectedCashBox(cb.id); }
              }
              const debitCode = (tx as any)?.debit_account_code;
              if (debitCode) {
                const { data: acct } = await supabase
                  .from("accounts")
                  .select("id, account_code, account_name, account_type")
                  .eq("user_id", ownerId)
                  .eq("account_code", debitCode)
                  .maybeSingle();
                if (acct) {
                  setPartyType("account");
                  setSelectedContact(null);
                  setSelectedEmployee(null);
                  setSelectedGlAccount(acct as GLAccount);
                  setGlAccountSearch("");
                }
              }
            }
            if ((data as any).workshop_id) {
              const { data: ws } = await supabase.from("workshops").select("id, name, customer_name").eq("id", (data as any).workshop_id).single();
              if (ws) setSelectedWorkshop(ws);
            }
            if ((data as any).cost_center_id) setCostCenterId((data as any).cost_center_id);
          }
        }
      } catch (e) { /* ignore */ }
      setEditLoading(false);
    };
    loadVoucher();
  }, [editId, user, isReceipt]);

  // Load cash boxes, bank accounts, and generate ref number for payments
  const regenerateRefNumber = useCallback(async () => {
    if (!ownerId) return;
    if (!isReceipt) {
      const { data: vData } = await supabase.from("vouchers").select("ref_number").eq("user_id", ownerId).eq("type", "payment").order("created_at", { ascending: false }).limit(1);
      const lastRef = (vData || [])[0]?.ref_number || "";
      const match = lastRef.match(/(\d+)$/);
      const nextNum = match ? String(parseInt(match[1]) + 1).padStart(Math.max(match[1].length, 4), "0") : "0001";
      setRefNumber(`PV-${new Date().getFullYear()}-${nextNum}`);
    } else {
      const { data: rvData } = await supabase.from("receipt_vouchers").select("receipt_number").eq("user_id", ownerId).order("created_at", { ascending: false }).limit(1);
      const lastRef = (rvData || [])[0]?.receipt_number || "";
      const match = lastRef.match(/(\d+)$/);
      const nextNum = match ? String(parseInt(match[1]) + 1).padStart(Math.max(match[1].length, 4), "0") : "0001";
      setRefNumber(`RCV-${new Date().getFullYear()}-${nextNum}`);
    }
  }, [ownerId, isReceipt]);

  useEffect(() => {
    if (!user || !ownerId) return;
    const load = async () => {
      const cbCached = cashBoxesCache.get(ownerId);
      const baCached = bankAccountsCache.get(ownerId);
      const now = Date.now();
      const cbFresh = cbCached && now - cbCached.ts < VOUCHER_LOOKUP_TTL_MS ? cbCached.data : null;
      const baFresh = baCached && now - baCached.ts < VOUCHER_LOOKUP_TTL_MS ? baCached.data : null;
      const [cbRes, baRes] = await Promise.all([
        cbFresh
          ? Promise.resolve({ data: cbFresh } as any)
          : supabase.from("cash_boxes").select("id, name, gl_account_code, currency").eq("user_id", ownerId).eq("is_active", true),
        baFresh
          ? Promise.resolve({ data: baFresh } as any)
          : supabase.from("bank_accounts").select("id, name, bank_name, gl_account_code, currency, incoming_checks_account_code, outgoing_checks_account_code").eq("user_id", ownerId).eq("is_active", true),
      ]);
      if (!cbFresh && cbRes.data) cashBoxesCache.set(ownerId, { data: cbRes.data as any[], ts: Date.now() });
      if (!baFresh && baRes.data) bankAccountsCache.set(ownerId, { data: baRes.data as any[], ts: Date.now() });
      setCashBoxes(cbRes.data || []);
      const bankList: any[] = baRes.data || [];
      setBankAccounts(bankList);
      if (cbRes.data?.length && !isEditMode) {
        const defaultKey = `voucher_default_cash_box_${ownerId}_${isReceipt ? "receipt" : "payment"}`;
        const savedDefault = typeof window !== "undefined" ? localStorage.getItem(defaultKey) : null;
        const validDefault = savedDefault && cbRes.data.some(cb => cb.id === savedDefault) ? savedDefault : null;
        setSelectedCashBox(validDefault || cbRes.data[0].id);
      }
      if (bankList.length && !isEditMode) {
        setSelectedBankAccount(bankList[0].id);
        setSelectedChequeBankAccount(bankList[0].id);
      }
      if (!isEditMode) {
        await regenerateRefNumber();
      }
    };
    load();
  }, [user, ownerId, isReceipt, regenerateRefNumber, isEditMode]);

  // Load invoices when contact is selected
  useEffect(() => {
    if (!user || !ownerId || !selectedContact) { setInvoices([]); return; }
    // Smart loading:
    //   - Receipt + customer  → sale invoices (settlement)
    //   - Payment + supplier  → purchase invoices (settlement)
    //   - Payment + customer  → sale invoices (reverse-settlement / refund)
    //   - Receipt + supplier  → purchase invoices (rare: supplier refund)
    // We can't tell party-side here (customer vs supplier) without the contact_type,
    // but the same invoice query (filtered by contact_id) returns whatever is open
    // for THIS contact regardless of invoice_type. So we fetch BOTH sides and let
    // the allocation engine work on the open set.
    (supabase.from("invoices")
      .select("id, invoice_number, invoice_date, due_date, total_amount, paid_amount, remaining_amount, status, currency, exchange_rate, invoice_type")
      .eq("user_id", ownerId)
      .eq("contact_id", selectedContact.id)
      .in("invoice_type", isReceipt ? ["sale"] : ["purchase", "sale"])
      .in("payment_status", ["unpaid", "partial"]) as any)
      .neq("status", "cancelled")
      .not("status", "in", '("مسودة","draft")')
      .order("invoice_date", { ascending: true })
      .then(({ data }) => {
        const loaded = (data || []).map(inv => ({
          ...inv,
          selected: false,
          allocatedAmount: 0,
        }));

        // Prefill: auto-select the invoice from the "Mark as paid" flow + set amount to its remaining
        if (prefillInvoiceId && !prefillConsumed) {
          const target = loaded.find(i => i.id === prefillInvoiceId);
          if (target) {
            const remaining = Number(target.remaining_amount ?? target.total_amount ?? 0);
            target.selected = true;
            target.allocatedAmount = remaining;
            if (!amount) setAmount(String(remaining));
            setPrefillConsumed(true);
          }
        }

        setInvoices(loaded);
      });
  }, [user, ownerId, selectedContact, isReceipt]);

  // Load this customer's orders (for the "link to order" picker next to payment method).
  // Receipt vouchers only. Shows the most recent 50 non-cancelled orders for the contact.
  useEffect(() => {
    if (!isReceipt || !user || !ownerId || !selectedContact) {
      setCustomerOrders([]);
      return;
    }
    let cancelled = false;
    setLoadingCustomerOrders(true);
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, manual_ref, order_date, total, paid_amount, remaining_amount, status, payment_status")
        .eq("user_id", ownerId)
        .eq("contact_id", selectedContact.id)
        .neq("status", "ملغي")
        .order("order_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      const rows = (data || []).map((o: any) => {
        const total = Number(o.total || 0);
        const paid = Number(o.paid_amount || 0);
        const remaining = o.remaining_amount != null ? Number(o.remaining_amount) : Math.max(0, total - paid);
        return {
          id: o.id,
          order_number: o.order_number,
          manual_ref: o.manual_ref,
          order_date: o.order_date,
          total,
          paid,
          remaining,
          status: o.status,
          payment_status: o.payment_status,
        };
      });
      setCustomerOrders(rows);
      // Refresh linked order info if we have a linkedOrderId in this list
      if (linkedOrderId) {
        const hit = rows.find(r => r.id === linkedOrderId);
        if (hit) setLinkedOrderInfo({ id: hit.id, order_number: hit.order_number, manual_ref: hit.manual_ref, total: hit.total, remaining: hit.remaining });
      }
      setLoadingCustomerOrders(false);
    })();
    return () => { cancelled = true; };
  }, [user, ownerId, selectedContact, isReceipt, linkedOrderId]);

  // Clear the linked order automatically when the contact changes to one that
  // doesn't own it. We compare against the fetched list once loaded.
  useEffect(() => {
    if (!linkedOrderId) return;
    if (!selectedContact) { setLinkedOrderId(null); setLinkedOrderInfo(null); return; }
    if (customerOrders.length > 0 && !customerOrders.some(o => o.id === linkedOrderId)) {
      setLinkedOrderId(null);
      setLinkedOrderInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContact?.id, customerOrders]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts.slice(0, 10);
    return contacts.filter(c => multiWordMatchAny(contactSearch, c.contact_name)).slice(0, 10);
  }, [contacts, contactSearch]);

  // Inline quick-create contact — mirrors the invoice flow.
  // When the user types a name not in the list, they can add it as a new
  // contact directly from the dropdown without opening a separate dialog.
  const handleQuickAddContactFromSearch = async () => {
    const trimmed = contactSearch.trim();
    if (!trimmed || trimmed.length < 2 || !user || !ownerId) return;
    setCreatingContact(true);
    try {
      const contactType = isReceipt ? "عميل" : "مورد";
      // Lookup first to avoid unique constraint errors on re-clicks
      const { data: existing } = await supabase
        .from("contacts")
        .select("id, contact_name, contact_type, current_balance")
        .eq("user_id", ownerId)
        .eq("contact_name", trimmed)
        .maybeSingle();
      let created: any = existing;
      if (!existing) {
        const { data: upserted, error } = await supabase
          .from("contacts")
          .upsert(
            { user_id: ownerId, contact_name: trimmed, contact_type: contactType, current_balance: 0 } as any,
            { onConflict: "user_id,contact_name" }
          )
          .select("id, contact_name, contact_type, current_balance")
          .single();
        if (error) throw error;
        created = upserted;
      }
      const newContact: Contact = {
        id: created.id,
        contact_name: created.contact_name,
        contact_type: created.contact_type || contactType,
        current_balance: Number(created.current_balance) || 0,
        ledger_balance: 0,
        open_invoices_balance: 0,
      };
      setContacts(prev => (prev.some(c => c.id === newContact.id) ? prev : [...prev, newContact]));
      setSelectedContact(newContact);
      setContactSearch("");
      setShowContactDropdown(false);
      toast.success(`تم إضافة ${contactType}: ${newContact.contact_name}`);
      focusAmountField();
    } catch (err: any) {
      toast.error(err?.message || "تعذّر إضافة الجهة");
    } finally {
      setCreatingContact(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employeeList.slice(0, 10);
    return employeeList.filter(e => multiWordMatchAny(employeeSearch, e.full_name)).slice(0, 10);
  }, [employeeList, employeeSearch]);

  const filteredGlAccounts = useMemo(() => {
    if (!glAccountSearch.trim()) return glAccounts.slice(0, 15);
    return glAccounts.filter(a => multiWordMatchAny(glAccountSearch, `${a.account_code} ${a.account_name}`)).slice(0, 15);
  }, [glAccounts, glAccountSearch]);

  const filteredInvoices = useMemo(() => {
    if (!invoiceSearch.trim()) return invoices;
    return invoices.filter(inv => multiWordMatchAny(invoiceSearch, inv.invoice_number));
  }, [invoices, invoiceSearch]);

  const openInvoiceCount = invoices.length;
  const oldestInvoiceDays = useMemo(() => {
    if (!invoices.length) return 0;
    const oldest = invoices[0];
    if (!oldest.due_date) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(oldest.due_date).getTime()) / 86400000));
  }, [invoices]);

  const totalAllocated = useMemo(() => {
    return invoices.filter(i => i.selected).reduce((sum, i) => sum + (i.allocatedAmount || 0), 0);
  }, [invoices]);

  const amountNum = parseFloat(amount) || 0;
  const amountInILS = currency === "ILS" ? amountNum : amountNum * exchangeRate;
  const unallocated = amountNum - totalAllocated;
  const currencySymbol = CURRENCIES.find(c => c.value === currency)?.symbol || "₪";
  const currencyLabel = CURRENCIES.find(c => c.value === currency)?.label || "شيكل";

  const toggleInvoice = (id: string) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== id) return inv;
      const convertedRemaining = getInvRemainingInVoucherCurrency(inv);
      return { ...inv, selected: !inv.selected, allocatedAmount: !inv.selected ? Math.min(convertedRemaining, Math.max(0, amountNum - totalAllocated + (inv.selected ? (inv.allocatedAmount || 0) : 0))) : 0 };
    }));
  };

  const selectAll = () => {
    if (amountNum <= 0) {
      toast.error("أدخل المبلغ المقبوض أولاً");
      return;
    }
    if (invoices.length === 0) {
      toast.error("لا توجد فواتير مفتوحة لهذا العميل");
      return;
    }
    const next = engineAutoAllocate(invoices as any, amountNum, currency, exchangeRate);
    setInvoices(next as any);
    const allocated = next.reduce((s: number, i: any) => s + (i.allocatedAmount || 0), 0);
    const unalloc = Math.round((amountNum - allocated) * 100) / 100;
    if (unalloc < 0.01) {
      toast.success("تم التخصيص التلقائي على كامل المبلغ");
    } else if (allocated > 0) {
      toast.success(`تم تخصيص ${allocated.toFixed(2)} — المتبقي ${unalloc.toFixed(2)} كدفعة مقدمة`);
    } else {
      toast.error("تعذَّر التخصيص — تحقق من الفواتير المفتوحة");
    }
  };

  const selectOldestFirst = () => selectAll();

  // Auto-allocate effect — runs whenever the user is in "auto" mode and any
  // of the inputs (amount, currency, exchange rate, invoice list) change.
  // This makes the FIFO distribution feel "live" — the user just types the
  // amount and the table fills in instantly, no extra click required.
  useEffect(() => {
    if (allocationMode !== "auto") return;
    if (amountNum <= 0 || invoices.length === 0) return;
    setInvoices(prev => {
      // Bail if there is nothing to recompute (avoid render loops).
      const next = engineAutoAllocate(prev as any, amountNum, currency, exchangeRate);
      const same = prev.length === next.length && prev.every((p, idx) => {
        const n = next[idx];
        return p.id === n.id
          && p.selected === n.selected
          && Math.abs((p.allocatedAmount || 0) - (n.allocatedAmount || 0)) < 0.005;
      });
      return same ? prev : (next as any);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocationMode, amountNum, currency, exchangeRate, invoices.length]);

  // File upload handler
  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    if (!user) return;
    const fileArray = Array.from(files);
    if (attachments.length + fileArray.length > 5) {
      toast.error("الحد الأقصى 5 ملفات");
      return;
    }
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    for (const file of fileArray) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`الملف ${file.name} أكبر من 10MB`); continue; }
      if (!allowedTypes.includes(file.type)) { toast.error(`نوع الملف ${file.name} غير مدعوم`); continue; }
      setUploadingFile(true);
      try {
        const filePath = `${user.id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("voucher-attachments").upload(filePath, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("voucher-attachments").getPublicUrl(filePath);
        setAttachments(prev => [...prev, {
          name: file.name,
          url: urlData.publicUrl || filePath,
          size: file.size,
          type: file.type,
          uploaded_at: new Date().toISOString(),
        }]);
      } catch (err: any) {
        toast.error(`فشل رفع ${file.name}: ${err.message}`);
      }
      setUploadingFile(false);
    }
  }, [user, attachments.length]);

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const clearSelection = () => {
    setInvoices(prev => prev.map(inv => ({ ...inv, selected: false, allocatedAmount: 0 })));
  };

  const updateAllocation = (id: string, val: number) => {
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, allocatedAmount: val } : inv));
  };

  /** Convert invoice remaining to voucher currency */
  const getInvRemainingInVoucherCurrency = (inv: Invoice): number => {
    const rawRemaining = Math.max(0, (inv.remaining_amount ?? inv.total_amount) - (inv.paid_amount ?? 0));
    const invCurr = inv.currency || "شيكل";
    const invIsILS = invCurr === "شيكل" || invCurr === "ILS";
    const voucherIsILS = currency === "ILS";

    // Same currency
    if ((invIsILS && voucherIsILS) || (!invIsILS && !voucherIsILS && invCurr === currency)) {
      return rawRemaining;
    }
    // Invoice is foreign, voucher is ILS → multiply by invoice exchange rate
    if (!invIsILS && voucherIsILS) {
      return rawRemaining * (inv.exchange_rate || 1);
    }
    // Invoice is ILS, voucher is foreign → divide by voucher exchange rate
    if (invIsILS && !voucherIsILS) {
      return exchangeRate > 0 ? rawRemaining / exchangeRate : rawRemaining;
    }
    // Both foreign but different → convert via ILS
    const invInILS = rawRemaining * (inv.exchange_rate || 1);
    return exchangeRate > 0 ? invInILS / exchangeRate : invInILS;
  };

  const isInvCurrencyDifferent = (inv: Invoice): boolean => {
    const invCurr = inv.currency || "شيكل";
    const invIsILS = invCurr === "شيكل" || invCurr === "ILS";
    const voucherIsILS = currency === "ILS";
    if (invIsILS && voucherIsILS) return false;
    if (!invIsILS && !voucherIsILS && invCurr === currency) return false;
    return true;
  };

  const getInvCurrencySymbol = (inv: Invoice): string => {
    const c = inv.currency || "شيكل";
    if (c === "دولار" || c === "USD") return "$";
    if (c === "دينار" || c === "JOD") return "د.أ";
    if (c === "يورو" || c === "EUR") return "€";
    return "₪";
  };

  const getDaysOverdue = (dueDate: string | null) => {
    if (!dueDate) return 0;
    return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
  };

  const getOverdueColor = (days: number) => {
    if (days > 30) return "text-destructive";
    if (days > 0) return "text-warning";
    return "text-primary";
  };

  const getOverdueLabel = (days: number) => {
    if (days > 0) return `${days} يوم`;
    return "جارية";
  };

  const getOverdueIcon = (days: number) => {
    if (days > 30) return "🔴";
    if (days > 0) return "🟡";
    return "🟢";
  };

  const handleSave = async (asDraft = false) => {
    // Belt-and-suspenders: bail immediately if a save is already in flight.
    if (savingRef.current) return;
    orphanTxRef.current = null;
    const isEmployeePayment = !isReceipt && partyType === "employee";
    const isAccountPayment = partyType === "account";
    if (!user) {
      toast.error("لم يتم التعرف على المستخدم — أعد تسجيل الدخول");
      return;
    }
    if (!ownerId) {
      toast.error("جاري تحميل بيانات الحساب، حاول بعد ثانية");
      return;
    }
    if (isEditMode && isCancelled) {
      toast.error("لا يمكن تعديل سند ملغي — أنشئ سنداً جديداً مشابهاً بدل تعديل سند ملغى");
      return;
    }
    if (amountNum <= 0) {
      toast.error("الرجاء إدخال المبلغ");
      try { amountInputRef.current?.focus(); } catch {}
      return;
    }
    if (isEmployeePayment && !selectedEmployee) {
      toast.error("الرجاء اختيار الموظف");
      return;
    }
    if (isAccountPayment && !selectedGlAccount) {
      toast.error("الرجاء اختيار الحساب");
      return;
    }
    if (!isEmployeePayment && !isAccountPayment && !selectedContact) {
      toast.error("الرجاء اختيار الجهة");
      return;
    }
    const effectiveInvoices = allocationMode === "auto"
      ? (engineAutoAllocate(invoices as any, amountNum, currency, exchangeRate) as Invoice[])
      : invoices;

    // ─── Smart Allocation Posting Guards ───
    if (!asDraft && partyType === "contact" && selectedContact) {
      const summary = engineSummary(effectiveInvoices as any, amountNum);
      const guard = checkPostingGuards({
        voucherKind: voucherType,
        partyType,
        hasContact: true,
        openInvoiceCount: effectiveInvoices.length,
        mode: allocationMode,
        summary,
      });
      if (!guard.ok && guard.block) {
        toast.error(guard.block);
        return;
      }
      if (guard.confirm) {
        const proceed = window.confirm(guard.confirm);
        if (!proceed) return;
      }
    }
    // Validate cheque amounts total
    if (paymentMethod === "شيك" && !asDraft) {
      // يسمح بنوعين: شيكات جديدة (cheques) أو شيكات مظهَّرة موجودة (endorsedCheques)
      const validCheques = cheques.filter(
        c => c.number && String(c.number).trim() !== "" && c.bank && Number(c.amount) > 0
      );
      const endorsedTotal = endorsedCheques.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      const newCount = validCheques.length;
      const endorsedCount = endorsedCheques.length;

      if (newCount === 0 && endorsedCount === 0) {
        toast.error(
          "يجب إدخال بيانات شيك جديد (الرقم، البنك، والمبلغ) أو اختيار شيك موجود للتجيير قبل حفظ السند",
        );
        return;
      }

      // Per-row strict validation for new cheques (number, bank, date, amount, currency).
      if (newCount > 0) {
        try {
          validateChequeRows(validCheques as any, currency);
        } catch (e: any) {
          toast.error(e?.message || "بيانات الشيك غير مكتملة");
          return;
        }
      }

      const chequesTotal =
        validCheques.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) + endorsedTotal;
      const diff = Math.abs(chequesTotal - amountNum);
      if (diff > 0.01) {
        const breakdown =
          endorsedCount > 0 && newCount > 0
            ? ` (جديد: ${(chequesTotal - endorsedTotal).toFixed(2)} + مظهَّر: ${endorsedTotal.toFixed(2)})`
            : endorsedCount > 0
            ? " (مظهَّر)"
            : "";
        toast.error(
          `إجمالي الشيكات${breakdown} (${chequesTotal.toFixed(2)}) لا يساوي مبلغ السند (${amountNum.toFixed(2)})`,
        );
        return;
      }
      // رقم حساب صاحب الشيك أصبح اختيارياً للوارد والصادر معاً
    }

    // ─── MIXED path (نقدي + شيكات في نفس السند) ───
    if (paymentMethod === "مختلط" && !asDraft) {
      if (isEditMode) {
        toast.error("تعديل السند المختلط غير مدعوم بعد — أنشئ سنداً جديداً");
        return;
      }
      if (partyType !== "contact" || !selectedContact) {
        toast.error("السند المختلط متاح للزبون/المورد فقط");
        return;
      }
      const cashPart = Number(mixedCashAmount) || 0;
      const validCheques = cheques.filter(
        c => c.number && String(c.number).trim() !== "" && c.bank && Number(c.amount) > 0
      );
      if (cashPart <= 0 && validCheques.length === 0) {
        toast.error("أدخل مبلغاً نقدياً أو أضف شيكاً واحداً على الأقل");
        return;
      }
      if (validCheques.length > 0) {
        try { validateChequeRows(validCheques as any, currency); }
        catch (e: any) { toast.error(e?.message || "بيانات الشيك غير مكتملة"); return; }
      }
      const chequesTotal = validCheques.reduce((s, c) => s + (Number(c.amount) || 0), 0);
      const grand = cashPart + chequesTotal;
      if (Math.abs(grand - amountNum) > 0.01) {
        toast.error(`مجموع (نقدي ${cashPart.toFixed(2)} + شيكات ${chequesTotal.toFixed(2)}) = ${grand.toFixed(2)} لا يساوي مبلغ السند ${amountNum.toFixed(2)}`);
        return;
      }
      // Determine cash account
      let cashAcct: string | null = null;
      if (cashPart > 0) {
        if (depositType === "cash_box" && selectedCashBox) {
          cashAcct = cashBoxes.find(c => c.id === selectedCashBox)?.gl_account_code || "1110";
        } else if (depositType === "bank" && selectedBankAccount) {
          cashAcct =
            bankAccounts.find(b => b.id === selectedBankAccount)?.gl_account_code ||
            (await resolveBankAccountCode(ownerId));
        } else {
          toast.error("اختر صندوق أو بنك للجزء النقدي"); return;
        }
      }
      savingRef.current = true;
      setSaving(true);
      try {
        const result = await callCreateMixedVoucherRpc({
          userId: ownerId,
          kind: isReceipt ? "receipt" : "payment",
          contactId: selectedContact.id,
          contactName: selectedContact.contact_name,
          voucherDate: paymentDate,
          currency: CURRENCIES.find(c => c.value === currency)?.label || "شيكل",
          exchangeRate: currency !== "ILS" ? exchangeRate : null,
          description: notes || `${isReceipt ? "سند قبض" : "سند صرف"} مختلط - ${selectedContact.contact_name}`,
          notes: notes || null,
          cashAmount: cashPart,
          cashAccountCode: cashAcct,
          cheques: validCheques.map(c => ({
            number: c.number,
            date: c.date,
            bank: c.bank,
            amount: Number(c.amount) || 0,
            account_number: c.accountNumber || null,
            notes: c.notes || null,
          })),
          allocations: (invoices || [])
            .filter((inv: any) => Number(inv.paidNow || 0) > 0)
            .map((inv: any) => ({ invoice_id: inv.id, amount: Number(inv.paidNow) })),
          idempotencyKey: `MIX-${Date.now()}`,
          workshopId: selectedWorkshop?.id || null,
          costCenterId: costCenterId,
        });
        if ((result as any)?.success === false) {
          throw new Error((result as any).error || "فشل حفظ السند المختلط");
        }
        toast.success("تم حفظ السند المختلط بنجاح ✅");
        navigate(listPath);
        return;
      } catch (e: any) {
        toast.error(e?.message || "فشل حفظ السند المختلط");
        return;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    }

    savingRef.current = true;
    setSaving(true);

    try {
      let depositAccountCode = "1110";
      let cashBoxId: string | null = null;
      let bankAccountId: string | null = null;

      if (paymentMethod === "شيك") {
        // For cheques, use the selected cheque bank account GL code
        if (selectedChequeBankAccount) {
          const ba = bankAccounts.find(b => b.id === selectedChequeBankAccount);
          if (isReceipt) {
            depositAccountCode = ba?.incoming_checks_account_code || "1150"; // incoming cheques
          } else {
            depositAccountCode = ba?.outgoing_checks_account_code || "1160"; // outgoing cheques
          }
          bankAccountId = selectedChequeBankAccount;
        } else {
          depositAccountCode = isReceipt ? "1150" : "1160";
        }
      } else if (depositType === "cash_box" && selectedCashBox) {
        const cb = cashBoxes.find(c => c.id === selectedCashBox);
        depositAccountCode = cb?.gl_account_code || "1110";
        cashBoxId = selectedCashBox;
      } else if (depositType === "bank" && selectedBankAccount) {
        const ba = bankAccounts.find(b => b.id === selectedBankAccount);
        depositAccountCode = ba?.gl_account_code || (await resolveBankAccountCode(ownerId));
        bankAccountId = selectedBankAccount;
      }

      // Determine the counterpart account code
      // Contact vouchers are intentionally posted to the selected party ledger
      // (1130 customers / 2110 suppliers). Advances remain an allocation state,
      // not a separate visible ledger, so Account Statement always shows one
      // clean account for the contact.
      let counterAccountCode = isReceipt ? "1130" : "2110"; // default: receivables / payables
      if (isAccountPayment && selectedGlAccount) {
        counterAccountCode = selectedGlAccount.account_code;
      }

      // ─── Smart Allocation: route by intent ───
      // For contact-based vouchers, the engine tells us whether this is a
      // settlement, advance, refund, or reverse-settlement. Map each intent
      // to the correct counter-account so the journal entry is meaningful
      // and customer/supplier statements stay clean.
      let allocationIntent: string | null = null;
      if (partyType === "contact" && selectedContact && !isAccountPayment) {
        const summaryNow = engineSummary(effectiveInvoices as any, amountNum);
        const cls = engineClassify({
          voucherKind: voucherType,
          partyType: "contact",
          hasContact: true,
          openInvoiceCount: effectiveInvoices.length,
          mode: allocationMode,
          summary: summaryNow,
        });
        allocationIntent = cls.intent;

        if (isReceipt) {
          // Receipt + customer: always use the customer receivable sub-ledger.
          // If there are no invoices, the unallocated amount is tracked by the
          // allocation layer, but the statement stays under the same contact.
          counterAccountCode = "1130";
        } else {
          // Payment voucher: customer refunds reduce receivables, otherwise use
          // supplier payable sub-ledger. Supplier advances are not split into a
          // separate visible account because that creates duplicate statements.
          counterAccountCode = (cls.intent === "refund" || cls.intent === "reverse_settlement")
            ? "1130"
            : "2110";
        }
      }

      // ─── Auto-route to contact sub-account when parent has children ───
      // If the user already opened sub-accounts under 1130 / 2110,
      // posting to the parent is forbidden. Resolve (or auto-create) the
      // contact's own sub-account so receipts/payments always land in a
      // postable account and the customer/supplier statement stays clean.
      if (selectedContact && !isAccountPayment) {
        try {
          const { data: resolved, error: resErr } = await supabase.rpc(
            "resolve_postable_account" as any,
            {
              p_user_id: ownerId,
              p_parent_code: counterAccountCode,
              p_contact_id: selectedContact.id,
              p_contact_name: selectedContact.contact_name,
            }
          );
          if (resErr) throw resErr;
          if (typeof resolved === "string" && resolved) {
            counterAccountCode = resolved;
          }
        } catch (e: any) {
          throw new Error(
            e?.message ||
              `تعذر تحديد الحساب الفرعي للجهة على ${counterAccountCode}`
          );
        }
      }

      let finalRefNumber: string;
      if (isEditMode) {
        finalRefNumber = refNumber;
      } else {
        if (!reservedRefRef.current) {
          reservedRefRef.current = await reserveVoucherRefNumber();
        }
        finalRefNumber = reservedRefRef.current;
      }
      // Deterministic per-voucher idempotency seed: a retry of the same voucher
      // reuses the same key, so the DB unique index rejects the duplicate.
      const postingNonce = finalRefNumber;

      // ─── EDIT MODE ───
      if (isEditMode && editId) {
        if (isReceipt) {
          // Get linked transaction ID before updating
          const { data: existingReceipt } = await supabase.from("receipt_vouchers")
            .select("linked_transaction_id")
            .eq("id", editId).single();

          const { error } = await supabase
            .from("receipt_vouchers")
            .update({
              contact_id: selectedContact?.id || null,
              contact_name: selectedContact?.contact_name || selectedGlAccount?.account_name || "",
              payment_date: paymentDate,
              amount: amountNum,
              payment_method: paymentMethod,
              check_number: paymentMethod === "شيك" ? checkNumber : null,
              check_date: paymentMethod === "شيك" && checkDate ? checkDate : null,
              bank_name: paymentMethod === "شيك" ? checkBank : null,
              cash_box_id: cashBoxId,
              bank_account_id: bankAccountId,
              deposit_account_code: depositAccountCode,
              notes,
              workshop_id: selectedWorkshop?.id || null,
            } as any)
            .eq("id", editId)
            .eq("user_id", ownerId);
          if (error) throw error;

          // Update linked transaction (Golden Rule: insert fresh + relink + delete old).
          // Do not soft-delete the currently linked transaction before relinking
          // the voucher: a DB trigger interprets that as intentional cancellation.
          const linkedTxId = (existingReceipt as any)?.linked_transaction_id;
          // Also recover legacy receipts that were saved as "posted" but never
          // got a transaction created (linked_transaction_id IS NULL). Without
          // this, editing such vouchers would skip posting entirely and the
          // Account Statement would never see them.
          if (linkedTxId || !asDraft) {
            // Insert fresh transaction
            const { data: newTx, error: newTxError } = await supabase.from("transactions").insert({
              user_id: ownerId,
              transaction_date: paymentDate,
              description: notes || `سند قبض من ${selectedContact?.contact_name || selectedGlAccount?.account_name || ""}`,
              debit_account_code: depositAccountCode,
              credit_account_code: counterAccountCode,
              amount: amountInILS,
              currency: currencyLabel,
              transaction_type: "receipt",
              contact_id: selectedContact?.id || null,
              payment_method: paymentMethod,
              idempotency_key: linkedTxId ? `RCV-EDIT-${Date.now()}` : `RCV-REPAIR-${editId}-${Date.now()}`,
              foreign_amount: currency !== "ILS" ? amountNum : null,
              exchange_rate: currency !== "ILS" ? exchangeRate : null,
              workshop_id: selectedWorkshop?.id || null,
              cost_center_name: selectedWorkshop?.name || null,
              cost_center_id: costCenterId,
              reference: finalRefNumber || null,
            } as any).select("id").single();
            if (newTxError) throw newTxError;
            if (!newTx?.id) throw new Error("فشل تحديث سند القبض: لم يتم إنشاء القيد الجديد");

            // Relink first, then soft-delete the old transaction safely.
            const { error: relinkError } = await supabase.from("receipt_vouchers").update({
              linked_transaction_id: newTx.id,
              status: asDraft ? "draft" : "posted",
            } as any).eq("id", editId).eq("user_id", ownerId);
            if (relinkError) throw relinkError;

            if (linkedTxId && linkedTxId !== newTx.id) {
              const { error: oldTxError } = await supabase.from("transactions").update({
                is_deleted: true,
                idempotency_key: null,
              } as any).eq("id", linkedTxId).eq("user_id", ownerId);
              if (oldTxError) throw oldTxError;
            }
          }

          broadcastChange("receipt_voucher", "updated", editId);
          toast.success(`تم تحديث ${voucherLabel} بنجاح`);

          // ─── Cheques: delete & recreate (Golden Rule) ───
          if (paymentMethod === "شيك") {
            await syncChequesOnEdit({
              userId: ownerId,
              voucherId: editId,
              receiptVoucherId: editId,
              direction: "وارد",
              cheques,
              partyName: selectedContact?.contact_name || selectedGlAccount?.account_name || "",
              contactId: selectedContact?.id || null,
              currencyLabel: currency,
              sourceBankAccountId: selectedChequeBankAccount || null,
              fallbackDate: paymentDate,
              fallbackNotes: notes || null,
            });
          } else {
            // Payment method changed away from cheque — wipe orphan rows if no
            // downstream events have happened yet.
            await wipeUnreferencedCheques(ownerId, editId);
          }
        } else {
          // Get linked transaction ID before updating
          const { data: existingVoucher } = await supabase.from("vouchers")
            .select("linked_transaction_id")
            .eq("id", editId).single();

          const isEmployeePaymentEdit = !isReceipt && partyType === "employee" && selectedEmployee;

          // ─── Resolve employee account for edit mode (same as create) ───
          let editDebitAccountCode = counterAccountCode; // default: 2110
          let editTxDescription = notes || `سند صرف إلى ${selectedContact?.contact_name || selectedGlAccount?.account_name || ""}`;
          let editTxContactId: string | null = selectedContact?.id || null;

          if (isEmployeePaymentEdit && selectedEmployee) {
            const categoryLabel = empCategory === "أخرى" ? empCategoryCustom : empCategory;
            const violationNote = empCategory === "مخالفة" && violationReason ? ` - السبب: ${violationReason}` : "";
            editTxDescription = `${categoryLabel} - ${selectedEmployee.full_name}${violationNote}`;
            if (notes) editTxDescription += ` | ${notes}`;
            editTxContactId = null;

            const { data: empAccount } = await supabase
              .from("accounts")
              .select("account_code")
              .eq("user_id", ownerId)
              .eq("parent_code", "2180")
              .like("account_name", `%${selectedEmployee.full_name}%`)
              .limit(1)
              .single();

            if (empAccount) {
              editDebitAccountCode = empAccount.account_code;
            } else {
              const { data: maxCode } = await supabase
                .from("accounts")
                .select("account_code")
                .eq("user_id", ownerId)
                .eq("parent_code", "2180")
                .order("account_code", { ascending: false })
                .limit(1)
                .single();
              const nextCode = maxCode ? String(parseInt(maxCode.account_code) + 1) : "21801";
              await supabase.from("accounts").insert({
                user_id: ownerId,
                account_code: nextCode,
                account_name: `ذمم موظف - ${selectedEmployee.full_name}`,
                account_type: "التزامات",
                parent_code: "2180",
                is_system: false,
              });
              editDebitAccountCode = nextCode;
            }
          }

          if (isAccountPayment && selectedGlAccount) {
            editDebitAccountCode = selectedGlAccount.account_code;
            editTxContactId = null;
          }

          const payMethodMap: Record<string, string> = { "نقدي": "cash", "شيك": "cheque", "تحويل": "transfer", "بطاقة": "card" };
          const { error } = await supabase
            .from("vouchers")
            .update({
              date: paymentDate,
              contact_id: isEmployeePaymentEdit ? null : (isAccountPayment ? null : selectedContact?.id),
              employee_id: isEmployeePaymentEdit ? selectedEmployee.id : null,
              payment_method: payMethodMap[paymentMethod] || "cash",
              amount: amountNum,
              amount_ils: amountInILS,
              currency: currency,
              exchange_rate: exchangeRate,
              description: editTxDescription,
              notes: notes || null,
              bank_account_id: bankAccountId,
              cash_box_id: cashBoxId,
              cheque_number: paymentMethod === "شيك" ? checkNumber : null,
              cheque_due_date: paymentMethod === "شيك" && checkDate ? checkDate : null,
              cheque_bank_name: paymentMethod === "شيك" ? checkBank : null,
              workshop_id: selectedWorkshop?.id || null,
              cost_center_id: costCenterId,
            } as any)
            .eq("id", editId)
            .eq("user_id", ownerId);
          if (error) throw error;

          // Update linked transaction (Golden Rule: insert fresh + relink + delete old).
          // Do not soft-delete the currently linked transaction before relinking
          // the voucher: a DB trigger interprets that as intentional cancellation.
          // Also self-heal legacy payment vouchers that were posted but never
          // got a transaction created (linked_transaction_id IS NULL). Without
          // this, editing such vouchers would skip posting entirely and the
          // Supplier Statement would never see them.
          const linkedTxId = (existingVoucher as any)?.linked_transaction_id;
          if (linkedTxId || !asDraft) {
            // Insert fresh transaction
            const payMethodMapAr: Record<string, string> = { "نقدي": "نقدي", "شيك": "شيك", "تحويل": "بنك", "بطاقة": "بطاقة" };
            const { data: newTx, error: newTxError } = await supabase.from("transactions").insert({
              user_id: ownerId,
              transaction_date: paymentDate,
              description: editTxDescription,
              debit_account_code: editDebitAccountCode,
              credit_account_code: depositAccountCode,
              amount: amountInILS,
              currency: currencyLabel,
              transaction_type: isEmployeePaymentEdit ? "employee_payment" : isAccountPayment ? "journal" : "payment",
              contact_id: editTxContactId,
              payment_method: payMethodMapAr[paymentMethod] || "نقدي",
              idempotency_key: linkedTxId ? `PAY-EDIT-${Date.now()}` : `PAY-REPAIR-${editId}-${Date.now()}`,
              foreign_amount: currency !== "ILS" ? amountNum : null,
              exchange_rate: currency !== "ILS" ? exchangeRate : null,
              expense_category: isEmployeePaymentEdit ? (empCategory === "أخرى" ? empCategoryCustom : empCategory) : null,
              workshop_id: selectedWorkshop?.id || null,
              cost_center_name: selectedWorkshop?.name || null,
              cost_center_id: costCenterId,
              reference: finalRefNumber || null,
            } as any).select("id").single();
            if (newTxError) throw newTxError;
            if (!newTx?.id) throw new Error("فشل تحديث سند الصرف: لم يتم إنشاء القيد الجديد");

            // Relink first, then soft-delete the old transaction safely.
            const { error: relinkError } = await supabase.from("vouchers").update({
              linked_transaction_id: newTx.id,
              status: asDraft ? "draft" : "posted",
              posted_by: !asDraft ? user.id : null,
              posted_at: !asDraft ? new Date().toISOString() : null,
            } as any).eq("id", editId).eq("user_id", ownerId);
            if (relinkError) throw relinkError;

            if (linkedTxId && linkedTxId !== newTx.id) {
              const { error: oldTxError } = await supabase.from("transactions").update({
                is_deleted: true,
                idempotency_key: null,
              } as any).eq("id", linkedTxId).eq("user_id", ownerId);
              if (oldTxError) throw oldTxError;
            }
          }

          broadcastChange("payment_voucher", "updated", editId);
          toast.success(`تم تحديث ${voucherLabel} بنجاح`);

          // ─── Cheques: delete & recreate (Golden Rule) ───
          if (paymentMethod === "شيك") {
            await syncChequesOnEdit({
              userId: ownerId,
              voucherId: editId,
              receiptVoucherId: null,
              direction: "صادر",
              cheques,
              partyName: selectedContact?.contact_name || selectedGlAccount?.account_name || "",
              contactId: selectedContact?.id || null,
              currencyLabel: currency,
              sourceBankAccountId: selectedChequeBankAccount || null,
              fallbackDate: paymentDate,
              fallbackNotes: notes || null,
            });
          } else {
            await wipeUnreferencedCheques(ownerId, editId);
          }

          // B3.4: refresh sub-ledger mirror for this voucher (delete & recreate).
          // Only mirrors employee payment vouchers; other voucher types are untouched.
          await supabase
            .from("employee_financial_movements")
            .delete()
            .eq("source_id", editId)
            .eq("source_type", "finance_manual");
          if (isEmployeePaymentEdit && selectedEmployee) {
            const subCat = mapEmpCategoryToSubLedger(empCategory);
            if (subCat) {
              const refNum = refNumber || `PV-${editId.slice(0, 8)}`;
              const customLabel = empCategory === "أخرى" && empCategoryCustom ? empCategoryCustom : empCategory;
              const violNote = empCategory === "مخالفة" && violationReason ? ` - السبب: ${violationReason}` : "";
              const period = toSalaryPeriod(deductionMonth, paymentDate);
              await supabase.from("employee_financial_movements").insert({
                user_id: ownerId,
                employee_id: selectedEmployee.id,
                source_type: "finance_manual",
                source_id: editId,
                source_reference: refNum,
                reference_number: refNum,
                category: subCat,
                description: `سند صرف ${customLabel} - ${selectedEmployee.full_name}${violNote}`,
                amount: amountInILS,
                movement_type: "debit",
                status: "approved",
                movement_date: paymentDate,
                salary_month: period.salary_month,
                salary_year: period.salary_year,
                salary_month_locked: !!deductionMonth,
                created_by: user.id,
                notes: notes || null,
              } as any);
            }
          }
        }
        navigate(listPath);
        return;
      }

      // ─── CREATE MODE ───
      let txId: string | null = null;

      // Force direct transaction (bypass legacy RPC) whenever the intent
      // requires a non-default counter-account. Advances now stay on the same
      // contact ledger, so they can safely use the canonical voucher path.
      const intentNeedsDirect =
        allocationIntent === "refund" ||
        allocationIntent === "reverse_settlement";
      const useDirectTransaction = isAccountPayment || currency !== "ILS" || intentNeedsDirect;

      // Phase 5C: feature-flagged routing through the canonical wide RPCs.
      // Only applies to the SIMPLEST contact-based, ILS, no-cheque flow so
      // we never disturb employee / account / foreign / cheque / multi-line
      // paths in this phase. Default OFF for all tenants.
      const vouchersRpcOn = isVouchersRpcEnabled(settings);
      const isSimpleContactVoucher =
        partyType === "contact" &&
        !!selectedContact &&
        !isAccountPayment &&
        !isEmployeePayment &&
        currency === "ILS" &&
        paymentMethod !== "شيك" &&
        !intentNeedsDirect;

      if (!asDraft && isReceipt && !useDirectTransaction) {
        if (vouchersRpcOn && isSimpleContactVoucher) {
          // NEW canonical path — passes deposit account, voucher_date and
          // notes directly to the RPC so we no longer have to mutate
          // transactions after the fact.
          const result = await callCreateReceiptRpc({
            userId: ownerId,
            contactId: selectedContact!.id,
            contactName: selectedContact!.contact_name,
            amount: amountNum,
            paymentMethod: paymentMethod === "تحويل" ? "بنك" : "نقدي",
            description: notes || `سند قبض من ${selectedContact!.contact_name}`,
            currency: currencyLabel,
            idempotencyKey: `RCV-${postingNonce}`,
            reference: finalRefNumber,
            voucherDate: paymentDate,
            cashAccountCode: depositAccountCode,
            notes: notes || null,
            workshopId: selectedWorkshop?.id || null,
            costCenterId: costCenterId,
          });
          if (result?.success === false) {
            throw new Error(result.error || "فشل إنشاء القيد المحاسبي لسند القبض");
          }
          txId = result?.transaction_id || null;
        } else {
          // LEGACY path — unchanged behaviour for all existing tenants.
          const { data: txResult, error: rpcError } = await supabase.rpc("create_receipt_with_entry", {
            p_user_id: ownerId,
            p_contact_id: selectedContact!.id,
            p_contact_name: selectedContact!.contact_name,
            p_amount: amountNum,
            p_payment_method: paymentMethod === "شيك" ? "شيك" : paymentMethod === "تحويل" ? "بنك" : "نقدي",
            p_description: notes || `سند قبض من ${selectedContact!.contact_name}`,
            p_currency: currencyLabel,
            p_idempotency_key: `RCV-${postingNonce}`,
            p_voucher_date: paymentDate,
            p_exchange_rate: currency !== "ILS" ? exchangeRate : null,
            p_reference: finalRefNumber,
            p_cash_account_code: depositAccountCode,
            p_contact_account_code: counterAccountCode,
            p_notes: notes || null,
            p_workshop_id: selectedWorkshop?.id || null,
            p_cost_center_id: costCenterId,
          });
          if (rpcError) throw rpcError;
          const rpcResult = (txResult as any) || {};
          if (rpcResult.success === false) {
            throw new Error(rpcResult.error || "فشل إنشاء القيد المحاسبي لسند القبض");
          }
          txId = rpcResult.transaction_id || null;

          // Update deposit account and workshop if needed
          if (txId) {
            const txUpdates: any = {};
            if (depositAccountCode !== "1110") txUpdates.debit_account_code = depositAccountCode;
            if (selectedWorkshop) { txUpdates.workshop_id = selectedWorkshop.id; txUpdates.cost_center_name = selectedWorkshop.name; }
            if (costCenterId) txUpdates.cost_center_id = costCenterId;
            if (Object.keys(txUpdates).length > 0) await supabase.from("transactions").update(txUpdates).eq("id", txId);
          }
        }
      } else if (!asDraft && isReceipt && useDirectTransaction) {
        // Direct transaction for account party type or foreign currency
        const debitCode = depositAccountCode;
        const creditCode = counterAccountCode;
        const { data: txData, error: txErr } = await supabase.from("transactions").insert({
          user_id: ownerId,
          transaction_date: paymentDate,
          description: notes || `سند قبض - ${selectedGlAccount?.account_name || selectedContact?.contact_name || ""}`,
          debit_account_code: debitCode,
          credit_account_code: creditCode,
          amount: amountInILS,
          currency: currencyLabel,
          transaction_type: "receipt",
          contact_id: selectedContact?.id || null,
          payment_method: paymentMethod,
          idempotency_key: `RCV-${postingNonce}`,
          reference: finalRefNumber || null,
          foreign_amount: currency !== "ILS" ? amountNum : null,
          exchange_rate: currency !== "ILS" ? exchangeRate : null,
          workshop_id: selectedWorkshop?.id || null,
          cost_center_name: selectedWorkshop?.name || null,
          cost_center_id: costCenterId,
        } as any).select("id").single();
        if (txErr) throw txErr;
        txId = txData?.id || null;
      }

      // GUARD: never insert a posted receipt voucher without an accounting entry.
      // Prevents the silent orphan that produced REC-2026-0001 (linked_transaction_id NULL while status=posted).
      if (!asDraft && isReceipt && !txId) {
        throw new Error("فشل ترحيل سند القبض: لم يتم إنشاء القيد المحاسبي. الرجاء المحاولة مرة أخرى.");
      }

      if (!asDraft && !isReceipt) {
        const payMethodMap: Record<string, string> = { "نقدي": "نقدي", "شيك": "شيك", "تحويل": "بنك", "بطاقة": "بطاقة" };
        
        let debitAccountCode = counterAccountCode;
        let txDescription = notes || `سند صرف إلى ${selectedContact?.contact_name || selectedGlAccount?.account_name || ""}`;
        let txContactId = selectedContact?.id || null;

         // Employee payment: find their account under 2180
        if (isEmployeePayment && selectedEmployee) {
          const categoryLabel = empCategory === "أخرى" ? empCategoryCustom : empCategory;
          const violationNote = empCategory === "مخالفة" && violationReason ? ` - السبب: ${violationReason}` : "";
          txDescription = `${categoryLabel} - ${selectedEmployee.full_name}${violationNote}`;
          if (notes) txDescription += ` | ${notes}`;
          txContactId = null;

          const { data: empAccount } = await supabase
            .from("accounts")
            .select("account_code")
            .eq("user_id", ownerId)
            .eq("parent_code", "2180")
            .like("account_name", `%${selectedEmployee.full_name}%`)
            .limit(1)
            .single();

          if (empAccount) {
            debitAccountCode = empAccount.account_code;
          } else {
            const { data: maxCode } = await supabase
              .from("accounts")
              .select("account_code")
              .eq("user_id", ownerId)
              .eq("parent_code", "2180")
              .order("account_code", { ascending: false })
              .limit(1)
              .single();
            const nextCode = maxCode ? String(parseInt(maxCode.account_code) + 1) : "21801";
            await supabase.from("accounts").insert({
              user_id: ownerId,
              account_code: nextCode,
              account_name: `ذمم موظف - ${selectedEmployee.full_name}`,
              account_type: "التزامات",
              parent_code: "2180",
              is_system: false,
            });
            debitAccountCode = nextCode;
          }
        }

        if (isAccountPayment && selectedGlAccount) {
          debitAccountCode = selectedGlAccount.account_code;
          txContactId = null;
        }

        // Phase 5C: when the flag is ON and we're on the simplest contact
        // payment path (ILS, no cheque, no employee, no account, no
        // smart-routing intent), route through the canonical RPC instead of
        // direct insert. The RPC writes to transactions atomically with the
        // correct journal lines.
        if (vouchersRpcOn && isSimpleContactVoucher) {
          const result = await callCreatePaymentRpc({
            userId: ownerId,
            contactId: selectedContact!.id,
            contactName: selectedContact!.contact_name,
            amount: amountNum,
            paymentMethod: paymentMethod === "تحويل" ? "بنك" : "نقدي",
            description: txDescription,
            currency: currencyLabel,
            idempotencyKey: `PAY-${postingNonce}`,
            reference: finalRefNumber,
            voucherDate: paymentDate,
            cashAccountCode: depositAccountCode,
            notes: notes || null,
            workshopId: selectedWorkshop?.id || null,
            costCenterId: costCenterId,
          });
          if (result?.success === false) {
            throw new Error(result.error || "فشل إنشاء القيد المحاسبي لسند الصرف");
          }
          txId = result?.transaction_id || null;
        } else {
        const { data: txData, error: txErr } = await supabase.from("transactions").insert({
          user_id: ownerId,
          transaction_date: paymentDate,
          description: txDescription,
          debit_account_code: debitAccountCode,
          credit_account_code: depositAccountCode,
          amount: amountInILS,
          currency: currencyLabel,
          transaction_type: isEmployeePayment ? (empCategory === "رواتب" ? "employee_salary" : empCategory === "سلفة" ? "employee_advance" : "employee_payment") : isAccountPayment ? "journal" : "payment",
          contact_id: txContactId,
          payment_method: payMethodMap[paymentMethod] || "نقدي",
          idempotency_key: `PAY-${postingNonce}`,
          reference: finalRefNumber || null,
          foreign_amount: currency !== "ILS" ? amountNum : null,
          exchange_rate: currency !== "ILS" ? exchangeRate : null,
          expense_category: isEmployeePayment ? (empCategory === "أخرى" ? empCategoryCustom : empCategory) : null,
          workshop_id: selectedWorkshop?.id || null,
          cost_center_name: selectedWorkshop?.name || null,
          cost_center_id: costCenterId,
        } as any).select("id").single();
        if (txErr) throw txErr;
        txId = txData?.id || null;
        }
      }

      // Track the un-attached transaction so a later failure can roll it back.
      if (!editId && txId) orphanTxRef.current = txId;

      if (isReceipt) {
        const { data: receipt, error: receiptError } = await supabase
          .from("receipt_vouchers")
          .insert({
            user_id: ownerId,
            receipt_number: finalRefNumber || null,
            contact_id: selectedContact?.id || null,
            contact_name: selectedContact?.contact_name || selectedGlAccount?.account_name || "",
            payment_date: paymentDate,
            amount: amountNum,
            payment_method: paymentMethod,
            check_number: paymentMethod === "شيك" ? checkNumber : null,
            check_date: paymentMethod === "شيك" && checkDate ? checkDate : null,
            bank_name: paymentMethod === "شيك" ? checkBank : null,
            cash_box_id: cashBoxId,
            bank_account_id: bankAccountId,
            deposit_account_code: depositAccountCode,
            notes,
            status: asDraft ? "draft" : "posted",
            linked_transaction_id: txId,
            attachments: attachments.length > 0 ? attachments : [],
            auto_allocate: autoAllocate,
            workshop_id: selectedWorkshop?.id || null,
          } as any)
          .select("id, receipt_number")
          .single();

        if (receiptError) throw receiptError;
        orphanTxRef.current = null;

        // Update transaction reference with receipt number
        if (txId && receipt?.receipt_number) {
          await supabase.from("transactions").update({ reference: receipt.receipt_number }).eq("id", txId);
        }

        const selectedInvoices = effectiveInvoices.filter(i => i.selected && (i.allocatedAmount || 0) > 0);
        if (selectedInvoices.length > 0 && receipt) {
          if (vouchersRpcOn && !asDraft) {
            // Phase 5D: atomic allocation through RPC. The RPC inserts the
            // links AND recalculates invoice paid/remaining/status in one
            // transaction. Replaces the per-invoice update loop.
            await callAllocateVoucherRpc({
              userId: ownerId,
              paymentId: receipt.id,
              voucherAmount: amountNum,
              allocations: selectedInvoices.map(inv => ({
                invoice_id: inv.id,
                amount: inv.allocatedAmount || 0,
              })),
              allowOverpay: false,
            });
          } else {
            // LEGACY path — unchanged.
            const links = selectedInvoices.map(inv => ({
              payment_id: receipt.id,
              invoice_id: inv.id,
              allocated_amount: inv.allocatedAmount || 0,
            }));
            await supabase.from("payment_invoice_links").insert(links);

            if (!asDraft) {
              for (const inv of selectedInvoices) {
                const newPaid = (inv.paid_amount || 0) + (inv.allocatedAmount || 0);
                const newRemaining = inv.total_amount - newPaid;
                await supabase.from("invoices").update({
                  paid_amount: newPaid,
                  remaining_amount: newRemaining,
                  payment_status: newRemaining <= 0 ? "paid" : "partial",
                }).eq("id", inv.id);
              }
            }
          }
        }

        if (paymentMethod === "شيك" && !asDraft && cheques.length > 0) {
          // Atomic insert with .select() + count verification.
          // Throws on partial save → outer try/catch surfaces error to user.
          await insertChequesForVoucher({
            userId: ownerId,
            voucherId: txId,
            receiptVoucherId: receipt?.id || null,
            direction: "وارد",
            cheques: cheques as any,
            partyName: selectedContact?.contact_name || selectedGlAccount?.account_name || "",
            contactId: selectedContact?.id || null,
            currencyLabel: currency,
            sourceBankAccountId: selectedChequeBankAccount || null,
            fallbackDate: paymentDate,
            fallbackNotes: notes || null,
          });
        }

        broadcastChange("receipt_voucher", "created", receipt?.id);
        // Auto-update linked order payment status when receipt was launched from Orders page
        // OR when the user picked an order via the "link to order" popover.
        const orderToSync = linkedOrderId || prefillOrderId;
        if (!asDraft && !editId && orderToSync && isReceipt) {
          try {
            const paidNow = Number(amount) || 0;
            const { data: ord } = await supabase
              .from("orders")
              .select("id, order_number, manual_ref, total, paid_amount, status")
              .eq("id", orderToSync)
              .maybeSingle();
            if (ord) {
              const total = Number((ord as any).total || 0);
              const prevPaid = Number((ord as any).paid_amount || 0);
              const newPaid = prevPaid + paidNow;
              const newStatus = newPaid + 0.001 >= total ? "مدفوع" : (newPaid > 0 ? "مدفوع جزئياً" : "غير مدفوع");
              await supabase
                .from("orders")
                .update({ paid_amount: newPaid, payment_status: newStatus } as any)
                .eq("id", orderToSync);
              // Safety net: ensure the receipt's notes mention the order number
              // so the customer statement + OrdersPage receipts-by-order aggregator
              // can link them even if the user cleared the auto-stamp.
              const ordNum = (ord as any).order_number as string | null;
              const ordRef = ((ord as any).manual_ref as string | null)?.trim() || ordNum;
              if (ordRef && receipt?.id) {
                const currentNotes = String(notes || "");
                const alreadyStamped = currentNotes.includes(ordRef) || (ordNum ? currentNotes.includes(ordNum) : false);
                if (!alreadyStamped) {
                  const stamped = currentNotes
                    ? `دفعة على طلبية ${ordRef} • ${currentNotes}`
                    : `دفعة على طلبية ${ordRef}`;
                  await supabase.from("receipt_vouchers").update({ notes: stamped }).eq("id", receipt.id);
                  if (txId) await supabase.from("transactions").update({ description: stamped }).eq("id", txId);
                }
              }
            }
          } catch (e) {
            console.warn("[voucher] failed to sync order payment status", e);
          }
        }
        const successMsg = asDraft ? "تم حفظ المسودة" : `تم ترحيل ${voucherLabel} ${receipt?.receipt_number}`;
        setSavedReceiptNumber(receipt?.receipt_number || "");
        clearDraft();
        if (fastEntryEnabled && !asDraft && !editId) {
          // Fast-entry: non-blocking toast + auto-reset.
          toast.success(successMsg, { duration: 2500 });
          resetForFastEntry();
        } else {
          toast.success(successMsg);
          setSaved(true);
        }
      } else {
        const payMethodMap: Record<string, string> = { "نقدي": "cash", "شيك": "cheque", "تحويل": "transfer", "بطاقة": "card" };
        const isEmpPay = partyType === "employee" && selectedEmployee;
        const categoryLabel = empCategory === "أخرى" ? empCategoryCustom : empCategory;
        const violationNote = empCategory === "مخالفة" && violationReason ? ` - السبب: ${violationReason}` : "";
        const empDesc = isEmpPay ? `${categoryLabel} - ${selectedEmployee.full_name}${violationNote}` : "";

        // GUARD: never insert a posted payment voucher without an accounting entry.
        if (!asDraft && !txId) {
          throw new Error("فشل ترحيل سند الصرف: لم يتم إنشاء القيد المحاسبي. الرجاء المحاولة مرة أخرى.");
        }

        const { data: voucher, error: voucherError } = await supabase
          .from("vouchers")
          .insert({
            user_id: ownerId,
            type: "payment" as const,
            ref_number: finalRefNumber || `PV-${new Date().getFullYear()}-0001`,
            date: paymentDate,
            contact_id: (isEmpPay || isAccountPayment) ? null : selectedContact?.id,
            payment_method: payMethodMap[paymentMethod] || "cash",
            amount: amountNum,
            amount_ils: amountInILS,
            currency: currency,
            exchange_rate: exchangeRate,
            description: isEmpPay ? (empDesc + (notes ? ` | ${notes}` : "")) : (notes || `سند صرف إلى ${selectedContact?.contact_name || selectedGlAccount?.account_name || ""}`),
            notes: notes || null,
            status: asDraft ? "draft" : "posted",
            linked_transaction_id: txId,
            bank_account_id: bankAccountId,
            cash_box_id: cashBoxId,
            cheque_number: paymentMethod === "شيك" ? checkNumber : null,
            cheque_due_date: paymentMethod === "شيك" && checkDate ? checkDate : null,
            cheque_bank_name: paymentMethod === "شيك" ? checkBank : null,
            posted_by: !asDraft ? user.id : null,
            posted_at: !asDraft ? new Date().toISOString() : null,
            employee_id: isEmpPay ? selectedEmployee.id : null,
            attachments: attachments.length > 0 ? attachments : [],
            workshop_id: selectedWorkshop?.id || null,
            cost_center_id: costCenterId,
          } as any)
          .select("id, ref_number")
          .single();

        if (voucherError) throw voucherError;
        orphanTxRef.current = null;

        // Update transaction reference with voucher ref number
        if (txId && voucher?.ref_number) {
          await supabase.from("transactions").update({ reference: voucher.ref_number }).eq("id", txId);
        }

        // B3.4: mirror employee payment voucher into employee_financial_movements.
        // Posting (transactions row) is unchanged — this is read-only mirroring
        // for the Sub-Ledger / Payroll Preview.
        if (isEmpPay && selectedEmployee && !asDraft && voucher?.id) {
          const subCat = mapEmpCategoryToSubLedger(empCategory);
          if (subCat) {
            const refNum = voucher.ref_number || `PV-${voucher.id.slice(0, 8)}`;
            const customLabel = empCategory === "أخرى" && empCategoryCustom ? empCategoryCustom : empCategory;
            const violNote = empCategory === "مخالفة" && violationReason ? ` - السبب: ${violationReason}` : "";
            // Payment voucher to employee = debit on the employee (he owes / received cash)
            const movementType: "debit" | "credit" = "debit";
            const movDate = paymentDate;
            const period = toSalaryPeriod(deductionMonth, paymentDate);
            const subLedgerErr = await supabase
              .from("employee_financial_movements")
              .insert({
                user_id: ownerId,
                employee_id: selectedEmployee.id,
                source_type: "finance_manual",
                source_id: voucher.id,
                source_reference: refNum,
                reference_number: refNum,
                category: subCat,
                description: `سند صرف ${customLabel} - ${selectedEmployee.full_name}${violNote}`,
                amount: amountInILS,
                movement_type: movementType,
                status: "approved",
                movement_date: movDate,
                salary_month: period.salary_month,
                salary_year: period.salary_year,
                salary_month_locked: !!deductionMonth,
                created_by: user.id,
                notes: notes || null,
              } as any);
            if (subLedgerErr.error) {
              console.warn("[B3.4] sub-ledger mirror failed:", subLedgerErr.error.message);
            }
          }
        }

        if (paymentMethod === "شيك" && !asDraft && cheques.length > 0) {
          // Same atomic helper as receipt-side. Hardens PV path that previously
          // suffered from "voucher saved with zero cheques" incidents.
          await insertChequesForVoucher({
            userId: ownerId,
            voucherId: txId,
            receiptVoucherId: null,
            direction: "صادر",
            cheques: cheques as any,
            partyName: selectedContact?.contact_name || selectedGlAccount?.account_name || "",
            contactId: selectedContact?.id || null,
            currencyLabel: currency,
            sourceBankAccountId: selectedChequeBankAccount || null,
            fallbackDate: paymentDate,
            fallbackNotes: notes || null,
          });
        }

        // Handle endorsed cheques — update existing cheques to "مظهر" status
        if (paymentMethod === "شيك" && !asDraft && endorsedCheques.length > 0 && voucher) {
          const supplierName = selectedContact?.contact_name || selectedGlAccount?.account_name || "";
          for (const ec of endorsedCheques) {
            let chequeId = ec.id;

            // Some older receipt vouchers display cheque details on the receipts
            // list but were never materialized into `cheques`. When selected for
            // endorsement, create the missing cheque row first, then continue with
            // the normal endorsement lifecycle below.
            if (ec.source === "receipt_voucher" && ec.receipt_voucher_id) {
              const { data: existingCheque, error: existingErr } = await supabase
                .from("cheques")
                .select("id")
                .eq("user_id", ownerId)
                .eq("receipt_voucher_id", ec.receipt_voucher_id)
                .maybeSingle();
              if (existingErr) throw existingErr;

              if (existingCheque?.id) {
                chequeId = existingCheque.id;
              } else {
                const { data: createdCheque, error: createChequeErr } = await supabase
                  .from("cheques")
                  .insert({
                    user_id: ownerId,
                    cheque_type: "وارد" as any,
                    cheque_number: ec.cheque_number || "",
                    cheque_date: ec.cheque_date || paymentDate,
                    amount: Number(ec.amount) || 0,
                    party_name: ec.party_name || "",
                    bank_name: ec.bank_name || "",
                    status: "مسجل" as any,
                    currency: ec.currency || currency,
                    source_bank_account_id: ec.source_bank_account_id || null,
                    receipt_voucher_id: ec.receipt_voucher_id,
                    contact_id: ec.contact_id || null,
                    voucher_id: ec.linked_transaction_id || null,
                  } as any)
                  .select("id")
                  .single();
                if (createChequeErr) throw createChequeErr;
                chequeId = createdCheque.id;
              }
            }

            // Update the cheque status to endorsed
            await supabase.from("cheques").update({
              status: "مظهر" as any,
              endorsed_to_contact_id: selectedContact?.id || null,
              endorsed_to_name: supplierName,
              endorsed_at: new Date().toISOString(),
              endorsement_voucher_id: voucher.id,
            } as any).eq("id", chequeId).eq("user_id", ownerId);

            // Create endorsement accounting entry:
            // Debit: supplier account (2110) — reduces payable
            // Credit: received cheques account (1150) — reduces cheques held
            const endorseDescription = `تجيير شيك رقم ${ec.cheque_number || "-"} للمورد ${supplierName}`;
            await supabase.from("transactions").insert({
              user_id: ownerId,
              transaction_date: paymentDate,
              description: endorseDescription,
              debit_account_code: "2110",
              credit_account_code: "1150",
              amount: ec.amount,
              currency: ec.currency || currencyLabel,
              transaction_type: "payment",
              contact_id: selectedContact?.id || null,
              payment_method: "شيك",
              reference: voucher.ref_number,
              idempotency_key: `ENDORSE-${ec.id}-${Date.now()}`,
              linked_transaction_id: txId,
            } as any);

            // Record status change in cheque_status_history
            await supabase.from("cheque_status_history").insert({
              cheque_id: chequeId,
              user_id: ownerId,
              from_status: ec.status as any,
              to_status: "مظهر" as any,
              action_type: "endorsement",
              reason: `تجيير إلى ${supplierName} - سند ${voucher.ref_number}`,
            });
          }
        }

        const selectedInvoices = effectiveInvoices.filter(i => i.selected && (i.allocatedAmount || 0) > 0);
        if (selectedInvoices.length > 0 && voucher) {
          if (vouchersRpcOn && !asDraft && txId) {
            // Phase 5D: atomic allocation through RPC, keyed by
            // transaction_id (since payment vouchers live in `vouchers`,
            // not `receipt_vouchers`). The RPC will also recalc invoice
            // status server-side.
            await callAllocateVoucherRpc({
              userId: ownerId,
              transactionId: txId,
              voucherAmount: amountNum,
              allocations: selectedInvoices.map(inv => ({
                invoice_id: inv.id,
                amount: inv.allocatedAmount || 0,
              })),
              allowOverpay: false,
            });
          } else {
            // LEGACY path — unchanged. Saves payment_invoice_links keyed
            // to vouchers.id for cancel reversal.
            const links = selectedInvoices.map(inv => ({
              payment_id: voucher.id,
              invoice_id: inv.id,
              allocated_amount: inv.allocatedAmount || 0,
            }));
            await supabase.from("payment_invoice_links").insert(links);

            for (const inv of selectedInvoices) {
              if (!asDraft) {
                const newPaid = (inv.paid_amount || 0) + (inv.allocatedAmount || 0);
                const newRemaining = inv.total_amount - newPaid;
                await supabase.from("invoices").update({
                  paid_amount: newPaid,
                  remaining_amount: newRemaining,
                  payment_status: newRemaining <= 0 ? "paid" : "partial",
                }).eq("id", inv.id);
              }
            }
          }
        }

        broadcastChange("payment_voucher", "created", voucher?.id);
        const successMsg = asDraft ? "تم حفظ المسودة" : `تم ترحيل ${voucherLabel} ${voucher?.ref_number}`;
        setSavedReceiptNumber(voucher?.ref_number || "");
        clearDraft();
        if (fastEntryEnabled && !asDraft && !editId) {
          toast.success(successMsg, { duration: 2500 });
          resetForFastEntry();
        } else {
          toast.success(successMsg);
          setSaved(true);
        }
      }
    } catch (err: any) {
      toast.error(formatDbError(err, "حدث خطأ أثناء الحفظ"));
      // Roll back a transaction that was created but never linked to a
      // voucher — otherwise a retry would post the same amount twice.
      const orphanId = orphanTxRef.current;
      if (orphanId) {
        orphanTxRef.current = null;
        try {
          await supabase
            .from("transactions")
            .update({ is_deleted: true, notes: "ملغى تلقائياً: فشل إنشاء السند المرتبط" } as any)
            .eq("id", orphanId);
        } catch (cleanupErr) {
          console.warn("[voucher] orphan transaction rollback failed", cleanupErr);
        }
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Keep the ref pointed at the latest handleSave so that memoized
  // ActionPane tabs and the Ctrl+Enter listener always see fresh state.
  handleSaveRef.current = handleSave;

  const handlePrint = () => {
    const partyName = partyType === "employee" && selectedEmployee
      ? selectedEmployee.full_name
      : partyType === "account" && selectedGlAccount
      ? selectedGlAccount.account_name
      : selectedContact?.contact_name || "";
    const amt = amountNum;
    // ─── حماية: لا تطبع سند فارغ (بدون مبلغ أو بدون طرف) ───
    if (amt <= 0 || !partyName) {
      toast.error("لا يمكن الطباعة", {
        description: amt <= 0
          ? "يرجى إدخال مبلغ السند قبل الطباعة."
          : "يرجى اختيار الجهة (الزبون/المورد/الموظف) قبل الطباعة.",
      });
      return;
    }
    const fmtAmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = (d: string | Date) => { const dt = new Date(d); const dd = String(dt.getDate()).padStart(2, '0'); const mm = String(dt.getMonth() + 1).padStart(2, '0'); const yyyy = dt.getFullYear(); return `${dd}/${mm}/${yyyy}`; };
    const dateFormatted = fmtDate(paymentDate);
    const typeLabel = isReceipt ? "سند قبض" : "سند صرف";
    const typeBadgeEn = isReceipt ? "Receipt Voucher" : "Payment Voucher";

    const amountInWords = `${Math.floor(amt)} ${currencyLabel}${amt % 1 > 0 ? ` و ${Math.round((amt % 1) * 100)} أغورة` : ""} فقط`;

    const categoryLabel = !isReceipt && partyType === "employee" && empCategory ? empCategory : "";

    // ملاحظة: لا نطبع تفاصيل الفواتير المرتبطة داخل السند — السند مستند مستقل
    // وعرض الفواتير داخله يربك القارئ. نكتفي بسطر واحد يلخّص قيمة السند.
    const depositLabel = paymentMethod === "شيك" && selectedChequeBankAccount
      ? (bankAccounts.find(b => b.id === selectedChequeBankAccount)?.name || "دفتر الشيكات")
      : depositType === "cash_box"
      ? (cashBoxes.find(c => c.id === selectedCashBox)?.name || "الصندوق")
      : (bankAccounts.find(b => b.id === selectedBankAccount)?.name || "البنك");

    const info: { label: string; value: string }[] = [
      { label: isReceipt ? "استلمنا من" : "صرفنا إلى", value: partyName || "—" },
      { label: "طريقة الدفع", value: paymentMethod },
      { label: paymentMethod === "شيك" ? "البنك" : (isReceipt ? "إيداع في" : "صرف من"), value: depositLabel },
      { label: "العملة", value: currencyLabel },
    ];
    if (categoryLabel) info.push({ label: "البند", value: categoryLabel });
    if (currency !== "ILS") {
      info.push({ label: "سعر الصرف", value: String(exchangeRate) });
      info.push({ label: "ما يعادله بالشيكل", value: `₪${fmtAmt(amountInILS)}` });
    }

    const tables: any[] = [];

    // سطر واحد فقط يمثل قيمة السند نفسه (لا نعرض الفواتير المرتبطة)
    const linkedRows = [[
      dateFormatted,
      savedReceiptNumber || refNumber || "—",
      notes || (categoryLabel ? `${categoryLabel} - ${partyName}` : typeLabel),
      typeLabel,
      isReceipt ? "" : `${currencySymbol}${fmtAmt(amt)}`,
      isReceipt ? `${currencySymbol}${fmtAmt(amt)}` : "",
    ]];

    tables.push({
      columns: [
        { label: "التاريخ", align: "right" },
        { label: "رقم المستند", align: "right" },
        { label: "البيان", align: "right" },
        { label: "النوع", align: "right" },
        { label: "مدين", align: "left", width: "110px" },
        { label: "دائن", align: "left", width: "110px" },
      ],
      rows: linkedRows,
    });

    // Cheques table (if any)
    if (paymentMethod === "شيك" && cheques.length > 0) {
      tables.push({
        caption: `بيانات الشيكات (${cheques.length})`,
        columns: [
          { label: "#", align: "center", width: "32px" },
          { label: "رقم الشيك", align: "right" },
          { label: "تاريخ الاستحقاق", align: "right" },
          { label: "البنك", align: "right" },
          { label: "المبلغ", align: "left", width: "120px" },
        ],
        rows: cheques.map((c, i) => [
          String(i + 1),
          c.number || "—",
          c.date ? fmtDate(c.date) : "—",
          c.bank || "—",
          `${currencySymbol}${fmtAmt(Number(c.amount) || 0)}`,
        ]),
      });
    }

    openOfficialVoucherWindow({
      docTypeLabel: typeLabel,
      docTypeLabelEn: typeBadgeEn,
      refNumber: savedReceiptNumber || refNumber || "",
      date: dateFormatted,
      company: {
        name: settings.company_name || "AMWALI",
        logoUrl: settings.logo_url || undefined,
        address: settings.address || undefined,
        phone: settings.phone || undefined,
        email: settings.email || undefined,
        taxNumber: settings.tax_number || undefined,
      },
      logoLayout: ((settings as any).invoice_header_layout === "logo_center" ? "logo_center" : "logo_center") as any,
      logoSize: (((settings as any).invoice_logo_size as any) || "large"),
      balanceBox: (((settings as any).voucher_show_balance_box !== false) && partyType === "contact" && selectedContact)
        ? (() => {
            const before = (computedBalance ?? selectedContact.ledger_balance ?? selectedContact.current_balance ?? 0)
              + (isEditMode ? (isReceipt ? originalAmount : -originalAmount) : 0);
            const delta = isReceipt ? -amt : amt;
            const after = before + delta;
            const sign = (n: number) => n > 0 ? "مدين" : n < 0 ? "دائن" : "متوازن";
            return {
              partyName: selectedContact.contact_name,
              beforeLabel: "الرصيد السابق",
              beforeValue: `${currencySymbol}${fmtAmt(Math.abs(before))}`,
              beforeNature: sign(before),
              afterLabel: "الرصيد الحالي",
              afterValue: `${currencySymbol}${fmtAmt(Math.abs(after))}`,
              afterNature: sign(after),
              movementLabel: isReceipt ? "قيمة سند القبض" : "قيمة سند الصرف",
              movementValue: `${currencySymbol}${fmtAmt(amt)}`,
              movementSign: isReceipt ? "-" : "+",
            };
          })()
        : undefined,
      info,
      tables,
      totals: (() => {
        const t: { label: string; value: string; warn?: boolean }[] = [
          { label: amountLabel, value: `${currencySymbol}${fmtAmt(amt)}` },
          { label: "المبلغ بالكلمات", value: amountInWords },
        ];
        return t;
      })(),
      notes: notes || undefined,
      signatures: [
        { label: "المحاسب" },
        { label: "المدير المالي" },
        { label: isReceipt ? "المستلم" : "المستفيد" },
      ],
      watermark: isCancelled ? "ملغي" : undefined,
    });
  };
  handlePrintRef.current = handlePrint;

  const formatAmount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const getInvSymbol = (inv: Invoice) => {
    const c = inv.currency || "شيكل";
    if (c === "دولار" || c === "USD") return "$";
    if (c === "دينار" || c === "JOD") return "د.أ";
    if (c === "يورو" || c === "EUR") return "€";
    return "₪";
  };

  if (editLoading) {
    return (
      <div className="flex items-center justify-center py-20" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">جاري تحميل بيانات السند...</p>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="max-w-2xl mx-auto space-y-6" dir="rtl">
        <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">تم حفظ {voucherLabel} بنجاح</h2>
          <p className="text-muted-foreground">رقم السند: <span className="font-mono font-bold text-foreground">{savedReceiptNumber}</span></p>
          {currency !== "ILS" && (
            <p className="text-xs text-muted-foreground">المبلغ بالشيكل: ₪{formatAmount(amountInILS)} (سعر الصرف: {exchangeRate})</p>
          )}
          <div className="flex items-center justify-center gap-3 pt-4">
            <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-all">
              <Printer className="h-4 w-4" /> طباعة الإيصال
            </button>
            <button onClick={() => navigate(listPath)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all">
              العودة للسندات
            </button>
            <button onClick={() => { setSaved(false); setAmount(""); setNotes(""); setSelectedContact(null); setSelectedGlAccount(null); setInvoices([]); setCheques([]); setEndorsedCheques([]); setCurrency("ILS"); setExchangeRate(1); regenerateRefNumber(); }} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-foreground text-sm hover:bg-secondary/50 transition-all">
              {isReceipt ? "سند قبض جديد" : "سند صرف جديد"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleNewSimilar = () => {
    const draftData = {
      _sourceRef: refNumber || savedReceiptNumber,
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod,
      amount: "", // reset amount
      currency,
      exchangeRate,
      notes,
      depositType,
      selectedCashBox,
      selectedBankAccount,
      contactId: selectedContact?.id || "",
      partyType,
      selectedGlAccountCode: selectedGlAccount?.account_code || "",
      selectedEmployeeId: selectedEmployee?.id || "",
    };
    localStorage.setItem(`draft_${voucherType}_new`, JSON.stringify(draftData));
    const path = isReceipt ? "/finance/receipt/new?from_duplicate=true" : "/finance/payment/new?from_duplicate=true";
    navigate(path);
    toast.success("تم نسخ بيانات السند — أدخل المبلغ وارتبط بالفواتير");
  };

  const handleCancelVoucher = async (reason: string, details: string) => {
    if (!user || !editId) return;
    try {
      const table = isReceipt ? "receipt_vouchers" : "vouchers";

      // 1. Reverse invoice paid amounts
      const { data: links } = await supabase
        .from("payment_invoice_links" as any)
        .select("invoice_id, allocated_amount")
        .eq("payment_id", editId);

      if (links && links.length > 0) {
        for (const link of links as any[]) {
          const { data: inv } = await supabase
            .from("invoices")
            .select("paid_amount, total_amount")
            .eq("id", link.invoice_id)
            .maybeSingle();
          if (inv) {
            const newPaid = Math.max(0, (inv.paid_amount || 0) - (link.allocated_amount || 0));
            const newRemaining = inv.total_amount - newPaid;
            await supabase.from("invoices").update({
              paid_amount: newPaid,
              remaining_amount: newRemaining,
              payment_status: newPaid <= 0 ? "unpaid" : "partial",
            }).eq("id", link.invoice_id);
          }
        }
        await supabase.from("payment_invoice_links" as any)
          .delete()
          .eq("payment_id", editId);
      }

      // 2. Cancel the voucher — DB trigger cascades to linked transaction
      const cancelReason = reason + (details ? ` — ${details}` : "");
      const { error } = await supabase
        .from(table as any)
        .update({ status: "cancelled" } as any)
        .eq("id", editId);
      if (error) throw error;

      // 3. Audit trail
      await supabase.from("document_edit_history" as any).insert({
        document_id: editId,
        document_type: isReceipt ? "receipt" : "payment",
        old_data: { ref_number: refNumber, amount: amountNum, contact_name: selectedContact?.contact_name },
        edit_reason: cancelReason,
        edited_by: user.id,
        user_id: ownerId,
        changes: { action: "cancel", reason: cancelReason },
      } as any);

      setEditVoucherStatus("cancelled");
      setShowCancelModal(false);
      broadcastChange(isReceipt ? "receipt_voucher" : "payment_voucher", "deleted", editId);

      // B3.4: remove the sub-ledger mirror so cancelled vouchers do not
      // skew Payroll Preview / Employee 360 totals.
      await supabase
        .from("employee_financial_movements")
        .delete()
        .eq("source_id", editId)
        .eq("source_type", "finance_manual");

      toast.success(`تم إلغاء ${voucherLabel} بنجاح وعكس القيود المرتبطة ✅`);
    } catch (err: any) {
      toast.error(err.message || "فشل إلغاء السند");
    }
  };

  const costCenterInline = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={costCenterId || selectedWorkshop ? "تم اختيار مركز تكلفة — انقر للتعديل" : "مركز التكلفة / الفرع"}
          data-testid={isReceipt ? "receipt-cost-center-icon-inline" : "payment-cost-center-icon-inline"}
          className={`relative h-11 w-11 shrink-0 flex items-center justify-center rounded-lg border transition-colors ${
            costCenterId || selectedWorkshop
              ? "bg-primary/10 border-primary/50 text-primary"
              : "bg-background border-border/40 text-muted-foreground hover:bg-primary/5 hover:border-primary/50"
          }`}
        >
          <Tag className="h-4 w-4" />
          {(costCenterId || selectedWorkshop) && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        <div data-testid={isReceipt ? "receipt-cost-center" : "payment-cost-center"}>
          <Label className="text-[11px] mb-1.5 block text-muted-foreground">مركز التكلفة / الفرع</Label>
          <CostCenterCombobox value={costCenterId} onChange={setCostCenterId} />
        </div>
        {workshopList.length > 0 && (
          <div className="relative" ref={workshopDropdownRef}>
            <Label className="text-[11px] mb-1.5 block text-muted-foreground">الورشة</Label>
            {selectedWorkshop ? (
              <div className="flex items-center gap-2 h-10 px-2.5 rounded-md border border-border/50 bg-card">
                <span style={{ background: "#E8F5E9", color: "#2E7D32", padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                  🏗️ {selectedWorkshop.name} {selectedWorkshop.customer_name ? `(${selectedWorkshop.customer_name})` : ""}
                </span>
                <button onClick={() => setSelectedWorkshop(null)} className="mr-auto p-1 rounded hover:bg-secondary/80">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Wrench className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={workshopSearch}
                  onChange={e => { setWorkshopSearch(e.target.value); setShowWorkshopDropdown(true); }}
                  onFocus={() => setShowWorkshopDropdown(true)}
                  placeholder="ابحث عن ورشة..."
                  className="pr-9 h-10"
                />
              </div>
            )}
            {showWorkshopDropdown && !selectedWorkshop && (
              <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {workshopList
                  .filter(ws => !workshopSearch || multiWordMatchAny(workshopSearch, ws.name, ws.customer_name || ""))
                  .map(ws => (
                    <button key={ws.id} onClick={() => { setSelectedWorkshop(ws); setWorkshopSearch(""); setShowWorkshopDropdown(false); }}
                      className="w-full text-right px-3 py-2 hover:bg-secondary/60 text-xs flex items-center justify-between gap-2 transition-colors">
                      <span className="text-muted-foreground text-[10px]">{ws.status === "active" ? "نشطة" : "مكتملة"}</span>
                      <span className="font-medium text-foreground">{ws.name} {ws.customer_name ? <span className="text-muted-foreground">({ws.customer_name})</span> : ""}</span>
                    </button>
                  ))}
                {workshopList.filter(ws => !workshopSearch || multiWordMatchAny(workshopSearch, ws.name, ws.customer_name || "")).length === 0 && (
                  <div className="p-3 text-center text-xs text-muted-foreground">لا توجد ورشات</div>
                )}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  const formBody = (
    <SmartFormScope
      className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 pb-8"
      firstFieldSelector="[data-smart-first]"
      disableAutoFocus={isEditMode}
    >
    {/* ═══════════════════════════════════════════════════════════════
        PROFESSIONAL VOUCHER LAYOUT — 12-column grid (RTL)
        ───────────────────────────────────────────────────────────────
        Top    : [Voucher Form  col-span-8] [Sticky Summary col-span-4]
        Middle : [Payment Card                              col-span-12]
        Bottom : [Notes col-span-8]               [Attachments col-span-4]
        Footer : Sticky action bar
        ═══════════════════════════════════════════════════════════════ */}
    <div dir="rtl" className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
      {/* ───── TOP-RIGHT (RTL right): Voucher Form — 8 cols ───── */}
      <div className="lg:col-span-8 space-y-3 min-w-0">
      {/* Duplicate Banner */}
      {duplicateSourceRef && <DuplicateBanner sourceRef={duplicateSourceRef} />}

      {/* Auto-Draft Restore Banner */}
      {hasDraft && (
        <DraftRestoreBanner
          onRestore={restoreDraft}
          onDismiss={clearDraft}
          savedAt={draftSavedAt}
          label={`يوجد مسودة محفوظة لـ ${voucherLabel}`}
        />
      )}

      {/* Cancelled Banner */}
      {isCancelled && (
        <div style={{
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '4px',
          direction: 'rtl',
          fontFamily: 'Cairo, sans-serif',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '20px' }}>🚫</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626', fontFamily: 'Cairo' }}>
              تم إلغاء هذا السند
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#991B1B', fontFamily: 'Cairo', lineHeight: 1.8 }}>
            لا يمكن تعديل سند ملغي — يمكنك إنشاء سند جديد مشابه
          </div>
        </div>
      )}

      {/* Header + old toolbar — hidden for receipts and payments
          (FinanceShell + ActionPane own this for both). */}
      {!useFinanceShell && <>
      <PageHeader
        title={pageTitle}
        breadcrumb={["المالية", isReceipt ? "سندات القبض" : "سندات الصرف", pageTitle]}
      />

      {/* Mobile Summary Bar (collapsible — lg: hidden) */}
      <MobileSummaryBar
        variant={voucherType}
        currencySymbol={currencySymbol}
        amount={amountNum}
        partyName={
          partyType === "contact" ? selectedContact?.contact_name :
          partyType === "employee" ? selectedEmployee?.full_name :
          partyType === "account" ? selectedGlAccount?.account_name :
          null
        }
        partyType={partyType}
        balanceBefore={
          partyType === "contact"
            ? ((computedBalance ?? selectedContact?.ledger_balance ?? selectedContact?.current_balance ?? 0)
                + (isEditMode ? (isReceipt ? originalAmount : -originalAmount) : 0))
            : null
        }
        openInvoicesCount={partyType === "contact" ? openInvoiceCount : 0}
        openInvoicesTotal={partyType === "contact" ? Number(selectedContact?.open_invoices_balance ?? 0) : 0}
        unappliedCredit={partyType === "contact" ? Number(selectedContact?.unapplied_credit ?? 0) : 0}
        oldestInvoiceDays={oldestInvoiceDays}
        paymentMethod={paymentMethod}
        chequesTotal={cheques.reduce((s, c) => s + (Number(c.amount) || 0), 0)}
        chequesCount={cheques.length}
        allocatedTotal={totalAllocated}
        date={paymentDate}
        refNumber={isEditMode ? refNumber : (savedReceiptNumber || refNumber || undefined)}
        onOpenStatement={
          partyType === "contact" && selectedContact?.id
            ? () => window.open(`/account-statement?contact_id=${selectedContact.id}`, "_blank")
            : undefined
        }
      />

      {/* Navigation Toolbar + Cancel Button */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1">
          <VoucherNavToolbar
            voucherType={voucherType}
            currentRef={isEditMode ? refNumber : (savedReceiptNumber || refNumber || undefined)}
            onPrint={handlePrint}
            onNewSimilar={(isEditMode || saved) ? handleNewSimilar : undefined}
            showNavigation={isEditMode || saved}
            onSaveDraft={!isEditMode && !isCancelled ? () => handleSave(true) : undefined}
            onSavePost={!isCancelled ? () => handleSave(false) : undefined}
            savePostLabel={isEditMode ? "تحديث السند" : "حفظ وترحيل"}
            saving={saving}
            saveDraftDisabled={saving}
            savePostDisabled={
              saving ||
              amountNum <= 0 ||
              (partyType === "contact" && !selectedContact) ||
              (partyType === "employee" && !selectedEmployee) ||
              (partyType === "account" && !selectedGlAccount)
            }
            savePostDisabledReason={
              amountNum <= 0
                ? "أدخل المبلغ أولاً"
                : (partyType === "contact" && !selectedContact)
                ? "اختر العميل/المورد أولاً"
                : (partyType === "employee" && !selectedEmployee)
                ? "اختر الموظف أولاً"
                : (partyType === "account" && !selectedGlAccount)
                ? "اختر الحساب أولاً"
                : undefined
            }
          />
        </div>
        {isEditMode && !isCancelled && editVoucherStatus === "posted" && (
          <button
            onClick={() => setShowCancelModal(true)}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: '1.5px solid #FCA5A5',
              background: 'white',
              color: '#DC2626',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'Cairo',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#DC2626';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'white';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#FCA5A5';
            }}
          >
            🚫 إلغاء السند
          </button>
        )}
      </div>
      </>}

      {/* Phase 5J — cross-link panel (edit mode only) */}
      {isEditMode && refNumber && (
        <RelatedJournalPanel voucherNumber={refNumber} />
      )}

      {/* Row 1: Basic Info */}
      <Card className="border-2 border-border shadow-md bg-card">
        <CardContent className="p-3 space-y-2.5">
          {/* Party Type Toggle */}
          <div>
            <Label className="text-xs mb-1.5 block">نوع الجهة</Label>
            <div className="flex gap-1.5">
              <button onClick={() => { setPartyType("contact"); setSelectedEmployee(null); setSelectedGlAccount(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 p-2 rounded-lg text-[11px] transition-all border ${partyType === "contact" ? "bg-primary/10 border-primary/40 text-primary font-bold" : "bg-secondary/50 border-border/30 text-muted-foreground hover:bg-secondary"}`}>
                <Users className="h-4 w-4" /> {isReceipt ? "زبون / جهة" : "مورد / جهة"}
              </button>
              {!isReceipt && (
                <button onClick={() => { setPartyType("employee"); setSelectedContact(null); setSelectedGlAccount(null); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 p-2 rounded-lg text-[11px] transition-all border ${partyType === "employee" ? "bg-primary/10 border-primary/40 text-primary font-bold" : "bg-secondary/50 border-border/30 text-muted-foreground hover:bg-secondary"}`}>
                  <UserCheck className="h-4 w-4" /> موظف
                </button>
              )}
              <button onClick={() => { setPartyType("account"); setSelectedContact(null); setSelectedEmployee(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 p-2 rounded-lg text-[11px] transition-all border ${partyType === "account" ? "bg-primary/10 border-primary/40 text-primary font-bold" : "bg-secondary/50 border-border/30 text-muted-foreground hover:bg-secondary"}`}>
                <BookOpen className="h-4 w-4" /> حسابات
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {useFinanceShell && (
              <div>
                <Label className="text-xs mb-1.5 block">رقم السند</Label>
                <Input
                  type="text"
                  readOnly
                  value={savedReceiptNumber || refNumber || ""}
                  placeholder="يُولَّد عند الحفظ"
                  data-testid={isReceipt ? "receipt-voucher-number" : "payment-voucher-number"}
                  className="font-mono font-bold tracking-wide bg-muted/40 cursor-default"
                />
              </div>
            )}
            <div>
              <Label className="text-xs mb-1.5 block">التاريخ</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} autoFocus data-smart-first="true" />
            </div>

            {/* Contact Search */}
            {partyType === "contact" && (
              <div className="relative" ref={contactDropdownRef}>
                <Label className="text-xs mb-1.5 block">{contactLabel}</Label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={selectedContact ? selectedContact.contact_name : contactSearch}
                    onChange={e => { setContactSearch(e.target.value); setSelectedContact(null); setShowContactDropdown(true); }}
                    onFocus={() => setShowContactDropdown(true)}
                    onKeyDown={e => {
                      // Bug #5: ArrowDown moves focus into the dropdown list
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setShowContactDropdown(true);
                        setTimeout(() => {
                          const first = contactDropdownRef.current?.querySelector<HTMLButtonElement>(
                            "div[class*='absolute'] button"
                          );
                          first?.focus();
                        }, 30);
                        return;
                      }
                      // Bug #6: Enter when single match → auto-select and jump to amount
                      if (e.key === "Enter") {
                        if (!selectedContact && filteredContacts.length === 1) {
                          e.preventDefault();
                          const only = filteredContacts[0];
                          setSelectedContact(only);
                          setContactSearch("");
                          setShowContactDropdown(false);
                          focusAmountField();
                          return;
                        }
                        setShowContactDropdown(false);
                      }
                    }}
                    placeholder={contactPlaceholder}
                    className="pr-9"
                  />
                  {(selectedContact || contactSearch) && (
                    <button onClick={() => { setSelectedContact(null); setContactSearch(""); setShowContactDropdown(false); }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {showContactDropdown && !selectedContact && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {contactSearch.trim().length >= 2 &&
                      !filteredContacts.some(c => c.contact_name.trim() === contactSearch.trim()) && (
                        <button
                          type="button"
                          disabled={creatingContact}
                          onMouseDown={(e) => { e.preventDefault(); handleQuickAddContactFromSearch(); }}
                          className="w-full text-right px-4 py-2.5 text-sm flex items-center gap-2 text-primary font-semibold border-b border-border hover:bg-primary/5 disabled:opacity-60"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {creatingContact
                            ? "جاري الإضافة..."
                            : `+ إضافة "${contactSearch.trim()}" كـ${isReceipt ? "زبون" : "مورد"} جديد`}
                        </button>
                      )}
                    {filteredContacts.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedContact(c); setContactSearch(""); setShowContactDropdown(false); focusAmountField(); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            setSelectedContact(c); setContactSearch(""); setShowContactDropdown(false); focusAmountField();
                          } else if (e.key === "ArrowDown") {
                            e.preventDefault();
                            (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.focus();
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            (e.currentTarget.previousElementSibling as HTMLButtonElement | null)?.focus();
                          }
                        }}
                        className="w-full text-right px-4 py-2.5 hover:bg-secondary focus:bg-secondary focus:outline-none transition-colors flex items-center justify-between">
                        <span className="text-sm">{c.contact_name}</span>
                        <span className="text-xs text-muted-foreground">دفتر: ₪{formatAmount(c.ledger_balance ?? c.current_balance ?? 0)} · مفتوح: ₪{formatAmount(c.open_invoices_balance ?? 0)}</span>
                      </button>
                    ))}
                    {filteredContacts.length === 0 && contactSearch.trim().length < 2 && (
                      <p className="text-center py-3 text-xs text-muted-foreground">ابدأ بكتابة اسم الجهة...</p>
                    )}
                    {filteredContacts.length === 0 && contactSearch.trim().length >= 2 && (
                      <p className="text-center py-2 text-xs text-muted-foreground">لا توجد نتائج — يمكنك إضافة جهة جديدة من الأعلى</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Employee Search */}
            {!isReceipt && partyType === "employee" && (
              <div className="relative" ref={employeeDropdownRef}>
                <Label className="text-xs mb-1.5 block">الموظف</Label>
                <div className="relative">
                  <UserCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={selectedEmployee ? selectedEmployee.full_name : employeeSearch}
                    onChange={e => { setEmployeeSearch(e.target.value); setSelectedEmployee(null); setShowEmployeeDropdown(true); }}
                    onFocus={() => setShowEmployeeDropdown(true)}
                    placeholder="ابحث عن موظف..."
                    className="pr-9"
                  />
                  {(selectedEmployee || employeeSearch) && (
                    <button onClick={() => { setSelectedEmployee(null); setEmployeeSearch(""); setShowEmployeeDropdown(false); }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {showEmployeeDropdown && !selectedEmployee && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredEmployees.map(emp => (
                      <button key={emp.id} onClick={() => { setSelectedEmployee(emp); setEmployeeSearch(""); setShowEmployeeDropdown(false); }}
                        className="w-full text-right px-4 py-2.5 hover:bg-secondary transition-colors flex items-center justify-between">
                        <span className="text-sm">{emp.full_name}</span>
                        <span className="text-xs text-muted-foreground">{emp.department || emp.job_title || ""}</span>
                      </button>
                    ))}
                    {filteredEmployees.length === 0 && <p className="text-center py-3 text-xs text-muted-foreground">لا توجد نتائج</p>}
                  </div>
                )}
              </div>
            )}

            {/* GL Account Search */}
            {partyType === "account" && (
              <div className="relative" ref={glAccountDropdownRef}>
                <Label className="text-xs mb-1.5 block">الحساب</Label>
                <div className="relative">
                  <BookOpen className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={selectedGlAccount ? `${selectedGlAccount.account_code} - ${selectedGlAccount.account_name}` : glAccountSearch}
                    onChange={e => { setGlAccountSearch(e.target.value); setSelectedGlAccount(null); setShowGlAccountDropdown(true); }}
                    onFocus={() => setShowGlAccountDropdown(true)}
                    placeholder="ابحث عن حساب بالاسم أو الرمز..."
                    className="pr-9"
                  />
                  {(selectedGlAccount || glAccountSearch) && (
                    <button onClick={() => { setSelectedGlAccount(null); setGlAccountSearch(""); setShowGlAccountDropdown(false); }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {showGlAccountDropdown && !selectedGlAccount && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {filteredGlAccounts.map(a => (
                      <button key={a.id} onClick={() => { setSelectedGlAccount(a); setGlAccountSearch(""); setShowGlAccountDropdown(false); }}
                        className="w-full text-right px-4 py-2.5 hover:bg-secondary transition-colors flex items-center justify-between">
                        <span className="text-sm"><span className="font-mono text-xs text-muted-foreground ml-2">{a.account_code}</span>{a.account_name}</span>
                        <span className="text-[10px] text-muted-foreground">{a.account_type}</span>
                      </button>
                    ))}
                    {filteredGlAccounts.length === 0 && <p className="text-center py-3 text-xs text-muted-foreground">لا توجد نتائج</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Amount, currency, payment method and payment account live in the upper card. */}
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-3">
              <Label className="text-xs mb-1.5 block font-bold text-foreground">{amountLabel}</Label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">{currencySymbol}</span>
                <Input
                  ref={amountInputRef}
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className={`pr-9 text-left font-mono text-xl font-bold h-12 border-2 bg-background transition-all ${highlightAmount ? "ring-4 ring-primary/60 ring-offset-2 ring-offset-background" : ""}`}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

              <div className={currency !== "ILS" ? "lg:col-span-2" : "lg:col-span-2"}>
              <Label className="text-xs mb-1.5 block">العملة</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-12 border-2 bg-background" data-testid={isReceipt ? "receipt-currency" : "payment-currency"}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.symbol} {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

              {currency !== "ILS" && (
                <div className="lg:col-span-2">
                  <Label className="text-xs mb-1.5 block flex items-center gap-1">
                    سعر الصرف
                    {fetchingRate && <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />}
                  </Label>
                  <Input
                    type="number"
                    value={exchangeRate}
                    onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)}
                    className="h-12 border-2 bg-background font-mono text-left"
                    step="0.001"
                    min="0"
                  />
                </div>
              )}

              <div className={currency !== "ILS" ? "lg:col-span-2" : "lg:col-span-3"}>
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <Label className="text-xs">طريقة الدفع</Label>
                {isReceipt && selectedContact && (
                  <Popover open={ordersPopoverOpen} onOpenChange={setOrdersPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        title="ربط بطلبية للزبون"
                        className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border transition-colors ${linkedOrderInfo ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 bg-background hover:bg-muted text-muted-foreground"}`}
                      >
                        <ShoppingCart className="h-3 w-3" strokeWidth={1.8} />
                        {linkedOrderInfo ? `طلبية ${linkedOrderInfo.order_number}` : "ربط بطلبية"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[380px] p-0" dir="rtl">
                      <div className="p-2 border-b flex items-center justify-between">
                        <span className="text-xs font-medium">طلبيات {selectedContact.contact_name}</span>
                        {linkedOrderInfo && (
                          <button
                            type="button"
                            className="text-[10px] text-destructive hover:underline"
                            onClick={() => { setLinkedOrderId(null); setLinkedOrderInfo(null); }}
                          >
                            إلغاء الربط
                          </button>
                        )}
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        {loadingCustomerOrders && (
                          <div className="p-3 text-xs text-muted-foreground text-center">جاري التحميل...</div>
                        )}
                        {!loadingCustomerOrders && customerOrders.length === 0 && (
                          <div className="p-4 text-xs text-muted-foreground text-center">لا توجد طلبيات لهذا الزبون</div>
                        )}
                        {!loadingCustomerOrders && customerOrders.map(o => {
                          const isSelected = o.id === linkedOrderId;
                          const fullyPaid = o.remaining <= 0.001;
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => {
                                setLinkedOrderId(o.id);
                                setLinkedOrderInfo({ id: o.id, order_number: o.order_number, total: o.total, remaining: o.remaining });
                                // Auto-fill amount with remaining if user hasn't typed anything yet
                                if (!amount && o.remaining > 0) setAmount(String(o.remaining));
                              // Stamp order reference into notes so the customer statement
                              // and OrdersPage (receipts-by-order aggregator) can find it.
                              const stamp = `دفعة على طلبية ${o.order_number}`;
                              setNotes(prev => (prev && prev.includes(o.order_number)) ? prev : (prev ? `${stamp} • ${prev}` : stamp));
                                setOrdersPopoverOpen(false);
                              }}
                              className={`w-full text-right px-3 py-2 border-b last:border-b-0 hover:bg-muted transition-colors ${isSelected ? "bg-primary/10" : ""}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold font-mono">{o.order_number}</span>
                                <span className="text-[10px] text-muted-foreground">{o.order_date || ""}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-1 text-[11px]">
                                <span>الإجمالي: <span className="font-mono">{o.total.toFixed(2)}</span></span>
                                <span className={fullyPaid ? "text-emerald-600" : "text-amber-600"}>
                                  المتبقي: <span className="font-mono">{o.remaining.toFixed(2)}</span>
                                </span>
                              </div>
                              {o.payment_status && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">{o.payment_status}</div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-12 border-2 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      <span className="flex items-center gap-2">
                        <m.icon className="h-4 w-4" strokeWidth={1.6} />
                        {m.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

              <div className={currency !== "ILS" ? "lg:col-span-3" : "lg:col-span-4"}>
              {paymentMethod === "شيك" ? (
                <>
                  {isReceipt ? (
                    <>
                      <Label className="text-xs mb-1.5 block">حساب الدفع</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 h-12 px-3 rounded-md border border-border/40 bg-background text-xs text-muted-foreground">
                          <ReceiptIcon className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium text-foreground">شيكات برسم التحصيل (1150)</span>
                          <span className="text-[10px]">— تلقائي</span>
                        </div>
                        {costCenterInline}
                      </div>
                    </>
                  ) : (
                    <>
                      <Label className="text-xs mb-1.5 block">حساب الدفع</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <Select value={selectedChequeBankAccount} onValueChange={setSelectedChequeBankAccount}>
                            <SelectTrigger className="h-12"><SelectValue placeholder="اختر الحساب البنكي" /></SelectTrigger>
                            <SelectContent>
                              {bankAccounts.map(ba => (
                                <SelectItem key={ba.id} value={ba.id}>
                                  {ba.name} - {ba.bank_name} {ba.currency ? `(${ba.currency})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {costCenterInline}
                      </div>
                    </>
                  )}
                </>
              ) : null}
              </div>
            </div>

            {/* Wider deposit row — for cash / mixed / transfer etc. Cash-box selector lives here to gain horizontal space. */}
            {paymentMethod !== "شيك" && (
              <div className="mt-3 pt-3 border-t border-border/40 grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-3 items-end">
                <div>
                  <Label className="text-xs mb-1.5 block">{isReceipt ? "إيداع في" : "الدفع من"}</Label>
                  {paymentMethod === "تحويل" ? (
                    <div className="flex items-center gap-1.5 h-11 px-3 rounded-lg border border-primary/40 bg-primary/10 text-primary text-[11px] font-bold">
                      <Building2 className="h-3.5 w-3.5" /> بنك (تحويل بنكي)
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setDepositType("cash_box")} className={`flex-1 text-[11px] h-11 rounded-lg border transition-all ${depositType === "cash_box" ? "bg-primary/10 border-primary/40 text-primary font-bold" : "bg-background border-border/40 text-muted-foreground"}`}>
                        صندوق
                      </button>
                      <button type="button" onClick={() => setDepositType("bank")} className={`flex-1 text-[11px] h-11 rounded-lg border transition-all ${depositType === "bank" ? "bg-primary/10 border-primary/40 text-primary font-bold" : "bg-background border-border/40 text-muted-foreground"}`}>
                        بنك
                      </button>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <Label className="text-xs mb-1.5 block">حساب الدفع</Label>
                  <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                  {depositType === "cash_box" ? (
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 min-w-0">
                        <Select value={selectedCashBox} onValueChange={setSelectedCashBox}>
                          <SelectTrigger className="h-11"><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                          <SelectContent>{cashBoxes.map(cb => <SelectItem key={cb.id} value={cb.id}>{cb.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {(() => {
                        const defaultKey = `voucher_default_cash_box_${ownerId}_${isReceipt ? "receipt" : "payment"}`;
                        const currentDefault = typeof window !== "undefined" ? localStorage.getItem(defaultKey) : null;
                        const isPinned = currentDefault && currentDefault === selectedCashBox;
                        return (
                          <button
                            type="button"
                            title={isPinned ? "إلغاء تعيين الصندوق الافتراضي" : "تعيين كصندوق افتراضي تلقائي"}
                            onClick={() => {
                              if (!selectedCashBox) { toast.error("اختر الصندوق أولاً"); return; }
                              if (isPinned) {
                                localStorage.removeItem(defaultKey);
                                toast.success("تم إلغاء الصندوق الافتراضي");
                              } else {
                                localStorage.setItem(defaultKey, selectedCashBox);
                                const cbName = cashBoxes.find(c => c.id === selectedCashBox)?.name || "";
                                toast.success(`تم تعيين "${cbName}" كصندوق افتراضي`);
                              }
                              setCashBoxes(prev => [...prev]);
                            }}
                            className={`h-10 w-10 flex items-center justify-center rounded-md border transition-all ${
                              isPinned
                                ? "bg-primary/15 border-primary/50 text-primary"
                                : "bg-secondary/40 border-border/40 text-muted-foreground hover:bg-secondary/70"
                            }`}
                          >
                            {isPinned ? <Pin className="h-4 w-4 fill-current" /> : <PinOff className="h-4 w-4" />}
                          </button>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="اختر البنك" /></SelectTrigger>
                        <SelectContent>{bankAccounts.map(ba => <SelectItem key={ba.id} value={ba.id}>{ba.name} - {ba.bank_name}</SelectItem>)}</SelectContent>
                      </Select>
                      {bankAccounts.length === 0 && (
                        <button
                          type="button"
                          onClick={() => navigate("/finance/bank-accounts?action=new")}
                          className="flex items-center gap-1.5 text-[10px] text-primary hover:underline font-medium"
                        >
                          <Plus className="h-3 w-3" /> تعريف حساب بنكي جديد
                        </button>
                      )}
                    </div>
                  )}
                  </div>
                  {costCenterInline}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Employee Transaction Category */}
          {!isReceipt && partyType === "employee" && selectedEmployee && (
            <div className="space-y-3">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                <span className="text-xs text-muted-foreground">الموظف: </span>
                <span className="text-sm font-bold text-foreground">{selectedEmployee.full_name}</span>
                {selectedEmployee.department && <span className="text-xs text-muted-foreground mr-2">({selectedEmployee.department})</span>}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <Label className="text-xs block">نوع العملية</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      شهر الخصم: <span className="font-bold text-foreground">{formatMonthLabel(deductionMonth || monthOf(paymentDate))}</span>
                    </span>
                    <DeductionMonthPicker
                      value={deductionMonth}
                      onChange={setDeductionMonth}
                      baseDate={paymentDate}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                  {EMP_TRANSACTION_CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    return (
                      <button key={cat.value} onClick={() => setEmpCategory(cat.value)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-md text-[10px] transition-colors border ${empCategory === cat.value ? "bg-primary/10 border-primary/40 text-primary font-semibold" : "bg-background border-border text-muted-foreground hover:bg-muted"}`}>
                        <Icon className="h-4 w-4" />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {empCategory === "أخرى" && (
                <div>
                  <Label className="text-xs mb-1.5 block">وصف العملية</Label>
                  <Input value={empCategoryCustom} onChange={e => setEmpCategoryCustom(e.target.value)} placeholder="أدخل وصف العملية..." />
                </div>
              )}

              {empCategory === "مخالفة" && (
                <div>
                  <Label className="text-xs mb-1.5 block">سبب المخالفة</Label>
                  <Input value={violationReason} onChange={e => setViolationReason(e.target.value)} placeholder="أدخل سبب المخالفة..." />
                </div>
              )}
            </div>
          )}

          {/* GL Account Info Badge */}
          {partyType === "account" && selectedGlAccount && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                📒 الحساب: <span className="font-bold text-foreground">{selectedGlAccount.account_code} - {selectedGlAccount.account_name}</span>
              </span>
              <span className="flex items-center gap-1.5">
                📁 النوع: <span className="font-bold text-foreground">{selectedGlAccount.account_type}</span>
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cost center + workshop moved to a compact icon-popover next to Attachments below. */}

      {/* ───── Payment + Allocation — flow continuously inside the
          col-span-8 left column so the sticky summary on the right
          always has content beside it (no more "floating" feel). */}

      {/* Row 2: Mixed-payment split + Cheque details */}
      {(paymentMethod === "شيك" || paymentMethod === "مختلط") && (
      <Card className="border-2 border-border shadow-md bg-card">
        <CardContent className="p-3 space-y-2.5">
          {paymentMethod === "مختلط" && (
            <div className="pt-2 border-t border-border/30 space-y-2">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Banknote className="h-3.5 w-3.5 text-primary" />
                توزيع المبلغ (نقدي + شيكات)
                <span className="ms-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-mono">
                  {currencySymbol} {currencyLabel}
                </span>
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                  <Label className="text-[11px] mb-1 block">المبلغ النقدي ({currencySymbol})</Label>
                  <div className="relative">
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{currencySymbol}</span>
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={mixedCashAmount}
                      onChange={(e) => setMixedCashAmount(e.target.value)}
                      placeholder="0.00"
                      className="text-left font-mono pr-7"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground bg-secondary/40 rounded-md px-3 py-2">
                  إجمالي الشيكات: <span className="font-bold text-foreground font-mono">
                    {currencySymbol}{cheques.reduce((s, c) => s + (Number(c.amount) || 0), 0).toFixed(2)}
                  </span>
                </div>
                <div className={`text-[11px] rounded-md px-3 py-2 font-mono ${
                  Math.abs((Number(mixedCashAmount) || 0) + cheques.reduce((s, c) => s + (Number(c.amount) || 0), 0) - amountNum) < 0.01
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-destructive/10 text-destructive"
                }`}>
                  المجموع: {currencySymbol}{((Number(mixedCashAmount) || 0) + cheques.reduce((s, c) => s + (Number(c.amount) || 0), 0)).toFixed(2)}
                  {" / "}{currencySymbol}{amountNum.toFixed(2)}
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground bg-muted/40 rounded-md px-2 py-1.5">
                جميع الشيكات والمبلغ النقدي بعملة السند: <span className="font-bold text-foreground">{currencyLabel} ({currencySymbol})</span>
              </div>
            </div>
          )}

          {/* Cheque details - Multi cheque (always visible, Hesabate-style) */}
          {(
            <div className="pt-3 border-t-2 border-border space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-xs font-bold flex items-center gap-1.5">
                  <ReceiptIcon className="h-3.5 w-3.5 text-primary" />
                  بيانات الشيكات ({cheques.length + endorsedCheques.length})
                  {paymentMethod !== "شيك" && paymentMethod !== "مختلط" && (
                    <span className="text-[10px] font-normal text-muted-foreground mr-1">
                      — غيّر طريقة الدفع إلى "شيك" أو "مختلط" لتفعيل الإدخال
                    </span>
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  {!isReceipt && (
                    <button type="button" onClick={() => setShowEndorseModal(true)} className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 transition-all font-medium border border-amber-200">
                      <ArrowLeftRight className="h-3 w-3" /> تجيير شيك مستلم
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (paymentMethod !== "شيك" && paymentMethod !== "مختلط") setPaymentMethod("شيك");
                      addCheque();
                    }}
                    className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all font-medium"
                  >
                    <Plus className="h-3 w-3" /> إضافة شيك
                  </button>
                </div>
              </div>

              {/* Endorsed cheques */}
              {endorsedCheques.map((ec, idx) => (
                <div key={`endorsed-${ec.id}`} className="relative bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                      <ArrowLeftRight className="h-2.5 w-2.5" /> مُجيَّر
                    </span>
                    <button type="button" onClick={() => setEndorsedCheques(prev => prev.filter(c => c.id !== ec.id))} className="p-1 rounded-lg hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-muted-foreground block">رقم الشيك</span>
                      <span className="font-mono font-medium">{ec.cheque_number || "-"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">البنك</span>
                      <span>{ec.bank_name || "-"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">الساحب</span>
                      <span className="font-medium">{ec.party_name}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">المبلغ</span>
                      <span className="font-mono font-bold text-amber-700">{ec.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    تاريخ الاستحقاق: {ec.cheque_date} | الحالة الأصلية: {ec.status}
                  </div>
                </div>
              ))}

              {cheques.length === 0 && endorsedCheques.length === 0 && (
                <div className="text-center py-4 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                  اضغط "إضافة شيك" لإدخال بيانات الشيك أو "تجيير شيك مستلم" لتحويل شيك موجود
                </div>
              )}
              {cheques.length > 0 && (
                <>
                  {/* Compact column header (RTL) */}
                  <div
                    className="hidden md:grid items-center gap-2 px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide"
                    style={{ gridTemplateColumns: "28px minmax(0,1.4fr) minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1.2fr) 36px 32px" }}
                  >
                    <span className="text-center">#</span>
                    <span>رقم الشيك</span>
                    <span>البنك</span>
                    <span>تاريخ الاستحقاق</span>
                    <span>المبلغ</span>
                    <span>رقم الحساب</span>
                    <span className="text-center">ملاحظات</span>
                    <span></span>
                  </div>
                  <div className="space-y-1.5">
                    {cheques.map((chq, idx) => (
                      <CompactChequeRow
                        key={idx}
                        index={idx}
                        cheque={chq as any}
                        isReceipt={isReceipt}
                        bankAccounts={bankAccounts as any}
                        onUpdate={updateCheque as any}
                        onRemove={removeCheque}
                        onEnterAdd={addChequeAndFocus}
                        autoFocusFirst={focusChequeIndex === idx}
                      />
                    ))}
                  </div>
                </>
              )}
              {cheques.length > 1 && (
                <div className="text-left text-xs font-mono font-bold text-primary pt-1">
                  إجمالي الشيكات: {CURRENCIES.find(c => c.value === currency)?.symbol || "₪"}{cheques.reduce((sum, c) => sum + (Number(c.amount) || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Invoice Linking Section */}
      {selectedContact && partyType === "contact" && settings.enable_voucher_invoice_link !== false && (
        <>
        {/* Quick-toggle: Payment on Account — sets mode to "advance" so amount stays as open credit */}
        <div className="flex items-center justify-between gap-2 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 px-3 py-2">
          <div className="text-[12px] text-foreground flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <span className="font-bold">دفعة على الحساب؟</span>
            <span className="text-muted-foreground">— احفظ المبلغ كرصيد مفتوح بدون ربطه بفاتورة.</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant={allocationMode === "advance" ? "default" : "outline"}
            onClick={() => setAllocationMode(allocationMode === "advance" ? "auto" : "advance")}
            className="h-7 text-[11px] gap-1"
          >
            {allocationMode === "advance" ? "✓ مفعّل" : "تفعيل"}
          </Button>
        </div>
        <SmartAllocationPanel
          voucherKind={voucherType}
          partyType={partyType}
          hasContact={!!selectedContact}
          invoices={invoices as any}
          amount={amountNum}
          currency={currency}
          exchangeRate={exchangeRate}
          currencySymbol={currencySymbol}
          mode={allocationMode}
          onModeChange={setAllocationMode}
          onToggle={toggleInvoice}
          onUpdateAllocation={updateAllocation}
          onAutoAllocate={selectAll}
          onClear={clearSelection}
          invoiceSearch={invoiceSearch}
          onInvoiceSearch={setInvoiceSearch}
        />
        </>
      )}

      {/* ───── COMPACT bottom bar: Notes + Attachments in ONE horizontal row ───── */}
      <Card className="border-2 border-[#CBD5E1] bg-white dark:bg-card shadow-sm">
        <CardContent className="p-2">
          <div className="flex items-stretch gap-2">
            {/* Notes — takes most width */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <Label className="text-[11px] font-bold text-foreground whitespace-nowrap shrink-0">ملاحظات</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={`ملاحظات تظهر في إيصال ${isReceipt ? "القبض" : "الصرف"}...`}
                rows={1}
                className="resize-none border border-[#CBD5E1] bg-white dark:bg-background text-xs px-2 py-1.5 min-h-[45px] h-[45px] leading-tight"
              />
            </div>

            {/* Divider */}
            <div className="w-px bg-[#CBD5E1] shrink-0" />

            {/* Attachments — compact */}
            <div className="flex items-center gap-2 shrink-0">
              <Paperclip className="h-4 w-4 text-primary" />
              <span className="text-[11px] font-bold text-foreground whitespace-nowrap">
                المرفقات ({attachments.length})
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border border-[#CBD5E1] bg-white dark:bg-background hover:bg-primary/5 hover:border-primary/50 transition-colors font-medium text-foreground"
              >
                <Plus className="h-3 w-3" /> إضافة
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                onChange={e => { if (e.target.files) handleFileUpload(e.target.files); e.target.value = ""; }}
              />
              {uploadingFile && <span className="text-[10px] text-primary animate-pulse">جاري الرفع...</span>}

            </div>
          </div>

          {/* Attached files list — only when files exist, kept ultra-compact */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[#CBD5E1]">
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-secondary/40 border border-border rounded-md px-2 py-1 text-[11px]">
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium text-foreground max-w-[160px] truncate">{att.name}</span>
                  <span className="text-muted-foreground">({(att.size / 1024).toFixed(0)}KB)</span>
                  <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ END LEFT COLUMN (col-span-8) ═══ */}
      </div>

      {/* ───── RIGHT (RTL left): Sticky Summary — 4 cols ─────
          Sits inside the master grid (NOT floating). Aligns to the
          top of the form and stays visible while scrolling. */}
      <aside className="hidden lg:block lg:col-span-4 lg:sticky lg:top-4 self-start w-full">
        <SmartSummaryPanel
          variant={voucherType}
          currencySymbol={currencySymbol}
          amount={amountNum}
          partyName={
            partyType === "contact" ? selectedContact?.contact_name :
            partyType === "employee" ? selectedEmployee?.full_name :
            partyType === "account" ? selectedGlAccount?.account_name :
            null
          }
          partyType={partyType}
          balanceBefore={
            partyType === "contact"
            ? ((computedBalance ?? selectedContact?.ledger_balance ?? selectedContact?.current_balance ?? 0)
                + (isEditMode ? (isReceipt ? originalAmount : -originalAmount) : 0))
              : null
          }
          openInvoicesCount={partyType === "contact" ? openInvoiceCount : 0}
          openInvoicesTotal={partyType === "contact" ? Number(selectedContact?.open_invoices_balance ?? 0) : 0}
          unappliedCredit={partyType === "contact" ? Number(selectedContact?.unapplied_credit ?? 0) : 0}
          oldestInvoiceDays={oldestInvoiceDays}
          paymentMethod={paymentMethod}
          chequesTotal={cheques.reduce((s, c) => s + (Number(c.amount) || 0), 0)}
          chequesCount={cheques.length}
          allocatedTotal={totalAllocated}
          date={paymentDate}
          refNumber={isEditMode ? refNumber : (savedReceiptNumber || refNumber || undefined)}
          onOpenStatement={
            partyType === "contact" && selectedContact?.id
              ? () => window.open(`/account-statement?contact_id=${selectedContact.id}`, "_blank")
              : undefined
          }
        />
      </aside>

      {/* ═══ END MASTER GRID ═══ */}
      </div>

      {/* ═══ Sticky Bottom Action Bar — hidden for receipts & payments
          (ActionPane owns this for both). */}
      {!useFinanceShell && !isCancelled && (
        <div className="sticky bottom-0 -mx-4 lg:-mx-6 mt-5 px-4 lg:px-6 py-3 bg-background/95 backdrop-blur-md border-t border-border/60 z-40">
          <div className="max-w-[1600px] mx-auto flex items-center gap-2 flex-wrap">
            {/* Ghost: Print */}
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 h-11 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
              <Printer className="h-4 w-4" /> طباعة
            </button>

            {/* Secondary: Draft (only in create mode) */}
            {!isEditMode && (
              <button onClick={() => handleSave(true)} disabled={saving}
                className="px-4 h-11 rounded-xl border border-border text-foreground text-sm hover:bg-secondary/50 transition-all disabled:opacity-50">
                حفظ كمسودة
              </button>
            )}

            {/* PRIMARY — full-flex, dominant */}
            <button onClick={() => handleSave(false)}
              disabled={saving || amountNum <= 0 || (partyType === "contact" && !selectedContact) || (partyType === "employee" && !selectedEmployee) || (partyType === "account" && !selectedGlAccount)}
              className="flex-1 min-w-[220px] flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-primary/25">
              <Save className="h-4 w-4" />
              {saving ? "جارٍ الحفظ..." : isEditMode ? "تحديث السند" : "حفظ وترحيل"}
            </button>
          </div>
        </div>
      )}

      {/* Cancelled — only show print, full width */}
      {!useFinanceShell && isCancelled && (
        <div className="sticky bottom-0 -mx-4 lg:-mx-6 mt-5 px-4 lg:px-6 py-3 bg-background/95 backdrop-blur-md border-t border-border/60 z-40 flex items-center justify-center">
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-5 h-11 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
            <Printer className="h-4 w-4" /> طباعة (ملغي)
          </button>
        </div>
      )}

      {/* Cancel Modal */}
      <VoucherCancelModal
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleCancelVoucher}
        voucherRef={refNumber}
        voucherType={voucherType}
        contactName={selectedContact?.contact_name || selectedGlAccount?.account_name || selectedEmployee?.full_name || ""}
        amount={amountNum}
        date={paymentDate}
        paymentMethod={paymentMethod}
        currencySymbol={currencySymbol}
      />

      {/* Endorse Cheque Modal */}
      <EndorseChequeModal
        open={showEndorseModal}
        onClose={() => setShowEndorseModal(false)}
        preferCurrency={currency}
        onSelect={(ec) => {
          setEndorsedCheques(prev => [...prev, ec]);
          // Auto-update amount to include endorsed cheque
          const currentTotal = (parseFloat(amount) || 0) + ec.amount;
          setAmount(String(currentTotal));
          toast.success(`تم اختيار شيك رقم ${ec.cheque_number || "-"} للتجيير (${ec.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })})`);
        }}
        excludeIds={endorsedCheques.map(c => c.id)}
      />
    </SmartFormScope>
  );

  if (useFinanceShell) {
    const listLabel = isReceipt ? "سندات القبض" : "سندات الصرف";
    const listHref = isReceipt ? "/finance/receipts" : "/finance/payments";
    const bannerTestId = isReceipt ? "receipt-view-banner" : "payment-view-banner";
    return (
      <FinanceShell
        title={pageTitle}
        subtitle={pageDesc}
        breadcrumb={[
          { label: "المالية", href: "/accounting-center" },
          { label: listLabel, href: listHref },
          { label: pageTitle },
        ]}
        actionTabs={voucherActionTabs}
        compact
      >
        {isEditMode && (
          <div className={`mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border ${isReadOnly ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"}`} data-testid={bannerTestId}>
            <div className="flex items-center gap-2 text-xs font-semibold">
              {isReadOnly ? <Lock className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              <span>
                {isReadOnly
                  ? `وضع العرض — السند ${refNumber}. اضغط "تعديل" للتعديل أو "إنشاء مشابه" لنسخه.`
                  : `وضع التعديل — السند ${refNumber}. اضغط "حفظ التعديلات" لحفظ التغييرات.`}
              </span>
            </div>
          </div>
        )}
        <fieldset disabled={isEditMode && isReadOnly} className="contents min-w-0">
          {formBody}
        </fieldset>
      </FinanceShell>
    );
  }

  return formBody;
};

export default VoucherFormPage;
