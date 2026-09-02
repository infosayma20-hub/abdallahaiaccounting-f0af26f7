import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import DuplicateBanner from "@/components/DuplicateBanner";
import {
  Loader2, Plus, FileText, Trash2, Save, Eye, AlertTriangle, CheckCircle,
  Pencil, Lock, Copy, Printer, ChevronRight, ChevronLeft, ListChecks, Calculator,
  CreditCard, Building2, Banknote, Clock, Search, Package, Receipt,
  ShoppingCart, Send, Percent, Hash, ChevronDown, MessageSquare, Paperclip,
  Upload, X, ExternalLink, FileCheck, ChevronUp, TriangleAlert, MoreHorizontal, Tag, Warehouse, Wallet
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FinanceShell, ActionPane, type ActionTab } from "@/components/finance/shell";
import { CompactActionRibbon } from "@/components/finance/shell/CompactActionRibbon";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { isInvoicesRpcEnabled, callCreateInvoiceLedgerRpc } from "@/lib/invoice-rpc";
import { callCreateReceiptRpc, callCreatePaymentRpc } from "@/lib/voucher-rpc";
import { useCompany } from "@/hooks/useCompanyContext";
import InvoicePrintView from "@/components/InvoicePrintView";
import CreateWarrantyCardsDialog from "@/components/warranty/CreateWarrantyCardsDialog";
import { Shield } from "lucide-react";
import { createRoot } from "react-dom/client";
import SmartFormScope from "@/components/forms/SmartFormScope";
import useFormDraft from "@/hooks/useFormDraft";
import DraftRestoreBanner from "@/components/forms/DraftRestoreBanner";
import useModalDraft from "@/hooks/useModalDraft";
import CustomerInsightsBar from "@/components/invoice/CustomerInsightsBar";
import TypedDateInput from "@/components/forms/TypedDateInput";
import useInvoiceKeyboard, { focusNextInvoiceCell } from "@/hooks/useInvoiceKeyboard";
import SmartSummaryPanel from "@/components/voucher/SmartSummaryPanel";
import InlineProductAutocomplete from "@/components/invoice/InlineProductAutocomplete";
import FabricSelect from "@/components/inventory/FabricSelect";
import InvoiceNumericInput from "@/components/invoice/InvoiceNumericInput";
import ProductSearchDialog from "@/components/invoice/ProductSearchDialog";
import DraftStatusBadge, { type DraftStatus } from "@/components/invoice/DraftStatusBadge";
import DraftsHistoryDialog from "@/components/invoice/DraftsHistoryDialog";
import AccountingShell from "@/components/layout/AccountingShell";
import { fetchManyContactStatementBalances, fetchContactStatementBalance } from "@/lib/contact-balance";
import { formatDbError } from "@/lib/db-error-toast";
import CostCenterCombobox from "@/components/cost-centers/CostCenterCombobox";
import { useTT } from "@/i18n/dict";
import useAccountingOutbox from "@/hooks/useAccountingOutbox";

// Lightweight in-memory cache for exchange rates to avoid re-fetching the
// same currency on every currency-select toggle. 5-minute TTL, per-tab.
const INVOICE_FX_TTL_MS = 5 * 60 * 1000;
const invoiceFxCache = new Map<string, { rate: number; ts: number }>();

// Wave 2 · tiny lookup caches (per owner, 2-minute TTL). These lists (warehouses,
// workshops) are read-only inside the invoice form and rarely change mid-session.
// TTL kept short so a newly-added warehouse/workshop appears quickly.
const INVOICE_LOOKUP_TTL_MS = 2 * 60 * 1000;
const warehousesCache = new Map<string, { data: any[]; ts: number }>();
const workshopsCache = new Map<string, { data: any[]; ts: number }>();

// ─── Types ───
type TaxCategory = "taxable" | "zero" | "exempt";

const TAX_CATEGORY_OPTIONS: { value: TaxCategory; label: string; rate: number }[] = [
  { value: "taxable", label: "خاضع للضريبة 16%", rate: 16 },
  { value: "zero", label: "بنسبة صفر 0%", rate: 0 },
  { value: "exempt", label: "معفى من الضريبة", rate: 0 },
];

interface InvoiceItem {
  id: string;
  productId?: string;
  description: string;
  quantity: number;
  bonusQuantity: number;
  unitPrice: number;
  discount: number;
  discountType: "percent" | "amount";
  taxRate: number;
  taxCategory: TaxCategory;
  unitOfMeasure: string;
  subtotal: number;
  workshopId?: string | null;
  /** خاصية القماش على مستوى البند (اختيارية) */
  fabric?: string | null;
}

interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
  phone?: string;
  email?: string;
  address?: string;
  payment_terms_days?: number;
  current_balance?: number;
  credit_limit?: number;
  tax_number?: string;
  sales_rep_id?: string;
  balance?: number;
}

interface SalesRep {
  id: string;
  name: string;
}

// ─── Helpers ───
const PAYMENT_TERMS: { value: string; label: string; days: number }[] = [
  { value: "immediate", label: "فوري", days: 0 },
  { value: "net_7", label: "صافي 7 أيام", days: 7 },
  { value: "net_15", label: "صافي 15 يوم", days: 15 },
  { value: "net_30", label: "صافي 30 يوم", days: 30 },
  { value: "net_45", label: "صافي 45 يوم", days: 45 },
  { value: "net_60", label: "صافي 60 يوم", days: 60 },
  { value: "net_90", label: "صافي 90 يوم", days: 90 },
  { value: "custom", label: "مخصص", days: -1 },
];

// Invoices are accrual-only (credit). Payment is recorded later via receipt/payment vouchers.
// The DB stores the Arabic label "آجل" for credit invoices.
const CREDIT_PAYMENT_METHOD_DB = "آجل" as const;

const createEmptyItem = (): InvoiceItem => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: 1,
  bonusQuantity: 0,
  unitPrice: 0,
  discount: 0,
  discountType: "percent",
  taxRate: 16,
  taxCategory: "taxable",
  unitOfMeasure: "قطعة",
  subtotal: 0,
  workshopId: null,
  fabric: null,
});

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};

const numberToArabicWords = (num: number): string => {
  if (num === 0) return "صفر";
  const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
  const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const teens = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

  const whole = Math.floor(num);
  const parts: string[] = [];

  if (whole >= 1000000) {
    const m = Math.floor(whole / 1000000);
    parts.push(m === 1 ? "مليون" : m === 2 ? "مليونان" : `${ones[m] || m} ملايين`);
  }
  const rem = whole % 1000000;
  if (rem >= 1000) {
    const t = Math.floor(rem / 1000);
    if (t === 1) parts.push("ألف");
    else if (t === 2) parts.push("ألفان");
    else if (t <= 10) parts.push(`${ones[t]} آلاف`);
    else parts.push(`${t} ألف`);
  }
  const h = whole % 1000;
  if (h >= 100) parts.push(hundreds[Math.floor(h / 100)]);
  const r = h % 100;
  if (r >= 10 && r <= 19) parts.push(teens[r - 10]);
  else {
    if (r % 10 > 0) parts.push(ones[r % 10]);
    if (Math.floor(r / 10) > 0) parts.push(tens[Math.floor(r / 10)]);
  }

  return parts.length > 0 ? `فقط ${parts.join(" و")} شيكل لا غير` : "صفر شيكل";
};

const CURRENCY_SYMBOLS: Record<string, string> = { "شيكل": "₪", "دولار": "$", "دينار": "د.ا", "يورو": "€" };

const fmtCurrencyStatic = (n: number) =>
  `₪${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getVisibleInvoiceInput = (selectors: string[]): HTMLInputElement | null => {
  const candidates = selectors.flatMap(selector =>
    Array.from(document.querySelectorAll<HTMLInputElement>(selector)),
  );

  return candidates.find(input => {
    if (!input.isConnected || input.disabled || input.readOnly) return false;
    const rect = input.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(input);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }) || null;
};

/** Focus any visible element matching one of the selectors (buttons, triggers…). */
const focusInvoiceElement = (selectors: string[]): boolean => {
  const el = selectors
    .flatMap(sel => Array.from(document.querySelectorAll<HTMLElement>(sel)))
    .find(node => {
      if (!node.isConnected || (node as HTMLButtonElement).disabled) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    });
  if (el) { el.focus(); return true; }
  return false;
};

const getNextInvoiceSequence = (rows: { invoice_number: string | null }[] | null | undefined, offset = 0) => {
  const maxUsed = (rows || []).reduce((max, row) => {
    const match = String(row.invoice_number || "").match(/-(\d+)$/);
    const value = match ? Number(match[1]) : 0;
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, offset);
  return Math.max(maxUsed + 1, offset + 1);
};

const isDuplicateInvoiceNumberError = (error: any) => {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return message.includes("duplicate key") && message.includes("idx_invoices_unique_number_per_user_type");
};

// ─── Component ───
const InvoiceCreatePage = () => {
  const tt = useTT();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;
  const { queueDocument: queueOfflineDocument } = useAccountingOutbox();
  const { company } = useCompany();
  const { toast } = useToast();
  const { settings: companySettings } = useCompanySettings();
  const taxEnabled = companySettings?.vat_enabled ?? true;
  /** حقل tt("القماش") على مستوى البند — مخصّص للحسابات التي تفعّله فقط (مثل معرض بيلونا) */
  const fabricAttributeEnabled = Boolean((companySettings as any)?.enable_line_fabric_attribute);

  const fromDuplicate = searchParams.get("from_duplicate") === "true";
  const editInvoiceId = searchParams.get("edit");
  const prefillContactId = searchParams.get("contact_id");
  const prefillContactName = searchParams.get("contact_name");
  const prefillAmount = searchParams.get("amount");
  const prefillNotes = searchParams.get("notes");
  const workshopId = searchParams.get("workshop_id");
  const prefillType = searchParams.get("type"); // "sales" or "purchase"
  const linkedOrderId = searchParams.get("order_id");
  const isEditMode = Boolean(editInvoiceId);
  const [duplicateSourceRef, setDuplicateSourceRef] = useState<string | null>(null);
  const [loadingEditInvoice, setLoadingEditInvoice] = useState(isEditMode);
  // Edit mode opens read-only by default; user toggles via "تعديل" button.
  const [isReadOnly, setIsReadOnly] = useState<boolean>(isEditMode);
  // Always-fresh handleCreate ref (memoized ActionPane handlers would
  // otherwise capture stale closures with empty form → false validation).
  const handleCreateRef = useRef<((asDraft?: boolean) => void) | null>(null);
  const handlePrintRef = useRef<((previewOnly?: boolean) => void) | null>(null);
  const originalInvoiceRef = useRef<{
    linkedTransactionId: string | null;
    contactId: string | null;
    remainingAmount: number;
    paidAmount: number;
    totalAmount: number;
    invoiceNumber: string | null;
    status: string | null;
  } | null>(null);
  // Snapshot of items at load time — used on edit-save to compute stock delta
  // and avoid duplicating stock_movements when a line quantity changes.
  const originalItemsRef = useRef<Array<{ productId: string; quantity: number }>>([]);

  // Data
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; is_default: boolean | null }[]>([]);
  const [warehouseStock, setWarehouseStock] = useState<Record<string, number>>({});
  // Which warehouse the loaded stock map belongs to (guards against filtering while loading).
  const [stockWarehouseId, setStockWarehouseId] = useState<string | null>(null);
  const [workshops, setWorkshops] = useState<{ id: string; name: string; status: string }[]>([]);
  const [lastPrices, setLastPrices] = useState<Record<string, number>>({});
  const [productSearchDialog, setProductSearchDialog] = useState<{ open: boolean; itemId: string | null }>({
    open: false,
    itemId: null,
  });
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; bank_name: string; currency: string; gl_account_code: string | null }[]>([]);
  const [cashBoxes, setCashBoxes] = useState<{ id: string; name: string; gl_account_code: string | null }[]>([]);
  const [creating, setCreating] = useState(false);
  // Synchronous re-entry guard — prevents double-submit from rapid clicks
  // BEFORE React flushes the `creating` state (which the button `disabled`
  // prop depends on). Without this, users could triple-click "حفظ" during
  // slow network and produce PO-…-0043 / 0044 / 0045 duplicates.
  const creatingRef = useRef(false);
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState<string>("...");
  /** Contact id restored from a "duplicate" draft — read by fetchAll because its
   *  closure captures the first-render `form` (stale) and can never see the
   *  restored contactId otherwise. */
  const duplicateContactIdRef = useRef<string | null>(null);
  // Cache the next preview number per type so toggling sales/purchase recomputes locally.
  // The final number is still assigned by the DB trigger on insert.
  const typeCountsRef = useRef<{
    salesNext: number;
    purchaseNext: number;
    salesPrefix: string;
    purchasePrefix: string;
  } | null>(null);
  const [defaultTaxCategory, setDefaultTaxCategory] = useState<TaxCategory>("taxable");

  // Contact search
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [contactActiveIdx, setContactActiveIdx] = useState<number>(-1);
  const contactActiveIdxRef = useRef<number>(-1);
  const filteredContactsRef = useRef<Contact[]>([]);
  useEffect(() => { contactActiveIdxRef.current = contactActiveIdx; }, [contactActiveIdx]);
  const [contactDebtWarning, setContactDebtWarning] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  // Bridge of Understanding data — fetched per-contact for the SmartSummaryPanel
  const [contactOpenInvoicesTotal, setContactOpenInvoicesTotal] = useState<number>(0);
  const [contactUnappliedCredit, setContactUnappliedCredit] = useState<number>(0);
  const [contactStatementBalance, setContactStatementBalance] = useState<number | null>(null);

  // Dialogs
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showWarrantyDialog, setShowWarrantyDialog] = useState(false);
  const [showQuickAddRep, setShowQuickAddRep] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ name: "", sell_price: 0, buy_price: 0, unit: "قطعة", quantity: 0, product_type: "product" as "product" | "service", service_direction: "" as "" | "provided" | "received" });
  const [quickRepForm, setQuickRepForm] = useState({ full_name: "", phone: "", region: "", sales_commission_rate: 0 });

  // ─── Auto-draft للنوافذ المنبثقة (Quick Add) ───
  // عزل: user + company + نوع modal
  const modalScope = `${user?.id || "anon"}:${company?.id || "no-company"}`;

  const { clearModalDraft: clearProductDraft } = useModalDraft(
    "quick_add_product",
    quickAddForm,
    (d) => setQuickAddForm({
      name: d?.name ?? "",
      sell_price: Number(d?.sell_price) || 0,
      buy_price: Number(d?.buy_price) || 0,
      unit: d?.unit || "قطعة",
      quantity: Number(d?.quantity) || 0,
      product_type: (d?.product_type === "service" ? "service" : "product"),
      service_direction: (d?.service_direction === "provided" || d?.service_direction === "received") ? d.service_direction : "",
    }),
    {
      enabled: showQuickAdd && !!user,
      scope: modalScope,
      isEmpty: (d) => !d.name?.trim() && !d.sell_price && !d.buy_price && !d.quantity,
      version: 1,
    }
  );

  const { clearModalDraft: clearRepDraft } = useModalDraft(
    "quick_add_sales_rep",
    quickRepForm,
    (d) => setQuickRepForm({
      full_name: d?.full_name ?? "",
      phone: d?.phone ?? "",
      region: d?.region ?? "",
      sales_commission_rate: Number(d?.sales_commission_rate) || 0,
    }),
    {
      enabled: showQuickAddRep && !!user,
      scope: modalScope,
      isEmpty: (d) => !d.full_name?.trim() && !d.phone?.trim() && !d.region?.trim() && !d.sales_commission_rate,
      version: 1,
    }
  );

  // Customer detail overrides (on-invoice only)
  const [customerOverrides, setCustomerOverrides] = useState({ phone: "", email: "", tax_number: "", address: "" });

  // Attachments
  const [attachments, setAttachments] = useState<{ name: string; url: string; size: number; type: string; uploaded_at: string }[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [draftReady, setDraftReady] = useState(false);

  // Terms
  const [termsOpen, setTermsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [invoiceMetaOpen, setInvoiceMetaOpen] = useState(false);
  const [invoiceTerms, setInvoiceTerms] = useState("");
  const defaultTerms = companySettings?.default_invoice_terms || "يُرجى السداد خلال المدة المتفق عليها.\nشكراً لتعاملكم معنا.";

  // Initialize terms from company settings
  useEffect(() => {
    if (invoiceTerms === "" && !isEditMode) {
      setInvoiceTerms(defaultTerms);
    }
  }, [defaultTerms]);

  // ─── Apply company default invoice kind (نقدي / آجل) on new invoices ───
  // Uses `company_settings.default_invoice_kind` (default 'credit'). Only runs
  // in create mode, once settings load, and skips when a draft was restored.
  const appliedDefaultKindRef = useRef(false);
  useEffect(() => {
    if (isEditMode || appliedDefaultKindRef.current) return;
    const defKind = (companySettings as any)?.default_invoice_kind;
    if (defKind !== "cash" && defKind !== "credit") return;
    appliedDefaultKindRef.current = true;
    if (defKind !== form.invoiceKind) {
      setForm(p => ({ ...p, invoiceKind: defKind }));
    }
     
  }, [companySettings, isEditMode]);

  const [productSearchByRow, setProductSearchByRow] = useState<Record<string, string>>({});

  // ─── Draft autosave UX state ───
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [showDraftsHistory, setShowDraftsHistory] = useState(false);
  // Used to suppress the restore banner immediately after the user explicitly
  // chose "بدء فاتورة جديدة" / "جديد", so the just-cleared draft never resurfaces.
  const suppressRestoreRef = useRef(false);

  // Form state
  // ─── Accounting policy (post QuickBooks-style refactor) ───
  // All invoices are issued on **credit (آجل)** basis. Payment is recorded later
  // through the dedicated voucher system (receipt for sales, payment for purchases).
  // This mirrors QuickBooks/Xero accrual flow: invoice → AR/AP, then voucher → cash/bank.
  const [form, setForm] = useState({
    type: (prefillType === "purchase" ? "purchase" : "sales") as "sales" | "purchase",
    contactName: "",
    contactId: null as string | null,
    date: new Date().toISOString().split("T")[0],
    dueDate: "",
    paymentTerms: "net_30",
    paymentMethod: "credit" as "credit", // ← always credit; no UI to change
    // Invoice kind exposed to the user via segmented control next to cost center.
    // "credit" (آجل) → posts to AR/AP, paid_amount=0. "cash" (نقدي) → immediately
    // posts to the chosen cash box / bank account (Dr cash / Cr revenue for sales,
    // Dr purchases / Cr cash for purchases) so it actually moves cash. Stored in
    // DB via payment_method = نقدي + cash_account_code (gl_account_code).
    invoiceKind: "credit" as "credit" | "cash",
    // Required when invoiceKind === "cash" — gl_account_code of the chosen cash
    // box or bank account. Used as the cash-side leg of the GL entry.
    cashAccountCode: null as string | null,
    currency: tt("شيكل"),
    exchangeRate: 1,
    notes: "",
    notesInternal: "",
    salespersonId: null as string | null,
    billingAddress: "",
    taxInclusive: false,
    warehouseId: null as string | null,
    workshopId: null as string | null,
    costCenterId: null as string | null,
    items: [createEmptyItem()] as InvoiceItem[],
    // Invoice-level discount (applied on the whole invoice total, after items and tax).
    invoiceDiscount: 0,
    invoiceDiscountType: "amount" as "amount" | "percent",
  });

  // ─── المبلغ المدفوع فعلياً للفاتورة النقدية ───
  // الافتراضي = إجمالي الفاتورة ويتبعها تلقائياً حتى يلمسه المستخدم (touched).
  // يدعم: دفع أقل (متبقٍ على الذمة) / دفع أكثر (رصيد للجهة) / صفر (آجل بالكامل).
  const [cashPaidInput, setCashPaidInput] = useState("");
  const [cashPaidTouched, setCashPaidTouched] = useState(false);

  const currSymbol = CURRENCY_SYMBOLS[form.currency] || "₪";
  const fmtCurrency = useCallback((n: number) =>
    `${currSymbol}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, [currSymbol]);

  // ─── Auto-Draft: حفظ تلقائي يحمي من فقدان البيانات عند التنقل بين التبويبات ───
  // معطّل في وضع التعديل (التعديل يحمل بياناته من قاعدة البيانات)،
  // وعند الاستيراد من duplicate (له منطق منفصل).
  const draftFormId = `invoice_${form.type === "purchase" ? "purchase" : "sales"}_new`;
  const draftScope = [user?.id || "anon", company?.id || "no-company", location.pathname, form.type, "new"].join(":");
  const invoiceDraftSnapshot = useMemo(() => ({
    form,
    contactSearch,
    customerOverrides,
    invoiceTerms,
    attachments,
    cashPaidInput,
    cashPaidTouched,
  }), [form, contactSearch, customerOverrides, invoiceTerms, attachments, cashPaidInput, cashPaidTouched]);

  const { hasDraft, restoreDraft, clearDraft, draftSavedAt } = useFormDraft(
    draftFormId,
    invoiceDraftSnapshot,
    (draft) => {
      const typedDraft = draft as typeof invoiceDraftSnapshot;
      if (typedDraft && typedDraft.form) {
        // Back-compat: older drafts may lack invoiceKind / cashAccountCode.
        const restored = typedDraft.form as typeof form;
        setForm({
          ...restored,
          invoiceKind: restored.invoiceKind || "credit",
          cashAccountCode: restored.cashAccountCode ?? null,
        });
        setContactSearch(typedDraft.contactSearch || typedDraft.form.contactName || "");
        setCustomerOverrides(typedDraft.customerOverrides || { phone: "", email: "", tax_number: "", address: "" });
        setInvoiceTerms(typedDraft.invoiceTerms ?? "");
        setAttachments(Array.isArray(typedDraft.attachments) ? typedDraft.attachments : []);
        setCashPaidInput(typeof typedDraft.cashPaidInput === "string" ? typedDraft.cashPaidInput : "");
        setCashPaidTouched(Boolean(typedDraft.cashPaidTouched));
        return;
      }
      // توافق رجعي مع المسودات القديمة (form فقط)
      const legacyDraft = draft as unknown as typeof form;
      setForm({ ...legacyDraft, invoiceKind: legacyDraft.invoiceKind || "credit" });
      setContactSearch(legacyDraft.contactName || "");
    },
    {
      enabled: !isEditMode && !fromDuplicate,
      version: 3,
      scope: draftScope,
      ready: draftReady,
      // لا استرجاع صامت: نريد دائماً عرض Banner واضح حتى لا تظهر بيانات
      // فاتورة قديمة بعد ضغط "جديد".
      autoRestoreWithinMs: 0,
      isEmpty: (data: typeof invoiceDraftSnapshot) =>
        !data.form?.contactName?.trim() &&
        !data.form?.contactId &&
        !data.form?.notes?.trim() &&
        (!data.form?.items?.length ||
          data.form.items.every((it: any) => !it.description?.trim() && !it.productId)),
    }
  );

  // Reflect autosave activity in the small status badge.
  // We mark "saving" the moment the user edits the snapshot, then "saved" once
  // useFormDraft updates `draftSavedAt` (debounced internally).
  const lastSnapshotRef = useRef(invoiceDraftSnapshot);
  useEffect(() => {
    if (isEditMode || fromDuplicate) return;
    if (lastSnapshotRef.current !== invoiceDraftSnapshot) {
      lastSnapshotRef.current = invoiceDraftSnapshot;
      setDraftStatus(prev => (prev === "error" ? prev : "saving"));
    }
  }, [invoiceDraftSnapshot, isEditMode, fromDuplicate]);
  useEffect(() => {
    if (draftSavedAt) setDraftStatus("saved");
  }, [draftSavedAt]);

  useEffect(() => {
    if (!fromDuplicate) return;
    const draftKey = "draft_invoice_new";
    const draft = localStorage.getItem(draftKey);
    if (!draft) return;
    try {
      const data = JSON.parse(draft);
      localStorage.removeItem(draftKey);
      duplicateContactIdRef.current = data.contactId || null;
      setDuplicateSourceRef(data._sourceRef || null);
      setForm(prev => ({
        ...prev,
        type: data.type || prev.type,
        contactName: data.contactName || "",
        contactId: data.contactId || null,
        paymentTerms: data.paymentTerms || "net_30",
        paymentMethod: "credit",
        invoiceKind: data.invoiceKind || "credit",
        cashAccountCode: data.cashAccountCode ?? null,
        currency: data.currency || tt("شيكل"),
        exchangeRate: data.exchangeRate || 1,
        notes: data.notes || "",
        notesInternal: data.notesInternal || "",
        salespersonId: data.salespersonId || null,
        billingAddress: data.billingAddress || "",
        taxInclusive: data.taxInclusive || false,
        warehouseId: data.warehouseId ?? prev.warehouseId,
        workshopId: data.workshopId ?? null,
        items: data.items?.length ? data.items.map((item: any) => ({ ...item, id: crypto.randomUUID() })) : [createEmptyItem()],
        // Invoices are credit-only — payment metadata is reset
        date: new Date().toISOString().split("T")[0],
        dueDate: "",
      }));
      // الفاتورة الجديدة تبدأ بسداد كامل افتراضي (يتبع الإجمالي تلقائياً)
      setCashPaidInput("");
      setCashPaidTouched(false);
      if (data.contactSearch) setContactSearch(data.contactSearch);
      if (data.customerOverrides) setCustomerOverrides(data.customerOverrides);
      if (typeof data.invoiceTerms === "string") setInvoiceTerms(data.invoiceTerms);
    } catch (e) { /* ignore parse errors */ }
  }, [fromDuplicate]);

  // ─── Data Fetching ───
  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      const [cRes, pRes, sRes, bRes, cbRes, salesNumbersRes, purchaseNumbersRes, taxSettingsRes, companyRes, settingsRes] = await Promise.all([
        supabase.from("contacts").select("id, contact_name, contact_type, phone, email, address, payment_terms_days, current_balance, credit_limit, tax_number, sales_rep_id").eq("user_id", ownerId).neq("is_archived", true).order("contact_name"),
        fetchAllRows<any>((from, to) =>
          supabase.from("products").select("*").eq("user_id", ownerId).order("name").range(from, to)
        ).then((data) => ({ data, error: null as any })),
        supabase.from("sales_representatives").select("id, full_name").eq("user_id", ownerId).eq("is_active", true),
        supabase.from("bank_accounts").select("id, name, bank_name, currency, gl_account_code").eq("user_id", ownerId).eq("is_active", true),
        // Cash boxes — combined with bank accounts in the cash-invoice picker so
        // users can choose either to receive (sales) / pay (purchases) cash.
        supabase.from("cash_boxes").select("id, name, gl_account_code").eq("user_id", ownerId).eq("is_active", true),
        // Include cancelled/voided invoices — the DB unique index covers them too,
        // so the next sequence must skip past any existing number regardless of status.
        supabase.from("invoices").select("invoice_number").eq("user_id", ownerId).eq("invoice_type", "sale"),
        supabase.from("invoices").select("invoice_number").eq("user_id", ownerId).eq("invoice_type", "purchase"),
        supabase.from("tax_settings").select("registration_type").eq("user_id", ownerId).maybeSingle(),
        supabase.from("companies").select("invoice_number_offset").eq("owner_id", user.id).maybeSingle(),
        (supabase.from("company_settings" as any).select("invoice_prefix, purchase_order_prefix").eq("user_id", ownerId).maybeSingle() as any),
      ]);
      const contactsList = (cRes.data || []) as Contact[];
      
      const statementBalanceMap = await fetchManyContactStatementBalances(contactsList, { userId: user.id });
      
      const contactsWithBalance = contactsList.map(c => {
        const balance = statementBalanceMap[c.id] ?? 0;
        return { ...c, balance };
      });
      setContacts(contactsWithBalance);
      setProducts((pRes.data as any[]) || []);
      setSalesReps(((sRes.data || []) as any[]).map(s => ({ id: s.id, name: s.full_name })));
      setBankAccounts((bRes.data || []) as any[]);
      setCashBoxes((cbRes.data || []) as any[]);

      // ─── Warehouses (used for stock attribution + advanced product picker) ───
      let whList: any[];
      const whCached = warehousesCache.get(ownerId);
      if (whCached && Date.now() - whCached.ts < INVOICE_LOOKUP_TTL_MS) {
        whList = whCached.data;
      } else {
        const { data: whData } = await supabase
          .from("warehouses")
          .select("id, name, is_default")
          .eq("user_id", ownerId)
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .order("name");
        whList = (whData as any[]) || [];
        warehousesCache.set(ownerId, { data: whList, ts: Date.now() });
      }
      // Scope guard: users restricted to specific branches/warehouses only see
      // (and can only post to) their own warehouses — mirrors the DB trigger
      // `enforce_user_warehouse_scope`.
      try {
        const { data: scopeRows } = await supabase
          .from("user_scope_access")
          .select("branch_id,warehouse_id")
          .eq("user_id", user.id);
        if (scopeRows && scopeRows.length > 0) {
          const allowed = new Set(scopeRows.filter(s => s.warehouse_id).map(s => s.warehouse_id as string));
          const branchIds = scopeRows.filter(s => s.branch_id).map(s => s.branch_id as string);
          if (branchIds.length > 0) {
            const { data: branchWhs } = await supabase
              .from("warehouses").select("id").in("branch_id", branchIds);
            (branchWhs || []).forEach((w: any) => allowed.add(w.id));
          }
          whList = whList.filter((w: any) => allowed.has(w.id));
        }
      } catch { /* scope lookup is advisory; DB trigger is the hard block */ }

      setWarehouses(whList);
      // Default warehouse = is_default flag, else first one.
      setForm(prev => {
        const stillAllowed = prev.warehouseId && whList.some((w: any) => w.id === prev.warehouseId);
        if (stillAllowed) return prev;
        const def = whList.find((w: any) => w.is_default) || whList[0];
        return def ? { ...prev, warehouseId: def.id } : prev;
      });


      // ─── Workshops (Cost Centers) ───
      let wshList: any[];
      const wshCached = workshopsCache.get(ownerId);
      if (wshCached && Date.now() - wshCached.ts < INVOICE_LOOKUP_TTL_MS) {
        wshList = wshCached.data;
      } else {
        const { data: wshData } = await supabase
          .from("workshops")
          .select("id, name, status")
          .eq("user_id", ownerId)
          .order("name");
        wshList = (wshData as any[]) || [];
        workshopsCache.set(ownerId, { data: wshList, ts: Date.now() });
      }
      setWorkshops(wshList);
      // If invoice was opened from a workshop URL, set it as the default cost center
      if (workshopId && !isEditMode && !fromDuplicate) {
        setForm(prev => prev.workshopId ? prev : { ...prev, workshopId: workshopId });
      }

      // Set default tax category based on registration type
      const regType = (taxSettingsRes.data as any)?.registration_type;
      const detectedTaxCat: TaxCategory = (regType === "exempt" || regType === "unregistered") ? "zero" : "taxable";
      setDefaultTaxCategory(detectedTaxCat);
      // Update existing items if not in edit mode and not from duplicate
      if (!isEditMode && !fromDuplicate) {
        setForm(prev => ({
          ...prev,
          items: prev.items.map(item => ({
            ...item,
            taxCategory: detectedTaxCat,
            taxRate: detectedTaxCat === "taxable" ? 16 : 0,
          })),
        }));
      }

      // Generate next invoice number based on current type + offset + custom prefix from settings
      const settingsRow = (settingsRes as any)?.data || {};
      const salesPrefix = (settingsRow.invoice_prefix || "INV").trim() || "INV";
      const purchasePrefix = (settingsRow.purchase_order_prefix || "PO").trim() || "PO";
      // Offset applies only to sales (legacy invoice_number_offset on companies)
      const invoiceOffset = (companyRes.data as any)?.invoice_number_offset || 0;
      const salesNext = getNextInvoiceSequence((salesNumbersRes.data as any[]) || [], invoiceOffset);
      const purchaseNext = getNextInvoiceSequence((purchaseNumbersRes.data as any[]) || [], 0);
      const prefix = form.type === "sales" ? salesPrefix : purchasePrefix;
      const nextSequence = form.type === "sales" ? salesNext : purchaseNext;
      const year = new Date().getFullYear();
      const nextNum = String(nextSequence).padStart(4, "0");
      setNextInvoiceNumber(`${prefix}-${year}-${nextNum}`);
      // Cache next sequences so the type-toggle effect can recompute without re-fetching
      typeCountsRef.current = {
        salesNext,
        purchaseNext,
        salesPrefix,
        purchasePrefix,
      };

      // Resolve duplicate contact after contacts load.
      // NOTE: this effect's closure holds the FIRST-render `form` (contactId
      // still null) — read the id from duplicateContactIdRef which the restore
      // effect sets synchronously before this async fetch completes.
      if (fromDuplicate) {
        const draft = duplicateContactIdRef.current || form.contactId;
        if (draft) {
          const found = contactsList.find(c => c.id === draft);
          if (found) {
            setSelectedContact(found);
            setContactSearch(found.contact_name);
          }
        }
      }

      // Pre-fill from URL params (e.g. from workshops)
      if (prefillContactId && !fromDuplicate && !isEditMode) {
        const found = contactsList.find(c => c.id === prefillContactId);
        if (found) {
          setSelectedContact(found);
          setContactSearch(found.contact_name);
          setForm(f => ({ ...f, contactId: found.id, contactName: found.contact_name }));
          if (found.address) setCustomerOverrides(o => ({ ...o, address: found.address || "" }));
          if (found.phone) setCustomerOverrides(o => ({ ...o, phone: found.phone || "" }));
        }
        if (prefillAmount) {
          const amt = Number(prefillAmount);
          if (amt > 0) {
            setForm(f => ({ ...f, items: [{ ...createEmptyItem(), description: prefillNotes || tt("خدمات ورشة عمل"), qty: 1, unitPrice: amt, total: amt }] }));
          }
        }
        if (prefillNotes && !prefillAmount) {
          setForm(f => ({ ...f, notes: prefillNotes }));
        }
      } else if (prefillContactName && !prefillContactId && !fromDuplicate && !isEditMode) {
        setContactSearch(prefillContactName);
        setForm(f => ({ ...f, contactName: prefillContactName }));
      }

      // Pre-fill items and contact from an order (sessionStorage bridge from Orders page)
      if (!fromDuplicate && !isEditMode) {
        try {
          const raw = sessionStorage.getItem("order_invoice_prefill");
          if (raw) {
            const p = JSON.parse(raw);
            if (p && Array.isArray(p.items)) {
              // Contact
              if (p.contactId) {
                const found = contactsList.find(c => c.id === p.contactId);
                if (found) {
                  setSelectedContact(found);
                  setContactSearch(found.contact_name);
                  setForm(f => ({ ...f, contactId: found.id, contactName: found.contact_name }));
                  if (found.address) setCustomerOverrides(o => ({ ...o, address: found.address || "" }));
                  if (found.phone) setCustomerOverrides(o => ({ ...o, phone: found.phone || "" }));
                }
              } else if (p.contactName) {
                setContactSearch(p.contactName);
                setForm(f => ({ ...f, contactName: p.contactName }));
              }
              // Items
              const prefillItems: InvoiceItem[] = p.items.map((it: any) => {
                const qty = Number(it.quantity || 1);
                const price = Number(it.unit_price || 0);
                const disc = Number(it.discount || 0);
                const line = Math.max(0, qty * price - disc);
                return {
                  id: crypto.randomUUID(),
                  productId: it.product_id || undefined,
                  description: it.product_name || "",
                  quantity: qty,
                  bonusQuantity: 0,
                  unitPrice: price,
                  discount: disc,
                  discountType: "amount",
                  taxRate: 0,
                  taxCategory: "exempt",
                  unitOfMeasure: it.unit || "قطعة",
                  subtotal: line,
                  workshopId: null,
                };
              });
              if (prefillItems.length > 0) {
                setForm(f => ({
                  ...f,
                  items: prefillItems,
                  notes: (p.orderRef || p.orderNumber) ? `مرتبطة بالطلبية ${p.orderRef || p.orderNumber}${f.notes ? " • " + f.notes : ""}` : f.notes,
                }));
              }
            }
          }
        } catch {}
        // Clear right away so refreshing the page won't re-apply.
        sessionStorage.removeItem("order_invoice_prefill");
      }
    };
    fetchAll().then(() => setDraftReady(true), () => setDraftReady(true));
  }, [user]);

  // Recompute the next invoice number whenever the user toggles between sales and purchase.
  // Each type has its own independent counter (e.g. INV-2026-0001, PO-2026-0001).
  useEffect(() => {
    if (isEditMode) return;
    const cache = typeCountsRef.current;
    if (!cache) return;
    const isSales = form.type === "sales";
    const prefix = isSales ? cache.salesPrefix : cache.purchasePrefix;
    const year = new Date().getFullYear();
    const nextSequence = isSales ? cache.salesNext : cache.purchaseNext;
    const nextNum = String(nextSequence).padStart(4, "0");
    setNextInvoiceNumber(`${prefix}-${year}-${nextNum}`);
  }, [form.type, isEditMode]);

  // Refresh per-warehouse stock map when warehouse changes (used by autocomplete + popup).
  useEffect(() => {
    if (!user || !form.warehouseId) {
      setWarehouseStock({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("product_warehouse_stock" as any)
        .select("product_id, quantity_on_hand")
        .eq("user_id", ownerId)
        .eq("warehouse_id", form.warehouseId);
      if (cancelled) return;
      const map: Record<string, number> = {};
      ((data as any[]) || []).forEach((r: any) => {
        if (r.product_id) map[r.product_id] = Number(r.quantity_on_hand || 0);
      });
      setWarehouseStock(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, form.warehouseId]);

  // Last unit price per product (last sale price for sales, last purchase price for purchase).
  useEffect(() => {
    if (!user || products.length === 0) return;
    let cancelled = false;
    (async () => {
      const targetType = form.type === "sales" ? "sale" : "purchase";
      const { data } = await supabase
        .from("invoice_items")
        .select("product_id, unit_price, created_at, invoices!inner(invoice_type, user_id)")
        .eq("invoices.user_id", ownerId)
        .eq("invoices.invoice_type", targetType)
        .not("product_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      const map: Record<string, number> = {};
      ((data as any[]) || []).forEach((row: any) => {
        if (row.product_id && map[row.product_id] === undefined) {
          map[row.product_id] = Number(row.unit_price || 0);
        }
      });
      setLastPrices(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, products.length, form.type]);

  useEffect(() => {
    const terms = PAYMENT_TERMS.find(t => t.value === form.paymentTerms);
    if (terms && terms.days >= 0) {
      setForm(p => ({ ...p, dueDate: addDays(p.date, terms.days) }));
    }
  }, [form.paymentTerms, form.date]);

  // ─── Item Calculations ───
  const calcItemSubtotal = useCallback((item: InvoiceItem) => {
    const base = item.quantity * item.unitPrice;
    let discountAmount = 0;
    if (item.discountType === "percent") {
      discountAmount = base * (item.discount / 100);
    } else {
      discountAmount = item.discount;
    }
    const afterDiscount = base - discountAmount;
    // Only add tax if tax is enabled at company level
    if (!taxEnabled) return afterDiscount;
    // If tax-inclusive, price already contains tax — don't add on top
    if (form.taxInclusive) return afterDiscount;
    const tax = afterDiscount * (item.taxRate / 100);
    return afterDiscount + tax;
  }, [taxEnabled, form.taxInclusive]);

  useEffect(() => {
    if (!isEditMode || !editInvoiceId) {
      setLoadingEditInvoice(false);
      return;
    }
    if (!user) return;

    let mounted = true;

    const loadInvoiceForEdit = async () => {
      setLoadingEditInvoice(true);
      try {
        const { data, error } = await supabase
          .from("invoices")
          .select("*, invoice_items(*)")
          .eq("id", editInvoiceId)
          .eq("user_id", ownerId)
          .maybeSingle();

        if (error || !data) {
          toast({ title: tt("تعذر تحميل الفاتورة للتعديل"), variant: "destructive" });
          navigate("/invoices");
          return;
        }

        const mappedItems: InvoiceItem[] = (data.invoice_items || []).map((item: any) => {
          const rate = Number(item.tax_rate) || 0;
          const normalized: InvoiceItem = {
            id: item.id || crypto.randomUUID(),
            productId: item.product_id || undefined,
            description: item.product_name || item.description || "",
            quantity: Number(item.quantity) || 1,
            bonusQuantity: Number(item.bonus_quantity) || 0,
            unitPrice: Number(item.unit_price) || 0,
            discount: Number(item.discount) || 0,
            discountType: item.discount_type === "amount" ? "amount" : "percent",
            taxRate: rate,
            taxCategory: item.tax_category || (rate > 0 ? "taxable" : "exempt"),
            unitOfMeasure: item.unit_of_measure || "قطعة",
            subtotal: Number(item.total_amount) || 0,
            workshopId: item.workshop_id || null,
            fabric: item.fabric ?? null,
          };
          normalized.subtotal = calcItemSubtotal(normalized);
          return normalized;
        });

        if (!mounted) return;

        originalInvoiceRef.current = {
          linkedTransactionId: data.linked_transaction_id || null,
          contactId: data.contact_id || null,
          remainingAmount: Number(data.remaining_amount) || 0,
          paidAmount: Number(data.paid_amount) || 0,
          totalAmount: Number(data.total_amount) || 0,
          invoiceNumber: data.invoice_number || null,
          status: data.status || null,
        };
        originalItemsRef.current = (data.invoice_items || [])
          .filter((it: any) => it.product_id)
          .map((it: any) => ({ productId: it.product_id, quantity: Number(it.quantity) || 0 }));

        const paymentTerms = data.payment_terms || "net_30";

        setForm(prev => ({
          ...prev,
          type: data.invoice_type === "purchase" ? "purchase" : "sales",
          contactName: data.contact_name || "",
          contactId: data.contact_id || null,
          date: data.invoice_date || prev.date,
          dueDate: data.due_date || "",
          paymentTerms,
          // Always force credit — invoices are accrual-only since payment UI was removed.
          // Existing non-credit invoices will be re-saved as credit with paid_amount=0.
          paymentMethod: "credit",
          // Infer invoice kind from saved payment_method:
          // "نقدي"/"cash" → cash; anything else (incl. "آجل") → credit.
          invoiceKind: (data.payment_method === "نقدي" || data.payment_method === "cash") ? "cash" : "credit",
          // Restore the saved cash account code so the picker reflects the
          // original choice. NULL for legacy cash invoices saved before this
          // column existed — the user must re-pick a cash account on save.
          cashAccountCode: (data as any).cash_account_code || null,
          currency: data.currency || tt("شيكل"),
          exchangeRate: Number(data.exchange_rate) || 1,
          notes: data.notes || "",
          notesInternal: data.notes_internal || "",
          salespersonId: data.salesperson_id || null,
          billingAddress: data.billing_address || "",
          taxInclusive: Boolean(data.tax_inclusive),
          workshopId: data.workshop_id || null,
          costCenterId: (data as any).cost_center_id || null,
          // Restore the invoice's own warehouse — without this the form keeps the
          // default warehouse and "إنشاء مشابه" posts stock to the wrong warehouse.
          warehouseId: data.warehouse_id || prev.warehouseId,
          items: mappedItems.length ? mappedItems : [createEmptyItem()],
        }));

        // استرجاع المبلغ المدفوع فعلياً للفاتورة النقدية القائمة (من paid_amount
        // الذي تضبطه مزامنة السند) — الدفعات حقيقة مالية لا تتبع الإجمالي عند التعديل.
        const wasCash = data.payment_method === "نقدي" || data.payment_method === "cash";
        if (wasCash) {
          setCashPaidInput(String(Number(data.paid_amount) || 0));
          setCashPaidTouched(true);
        } else {
          setCashPaidInput("");
          setCashPaidTouched(false);
        }

        if (data.invoice_number) setNextInvoiceNumber(data.invoice_number);
        if ((data as any).created_at) (window as any).__invoiceCreatedAt = (data as any).created_at;

        // Load attachments and terms from edit data
        if (data.attachments) {
          try {
            const parsed = typeof data.attachments === 'string' ? JSON.parse(data.attachments) : data.attachments;
            setAttachments(Array.isArray(parsed) ? parsed : []);
          } catch { setAttachments([]); }
        }
        if (data.terms) setInvoiceTerms(data.terms);

        setContactSearch(data.contact_name || "");
      } catch (err: any) {
        console.error("Load invoice for edit failed:", err);
        toast({ title: tt("خطأ أثناء تحميل الفاتورة"), description: err.message, variant: "destructive" });
        navigate("/invoices");
      } finally {
        if (mounted) setLoadingEditInvoice(false);
      }
    };

    loadInvoiceForEdit();
    return () => {
      mounted = false;
    };
  }, [isEditMode, editInvoiceId, user, calcItemSubtotal, toast, navigate]);

  useEffect(() => {
    if (!form.contactId) {
      setSelectedContact(null);
      setContactStatementBalance(null);
      setContactOpenInvoicesTotal(0);
      setContactUnappliedCredit(0);
      return;
    }
    const matched = contacts.find(c => c.id === form.contactId) || null;
    setSelectedContact(matched);
  }, [contacts, form.contactId]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !selectedContact?.id) { setContactStatementBalance(null); return; }
    fetchContactStatementBalance({
      contactId: selectedContact.id,
      userId: user.id,
      contactType: selectedContact.contact_type,
    }).then((balance) => {
      if (!cancelled) setContactStatementBalance(balance);
    });
    return () => { cancelled = true; };
  }, [user, selectedContact?.id, selectedContact?.contact_type]);

  // ─── Bridge of Understanding: fetch open invoices + unapplied credits for selected contact ───
  useEffect(() => {
    let cancelled = false;
    if (!user || !form.contactId) {
      setContactOpenInvoicesTotal(0);
      setContactUnappliedCredit(0);
      return;
    }
    (async () => {
      const [invRes, payRes] = await Promise.all([
        // Open (unpaid/partial) credit invoices — sales side only contributes to receivables
        supabase
          .from("invoices")
          .select("remaining_amount, invoice_type, status")
          .eq("user_id", ownerId)
          .eq("contact_id", form.contactId)
          .eq("invoice_type", form.type === "sales" ? "sale" : "purchase")
          .neq("status", "cancelled")
          .gt("remaining_amount", 0),
        // Unapplied receipts/payments (advance balance not yet linked to invoices)
        supabase
          .from("transactions")
          .select("amount, transaction_type, debit_account_code, credit_account_code")
          .eq("user_id", ownerId)
          .eq("contact_id", form.contactId)
          .eq("is_deleted", false)
          .in("transaction_type", form.type === "sales"
            ? ["receipt", "receipt_unapplied"]
            : ["payment", "payment_unapplied"]),
      ]);
      if (cancelled) return;
      const openSum = (invRes.data || []).reduce((s: number, r: any) => s + Number(r.remaining_amount || 0), 0);
      // Unapplied = receipt amounts not yet bound to an invoice (heuristic: receipt minus open invoices, floored at 0)
      const receiptsSum = (payRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const unapplied = Math.max(0, receiptsSum - openSum);
      setContactOpenInvoicesTotal(openSum);
      setContactUnappliedCredit(unapplied);
    })();
    return () => { cancelled = true; };
  }, [user, form.contactId, form.type]);

  const getItemDiscountAmount = useCallback((item: InvoiceItem) => {
    const base = item.quantity * item.unitPrice;
    return item.discountType === "percent" ? base * (item.discount / 100) : item.discount;
  }, []);

  const summary = useMemo(() => {
    const grossTotal = form.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const itemsDiscount = form.items.reduce((s, i) => s + getItemDiscountAmount(i), 0);
    // Cash invoices are immediately marked as paid (paid_amount = total, remaining = 0).
    // Credit invoices remain unpaid at creation (paid via separate receipt voucher).
    const computePaid = (total: number) =>
      form.invoiceKind === "cash"
        ? { paidAmount: total, remainingAmount: 0 }
        : { paidAmount: 0, remainingAmount: total };

    // Compute pre-invoice-discount total & tax first
    let baseTotal = 0;
    let baseSubtotal = grossTotal;
    let totalTax = 0;
    if (!taxEnabled) {
      baseTotal = grossTotal - itemsDiscount;
    } else if (form.taxInclusive) {
      // Tax-inclusive: prices already contain tax, extract it
      form.items.forEach(i => {
        const base = i.quantity * i.unitPrice;
        const disc = i.discountType === "percent" ? base * (i.discount / 100) : i.discount;
        const afterDiscount = base - disc;
        const net = afterDiscount / (1 + i.taxRate / 100);
        totalTax += afterDiscount - net;
      });
      baseTotal = grossTotal - itemsDiscount;
      baseSubtotal = baseTotal - totalTax;
    } else {
      // Tax-exclusive: tax added on top
      const afterDiscount = grossTotal - itemsDiscount;
      totalTax = form.items.reduce((s, i) => {
        const base = i.quantity * i.unitPrice;
        const disc = i.discountType === "percent" ? base * (i.discount / 100) : i.discount;
        return s + (base - disc) * (i.taxRate / 100);
      }, 0);
      baseTotal = afterDiscount + totalTax;
    }

    // Apply invoice-level discount on the final total (bounded to base total)
    const invRaw = Number(form.invoiceDiscount) || 0;
    let invoiceDiscountAmount =
      form.invoiceDiscountType === "percent" ? baseTotal * (invRaw / 100) : invRaw;
    if (invoiceDiscountAmount < 0) invoiceDiscountAmount = 0;
    if (invoiceDiscountAmount > baseTotal) invoiceDiscountAmount = baseTotal;

    const totalDiscount = itemsDiscount + invoiceDiscountAmount;
    const total = baseTotal - invoiceDiscountAmount;
    return {
      subtotal: baseSubtotal,
      totalDiscount,
      itemsDiscount,
      invoiceDiscountAmount,
      totalTax,
      total,
      ...computePaid(total),
    };
  }, [form.items, form.taxInclusive, form.invoiceKind, form.invoiceDiscount, form.invoiceDiscountType, taxEnabled, getItemDiscountAmount]);

  // المبلغ النقدي الفعلي: يتبع الإجمالي حتى يلمسه المستخدم، ويقبل الكسور (0.5+).
  const cashPaidAmount = useMemo(() => {
    if (form.invoiceKind !== "cash") return 0;
    if (!cashPaidTouched || cashPaidInput.trim() === "") return Math.round(summary.total * 100) / 100;
    const v = Number(cashPaidInput);
    if (!Number.isFinite(v) || v < 0) return 0;
    return Math.round(v * 100) / 100;
  }, [form.invoiceKind, cashPaidTouched, cashPaidInput, summary.total]);

  const amountInWords = useMemo(() => numberToArabicWords(Math.round(summary.total)), [summary.total]);

  // ─── Contact Selection ───
  const filteredContacts = useMemo(() => {
    const typeFilter = form.type === "sales" ? "عميل" : "مورد";
    return contacts.filter(c =>
      c.contact_name.includes(contactSearch) &&
      (c.contact_type === typeFilter || c.contact_type === "عميل ومورد" || !contactSearch)
    );
  }, [contacts, contactSearch, form.type]);
  useEffect(() => { filteredContactsRef.current = filteredContacts; }, [filteredContacts]);

  const selectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setContactSearch(contact.contact_name);
    setShowContactDropdown(false);
    setForm(p => ({
      ...p,
      contactName: contact.contact_name,
      contactId: contact.id,
      billingAddress: contact.address || "",
      salespersonId: contact.sales_rep_id || p.salespersonId,
      paymentTerms: contact.payment_terms_days
        ? PAYMENT_TERMS.find(t => t.days === contact.payment_terms_days)?.value || "net_30"
        : p.paymentTerms,
    }));
    // Populate customer detail overrides
    setCustomerOverrides({
      phone: contact.phone || "",
      email: contact.email || "",
      tax_number: contact.tax_number || "",
      address: contact.address || "",
    });
    // Debt warning from transaction balance
    const bal = contact.balance || 0;
    if (bal > 0) {
      setContactDebtWarning(`⚠️ رصيد مستحق: ${fmtCurrencyStatic(bal)}${contact.credit_limit ? ` من سقف ${fmtCurrencyStatic(contact.credit_limit)}` : ""}`);
    } else {
      setContactDebtWarning(null);
    }
    // Smart UX: with multiple warehouses the accountant confirms the warehouse first.
    // Enter flow: جهة → مستودع (inline) → آجل/نقدي → الأصناف.
    if (warehouses.length > 1) {
      setTimeout(() => {
        if (!focusInvoiceElement(['[data-invoice-warehouse="true"]'])) focusFirstProductTrigger();
      }, 120);
    } else {
      focusFirstProductTrigger();
    }

  };

  // After selecting a contact / product / row action — auto-jump to the next logical field.
  // Strategy: use the global focus framework. We dispatch focus to the first product trigger
  // of the first invoice row (after selecting a contact), or to the quantity input of the
  // current row (after selecting a product). Falls back to next focusable input.
  const focusFirstProductTrigger = () => {
    setTimeout(() => {
      const input = getVisibleInvoiceInput(['[data-invoice-product-input="true"]']);
      if (input) {
        input.focus();
        input.select();
      }
    }, 80);
  };

  /** Enter flow step 2 → focus the invoice kind (آجل/نقدي) segmented control. */
  const focusInvoiceKind = () => {
    setTimeout(() => {
      if (!focusInvoiceElement(['[data-invoice-kind="true"][aria-selected="true"]', '[data-invoice-kind="true"]'])) {
        focusFirstProductTrigger();
      }
    }, 80);
  };


  const focusRowQuantity = (itemId: string) => {
    setTimeout(() => {
      const input = getVisibleInvoiceInput([`[data-invoice-qty="${itemId}"]`]);
      if (input) { input.focus(); input.select(); }
    }, 80);
  };

  // ─── Item Updates ───
  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === "taxCategory") {
          const cat = TAX_CATEGORY_OPTIONS.find(o => o.value === value);
          updated.taxRate = cat ? cat.rate : 0;
        }
        updated.subtotal = calcItemSubtotal(updated);
        return updated;
      }),
    }));
  };

  const selectProduct = (itemId: string, productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    setProductSearchByRow(prev => ({ ...prev, [itemId]: prod.name }));
    setForm(prev => ({
      ...prev,
      items: prev.items.map(it => {
        if (it.id !== itemId) return it;
        const price = prev.type === "sales" ? Number(prod.sell_price) : Number(prod.buy_price);
        const updated = {
          ...it,
          productId: prod.id,
          description: prod.name,
          unitPrice: price > 0 ? price : it.unitPrice,
          unitOfMeasure: prod.unit || "قطعة",
          taxCategory: "taxable" as TaxCategory,
          taxRate: 16,
        };
        updated.subtotal = calcItemSubtotal(updated);
        return updated;
      }),
    }));
    // Smart UX: jump to quantity field of this row after picking a product
    focusRowQuantity(itemId);
  };

  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { ...createEmptyItem(), taxCategory: defaultTaxCategory, taxRate: defaultTaxCategory === "taxable" ? 16 : 0 }] }));
  const removeItem = (id: string) => {
    if (form.items.length <= 1) return;
    setProductSearchByRow(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setForm(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
  };
  const clearItems = () => {
    setProductSearchByRow({});
    setForm(prev => ({ ...prev, items: [createEmptyItem()] }));
  };

  // Adds a new row and focuses its product search field — used as overflow target
  // when the user presses Enter on the last row's tax cell. Focuses the product
  // autocomplete (not qty) so the next data-entry step is choosing a product.
  const addItemAndFocus = useCallback(() => {
    const newItem = { ...createEmptyItem(), taxCategory: defaultTaxCategory, taxRate: defaultTaxCategory === "taxable" ? 16 : 0 };
    setForm(prev => ({ ...prev, items: [...prev.items, newItem] }));
    const focusNewRow = () => {
      const el = getVisibleInvoiceInput([
        `input[data-row-id="${newItem.id}"]`,
        `[data-invoice-qty="${newItem.id}"]`,
      ]);
      el?.focus();
      el?.select?.();
    };
    setTimeout(focusNewRow, 50);
    setTimeout(focusNewRow, 140);
  }, [defaultTaxCategory]);

  // ─── Quick Add Product ───
  const handleQuickAddProduct = async () => {
    if (!user || !quickAddForm.name.trim()) { toast({ title: tt("اسم الصنف مطلوب"), variant: "destructive" }); return; }
    const isService = quickAddForm.product_type === "service";
    const payload: any = {
      name: quickAddForm.name,
      sell_price: quickAddForm.sell_price,
      buy_price: quickAddForm.buy_price,
      unit: isService ? tt("خدمة") : quickAddForm.unit,
      quantity: isService ? 0 : quickAddForm.quantity,
      product_type: quickAddForm.product_type,
      service_direction: isService
        ? (quickAddForm.service_direction || (form.type === "sales" ? "provided" : "received"))
        : null,
      user_id: ownerId,
    };
    const { error } = await supabase.from("products").insert(payload);
    if (error) { toast({ title: tt("خطأ في الإضافة"), variant: "destructive" }); return; }
    toast({ title: `تمت إضافة "${quickAddForm.name}" ✅` });
    setShowQuickAdd(false);
    setQuickAddForm({ name: "", sell_price: 0, buy_price: 0, unit: "قطعة", quantity: 0, product_type: "product", service_direction: "" });
    clearProductDraft();
    // Refresh products
    const data = await fetchAllRows<any>((from, to) =>
      supabase.from("products").select("*").eq("user_id", ownerId).order("name").range(from, to)
    );
    setProducts(data || []);
  };

  // ─── Quick Add Sales Rep ───
  const handleQuickAddRep = async () => {
    if (!user || !quickRepForm.full_name.trim()) { toast({ title: tt("اسم المندوب مطلوب"), variant: "destructive" }); return; }
    const { data: newRep, error } = await supabase.from("sales_representatives").insert({
      full_name: quickRepForm.full_name,
      phone: quickRepForm.phone || null,
      region: quickRepForm.region || null,
      sales_commission_rate: quickRepForm.sales_commission_rate || 0,
      user_id: ownerId,
    } as any).select("id, full_name").single();
    if (error) { toast({ title: tt("خطأ في الإضافة"), variant: "destructive" }); return; }
    toast({ title: `تمت إضافة المندوب "${quickRepForm.full_name}" ✅` });
    setShowQuickAddRep(false);
    setQuickRepForm({ full_name: "", phone: "", region: "", sales_commission_rate: 0 });
    clearRepDraft();
    if (newRep) {
      setSalesReps(prev => [...prev, { id: (newRep as any).id, name: (newRep as any).full_name }]);
      setForm(p => ({ ...p, salespersonId: (newRep as any).id }));
    }
  };

  const validate = (): boolean => {
    if (!form.contactName.trim()) { toast({ title: tt("يرجى اختيار جهة الاتصال"), variant: "destructive" }); return false; }
    if (form.items.some(i => !i.productId && !i.description.trim())) { toast({ title: tt("يرجى اختيار منتج لكل بند"), variant: "destructive" }); return false; }
    if (form.items.some(i => i.unitPrice <= 0)) { toast({ title: tt("لا يمكن إنشاء فاتورة ببند سعره 0"), variant: "destructive" }); return false; }
    if (form.items.some(i => i.quantity <= 0)) { toast({ title: tt("الكمية يجب أن تكون أكبر من 0"), variant: "destructive" }); return false; }
    if (form.items.some(i => Number(i.bonusQuantity || 0) < 0)) { toast({ title: tt("الكمية البونص لا يمكن أن تكون سالبة"), variant: "destructive" }); return false; }
    if (summary.total <= 0) { toast({ title: tt("إجمالي الفاتورة يجب أن يكون أكبر من 0"), variant: "destructive" }); return false; }
    if (form.invoiceKind === "cash" && !form.cashAccountCode) {
      toast({
        title: tt("اختر الصندوق لاستلام/دفع قيمة الفاتورة النقدية"),
        variant: "destructive",
      });
      return false;
    }
    if (form.invoiceKind === "cash" && cashPaidTouched) {
      const pv = Number(cashPaidInput);
      if (cashPaidInput.trim() !== "" && (!Number.isFinite(pv) || pv < 0)) {
        toast({ title: tt("المبلغ المدفوع يجب أن يكون صفراً أو أكثر"), variant: "destructive" });
        return false;
      }
    }
    return true;
  };

  // ─── Create / Update Invoice ───
  const handleCreate = async (asDraft = false) => {
    // Belt-and-suspenders: bail immediately on any re-entrant call.
    if (creatingRef.current) return;
    if (!asDraft && !validate()) return;
    if (!user) return;
    creatingRef.current = true;
    setCreating(true);

    // Invoice kind drives the DB payment_method label.
    // Cash invoices are immediately settled (paid_amount = total in summary);
    // credit invoices are paid later via receipt/payment vouchers.
    const paymentMethodDb = form.invoiceKind === "cash" ? "نقدي" : CREDIT_PAYMENT_METHOD_DB;
    let createdInvoiceId: string | null = null;
    let createdInvoiceTxId: string | null = null;
    let createdAutoVoucherTxId: string | null = null;

    try {
      // ─── OFFLINE CAPTURE ───
      // No internet: a plain credit sales invoice in ILS for an existing
      // contact is stored encrypted locally and posted later through
      // create_sale_invoice_atomic with the same idempotency key.
      if (!navigator.onLine) {
        const offlineEligible =
          !asDraft &&
          !isEditMode &&
          form.type === "sales" &&
          form.invoiceKind !== "cash" &&
          (form.currency === "شيكل" || form.currency === "ILS") &&
          !!form.contactId &&
          attachments.length === 0 &&
          !linkedOrderId &&
          !form.workshopId;

        if (!offlineEligible) {
          toast({
            title: tt("لا يوجد اتصال بالإنترنت"),
            description: tt("يمكن حفظ فاتورة مبيعات آجلة بالشيكل لجهة موجودة فقط بدون اتصال"),
            variant: "destructive",
          });
          creatingRef.current = false;
          setCreating(false);
          return;
        }

        const offlineItems = form.items
          .filter(i => i.description.trim())
          .map(item => ({
            product_id: item.productId || null,
            product_name: item.description.trim(),
            quantity: Number(item.quantity) || 0,
            unit_price: Number(item.unitPrice) || 0,
            discount_percent:
              item.discountType === "percent" ? Number(item.discount || 0) : 0,
            tax_percent: Number(item.taxRate || 0),
            total: calcItemSubtotal(item),
          }));

        const queued = await queueOfflineDocument({
          docType: "sales_invoice",
          rpc: "create_sale_invoice_atomic",
          payload: {
            p_user_id: ownerId,
            p_contact_id: form.contactId,
            p_contact_name: form.contactName,
            p_invoice_date: form.date,
            p_payment_method: paymentMethodDb,
            p_currency: "شيكل",
            p_exchange_rate: 1,
            p_subtotal: summary.subtotal,
            p_discount_amount: summary.totalDiscount,
            p_tax_amount: summary.totalTax,
            p_total_amount: summary.total,
            p_paid_amount: 0,
            p_notes: form.notes || null,
            p_items: offlineItems,
            p_source: "offline",
          },
          summary: {
            title: `فاتورة مبيعات — ${form.contactName}`,
            contact_name: form.contactName,
            amount: summary.total,
            currency: "شيكل",
            doc_date: form.date,
          },
          userId: ownerId!,
        });

        try { clearDraft(); } catch { /* noop */ }
        toast({
          title: tt("تم حفظ الفاتورة محلياً — ستُرحَّل تلقائياً عند عودة الإنترنت"),
          description: `${tt("المعرّف المؤقت")}: ${queued.local_id.slice(0, 16)}…`,
        });
        creatingRef.current = false;
        setCreating(false);
        navigate("/invoices");
        return;
      }

      let contactId = form.contactId;


      if (form.contactName.trim() && !contactId) {
        const trimmedName = form.contactName.trim();
        // Lookup first — contact may already exist (e.g. created from another flow
        // or stale local state). Avoid INSERT to prevent unique-constraint errors.
        const { data: existing } = await supabase
          .from("contacts")
          .select("id")
          .eq("user_id", ownerId)
          .eq("contact_name", trimmedName)
          .maybeSingle();

        if (existing?.id) {
          contactId = existing.id;
          const taxVal = (customerOverrides.tax_number || "").trim();
          if (taxVal) {
            await supabase.from("contacts").update({ tax_number: taxVal }).eq("id", existing.id);
          }
        } else {
          const { data: upserted, error: contactError } = await supabase
            .from("contacts")
            .upsert(
              {
                user_id: ownerId,
                contact_name: trimmedName,
                contact_type: form.type === "sales" ? "عميل" : "مورد",
                tax_number: (customerOverrides.tax_number || "").trim() || null,
              } as any,
              { onConflict: "user_id,contact_name" }
            )
            .select("id")
            .single();

          if (contactError) throw contactError;
          contactId = upserted?.id ?? null;
        }
      }

      const invoicePayload = {
        invoice_type: form.type === "sales" ? "sale" : "purchase",
        contact_name: form.contactName,
        contact_id: contactId,
        invoice_date: form.date,
        due_date: form.dueDate || null,
        subtotal: summary.subtotal,
        discount_amount: summary.totalDiscount,
        tax_amount: summary.totalTax,
        total_amount: summary.total,
        paid_amount: summary.paidAmount,
        remaining_amount: summary.remainingAmount,
        payment_status: summary.remainingAmount <= 0 ? "paid" : "unpaid",
        payment_method: paymentMethodDb,
        currency: form.currency,
        notes: form.notes,
        notes_internal: form.notesInternal || null,
        billing_address: customerOverrides.address || form.billingAddress || null,
        salesperson_id: form.salespersonId || null,
        tax_inclusive: form.taxInclusive,
        amount_in_words: amountInWords,
        payment_terms: form.paymentTerms,
        exchange_rate: form.exchangeRate,
        attachments: attachments.length > 0 ? JSON.stringify(attachments) : "[]",
        terms: invoiceTerms.trim() || null,
        warehouse_id: form.warehouseId || null,
        workshop_id: form.workshopId || null,
        cost_center_id: form.costCenterId || null,
        cash_account_code: form.invoiceKind === "cash" ? form.cashAccountCode : null,
        // ربط صريح بالطلبية المصدر (لا يُمسح عند التعديل لأنه يُضاف فقط عند وجوده)
        ...(linkedOrderId ? { order_id: linkedOrderId } : {}),
      } as any;

      // ─── Accounting routing (credit-only invoices) ───
      // Sales invoice  → Dr 1130 (AR) / Cr 4100 (Revenue)
      // Purchase invoice → Dr 5110 (Purchases) / Cr 2110 (AP)
      // Note: payment-related debit codes (1110/1120/1150) are no longer used here;
      // payment is recorded later via receipt/payment vouchers.
      // ─── Cash invoice GL routing ───
      // Cash sales:    Dr cashAccountCode / Cr 4100 (revenue)
      // Cash purchase: Dr 5110 (purchases)   / Cr cashAccountCode
      // Credit sales:  Dr 1130 (AR)         / Cr 4100
      // Credit purchase: Dr 5110             / Cr 2110 (AP)
      const isCashInvoice = form.invoiceKind === "cash";
      const cashCode = form.cashAccountCode || null;
      // ─── Cash invoice policy (v2) ───
      // على مسار الإنشاء (create) نجبر التقييد المحاسبي أن يمر عبر الذمم (AR/AP)
      // ثم ننشئ سند قبض/صرف تلقائي مربوط بالفاتورة — يظهر كمستند في سجل السندات
      // ويطبع بشكل مستقل (طلب المحاسب: 30/06/2026).
      // (v3 — 13/08/2026) نفس السياسة تُطبَّق الآن على مسار التعديل أيضاً:
      // قيد الفاتورة يبقى على الذمم دائماً، والحركة النقدية عبر السند فقط،
      // ويُزامَن السند مع الفاتورة كوحدة واحدة عبر sync_cash_invoice_voucher.
      // بدون ذلك كان التعديل يعيد كتابة القيد على الصندوق ويترك السند القديم
      // فيتضاعف الصندوق ويبقى رصيد وهمي على العميل/المورد.
      const useVoucherAutoFlow = isCashInvoice && !!cashCode;
      // المبلغ المدفوع فعلياً — قد يكون أقل (متبقٍ ذمة) أو أكثر (رصيد للجهة) أو صفراً (آجل).
      const cashPaid = useVoucherAutoFlow ? cashPaidAmount : 0;
      if (useVoucherAutoFlow) {
        invoicePayload.paid_amount = 0;
        invoicePayload.remaining_amount = summary.total;
        invoicePayload.payment_status = "unpaid";
      }
      const salesDebitCode = (isCashInvoice && cashCode && !useVoucherAutoFlow) ? cashCode : "1130";
      const salesCreditCode = "4100";
      const purchaseDebitCode = "5110";
      const purchaseCreditCode = (isCashInvoice && cashCode && !useVoucherAutoFlow) ? cashCode : "2110";
      const transactionType = (isCashInvoice && !useVoucherAutoFlow)
        ? (form.type === "sales" ? "sale_cash" : "purchase_cash")
        : (form.type === "sales" ? "sale_credit" : "purchase_credit");
      const isForeign = form.currency !== "شيكل" && form.exchangeRate && form.exchangeRate !== 1;
      const amountILS = isForeign ? summary.total * form.exchangeRate : summary.total;

      const buildItemsPayload = (invoiceId: string) =>
        form.items
          .filter(i => i.description.trim())
          .map(item => {
            const bonusQty = Number(item.bonusQuantity || 0);
            // Cost / line_profit: only set for sales when product cost is known.
            // COGS includes bonus units (delivered = quantity + bonus_quantity).
            // VAT note: VAT is calculated only on paid quantity revenue.
            // Bonus VAT (deemed-supply) treatment may need accountant/legal review later.
            const prod = item.productId ? products.find(p => p.id === item.productId) : null;
            const buyPrice = Number(prod?.buy_price || 0);
            const isSalesLine = form.type === "sales";
            const cost_price = isSalesLine && buyPrice > 0 ? buyPrice : null;
            const lineRevenue = calcItemSubtotal(item); // qty*price - discount
            const line_profit = (isSalesLine && cost_price != null)
              ? Number((lineRevenue - cost_price * (item.quantity + bonusQty)).toFixed(4))
              : null;
            return {
              invoice_id: invoiceId,
              product_id: item.productId || null,
              product_name: item.description,
              quantity: item.quantity,
              bonus_quantity: bonusQty,
              unit_price: item.unitPrice,
              discount: item.discount,
              discount_type: item.discountType,
              tax_rate: item.taxRate,
              total_amount: lineRevenue,
              unit_of_measure: item.unitOfMeasure,
              fabric: item.fabric || null,
              workshop_id: item.workshopId || form.workshopId || null,
              cost_center_id: form.costCenterId || null,
              cost_price,
              line_profit,
            };
          });

      const syncContactBalance = async (targetContactId: string | null, delta: number) => {
        if (!targetContactId || !delta) return;
        const { data: contactRow } = await supabase
          .from("contacts")
          .select("current_balance")
          .eq("id", targetContactId)
          .eq("user_id", ownerId)
          .maybeSingle();
        if (!contactRow) return;
        await supabase
          .from("contacts")
          .update({ current_balance: Number(contactRow.current_balance || 0) + delta } as any)
          .eq("id", targetContactId)
          .eq("user_id", ownerId);
      };

      if (isEditMode && editInvoiceId) {
        const updatePayload: Record<string, any> = { ...invoicePayload };
        updatePayload.invoice_number = originalInvoiceRef.current?.invoiceNumber || nextInvoiceNumber;
        if (asDraft) {
          updatePayload.status = "draft";
        } else if (originalInvoiceRef.current?.status === "draft") {
          // Promote draft → sent when the user saves edits without keeping it as a draft.
          updatePayload.status = "sent";
        }

        const { error: updateError } = await supabase
          .from("invoices")
          .update(updatePayload as any)
          .eq("id", editInvoiceId)
          .eq("user_id", ownerId);

        if (updateError) throw updateError;

        const { error: deleteItemsError } = await supabase
          .from("invoice_items")
          .delete()
          .eq("invoice_id", editInvoiceId);

        if (deleteItemsError) throw deleteItemsError;

        const updatedItems = buildItemsPayload(editInvoiceId);
        if (updatedItems.length > 0) {
          const { error: itemsError } = await supabase.from("invoice_items").insert(updatedItems as any);
          if (itemsError) throw itemsError;
        }

        if (!asDraft) {
          const headerWorkshopEdit = form.workshopId
            ? workshops.find(w => w.id === form.workshopId)
            : null;
          const txPayload = {
            user_id: ownerId,
            transaction_date: form.date,
            description: `فاتورة ${form.type === "sales" ? "مبيعات" : "مشتريات"} ${originalInvoiceRef.current?.invoiceNumber || nextInvoiceNumber} - ${form.contactName}`,
            debit_account_code: form.type === "sales" ? salesDebitCode : purchaseDebitCode,
            credit_account_code: form.type === "sales" ? salesCreditCode : purchaseCreditCode,
            amount: amountILS,
            currency: form.currency,
            foreign_amount: isForeign ? summary.total : null,
            exchange_rate: isForeign ? form.exchangeRate : null,
            transaction_type: transactionType,
            contact_id: contactId,
            reference: originalInvoiceRef.current?.invoiceNumber || nextInvoiceNumber,
            payment_method: paymentMethodDb,
            idempotency_key: `INV-${editInvoiceId}`,
            is_deleted: false,
            workshop_id: form.workshopId || null,
            cost_center_name: headerWorkshopEdit?.name || null,
            cost_center_id: form.costCenterId || null,
          };

          let linkedTransactionId = originalInvoiceRef.current?.linkedTransactionId || null;
          if (!linkedTransactionId) {
            // Try idempotency_key first
            const { data: existingTx } = await supabase
              .from("transactions")
              .select("id")
              .eq("user_id", ownerId)
              .eq("idempotency_key", `INV-${editInvoiceId}`)
              .eq("is_deleted", false)
              .maybeSingle();
            linkedTransactionId = existingTx?.id || null;
          }
          if (!linkedTransactionId) {
            // Fallback: search by reference (invoice number) + contact
            const invoiceRef = originalInvoiceRef.current?.invoiceNumber || nextInvoiceNumber;
            const { data: refTx } = await supabase
              .from("transactions")
              .select("id")
              .eq("user_id", ownerId)
              .eq("reference", invoiceRef)
              .eq("is_deleted", false)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            linkedTransactionId = refTx?.id || null;
          }

          if (linkedTransactionId) {
            const { error: txUpdateError } = await supabase
              .from("transactions")
              .update(txPayload as any)
              .eq("id", linkedTransactionId)
              .eq("user_id", ownerId);
            if (txUpdateError) throw txUpdateError;
          } else {
            const { data: insertedTx, error: txInsertError } = await supabase
              .from("transactions")
              .insert(txPayload as any)
              .select("id")
              .single();
            if (txInsertError) throw txInsertError;
            linkedTransactionId = insertedTx.id;
          }

          await supabase
            .from("invoices")
            .update({ linked_transaction_id: linkedTransactionId } as any)
            .eq("id", editInvoiceId)
            .eq("user_id", ownerId);

          if (form.type === "sales") {
            const oldContactId = originalInvoiceRef.current?.contactId || null;
            // الأثر الصافي على رصيد الجهة = (الإجمالي − المدفوع):
            // نقدي مع سند تلقائي → المتبقي الحقيقي (جزئي/زائد)، آجل → كامل الإجمالي.
            const oldTotal = Number(originalInvoiceRef.current?.totalAmount);
            const oldPaid = Number(originalInvoiceRef.current?.paidAmount);
            const oldNet = Number.isFinite(oldTotal) && Number.isFinite(oldPaid)
              ? oldTotal - oldPaid
              : Number(originalInvoiceRef.current?.remainingAmount || 0);
            const newNet = useVoucherAutoFlow
              ? summary.total - cashPaid
              : Number(summary.remainingAmount || 0);
            if (oldContactId && oldContactId !== contactId) {
              await syncContactBalance(oldContactId, -oldNet);
              await syncContactBalance(contactId, newNet);
            } else {
              await syncContactBalance(contactId, newNet - oldNet);
            }
          }

          originalInvoiceRef.current = {
            linkedTransactionId,
            contactId: contactId || null,
            remainingAmount: useVoucherAutoFlow
              ? Math.max(0, summary.total - cashPaid)
              : Number(summary.remainingAmount || 0),
            paidAmount: useVoucherAutoFlow ? cashPaid : Number(summary.paidAmount || 0),
            totalAmount: summary.total,
            invoiceNumber: originalInvoiceRef.current?.invoiceNumber || nextInvoiceNumber,
            status: asDraft ? "draft" : "sent",
          };

          // ─── Stock + buy_price reconciliation on edit ───
          // Behaviour:
          // • Treat edit as a fresh post: refresh products.buy_price for purchases
          //   when the line carries a meaningful price (option A from spec).
          // • Apply ONLY the delta between original and new quantity per product
          //   so the on-hand stock doesn't double-count (avoids 10 → 25 bug).
          // • Fill default_supplier_id only when it's still empty (never overwrite).
          // • Cancelled invoices never reach this branch (handled by status flip
          //   elsewhere), so buy_price/default_supplier_id stay untouched.
          const oldByProduct = new Map<string, number>();
          for (const o of originalItemsRef.current) {
            oldByProduct.set(o.productId, (oldByProduct.get(o.productId) || 0) + Number(o.quantity || 0));
          }
          const newByProduct = new Map<string, { qty: number; bonus: number; price: number }>();
          for (const it of form.items) {
            if (!it.productId) continue;
            const cur = newByProduct.get(it.productId) || { qty: 0, bonus: 0, price: 0 };
            cur.qty += Number(it.quantity || 0);
            cur.bonus += form.type === "sales" ? Number(it.bonusQuantity || 0) : 0;
            cur.price = Number(it.unitPrice || 0) || cur.price;
            newByProduct.set(it.productId, cur);
          }
          const allProductIds = new Set<string>([...oldByProduct.keys(), ...newByProduct.keys()]);
          for (const pid of allProductIds) {
            const prod = products.find(p => p.id === pid);
            if (!prod) continue;
            const oldQty = oldByProduct.get(pid) || 0;
            const entry = newByProduct.get(pid);
            const newQty = entry ? entry.qty + entry.bonus : 0;
            const delta = form.type === "sales" ? -(newQty - oldQty) : (newQty - oldQty);
            const productUpdate: Record<string, any> = {};
            if (delta !== 0) {
              productUpdate.quantity = Number(prod.quantity || 0) + delta;
            }
            if (form.type === "purchase" && entry) {
              if (entry.price > 0 && form.currency === "شيكل") {
                productUpdate.buy_price = entry.price;
              }
              if (contactId && !prod.default_supplier_id) {
                productUpdate.default_supplier_id = contactId;
              }
            }
            if (Object.keys(productUpdate).length > 0) {
              await supabase.from("products").update(productUpdate as any).eq("id", pid);
            }
            if (delta !== 0) {
              // stock_movements are now written by the DB trigger
              // `sync_invoice_item_stock` (WB-1) keyed on invoice_items.id.
              // No frontend insert needed — keeping products.quantity update only.
            }
          }
          // Refresh snapshot so a subsequent save in the same session uses the new baseline.
          originalItemsRef.current = Array.from(newByProduct.entries()).map(([productId, v]) => ({
            productId,
            quantity: v.qty,
          }));
        }

        // ─── مزامنة السند التلقائي للفاتورة النقدية عند التعديل ───
        // وحدة واحدة ذرّية داخل قاعدة البيانات: تحديث/إنشاء السند وقيده وتخصيصه،
        // أو إلغاؤه بالكامل إذا تحوّلت الفاتورة إلى آجلة/مسودة.
        {
          const invoiceRefNo = originalInvoiceRef.current?.invoiceNumber || nextInvoiceNumber;
          const { data: syncRes, error: syncErr } = await (supabase as any).rpc("sync_cash_invoice_voucher", {
            p_user_id: ownerId,
            p_invoice_id: editInvoiceId,
            p_is_cash: !asDraft && useVoucherAutoFlow && !!contactId,
            p_invoice_type: form.type === "sales" ? "sales" : "purchase",
            p_contact_id: contactId || null,
            p_contact_name: form.contactName,
            p_amount: cashPaid,
            p_date: form.date,
            p_cash_account_code: cashCode,
            p_currency: form.currency,
            p_exchange_rate: isForeign ? form.exchangeRate : null,
            p_reference: invoiceRefNo,
            p_workshop_id: form.workshopId || null,
            p_cost_center_id: form.costCenterId || null,
            p_posted_by: user.id,
          });
          if (syncErr) throw syncErr;
          if (syncRes && (syncRes as any).success === false) {
            throw new Error((syncRes as any).error || tt("فشل مزامنة سند الفاتورة النقدية"));
          }
        }

        await supabase.from("invoice_activity_log").insert({
          invoice_id: editInvoiceId,
          user_id: ownerId,
          action: asDraft ? "updated_draft" : "updated",
          details: { total: summary.total, payment_method: paymentMethodDb },
        } as any);

        toast({ title: asDraft ? tt("تم حفظ التعديلات كمسودة ✅") : tt("تم تحديث الفاتورة ✅") });
        clearDraft();
        navigate("/invoices");
        return;
      }

      const createInvoiceHeader = () => supabase
        .from("invoices")
        .insert({
          ...invoicePayload,
          user_id: ownerId,
          source: "manual",
          status: asDraft ? "draft" : "sent",
        } as any)
        .select("id, invoice_number")
        .single();

      let { data: dbInv, error: invErr } = await createInvoiceHeader();
      if (invErr && isDuplicateInvoiceNumberError(invErr)) {
        // Retry once with the same payload. The DB trigger now owns invoice_number
        // and advances past stale sequences / cancelled numbers atomically.
        ({ data: dbInv, error: invErr } = await createInvoiceHeader());
        if (invErr && isDuplicateInvoiceNumberError(invErr)) {
          throw new Error(tt("تعذر توليد رقم فاتورة جديد. حدّث الصفحة وحاول مرة أخرى."));
        }
      }

      if (invErr || !dbInv) throw invErr ?? new Error("Invoice insert failed");
      createdInvoiceId = dbInv.id;

      const itemsToInsert = buildItemsPayload(dbInv.id);
      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase.from("invoice_items").insert(itemsToInsert as any);
        if (itemsError) throw itemsError;
      }

      if (!asDraft) {
        for (const item of form.items) {
          if (!item.productId) continue;
          const prod = products.find(p => p.id === item.productId);
          if (!prod) continue;

          // Sales: deduct delivered quantity (quantity + bonus). Purchase bonus is out of scope.
          const bonusQty = form.type === "sales" ? Number(item.bonusQuantity || 0) : 0;
          const deliveredQty = item.quantity + bonusQty;
          const newQty = form.type === "sales"
            ? Number(prod.quantity) - deliveredQty
            : Number(prod.quantity) + item.quantity;

          // ─── Purchase invoice: refresh buy_price & supplier link ───
          // - buy_price is the single source of "سعر الشراء" displayed on the
          //   products screen (no separate last_purchase_price column exists).
          //   We update it only when the line carries a meaningful price.
          // - default_supplier_id is filled when the product was not yet
          //   linked to any supplier, so future purchase invoices prioritise it.
          const productUpdate: Record<string, any> = { quantity: newQty };
          if (form.type === "purchase") {
            const linePrice = Number(item.unitPrice || 0);
            if (linePrice > 0 && form.currency === "شيكل") {
              productUpdate.buy_price = linePrice;
            }
            if (contactId && !prod.default_supplier_id) {
              productUpdate.default_supplier_id = contactId;
            }
          }
          await supabase.from("products").update(productUpdate as any).eq("id", item.productId);
          // stock_movements are written by the DB trigger
          // `sync_invoice_item_stock` (WB-1) on invoice_items INSERT.
        }

        // ─── Post the GL entry (credit-only invoices) ───
        // Sales: Dr 1130 AR / Cr 4100 Revenue (legacy direct)
        // Purchase: Dr 5110 Purchases / Cr 2110 AP (legacy direct)
        // Phase 5H: when invoices_use_rpc is ON, route through
        // create_invoice_with_entry which validates parent accounts
        // and uses tenant sub-accounts (1115/1131/2111/4110/5111).
        const headerWorkshop = form.workshopId
          ? workshops.find(w => w.id === form.workshopId)
          : null;
        // Force the legacy direct-insert path for cash invoices when we are
        // still overriding the cash leg (edit mode) — the RPC doesn't support
        // that. When we route through AR/AP + auto voucher (useVoucherAutoFlow),
        // the RPC is safe to use because codes are the standard AR/AP.
        const useInvoiceRpc = isInvoicesRpcEnabled(companySettings) && (!isCashInvoice || useVoucherAutoFlow);
        let txDataId: string;
        if (useInvoiceRpc) {
          const rpcRes = await callCreateInvoiceLedgerRpc({
            userId: user.id,
            contactId: contactId || null,
            contactName: form.contactName,
            amount: amountILS,
            description: `فاتورة ${form.type === "sales" ? "مبيعات" : "مشتريات"} ${dbInv.invoice_number} - ${form.contactName}`,
            // ─── إصلاح: عندما يكون مسار السند التلقائي مفعّلاً للفواتير النقدية،
            // نُجبر الـ RPC على تقييد الفاتورة على الذمم (AR/AP) بتمرير 'آجل'،
            // حتى يستطيع سند القبض/الصرف التلقائي أدناه إقفالها بشكل صحيح.
            // بدون ذلك، الـ RPC يقيّد الفاتورة على الصندوق مباشرةً فيتولّد
            // رصيد وهمي (دائن) على حساب العميل بمقدار قيمة الفاتورة.
            paymentMethod: useVoucherAutoFlow ? "آجل" : paymentMethodDb,
            currency: form.currency,
            idempotencyKey: `INV-${dbInv.id}`,
            invoiceType: form.type === "sales" ? "sales" : "purchase",
            transactionDate: form.date,
            foreignAmount: isForeign ? summary.total : null,
            exchangeRate: isForeign ? form.exchangeRate : null,
            reference: dbInv.invoice_number,
            workshopId: form.workshopId || null,
            costCenterName: headerWorkshop?.name || null,
          });
          if (!rpcRes.success || !rpcRes.transaction_id) {
            throw new Error(rpcRes.error || "Invoice ledger RPC failed");
          }
          txDataId = rpcRes.transaction_id;
        } else {
        const { data: txData, error: txError } = await supabase.from("transactions").insert({
          user_id: ownerId,
          transaction_date: form.date,
          description: `فاتورة ${form.type === "sales" ? "مبيعات" : "مشتريات"} ${dbInv.invoice_number} - ${form.contactName}`,
          debit_account_code: form.type === "sales" ? salesDebitCode : purchaseDebitCode,
          credit_account_code: form.type === "sales" ? salesCreditCode : purchaseCreditCode,
          amount: amountILS,
          currency: form.currency,
          foreign_amount: isForeign ? summary.total : null,
          exchange_rate: isForeign ? form.exchangeRate : null,
          transaction_type: transactionType,
          contact_id: contactId,
          reference: dbInv.invoice_number,
          payment_method: paymentMethodDb,
          idempotency_key: `INV-${dbInv.id}`,
          workshop_id: form.workshopId || null,
          cost_center_name: headerWorkshop?.name || null,
          cost_center_id: form.costCenterId || null,
        } as any).select("id").single();
        if (txError) throw txError;
          txDataId = txData.id;
        }
        createdInvoiceTxId = txDataId;

        const { error: linkError } = await supabase.from("invoices").update({ linked_transaction_id: txDataId } as any).eq("id", dbInv.id).eq("user_id", ownerId);
        if (linkError) console.error("Failed to link transaction to invoice:", linkError);
        if (form.type === "sales") {
          // الأثر الصافي على رصيد الجهة = (الإجمالي − المدفوع): الفاتورة ترفع الذمة
          // بالإجمالي وسند القبض التلقائي يخفضها بالمدفوع — فيبقى المتبقي فقط.
          // سداد كامل → 0 (كما كان)، جزئي → المتبقي، زائد → سالب (رصيد دائن).
          const contactDelta = useVoucherAutoFlow
            ? (summary.total - cashPaid)
            : Number(summary.remainingAmount || 0);
          await syncContactBalance(contactId, contactDelta);
        }
        originalInvoiceRef.current = {
          linkedTransactionId: txDataId,
          contactId: contactId || null,
          remainingAmount: useVoucherAutoFlow
            ? Math.max(0, summary.total - cashPaid)
            : Number(summary.remainingAmount || 0),
          paidAmount: useVoucherAutoFlow ? cashPaid : Number(summary.paidAmount || 0),
          totalAmount: summary.total,
          invoiceNumber: dbInv.invoice_number,
          status: asDraft ? "draft" : "sent",
        };

        // ─── Auto-create receipt/payment voucher for cash invoices ───
        // Sales cash → سند قبض (Dr Cash / Cr AR 1130) with allocation to this invoice
        // Purchase cash → سند صرف (Dr AP 2110 / Cr Cash) with allocation to this invoice
        // This makes the cash movement appear as a proper voucher document in
        // the vouchers list and prints as سند قبض / سند صرف رسمي.
        if (useVoucherAutoFlow && contactId && cashPaid > 0) {
          try {
            const isSales = form.type === "sales";
            const voucherAmount = cashPaid;
            const voucherParams = {
              userId: ownerId,
              contactId,
              contactName: form.contactName,
              amount: voucherAmount,
              paymentMethod: "نقدي",
              description: `${isSales ? tt("سند قبض تلقائي") : tt("سند صرف تلقائي")} — فاتورة ${dbInv.invoice_number}`,
              currency: form.currency,
              voucherDate: form.date,
              exchangeRate: isForeign ? form.exchangeRate : null,
              reference: dbInv.invoice_number,
              cashAccountCode: cashCode!,
              idempotencyKey: `INV-VOUCHER-${dbInv.id}`,
              // نخصّم من الفاتورة بحد أقصى إجماليها — أي زيادة تبقى رصيداً غير مخصص
              // على حساب الجهة (دائن للزبون / سلفة للمورد) كالسندات اليدوية تماماً.
              allocations: [{ invoice_id: dbInv.id, amount: Math.min(voucherAmount, summary.total) }],
              workshopId: form.workshopId || null,
              costCenterId: form.costCenterId || null,
            };
            const voucherResult = isSales
              ? await callCreateReceiptRpc(voucherParams)
              : await callCreatePaymentRpc(voucherParams);
            if (voucherResult?.success === false || !voucherResult?.transaction_id) {
              throw new Error(voucherResult?.error || tt("فشل إنشاء قيد السند التلقائي"));
            }
            createdAutoVoucherTxId = voucherResult.transaction_id;

            if (isSales) {
              const { data: receiptDoc, error: receiptDocError } = await supabase
                .from("receipt_vouchers")
                .insert({
                  user_id: ownerId,
                  receipt_number: null,
                  contact_id: contactId,
                  contact_name: form.contactName,
                  payment_date: form.date,
                  amount: voucherAmount,
                  payment_method: "نقدي",
                  cash_box_id: null,
                  bank_account_id: null,
                  deposit_account_code: cashCode,
                  notes: `سند قبض تلقائي لفاتورة ${dbInv.invoice_number}`,
                  status: "posted",
                  linked_transaction_id: voucherResult.transaction_id,
                  auto_allocate: true,
                  workshop_id: form.workshopId || null,
                } as any)
                .select("id, receipt_number")
                .single();
              if (receiptDocError) throw receiptDocError;
              if (receiptDoc?.receipt_number) {
                await supabase
                  .from("transactions")
                  .update({ reference: receiptDoc.receipt_number } as any)
                  .eq("id", voucherResult.transaction_id)
                  .eq("user_id", ownerId);
              }
            } else {
              const { data: paymentDoc, error: paymentDocError } = await supabase
                .from("vouchers")
                .insert({
                  user_id: ownerId,
                  type: "payment",
                  subtype: "normal",
                  ref_number: null,
                  date: form.date,
                  contact_id: contactId,
                  payment_method: "cash",
                  amount: voucherAmount,
                  amount_ils: isForeign ? voucherAmount * form.exchangeRate : voucherAmount,
                  currency: form.currency === "شيكل" ? "ILS" : form.currency,
                  exchange_rate: form.exchangeRate || 1,
                  description: `سند صرف تلقائي لفاتورة ${dbInv.invoice_number}`,
                  notes: `سند صرف تلقائي لفاتورة ${dbInv.invoice_number}`,
                  status: "posted",
                  linked_transaction_id: voucherResult.transaction_id,
                  posted_by: user.id,
                  posted_at: new Date().toISOString(),
                  workshop_id: form.workshopId || null,
                  cost_center_id: form.costCenterId || null,
                } as any)
                .select("id, ref_number")
                .single();
              if (paymentDocError) throw paymentDocError;
              if (paymentDoc?.ref_number) {
                await supabase
                  .from("transactions")
                  .update({ reference: paymentDoc.ref_number } as any)
                  .eq("id", voucherResult.transaction_id)
                  .eq("user_id", ownerId);
              }
            }
          } catch (voucherErr: any) {
            console.error("Auto voucher creation failed:", voucherErr);
            throw new Error(voucherErr?.message || tt("فشل إنشاء سند القبض/الصرف التلقائي للفاتورة النقدية"));
          }
        }
      }

      // Tax ledger integration
      if (!asDraft && summary.totalTax > 0) {
        const invoiceDate = new Date(form.date);
        await supabase.from("tax_ledger" as any).insert({
          user_id: ownerId,
          tax_type: form.type === "sales" ? "output" : "input",
          net_amount: summary.subtotal - summary.totalDiscount,
          tax_rate: 16,
          tax_amount: summary.totalTax,
          total_amount: summary.total,
          reference_type: form.type === "sales" ? "invoice" : "purchase",
          reference_id: dbInv.id,
          reference_number: dbInv.invoice_number,
          contact_name: form.contactName,
          description: `فاتورة ${form.type === "sales" ? "مبيعات" : "مشتريات"} ${dbInv.invoice_number}`,
          transaction_date: form.date,
          period_year: invoiceDate.getFullYear(),
          period_month: invoiceDate.getMonth() + 1,
        } as any);
      }

      await supabase.from("invoice_activity_log").insert({
        invoice_id: dbInv.id,
        user_id: ownerId,
        action: asDraft ? "created_draft" : "created",
        details: { total: summary.total, payment_method: paymentMethodDb },
      } as any);

      // If linked to a workshop, mark it as completed
      if (workshopId && !asDraft) {
        await supabase.from("workshops").update({
          status: "completed",
          actual_end_date: new Date().toISOString().split("T")[0],
          updated_at: new Date().toISOString(),
        } as any).eq("id", workshopId);
      }

      // If invoice originated from an order, mark that order as invoiced
      if (linkedOrderId && !asDraft) {
        await supabase.from("orders").update({
          status: "مفوتر",
          invoice_id: dbInv.id,
          invoiced_at: new Date().toISOString(),
          invoiced_by: ownerId,
        } as any).eq("id", linkedOrderId);
      }

      toast({ title: asDraft ? tt("تم حفظ المسودة ✅") : `تم إنشاء الفاتورة ${dbInv.invoice_number} ✅` });
      clearDraft();
      navigate(workshopId ? "/workshops" : linkedOrderId ? "/orders" : "/invoices");
    } catch (err: any) {
      console.error("Invoice save error:", err);
      if (!isEditMode && createdInvoiceId) {
        try {
          await supabase.from("invoice_items").delete().eq("invoice_id", createdInvoiceId);
          if (createdInvoiceTxId) {
            await supabase
              .from("transactions")
              .update({ is_deleted: true, idempotency_key: null } as any)
              .eq("id", createdInvoiceTxId)
              .eq("user_id", ownerId);
          }
          if (createdAutoVoucherTxId) {
            await supabase
              .from("transactions")
              .update({ is_deleted: true, idempotency_key: null } as any)
              .eq("id", createdAutoVoucherTxId)
              .eq("user_id", ownerId);
          }
          await supabase
            .from("invoices")
            .update({
              status: "cancelled",
              is_voided: true,
              voided_at: new Date().toISOString(),
              void_reason: "rollback_after_posting_failure",
            } as any)
            .eq("id", createdInvoiceId)
            .eq("user_id", ownerId);
        } catch (cleanupErr) {
          console.error("Invoice rollback cleanup failed:", cleanupErr);
        }
      }
      const message = isDuplicateInvoiceNumberError(err)
        ? tt("تعذر توليد رقم فاتورة جديد. حدّث الصفحة وحاول مرة أخرى.")
        : formatDbError(err, tt("تعذّر حفظ الفاتورة"));
      toast({ title: tt("خطأ في حفظ الفاتورة"), description: message, variant: "destructive" });
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  // Keep ref pointed to latest handleCreate so memoized ActionPane tabs
  // always invoke the fresh closure (otherwise validation reads stale state).
  handleCreateRef.current = handleCreate;

  // ─── Print Preview ───
  const buildPrintInvoice = () => ({
    type: form.type,
    invoiceNumber: nextInvoiceNumber,
    date: form.date,
    dueDate: form.dueDate,
    contactName: form.contactName || "—",
    contactTaxNumber: customerOverrides.tax_number || selectedContact?.tax_number,
    contactPhone: customerOverrides.phone || selectedContact?.phone,
    contactEmail: customerOverrides.email || selectedContact?.email,
    contactAddress: customerOverrides.address || selectedContact?.address,
    items: form.items.map(i => ({
      description: i.description || "—",
      productCode: (() => {
        if (!i.productId) return undefined;
        const p: any = products.find(p => p.id === i.productId);
        return p?.sku || p?.barcode || undefined;
      })(),
      quantity: i.quantity,
      bonusQuantity: Number(i.bonusQuantity || 0),
      unitPrice: i.unitPrice,
      discount: i.discountType === "percent" ? i.quantity * i.unitPrice * (i.discount / 100) : i.discount,
      taxRate: i.taxRate,
      taxCategory: i.taxCategory,
      subtotal: calcItemSubtotal(i),
    })),
    notes: form.notes,
    status: isEditMode ? "sent" : "draft",
    paymentMethod: form.paymentMethod,
    subtotal: summary.subtotal,
    totalDiscount: summary.totalDiscount,
    totalTax: summary.totalTax,
    total: summary.total,
    paidAmount: summary.paidAmount,
    remainingAmount: summary.remainingAmount,
    currency: form.currency,
    terms: invoiceTerms || "",
    taxInclusive: form.taxInclusive,
  });

  const handlePrint = (previewOnly: boolean = false) => {
    const baseInvoice = buildPrintInvoice();
    // الرصيد الختامي للجهة بعد احتساب الفاتورة الحالية
    const baselineBalance = contactStatementBalance ?? selectedContact?.balance ?? (selectedContact as any)?.current_balance ?? null;
    let closingBalance: number | undefined;
    if (baselineBalance != null) {
      const remaining = Number(baseInvoice.remainingAmount || 0);
      // مبيعات: تزيد ذمة العميل (مدين). مشتريات: تزيد ذمة المورد (دائن => سالب).
      const delta = baseInvoice.type === "sales" ? remaining : -remaining;
      // إن كنا في وضع تعديل فاتورة محفوظة، الرصيد الأصلي يشملها فعلاً، فلا نضيف delta.
      closingBalance = isEditMode ? Number(baselineBalance) : Number(baselineBalance) + delta;
    }
    // الرصيد قبل الفاتورة = الختامي مطروحاً منه أثر هذه الفاتورة
    const openingBalance = closingBalance != null
      ? closingBalance - (baseInvoice.type === "sales" ? Number(baseInvoice.remainingAmount || 0) : -Number(baseInvoice.remainingAmount || 0))
      : null;
    const previewInvoice = closingBalance != null
      ? {
          ...baseInvoice,
          contactClosingBalance: closingBalance,
          contactClosingBalanceLabel: baseInvoice.type === "sales" ? "رصيد العميل بعد الفاتورة" : "رصيد المورد بعد الفاتورة",
          contactOpeningBalance: openingBalance ?? undefined,
          contactOpeningBalanceLabel: baseInvoice.type === "sales" ? "رصيد العميل قبل الفاتورة" : "رصيد المورد قبل الفاتورة",
        }
      : baseInvoice;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html dir="rtl"><head><title>فاتورة ${previewInvoice.invoiceNumber}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: white; } @media print { @page { margin: 8mm; size: A4; } }</style>
    </head><body><div id="print-root"></div></body></html>`);
    win.document.close();
    setTimeout(() => {
      const container = win.document.getElementById("print-root");
      if (container) {
        const root = createRoot(container);
        root.render(<InvoicePrintView invoice={previewInvoice} settings={companySettings} copyLabel={isEditMode && !previewOnly ? tt("أصلية") : tt("معاينة")} />);
        if (!previewOnly) setTimeout(() => win.print(), 500);
      }
    }, 200);
  };

  // Keep ref pointed to latest handlePrint so memoized ActionPane tabs
  // always invoke the fresh closure (otherwise it captures the initial
  // nextInvoiceNumber "..." placeholder).
  handlePrintRef.current = handlePrint;

  // ─── Delete Invoice ───
  const handleDeleteInvoice = async () => {
    if (!editInvoiceId || !user) return;
    try {
      const { error } = await supabase.from("invoices").update({ status: "cancelled" } as any).eq("id", editInvoiceId);
      if (error) throw error;
      toast({ title: tt("تم حذف الفاتورة بنجاح") });
      navigate("/invoices");
    } catch (err: any) {
      toast({ title: tt("خطأ في حذف الفاتورة"), description: err.message, variant: "destructive" });
    }
  };

  // ─── New Similar ───
  const handleNewSimilar = () => {
    // Save full form data to localStorage for the new page to pick up
    const duplicateData = {
      _sourceRef: nextInvoiceNumber || originalInvoiceRef.current?.invoiceNumber || "",
      type: form.type,
      contactName: form.contactName,
      contactId: form.contactId,
      contactSearch: form.contactName,
      paymentTerms: form.paymentTerms,
      paymentMethod: form.paymentMethod,
      invoiceKind: form.invoiceKind,
      cashAccountCode: form.cashAccountCode,
      currency: form.currency,
      exchangeRate: form.exchangeRate,
      notes: form.notes,
      notesInternal: form.notesInternal,
      salespersonId: form.salespersonId,
      billingAddress: form.billingAddress,
      taxInclusive: form.taxInclusive,
      warehouseId: form.warehouseId,
      workshopId: form.workshopId,
      customerOverrides,
      invoiceTerms,
      items: form.items.map(item => ({
        ...item,
        id: crypto.randomUUID(), // new IDs for the copy
      })),
    };
    localStorage.setItem("draft_invoice_new", JSON.stringify(duplicateData));
    const params = new URLSearchParams();
    params.set("type", form.type);
    params.set("from_duplicate", "true");
    navigate(`/invoices/new?${params.toString()}`);
    toast({ title: tt("تم نسخ بيانات الفاتورة — راجع وعدّل قبل الحفظ ✓") });
  };

  // WhatsApp send
  const handleWhatsApp = () => {
    if (!selectedContact?.phone) {
      toast({ title: tt("لا يوجد رقم هاتف للزبون"), variant: "destructive" });
      return;
    }
    const phone = selectedContact.phone.replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(
      `السلام عليكم ${form.contactName}،\nنرفق فاتورتكم بمبلغ ${fmtCurrency(summary.total)} مستحقة بتاريخ ${form.dueDate || form.date}\n\n${companySettings.company_name || "ZIDNI"} — ${companySettings.phone || ""}`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  // ─── Phase 2: Power-user keyboard shortcuts ───
  // Ctrl/Cmd+Enter → save invoice, Alt+N → add a new row.
  useInvoiceKeyboard({
    enabled: !loadingEditInvoice && !creating,
    onSave: () => handleCreate(false),
    onAddRow: addItemAndFocus,
  });

  const itemIds = form.items.map(i => i.id);
  const handleCellEnter = useCallback(
    (field: "qty" | "price" | "discount" | "tax", itemId: string) =>
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        e.stopPropagation();
        focusNextInvoiceCell(field, itemId, itemIds, addItemAndFocus);
      },
    [itemIds, addItemAndFocus],
  );

  // ─── Start a brand-new invoice ───
  // Wipes ALL working state so nothing leaks from a previously-edited invoice
  // or auto-saved draft. Used by the "جديد" button in the toolbar.
  const startNewInvoice = useCallback(() => {
    suppressRestoreRef.current = true;
    // Clear the autosaved draft first so the banner does not pop back up.
    try { clearDraft(); } catch { /* noop */ }

    setForm({
      type: form.type,
      contactName: "",
      contactId: null,
      date: new Date().toISOString().split("T")[0],
      dueDate: "",
      paymentTerms: "net_30",
      paymentMethod: "credit",
      invoiceKind: "credit",
      cashAccountCode: null,
      currency: tt("شيكل"),
      exchangeRate: 1,
      notes: "",
      notesInternal: "",
      salespersonId: null,
      billingAddress: "",
      taxInclusive: false,
      warehouseId: null,
      workshopId: null,
      costCenterId: null,
      items: [{ ...createEmptyItem(), taxCategory: defaultTaxCategory, taxRate: defaultTaxCategory === "taxable" ? 16 : 0 }],
      invoiceDiscount: 0,
      invoiceDiscountType: "amount",
    });
    setContactSearch("");
    setSelectedContact(null);
    setCustomerOverrides({ phone: "", email: "", tax_number: "", address: "" });
    setContactDebtWarning(null);
    setAttachments([]);
    setInvoiceTerms(defaultTerms);
    setProductSearchByRow({});
    setDraftStatus("idle");
    originalInvoiceRef.current = null;

    // If we are on an edit URL, leave it so we are unambiguously on the new path.
    if (isEditMode) {
      navigate("/invoices/new", { replace: true });
    }
    toast({ title: tt("تم بدء فاتورة جديدة") });
  }, [form.type, defaultTaxCategory, defaultTerms, clearDraft, isEditMode, navigate, toast]);

  // Restore a draft chosen explicitly from the drafts history dialog.
  const restoreDraftFromHistory = useCallback((data: any) => {
    if (!data) return;
    const formData = data?.form ?? data;
    if (!formData) return;
    setForm(formData as typeof form);
    setContactSearch(data?.contactSearch || formData?.contactName || "");
    setCustomerOverrides(data?.customerOverrides || { phone: "", email: "", tax_number: "", address: "" });
    setInvoiceTerms(data?.invoiceTerms ?? "");
    setAttachments(Array.isArray(data?.attachments) ? data.attachments : []);
    // Make sure we're on a clean "new invoice" URL — never carry an edit id over.
    if (isEditMode) navigate("/invoices/new", { replace: true });
    toast({ title: tt("تم استعادة المسودة ✓") });
  }, [isEditMode, navigate, toast]);

  // ─── Action Pane tabs (FinanceShell) — same shape as VoucherFormPage ───
  const goToAdjacentInvoice = async (direction: "prev" | "next") => {
    if (!user) return;
    try {
      // Always resolve the current invoice's created_at from the DB so navigation
      // stays consistent after moving between invoices (never rely on a stale
      // window global that only reflected the first-loaded invoice).
      let cursor: string | undefined;
      if (isEditMode && editInvoiceId) {
        const { data: cur } = await supabase
          .from("invoices")
          .select("created_at")
          .eq("id", editInvoiceId)
          .maybeSingle();
        cursor = (cur as any)?.created_at ?? undefined;
      }
      let q = supabase
        .from("invoices")
        .select("id, invoice_number, created_at")
        .eq("user_id", ownerId)
        .eq("invoice_type", form.type === "sales" ? "sale" : "purchase");
      if (isEditMode && cursor) {
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
        toast({ title: direction === "prev" ? tt("لا توجد فاتورة سابقة") : tt("لا توجد فاتورة تالية") });
        return;
      }
      navigate(`/invoices/new?edit=${target.id}`);
    } catch (err: any) {
      toast({ title: tt("تعذر التنقل بين الفواتير"), description: err.message, variant: "destructive" });
    }
  };

  const invoiceActionTabs: ActionTab[] = useMemo(() => {
    const pageTitle = isEditMode ? tt("تعديل الفاتورة") : tt("إنشاء فاتورة جديدة");
    const inEdit = isEditMode;
    const newGroup = {
      key: "new", label: tt("جديد"), items: [
        { key: "new", label: tt("فاتورة جديدة"), icon: Plus, variant: "primary" as const,
          onClick: () => startNewInvoice() },
        ...(inEdit ? [{ key: "duplicate", label: tt("إنشاء مشابه"), icon: Copy,
          onClick: () => handleNewSimilar() }] : []),
      ],
    };
    const saveGroup = inEdit
      ? { key: "save", label: tt("حفظ"), items: [
          { key: "edit", label: isReadOnly ? tt("تعديل") : tt("إلغاء التعديل"), icon: isReadOnly ? Pencil : Lock,
            variant: isReadOnly ? ("primary" as const) : undefined,
            onClick: () => setIsReadOnly(prev => !prev) },
          { key: "update", label: tt("حفظ التعديلات"), icon: Save, variant: "primary" as const,
            onClick: () => handleCreateRef.current?.(false), disabled: isReadOnly || creating,
            tooltip: isReadOnly ? tt("اضغط تعديل أولاً") : undefined },
          { key: "delete", label: tt("حذف الفاتورة"), icon: Trash2,
            onClick: () => setShowDeleteConfirm(true) },
        ]}
      : { key: "save", label: tt("حفظ"), items: [
          { key: "draft", label: tt("حفظ كمسودة"), icon: Save,
            onClick: () => handleCreateRef.current?.(true), disabled: creating },
          { key: "post", label: tt("حفظ وترحيل"), icon: CheckCircle, variant: "primary" as const,
            onClick: () => handleCreateRef.current?.(false), disabled: creating },
        ]};
    const viewGroup = { key: "view", label: tt("عرض"), items: [
      { key: "preview", label: tt("معاينة"), icon: Eye,     onClick: () => handlePrintRef.current?.(true) },
      { key: "print",   label: tt("طباعة"),  icon: Printer, onClick: () => handlePrintRef.current?.(false) },
    ]};
    const navGroup = { key: "nav", label: tt("تنقل"), items: [
      { key: "prev", label: tt("السابق"), icon: ChevronRight, onClick: () => goToAdjacentInvoice("prev") },
      { key: "next", label: tt("التالي"), icon: ChevronLeft,  onClick: () => goToAdjacentInvoice("next") },
      { key: "inquiry", label: tt("استعلام"), icon: ListChecks, onClick: () => navigate("/invoices") },
      { key: "center",  label: tt("فتح مركز المالية"), icon: Calculator, onClick: () => navigate("/accounting-center") },
    ]};
    return [{ key: "general", label: tt("عام"), groups: [newGroup, saveGroup, viewGroup, navGroup] }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, isReadOnly, creating]);

  // Ctrl/Cmd+Enter is already wired via useInvoiceKeyboard above (onSave → handleCreate).

  // ─── RENDER ───
  if (loadingEditInvoice) {
    return (
      <div className="px-4 lg:px-8 pt-10 pb-10 max-w-5xl mx-auto" dir="rtl">
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tt("جاري تحميل بيانات الفاتورة...")}
        </div>
      </div>
    );
  }

  return (
    <>
    {/* Compact D365-style header — sticky above the horizontal accounting scroller.
        Must live OUTSIDE <AccountingShell> because that wrapper creates its own
        overflow context, which cancels position:sticky. */}
    <div className="sticky top-0 z-40 px-4 lg:px-6 pt-1 pb-1 border-b border-border bg-card shadow-sm">
      <nav className="flex items-center gap-1 text-[10.5px] text-muted-foreground mb-0.5">
        <Link to="/accounting-center" className="hover:text-foreground">{tt("المالية")}</Link>
        <ChevronLeft className="h-3 w-3 rotate-180" />
        <Link to="/invoices" className="hover:text-foreground">{tt("الفواتير")}</Link>
        <ChevronLeft className="h-3 w-3 rotate-180" />
        <span>{isEditMode ? (isReadOnly ? tt("عرض الفاتورة") : tt("تعديل الفاتورة")) : tt("إنشاء فاتورة")}</span>
      </nav>
      <div className="flex items-center gap-2">
        <h1 className="text-[15px] font-bold text-foreground truncate shrink-0 flex items-center gap-2">
          {isEditMode ? (isReadOnly ? tt("عرض الفاتورة") : tt("تعديل الفاتورة")) : tt("إنشاء فاتورة جديدة")}
          {isEditMode && nextInvoiceNumber && (
            <span className="text-[12px] font-normal text-muted-foreground">— {nextInvoiceNumber}</span>
          )}
        </h1>
        <div className="h-6 w-px bg-border shrink-0 mx-1" />
        <div className="flex-1 min-w-0 flex justify-start">
          <CompactActionRibbon tabs={invoiceActionTabs} />
        </div>
      </div>
    </div>
    <AccountingShell>
    <SmartFormScope
      className="px-4 lg:px-6 pt-3 pb-32 w-full max-w-[1600px] mx-auto"
      firstFieldSelector="input[data-smart-first], [data-smart-first] input, [data-smart-first]"
      disableAutoFocus={isEditMode}
    >
    <div dir="rtl" className="contents">
      {/* Duplicate Banner */}
      {duplicateSourceRef && <DuplicateBanner sourceRef={duplicateSourceRef} />}

      {/* Draft Restore Banner — يظهر عند العودة لصفحة فيها مسودة محفوظة تلقائياً */}
      {hasDraft && !isEditMode && !suppressRestoreRef.current && (
        <DraftRestoreBanner
          onRestore={restoreDraft}
          onDismiss={() => { suppressRestoreRef.current = true; clearDraft(); }}
          savedAt={draftSavedAt}
          label={`يوجد مسودة فاتورة محفوظة تلقائياً — ${form.items.length} بند`}
        />
      )}

      {/* Edit-mode view banner (mirrors voucher behaviour) */}
      {isEditMode && (
        <div className={`mt-4 mb-2 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border ${isReadOnly ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"}`}>
          <div className="flex items-center gap-2 text-xs font-semibold">
            {isReadOnly ? <Lock className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            <span>
              {isReadOnly
                ? `وضع العرض — الفاتورة ${nextInvoiceNumber}. اضغط tt("تعديل") للتعديل أو tt("إنشاء مشابه") لنسخها.`
                : `وضع التعديل — الفاتورة ${nextInvoiceNumber}. اضغط tt("حفظ التعديلات") لحفظ التغييرات.`}
            </span>
          </div>
        </div>
      )}

      {/* Warranty Cards Action — only in edit mode for sales invoices */}
      {isEditMode && form.type === "sales" && editInvoiceId && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10"
            onClick={() => setShowWarrantyDialog(true)}
          >
            <Shield className="h-4 w-4" />
            {tt("إنشاء بطاقات كفالة")}
          </Button>
        </div>
      )}

      {/* View-mode lock: disable every form control inside the main form
          when isReadOnly. Uses <fieldset disabled> which natively disables
          all descendant inputs/buttons/selects without per-field plumbing.
          `contents` class keeps the grid layout intact. */}
      <fieldset disabled={isReadOnly} className="contents">
      {/* ═══════════════════════════════════════════════════════════════
          PROFESSIONAL ACCOUNTING-GRADE LAYOUT — 12-column grid (RTL)
          ───────────────────────────────────────────────────────────────
          Top row    : [Invoice Form  col-span-8] [Sticky Summary col-span-4]
          Middle row : [Items Table                              col-span-12]
          Bottom row : [Notes + Terms + Attach                    col-span-12]
          (Final totals are NOT duplicated — the top sticky summary is the
          single source of truth for totals, mirrored in the sticky action bar.)
          All cards share the same horizontal gutters (gap-6) and align
          perfectly on the same baselines — QuickBooks / Odoo style.
          ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start mt-2">

      {/* ───── TOP-LEFT (RTL right): Invoice Form — 8 cols ───── */}
      <div className="lg:col-span-8 min-w-0">
      <Card className="border border-border/60 shadow-sm rounded-2xl">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />{tt("بيانات الفاتورة")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {/* Type Toggle — compact segmented control aligned to the right (RTL) */}
          <div className="flex justify-start">
            <div
              role="tablist"
              aria-label={tt("نوع الفاتورة")}
              className="inline-flex w-full max-w-[420px] rounded-xl border border-border bg-muted/40 p-1 shadow-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={form.type === "sales"}
                onClick={() => setForm(p => ({ ...p, type: "sales" }))}
                className={`flex-1 h-9 rounded-lg text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  form.type === "sales"
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Receipt className="h-3.5 w-3.5" />{tt("فاتورة مبيعات")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={form.type === "purchase"}
                onClick={() => setForm(p => ({ ...p, type: "purchase" }))}
                className={`flex-1 h-9 rounded-lg text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  form.type === "purchase"
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ShoppingCart className="h-3.5 w-3.5" />{tt("فاتورة مشتريات")}
              </button>
            </div>
          </div>

          {/* Row 1 (Enter order): Issue Date → Currency → Due Date → Payment Terms · Invoice # is read-only on the right */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">{tt("تاريخ الإصدار")}</label>
              <TypedDateInput
                value={form.date}
                onChange={(v) => setForm(p => ({ ...p, date: v }))}
                ariaLabel={tt("تاريخ الإصدار")}
                inputProps={{ "data-smart-first": "true" }}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">{tt("العملة")}</label>
              <Select value={form.currency} onValueChange={async (v) => {
                setForm(p => ({ ...p, currency: v, exchangeRate: v === "شيكل" ? 1 : p.exchangeRate }));
                if (v !== "شيكل" && user) {
                  const codeMap: Record<string, string> = { "دولار": "USD", "دينار": "JOD", "يورو": "EUR" };
                  const code = codeMap[v];
                  if (code) {
                    const fxKey = `${ownerId}|${code}|sell`;
                    const cached = invoiceFxCache.get(fxKey);
                    if (cached && Date.now() - cached.ts < INVOICE_FX_TTL_MS && cached.rate > 0) {
                      setForm(p => ({ ...p, exchangeRate: cached.rate }));
                      return;
                    }
                    const { data: curr } = await supabase.from("currencies").select("id").eq("code", code).eq("user_id", ownerId).maybeSingle();
                    if (curr) {
                      const { data: rate } = await supabase.from("exchange_rates").select("sell_rate").eq("currency_id", curr.id).eq("user_id", ownerId).order("rate_date", { ascending: false }).limit(1).maybeSingle();
                      if (rate?.sell_rate) {
                        const r = Number(rate.sell_rate);
                        setForm(p => ({ ...p, exchangeRate: r }));
                        invoiceFxCache.set(fxKey, { rate: r, ts: Date.now() });
                      }
                    }
                  }
                }
              }}>
                <SelectTrigger className="rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[tt("شيكل"), tt("دولار"), tt("دينار"), tt("يورو")].map(c => <SelectItem key={c} value={c}>{tt(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">{tt("تاريخ الاستحقاق")}</label>
              <TypedDateInput
                value={form.dueDate}
                onChange={(v) => setForm(p => ({ ...p, dueDate: v }))}
                ariaLabel={tt("تاريخ الاستحقاق")}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">{tt("شروط الدفع")}</label>
              {form.invoiceKind === "cash" ? (
                <div className="h-10 rounded-xl border border-border bg-muted/40 text-xs text-muted-foreground flex items-center justify-center px-3">
                  {tt("فوري — فاتورة نقدية")}
                </div>
              ) : (
                <Select value={form.paymentTerms} onValueChange={v => setForm(p => ({ ...p, paymentTerms: v }))}>
                  <SelectTrigger className="rounded-xl text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map(t => <SelectItem key={t.value} value={t.value}>{tt(t.label)}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">{tt("رقم الفاتورة")}</label>
              <Input
                value={nextInvoiceNumber}
                readOnly
                tabIndex={-1}
                data-smart-skip="true"
                className="rounded-xl text-sm bg-muted/50 cursor-not-allowed font-mono"
                dir="ltr"
              />
            </div>
          </div>

          {/* Row 2: Contact + Salesperson */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="relative">
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">
                {form.type === "sales" ? tt("الزبون") : tt("المورد")}
              </label>
              <div className="relative flex">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={`${tt("ابحث عن")} ${form.type === "sales" ? tt("زبون") : tt("مورد")}...`}
                    value={contactSearch}
                    onChange={e => { setContactSearch(e.target.value); setForm(p => ({ ...p, contactName: e.target.value, contactId: null })); setSelectedContact(null); setShowContactDropdown(true); setContactActiveIdx(-1); }}
                    onFocus={() => { setShowContactDropdown(true); setContactActiveIdx(-1); }}
                    onBlur={() => setTimeout(() => setShowContactDropdown(false), 200)}
                    onKeyDown={e => {
                      if (!showContactDropdown && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                        setShowContactDropdown(true);
                        return;
                      }
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        e.stopPropagation();
                        setContactActiveIdx(i => Math.min(i + 1, filteredContacts.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        e.stopPropagation();
                        setContactActiveIdx(i => Math.max(i - 1, -1));
                      } else if (e.key === "Enter") {
                        // اقرأ من ref لتجنب closure قديم
                        const idx = contactActiveIdxRef.current;
                        const list = filteredContactsRef.current;
                        if (showContactDropdown && idx >= 0 && list[idx]) {
                          e.preventDefault();
                          e.stopPropagation();
                          selectContact(list[idx]);
                          setContactActiveIdx(-1);
                          // التركيز التالي يتكفّل به selectContact (مستودع → نوع الفاتورة → الأصناف)

                        } else if (showContactDropdown) {
                          // dropdown مفتوحة لكن لا يوجد عنصر مُحدَّد — امنع submit/تنقل
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      } else if (e.key === "Escape") {
                        setShowContactDropdown(false);
                        setContactActiveIdx(-1);
                      }
                    }}
                    className="rounded-xl rounded-l-none text-sm pr-9 border-l-0"
                    data-no-enter-nav="true"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setShowContactDropdown(prev => !prev); }}
                  className="flex items-center justify-center w-10 border border-border border-r-0 rounded-l-xl bg-muted/50 hover:bg-muted transition-colors"
                >
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              {showContactDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-popover border border-border rounded-xl shadow-lg">
                  <button
                    onClick={() => { setShowContactDropdown(false); const name = contactSearch.trim() || (form.type === "sales" ? tt("زبون جديد") : tt("مورد جديد")); setContactSearch(name); setForm(p => ({ ...p, contactName: name, contactId: null })); }}
                    className="w-full text-right px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-center gap-2 text-primary font-semibold border-b border-border"
                  >
                    <Plus className="h-3.5 w-3.5" /> {form.type === "sales" ? tt("إضافة زبون جديد") : tt("إضافة مورد جديد")}
                  </button>
                  {filteredContacts.map((c, idx) => (
                    <button
                      key={c.id}
                      ref={el => {
                        if (el && idx === contactActiveIdx) {
                          el.scrollIntoView({ block: "nearest" });
                        }
                      }}
                      onMouseEnter={() => setContactActiveIdx(idx)}
                      onClick={() => selectContact(c)}
                      className={`w-full text-right px-3 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${idx === contactActiveIdx ? "bg-muted" : "hover:bg-muted"}`}
                    >
                      <div>
                        <span className="font-medium">{c.contact_name}</span>
                        {c.phone && <span className="text-[10px] text-muted-foreground mr-2">{c.phone}</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`font-mono text-[10px] ${(c.balance || 0) > 0 ? "text-destructive" : "text-emerald-600"}`}>
                          {(c.balance || 0).toLocaleString("en", { minimumFractionDigits: 2 })} ₪
                        </span>
                        <Badge variant="outline" className="text-[9px]">{c.contact_type}</Badge>
                      </div>
                    </button>
                  ))}
                  {filteredContacts.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-3">{tt("لا توجد نتائج")}</p>
                  )}
                </div>
              )}
              {!form.contactId && form.contactName.trim() && (
                <p className="text-[10px] text-primary mt-1 font-medium">{tt("✨ سيتم إنشاء جهة اتصال جديدة تلقائياً")}</p>
              )}
              {/* رقم المشتغل المرخص + المستودع + نوع الفاتورة — كلها بصف واحد لتسريع الإدخال */}
              <div className="mt-2 flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] text-muted-foreground mb-0.5 block font-medium">
                    {tt("رقم المشتغل المرخص")}
                  </label>
                  <Input
                    value={customerOverrides.tax_number}
                    onChange={e => setCustomerOverrides(p => ({ ...p, tax_number: e.target.value }))}
                    onBlur={async () => {
                      const val = (customerOverrides.tax_number || "").trim();
                      if (!selectedContact?.id) return;
                      if ((selectedContact.tax_number || "") === val) return;
                      const { error } = await supabase
                        .from("contacts")
                        .update({ tax_number: val || null })
                        .eq("id", selectedContact.id);
                      if (!error) {
                        setSelectedContact(prev => prev ? { ...prev, tax_number: val } : prev);
                      }
                    }}
                    placeholder="—"
                    dir="ltr"
                    className="rounded-lg text-[12px] h-8"
                  />
                </div>

                {/* المستودع كأيقونة مختصرة */}
                {warehouses.length > 0 && (
                  <div className="shrink-0">
                    <label className="text-[10px] text-muted-foreground mb-0.5 block font-medium">{tt("المستودع")}</label>
                    <Select
                      value={form.warehouseId || ""}
                      onValueChange={v => { setForm(p => ({ ...p, warehouseId: v })); focusInvoiceKind(); }}
                    >
                      <SelectTrigger
                        data-invoice-warehouse="true"
                        title={warehouses.find(w => w.id === form.warehouseId)?.name || tt("اختر المستودع...")}
                        className="h-8 rounded-lg text-[11px] gap-1 px-2 max-w-[160px]"
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); focusInvoiceKind(); }
                        }}
                      >
                        <Warehouse className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {warehouses.find(w => w.id === form.warehouseId)?.name || tt("مستودع")}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map(w => (
                          <SelectItem key={`inline-wh-${w.id}`} value={w.id}>
                            {w.name}{w.is_default ? tt(" — الرئيسي") : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* آجل / نقدي كأزرار صغيرة */}
                <div className="shrink-0">
                  <label className="text-[10px] text-muted-foreground mb-0.5 block font-medium">{tt("نوع الفاتورة")}</label>
                  <div role="tablist" aria-label={tt("نوع الفاتورة")} className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 h-8">
                    <button
                      type="button"
                      role="tab"
                      data-invoice-kind="true"
                      aria-selected={form.invoiceKind === "credit"}
                      onKeyDown={e => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          e.preventDefault();
                          focusInvoiceElement(['[data-invoice-kind="true"][data-kind="cash"]']);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          (e.currentTarget as HTMLButtonElement).click();
                          focusFirstProductTrigger();
                        }
                      }}
                      data-kind="credit"
                      onClick={() => setForm(p => ({
                        ...p,
                        invoiceKind: "credit",
                        paymentTerms: p.paymentTerms === "immediate" ? "net_30" : p.paymentTerms,
                        cashAccountCode: null,
                      }))}
                      className={`px-3 text-[11px] rounded-md font-medium transition-all ${form.invoiceKind === "credit" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {tt("آجل")}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      data-invoice-kind="true"
                      data-kind="cash"
                      aria-selected={form.invoiceKind === "cash"}
                      onKeyDown={e => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          e.preventDefault();
                          focusInvoiceElement(['[data-invoice-kind="true"][data-kind="credit"]']);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          (e.currentTarget as HTMLButtonElement).click();
                          setTimeout(() => {
                            if (!focusInvoiceElement(['[data-invoice-cash-box="true"]'])) focusFirstProductTrigger();
                          }, 40);
                        }

                      }}
                      onClick={() => setForm(p => {
                        const defaultCash =
                          cashBoxes.find(c => c.gl_account_code)?.gl_account_code ||
                          bankAccounts.find(b => b.gl_account_code)?.gl_account_code ||
                          null;
                        return {
                          ...p,
                          invoiceKind: "cash",
                          paymentTerms: "immediate",
                          dueDate: p.date,
                          cashAccountCode: p.cashAccountCode || defaultCash,
                        };
                      })}
                      className={`px-3 text-[11px] rounded-md font-medium transition-all ${form.invoiceKind === "cash" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {tt("نقدي")}
                    </button>
                  </div>
                </div>

                {/* الصندوق + المبلغ المدفوع فعلياً — بجانب نقدي مباشرة (بدل فتح الخيارات المتقدمة) */}
                {form.invoiceKind === "cash" && (
                  <>
                    <div className="shrink-0">
                      <label className="text-[10px] text-muted-foreground mb-0.5 block font-medium">
                        {form.type === "sales" ? tt("الصندوق المستلم") : tt("الدفع من")}
                        <span className="text-destructive mr-1">*</span>
                      </label>
                      <Select
                        value={form.cashAccountCode || ""}
                        onValueChange={v => {
                          setForm(p => ({ ...p, cashAccountCode: v }));
                          setTimeout(() => focusInvoiceElement(['[data-invoice-cash-paid="true"]']), 30);
                        }}
                      >
                        <SelectTrigger
                          data-invoice-cash-box="true"
                          title={tt("اختر الصندوق / الحساب البنكي")}
                          onKeyDown={e => {
                            if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); focusInvoiceElement(['[data-invoice-cash-paid="true"]']); }
                          }}
                          className={`h-8 rounded-lg text-[11px] gap-1 px-2 max-w-[170px] ${!form.cashAccountCode ? "border-destructive/60" : ""}`}
                        >
                          <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            <SelectValue placeholder={tt("الصندوق")} />
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {cashBoxes.filter(c => c.gl_account_code).length > 0 && (
                            <div className="px-2 py-1 text-[10px] text-muted-foreground font-bold">{tt("الصناديق النقدية")}</div>
                          )}
                          {cashBoxes.filter(c => c.gl_account_code).map(c => (
                            <SelectItem key={`inline-cb-${c.id}`} value={c.gl_account_code as string}>{c.name}</SelectItem>
                          ))}
                          {bankAccounts.filter(b => b.gl_account_code).length > 0 && (
                            <div className="px-2 py-1 text-[10px] text-muted-foreground font-bold mt-1">{tt("الحسابات البنكية")}</div>
                          )}
                          {bankAccounts.filter(b => b.gl_account_code).map(b => (
                            <SelectItem key={`inline-bk-${b.id}`} value={b.gl_account_code as string}>
                              {b.bank_name ? `${b.name} — ${b.bank_name}` : b.name}
                            </SelectItem>
                          ))}
                          {cashBoxes.length === 0 && bankAccounts.length === 0 && (
                            <div className="px-3 py-2 text-[11px] text-muted-foreground">{tt("لا يوجد صناديق أو حسابات بنكية مفعّلة — أضِف صندوقاً أولاً.")}</div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="shrink-0 w-[110px]">
                      <label className="text-[10px] text-muted-foreground mb-0.5 block font-medium">{tt("المدفوع فعلياً")}</label>
                      <Input
                        data-invoice-cash-paid="true"
                        type="number"
                        min="0"
                        step="0.01"
                        dir="ltr"
                        value={cashPaidTouched ? cashPaidInput : String(Math.round(summary.total * 100) / 100)}
                        onChange={e => { setCashPaidInput(e.target.value); setCashPaidTouched(true); }}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); focusFirstProductTrigger(); }
                        }}
                        className="rounded-lg text-[12px] h-8"
                      />
                    </div>
                  </>
                )}
              </div>


              {/* Customer insights — always visible right under the picker */}
              {selectedContact && (
                <CustomerInsightsBar
                  contactId={selectedContact.id}
                  contactName={selectedContact.contact_name}
                  contactType={form.type as "sales" | "purchase"}
                  creditLimit={selectedContact.credit_limit}
                  ledgerBalance={contactStatementBalance ?? selectedContact.balance ?? selectedContact.current_balance ?? 0}
                  compact
                />
              )}
              {selectedContact && contactDebtWarning && (selectedContact.credit_limit || 0) > 0 && (selectedContact.balance || 0) > (selectedContact.credit_limit || 0) && (
                <div className="flex items-center gap-1.5 mt-1.5 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                  <p className="text-[10px] text-destructive font-medium">{tt("⚠️ تجاوز الحد الائتماني المسموح")}</p>
                </div>
              )}
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">{tt("المندوب (اختياري)")}</label>
              <div className="flex items-center gap-1.5">
                <Select value={form.salespersonId || "__none__"} onValueChange={v => {
                  if (v === "__new_rep__") { setShowQuickAddRep(true); return; }
                  setForm(p => ({ ...p, salespersonId: v === "__none__" ? null : v }));
                }}>
                  <SelectTrigger className="rounded-xl text-sm flex-1"><SelectValue placeholder={tt("اختر مندوب المبيعات...")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new_rep__" className="text-primary font-semibold">{tt("+ تعريف مندوب جديد")}</SelectItem>
                    <SelectItem value="__none__">{tt("بدون مندوب")}</SelectItem>
                    {salesReps.map(sr => <SelectItem key={sr.id} value={sr.id}>{sr.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={`h-10 w-10 rounded-xl shrink-0 ${form.costCenterId ? "border-primary/60 text-primary bg-primary/5" : ""}`}
                      title={form.costCenterId ? tt("تم اختيار مركز تكلفة — انقر للتعديل") : tt("مركز التكلفة (اختياري — لتقارير الربحية)")}
                    >
                      <Tag className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-3 space-y-2">
                    <div className="text-[11px] font-semibold text-foreground">{tt("مركز التكلفة")}</div>
                    <p className="text-[10px] text-muted-foreground -mt-1">{tt("اختياري — لتقارير الربحية")}</p>
                    <CostCenterCombobox
                      value={form.costCenterId}
                      onChange={(id) => setForm(p => ({ ...p, costCenterId: id }))}
                      placeholder={tt("بدون مركز تكلفة")}
                    />
                    {workshops.length > 0 && (
                      <div className="pt-1">
                        <label className="text-[10px] text-muted-foreground mb-1 block">
                          أو ربط بورشة (اختياري)
                        </label>
                        <Select
                          value={form.workshopId || "__none__"}
                          onValueChange={v => setForm(p => ({ ...p, workshopId: v === "__none__" ? null : v }))}
                        >
                          <SelectTrigger className="rounded-xl text-xs h-8">
                            <SelectValue placeholder={tt("بدون ورشة")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">{tt("بدون ورشة")}</SelectItem>
                            {workshops
                              .filter(w => w.status === "active" || w.id === form.workshopId)
                              .map(w => (
                                <SelectItem key={w.id} value={w.id}>
                                  {w.name}{w.status !== "active" ? ` — (${w.status})` : ""}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Warehouse / invoice kind — collapsible to keep the page compact */}
          <Collapsible open={invoiceMetaOpen} onOpenChange={setInvoiceMetaOpen} className="rounded-xl border border-border/60 bg-muted/20">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${invoiceMetaOpen ? "rotate-180" : ""}`} />
                  <span className="font-medium">{tt("خيارات الفاتورة المتقدمة")}</span>
                  <span className="text-[10px] text-muted-foreground/70">
                    ({form.invoiceKind === "cash" ? tt("نقدي") : tt("آجل")}
                    {form.warehouseId && warehouses.length > 0
                      ? ` · ${warehouses.find(w => w.id === form.warehouseId)?.name || "مستودع"}`
                      : ""})
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground/70">{tt("تعديل")}</span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {warehouses.length > 0 && (
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block font-medium">
                      {tt("المستودع")}
                      <span className="text-[9.5px] text-muted-foreground/70 mr-1">{tt("(يتم منه الخصم/الإضافة)")}</span>
                    </label>
                    <Select
                      value={form.warehouseId || ""}
                      onValueChange={v => { setForm(p => ({ ...p, warehouseId: v })); focusInvoiceKind(); }}
                    >
                      <SelectTrigger
                        data-invoice-warehouse-adv="true"
                        className="rounded-xl text-sm"
                        onKeyDown={e => {
                          // Enter = تأكيد المستودع الحالي والانتقال لنوع الفاتورة
                          // (فتح القائمة عبر الأسهم أو المسافة أو النقر)
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            focusInvoiceKind();
                          }
                        }}
                      >
                        <SelectValue placeholder={tt("اختر المستودع...")} />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map(w => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}{w.is_default ? tt(" — الرئيسي") : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Invoice kind: explicit cash vs credit segmented control */}
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block font-medium">
                    {tt("نوع الفاتورة")}
                    <span className="text-[9.5px] text-muted-foreground/70 mr-1">
                      ({form.invoiceKind === "cash" ? tt("تُسدّد فوراً") : tt("تُسجَّل على الذمة")})
                    </span>
                  </label>
                  <div
                    role="tablist"
                    aria-label={tt("نوع الفاتورة")}
                    className="inline-flex w-full rounded-xl border border-border bg-muted/40 p-0.5"
                  >
                    <button
                      type="button"
                      role="tab"
                      data-invoice-kind-adv="true"
                      onKeyDown={e => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          e.preventDefault();
                          focusInvoiceElement(['[data-invoice-kind="true"]:last-of-type']);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          (e.currentTarget as HTMLButtonElement).click();
                          focusFirstProductTrigger();
                        }
                      }}
                      aria-selected={form.invoiceKind === "credit"}
                      onClick={() =>
                        setForm(p => ({
                          ...p,
                          invoiceKind: "credit",
                          // Restore a sensible default if user came from cash mode
                          paymentTerms: p.paymentTerms === "immediate" ? "net_30" : p.paymentTerms,
                          // Cash account is irrelevant for credit invoices.
                          cashAccountCode: null,
                        }))
                      }
                      className={`flex-1 px-3 py-2 text-xs rounded-lg font-medium transition-all ${
                        form.invoiceKind === "credit"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tt("آجل")}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      data-invoice-kind-adv="true"
                      onKeyDown={e => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          e.preventDefault();
                          focusInvoiceElement(['[data-invoice-kind="true"]']);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          (e.currentTarget as HTMLButtonElement).click();
                          focusFirstProductTrigger();
                        }
                      }}
                      aria-selected={form.invoiceKind === "cash"}
                      onClick={() =>
                        setForm(p => {
                          // Default to the first cash box (else first bank account)
                          // so users get a working selection out of the box.
                          const defaultCash =
                            cashBoxes.find(c => c.gl_account_code)?.gl_account_code ||
                            bankAccounts.find(b => b.gl_account_code)?.gl_account_code ||
                            null;
                          return {
                            ...p,
                            invoiceKind: "cash",
                            // Force terms/due-date to match cash semantics
                            paymentTerms: "immediate",
                            dueDate: p.date,
                            cashAccountCode: p.cashAccountCode || defaultCash,
                          };
                        })
                      }
                      className={`flex-1 px-3 py-2 text-xs rounded-lg font-medium transition-all ${
                        form.invoiceKind === "cash"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tt("نقدي")}
                    </button>
                  </div>
                  {/* Cash account picker — shown only when tt("نقدي") so the user can
                      pick which cash box / bank account receives (sales) or
                      pays (purchases) the invoice value. Required before save. */}
                  {form.invoiceKind === "cash" && (
                    <div className="mt-2">
                      <label className="text-[11px] text-muted-foreground mb-1 block font-medium">
                        {form.type === "sales" ? tt("الصندوق المستلم") : tt("الدفع من")}
                        <span className="text-destructive mr-1">*</span>
                      </label>
                      <Select
                        value={form.cashAccountCode || ""}
                        onValueChange={v => setForm(p => ({ ...p, cashAccountCode: v }))}
                      >
                        <SelectTrigger
                          onKeyDown={e => {
                            if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); focusFirstProductTrigger(); }
                          }}
                          className={`rounded-xl text-sm h-9 ${
                            !form.cashAccountCode ? "border-destructive/60" : ""
                          }`}
                        >

                          <SelectValue placeholder={tt("اختر الصندوق / الحساب البنكي")} />
                        </SelectTrigger>
                        <SelectContent>
                          {cashBoxes.filter(c => c.gl_account_code).length > 0 && (
                            <div className="px-2 py-1 text-[10px] text-muted-foreground font-bold">
                              {tt("الصناديق النقدية")}
                            </div>
                          )}
                          {cashBoxes
                            .filter(c => c.gl_account_code)
                            .map(c => (
                              <SelectItem key={`cb-${c.id}`} value={c.gl_account_code as string}>
                                {c.name}
                              </SelectItem>
                            ))}
                          {bankAccounts.filter(b => b.gl_account_code).length > 0 && (
                            <div className="px-2 py-1 text-[10px] text-muted-foreground font-bold mt-1">
                              {tt("الحسابات البنكية")}
                            </div>
                          )}
                          {bankAccounts
                            .filter(b => b.gl_account_code)
                            .map(b => (
                              <SelectItem key={`bk-${b.id}`} value={b.gl_account_code as string}>
                                {b.bank_name ? `${b.name} — ${b.bank_name}` : b.name}
                              </SelectItem>
                            ))}
                          {cashBoxes.length === 0 && bankAccounts.length === 0 && (
                            <div className="px-3 py-2 text-[11px] text-muted-foreground">
                              {tt("لا يوجد صناديق أو حسابات بنكية مفعّلة — أضِف صندوقاً أولاً.")}
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {tt("ستتم حركة النقدية فوراً على الحساب المختار.")}
                      </p>
                      {/* المبلغ المدفوع فعلياً — يدعم الدفع الجزئي والزائد.
                          الافتراضي = الإجمالي ويتبعه تلقائياً حتى يلمسه المستخدم. */}
                      <div className="mt-2">
                        <label className="text-[11px] text-muted-foreground mb-1 block font-medium">
                          {tt("المبلغ المدفوع فعلياً")}
                        </label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            dir="ltr"
                            value={cashPaidTouched ? cashPaidInput : String(Math.round(summary.total * 100) / 100)}
                            onChange={e => { setCashPaidInput(e.target.value); setCashPaidTouched(true); }}
                            onKeyDown={e => {
                              if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); focusFirstProductTrigger(); }
                            }}
                            className="rounded-xl text-sm h-9"
                          />

                          {cashPaidTouched && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              tabIndex={-1}
                              className="text-[11px] shrink-0"

                              onClick={() => { setCashPaidTouched(false); setCashPaidInput(""); }}
                            >
                              {tt("مطابقة الإجمالي")}
                            </Button>
                          )}
                        </div>
                        {summary.total > 0 && (() => {
                          const diff = Math.round((summary.total - cashPaidAmount) * 100) / 100;
                          if (cashPaidAmount <= 0)
                            return <p className="text-[10px] mt-1 text-muted-foreground">{tt("بدون دفع — ستُعامل كفاتورة آجلة بالكامل ويبقى كامل المبلغ ذمة على الجهة.")}</p>;
                          if (diff > 0.004)
                            return <p className="text-[10px] mt-1 text-amber-600 font-medium">{tt("المتبقي على الذمة:")} {fmtCurrency(diff)} — {tt("يظهر في كشف حساب الجهة")}</p>;
                          if (diff < -0.004)
                            return <p className="text-[10px] mt-1 text-blue-600 font-medium">{tt("زيادة عن قيمة الفاتورة:")} {fmtCurrency(-diff)} — {form.type === "sales" ? tt("تُسجَّل رصيداً دائناً للجهة يُخصم لاحقاً") : tt("تُسجَّل سلفة للمورد تُخصم لاحقاً")}</p>;
                          return <p className="text-[10px] mt-1 text-emerald-600">{tt("سداد كامل ✅")}</p>;
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Auto-filled contact details - editable on invoice */}
          {selectedContact && (
            <details className="group rounded-lg border border-border/60 bg-muted/20">
              <summary className="cursor-pointer select-none px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                  بيانات العميل (هاتف، بريد، عنوان، رقم ضريبي)
                </span>
                <span className="text-[10px] text-muted-foreground/70">{tt("اختياري")}</span>
              </summary>
              <div className="px-3 pb-3 pt-1 space-y-2">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-0.5 block">{tt("الهاتف")}</label>
                    <Input value={customerOverrides.phone} onChange={e => setCustomerOverrides(p => ({ ...p, phone: e.target.value }))} className="rounded-lg text-[11px] h-7 bg-background" placeholder="—" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-0.5 block">{tt("البريد الإلكتروني")}</label>
                    <Input value={customerOverrides.email} onChange={e => setCustomerOverrides(p => ({ ...p, email: e.target.value }))} className="rounded-lg text-[11px] h-7 bg-background" placeholder="—" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-0.5 block">{tt("الرقم الضريبي")}</label>
                    <Input value={customerOverrides.tax_number} onChange={e => setCustomerOverrides(p => ({ ...p, tax_number: e.target.value }))} className="rounded-lg text-[11px] h-7 bg-background" placeholder="—" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-0.5 block">{tt("العنوان")}</label>
                    <Input value={customerOverrides.address} onChange={e => setCustomerOverrides(p => ({ ...p, address: e.target.value }))} className="rounded-lg text-[11px] h-7 bg-background" placeholder="—" />
                  </div>
                </div>
                <a href={`/contacts?edit=${selectedContact.id}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary font-medium flex items-center gap-1 hover:underline justify-end">
                  <ExternalLink className="h-3 w-3" />{tt("إكمال بيانات العميل في الملف الكامل")}
                </a>
              </div>
            </details>
          )}

          {/* Exchange rate (only when non-ILS) */}
          {form.currency !== "شيكل" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block font-medium">{tt("سعر الصرف")}</label>
                <Input type="number" step="0.01" value={form.exchangeRate} onChange={e => setForm(p => ({ ...p, exchangeRate: Number(e.target.value) }))} className="rounded-xl text-sm h-10" dir="ltr" />
              </div>
              <div className="flex items-end">
                <p className="text-[11px] text-muted-foreground">{tt("المكافئ بالشيكل:")}<span className="font-semibold text-foreground">{fmtCurrencyStatic(summary.total * form.exchangeRate)}</span></p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* ───── TOP-RIGHT (RTL left): Sticky Summary — 4 cols ─────
          Aligned to the SAME top baseline as the invoice form card.
          Sticks while user fills items below. */}
      <aside className="lg:col-span-4 lg:sticky lg:top-4 self-start w-full">
        <SmartSummaryPanel
          variant="invoice"
          isPosted={isEditMode}
          invoiceType={form.type}
          subtotal={summary.subtotal}
          totalDiscount={summary.totalDiscount}
          totalTax={summary.totalTax}
          total={summary.total}
          taxEnabled={taxEnabled}
          taxInclusive={form.taxInclusive}
          itemsCount={form.items.filter(i => i.productId || i.description?.trim()).length}
          partyName={selectedContact?.contact_name || form.contactName || null}
          partyId={selectedContact?.id || null}
          balanceBefore={contactStatementBalance ?? selectedContact?.balance ?? selectedContact?.current_balance ?? 0}
          openInvoicesTotal={contactOpenInvoicesTotal}
          unappliedCredit={contactUnappliedCredit}
          creditLimit={selectedContact?.credit_limit ?? null}
          currency={form.currency}
          exchangeRate={form.exchangeRate}
          dueDate={form.dueDate}
          refNumber={nextInvoiceNumber}
          currencySymbol={currSymbol}
          onOpenStatement={selectedContact ? () => window.open(`/account-statement?contact_id=${selectedContact.id}`, "_blank") : undefined}
        />
      </aside>

      {/* ───── MIDDLE ROW: Items Table — full width 12 cols ───── */}
      <div className="lg:col-span-12 min-w-0">

      {/* ─── SECTION 2: Invoice Items — Clean Professional Table ─── */}
      <Card className="border border-border shadow-sm rounded-2xl overflow-hidden bg-background">
        <CardHeader className="pb-2 pt-2.5 px-4 border-b border-border bg-background">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />{tt("بنود الفاتورة")}
              <span className="text-[10px] font-normal text-muted-foreground">({form.items.length} {form.items.length === 1 ? tt("بند") : tt("بنود")})</span>
            </CardTitle>
            {/* Overflow menu keeps advanced actions reachable without cluttering the header */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" title={tt("خيارات إضافية")}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {taxEnabled && (
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setForm(p => ({ ...p, taxInclusive: !p.taxInclusive })); }}>
                    <Percent className="ml-2 h-4 w-4" />
                    <span>{form.taxInclusive ? tt("الأسعار شاملة الضريبة ✓") : tt("الأسعار غير شاملة الضريبة")}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setShowQuickAdd(true)}>
                  <Plus className="ml-2 h-4 w-4 text-primary" />
                  <span>{tt("تعريف منتج جديد")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setShowDraftsHistory(true)}>
                  <FileText className="ml-2 h-4 w-4" />
                  <span>{tt("المسودات المحفوظة")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={clearItems} className="text-destructive focus:text-destructive">
                  <Trash2 className="ml-2 h-4 w-4" />
                  <span>{tt("مسح كل البنود")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Zebra style: soft alternating rows, muted header, subtle borders */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-xs border-collapse [&_td]:border-0 [&_th]:border-0 [&_tr]:transition-colors">
              <thead>
                <tr className="bg-muted/50 text-[10.5px] font-semibold text-muted-foreground tracking-wide border-b border-border">
                  <th className="py-3 px-3 text-center w-[42px]">#</th>
                  <th className="py-3 px-3 text-right min-w-[260px]">{tt("المنتج / الخدمة")}</th>
                  <th className="py-3 px-3 text-center min-w-[100px] w-[100px]">{tt("الكمية")}</th>
                  <th className="py-3 px-3 text-center min-w-[100px] w-[100px]" title={tt("كمية بونص / مجاني")}>{tt("بونص")}</th>
                  <th className="py-3 px-3 text-center min-w-[120px] w-[130px]">{tt("السعر")}</th>
                  <th className="py-3 px-3 text-center min-w-[120px] w-[130px]">{tt("الخصم")}</th>
                  {taxEnabled && <th className="py-3 px-3 text-center min-w-[120px] w-[130px]">{tt("الضريبة")}</th>}
                  <th className="py-3 px-3 text-left min-w-[140px] w-[150px] text-foreground">{tt("الإجمالي")}</th>
                  <th className="py-3 px-2 text-center w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, idx) => {
                  const prod = item.productId ? products.find(p => p.id === item.productId) : null;
                  const storedPrice = prod ? Number(prod.buy_price) || 0 : 0;
                  const showWarning = form.type === "purchase" && storedPrice > 0 && item.unitPrice > storedPrice;
                  const diff = item.unitPrice - storedPrice;
                  const pct = storedPrice > 0 ? ((diff / storedPrice) * 100).toFixed(1) : "0";
                  // Per-warehouse stock when a warehouse is selected; falls back to total product qty.
                  const stock = prod
                    ? (form.warehouseId && warehouseStock[prod.id] !== undefined
                        ? Number(warehouseStock[prod.id] || 0)
                        : Number(prod.quantity || 0))
                    : 0;
                  const unit = prod?.unit || "قطعة";
                  const isService = prod?.product_type === "service";
                  const rowBg = idx % 2 === 0 ? "bg-background" : "bg-muted/25";
                  return (
                    <tr key={item.id} className={`${rowBg} hover:bg-primary/5 dark:hover:bg-primary/10 focus-within:bg-primary/10 dark:focus-within:bg-primary/15 transition-colors group border-b border-border/40`}>
                      {/* # */}
                      <td className="py-2 px-3 text-center text-[11px] text-muted-foreground font-mono align-middle">
                        {idx + 1}
                      </td>

                      {/* Product */}
                      <td className="py-1.5 px-2 align-top min-w-[320px] xl:min-w-[380px]">
                        <div className="flex items-stretch gap-1">
                          <div className="flex-1">
                            <InlineProductAutocomplete
                              value={productSearchByRow[item.id] ?? item.description}
                              products={products}
                              invoiceType={form.type}
                              currencySymbol={currSymbol}
                              supplierId={form.type === "purchase" ? form.contactId : null}
                              onChange={(value) => {
                                setProductSearchByRow(prev => ({ ...prev, [item.id]: value }));
                                setForm(prev => ({
                                  ...prev,
                                  items: prev.items.map(it => it.id === item.id ? { ...it, description: value, productId: undefined } : it),
                                }));
                              }}
                              onSelect={(productId) => selectProduct(item.id, productId)}
                              onQuickAdd={() => setShowQuickAdd(true)}
                              inputProps={{
                                "data-invoice-product-input": idx === 0 ? "true" : undefined,
                                "data-row-id": item.id,
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            title={tt("بحث متقدم عن صنف (Ctrl+K)")}
                            aria-label={tt("بحث متقدم عن صنف")}
                            onClick={() => setProductSearchDialog({ open: true, itemId: item.id })}
                            className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-muted hover:border-primary/40 text-muted-foreground hover:text-primary transition-colors shadow-sm"
                          >
                            <Search className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {item.productId && (
                          isService ? (
                            <p className="text-[9.5px] text-muted-foreground px-2 mt-1">{tt("⚙️ خدمة")}</p>
                          ) : (
                            <p className={`text-[9.5px] font-medium px-2 mt-1 tabular-nums ${
                              stock <= 0 ? "text-destructive" :
                              stock < item.quantity ? "text-amber-600" :
                              "text-emerald-600"
                            }`}>
                              📦 المتاح: {stock.toLocaleString("en")} {unit}
                              {form.type === "sales" && stock < item.quantity && (
                                <span className="mr-1 font-bold">{tt("— غير كافٍ!")}</span>
                              )}
                            </p>
                          )
                        )}
                        {item.productId && (prod?.sku || prod?.barcode) && (
                          <p className="text-[9.5px] text-muted-foreground px-2 mt-0.5 tabular-nums">
                            {tt("كود:")} <span className="font-mono">{prod?.sku || prod?.barcode}</span>
                          </p>
                        )}
                        {(fabricAttributeEnabled || item.fabric) && (
                          <div className="mt-1 max-w-[220px]">
                            <FabricSelect
                              value={item.fabric ?? null}
                              ownerId={ownerId}
                              onChange={(v) => updateItem(item.id, "fabric", v)}
                            />
                          </div>
                        )}
                        {item.productId && prod && (
                          <p className="text-[9.5px] text-muted-foreground px-2 mt-0.5 tabular-nums flex flex-wrap gap-x-2">
                            {Number(prod.buy_price) > 0 && (
                              <span title={tt("آخر سعر شراء مسجّل")}>{tt("🛒 شراء:")}<span className="font-semibold text-foreground">{Number(prod.buy_price).toLocaleString("en", { maximumFractionDigits: 2 })}</span></span>
                            )}
                            {Number((prod as any).sale_price ?? prod.price) > 0 && (
                              <span title={tt("سعر بيع الصنف")}>{tt("🏷️ بيع:")}<span className="font-semibold text-foreground">{Number((prod as any).sale_price ?? prod.price).toLocaleString("en", { maximumFractionDigits: 2 })}</span></span>
                            )}
                          </p>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="py-1.5 px-2 align-middle min-w-[100px]">
                        <InvoiceNumericInput
                          data-invoice-qty={item.id}
                          data-no-enter-nav="true"
                          min={0}
                          step="any"
                          value={item.quantity}
                          onChange={e => {
                            const raw = e.target.value;
                            const n = raw === "" ? 0 : Number(raw);
                            updateItem(item.id, "quantity", Number.isFinite(n) && n >= 0 ? n : 0);
                          }}
                          onKeyDown={handleCellEnter("qty", item.id)}
                          minWidthPx={84}
                          maxWidthPx={140}
                          className="font-semibold"
                        />
                      </td>

                      {/* Bonus quantity (free units) */}
                      <td className="py-1.5 px-2 align-middle min-w-[100px]">
                        <InvoiceNumericInput
                          min={0}
                          step="any"
                          value={item.bonusQuantity}
                          onChange={e => {
                            const raw = e.target.value;
                            const n = raw === "" ? 0 : Number(raw);
                            updateItem(item.id, "bonusQuantity", Number.isFinite(n) && n >= 0 ? n : 0);
                          }}
                          minWidthPx={84}
                          maxWidthPx={140}
                          title={tt("كمية بونص — مجانية، تخصم من المخزون ولكن لا تضاف للإيراد")}
                        />
                      </td>

                      {/* Price */}
                      <td className="py-1.5 px-2 align-middle relative min-w-[120px]">
                        <InvoiceNumericInput
                          data-invoice-price={item.id}
                          data-no-enter-nav="true"
                          min={0}
                          value={item.unitPrice}
                          onChange={e => updateItem(item.id, "unitPrice", Number(e.target.value))}
                          onKeyDown={handleCellEnter("price", item.id)}
                          unitLabel={currSymbol}
                          minWidthPx={96}
                          maxWidthPx={160}
                          focusMaxWidthPx={220}
                          className={`font-semibold ${showWarning ? "border-amber-400 bg-amber-50" : ""}`}
                        />
                        {showWarning && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 cursor-help">
                                <TriangleAlert className="h-3.5 w-3.5 text-amber-500" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-lg shadow-md p-2.5 max-w-[220px] space-y-0.5" dir="rtl">
                              <p className="font-semibold">{tt("⚠️ السعر أعلى من سعر الشراء المعتاد")}</p>
                              <p>سعر الشراء المثبت: {fmtCurrency(storedPrice)}</p>
                              <p>الفرق: {fmtCurrency(diff)} ({pct}% أعلى)</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </td>

                      {/* Discount with type toggle inline */}
                      <td className="py-1.5 px-2 align-middle min-w-[120px]">
                        <div className="flex items-center gap-1">
                          <InvoiceNumericInput
                            data-invoice-discount={item.id}
                            data-no-enter-nav="true"
                            min={0}
                            value={item.discount}
                            onChange={e => updateItem(item.id, "discount", Number(e.target.value))}
                            onKeyDown={handleCellEnter("discount", item.id)}
                            unitLabel={item.discountType === "percent" ? "%" : currSymbol}
                            minWidthPx={80}
                            maxWidthPx={130}
                            focusMaxWidthPx={180}
                            className="flex-1 min-w-0"
                          />
                          <button
                            onClick={() => updateItem(item.id, "discountType", item.discountType === "percent" ? "amount" : "percent")}
                            className="h-9 w-9 rounded-md border border-input bg-background flex items-center justify-center text-[10px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0 shadow-sm"
                            title={item.discountType === "percent" ? tt("خصم نسبي %") : tt("خصم ثابت")}
                          >
                            {item.discountType === "percent" ? <Percent className="h-3 w-3" /> : currSymbol}
                          </button>
                        </div>
                      </td>

                      {/* Tax Category */}
                       {taxEnabled && (
                         <td className="py-1.5 px-2 align-middle min-w-[120px]">
                          <div className="flex items-center gap-1">
                            <div className="relative flex-1 min-w-0">
                              <InvoiceNumericInput
                                data-invoice-tax={item.id}
                                data-no-enter-nav="true"
                                min={0}
                                max={100}
                                step="0.01"
                                value={item.taxCategory === "exempt" ? "" : item.taxRate}
                                placeholder={item.taxCategory === "exempt" ? tt("معفي") : "0"}
                                disabled={item.taxCategory === "exempt"}
                                onChange={e => {
                                  const rate = Number(e.target.value);
                                  setForm(prev => ({
                                    ...prev,
                                    items: prev.items.map(it => {
                                      if (it.id !== item.id) return it;
                                      const nextCat: TaxCategory = rate > 0 ? "taxable" : "zero";
                                      const updated = { ...it, taxRate: isFinite(rate) ? rate : 0, taxCategory: nextCat };
                                      updated.subtotal = calcItemSubtotal(updated);
                                      return updated;
                                    }),
                                  }));
                                }}
                                onKeyDown={handleCellEnter("tax", item.id)}
                                className="pr-6"
                                unitLabel="%"
                                minWidthPx={84}
                                maxWidthPx={120}
                                title={tt("نسبة الضريبة %")}
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="h-9 w-9 shrink-0 rounded-md border border-input bg-background flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shadow-sm"
                                  title={tt("اختصارات الضريبة")}
                                  aria-label={tt("اختصارات الضريبة")}
                                  tabIndex={-1}
                                  data-smart-skip="true"
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[140px]">
                                <DropdownMenuItem onClick={() => updateItem(item.id, "taxCategory", "taxable")}>
                                  {tt("16% — خاضعة")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateItem(item.id, "taxCategory", "zero")}>
                                  {tt("0% — صفرية")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateItem(item.id, "taxCategory", "exempt")}>
                                  {tt("معفي")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      )}

                       {/* Subtotal */}
                       <td className="py-2 px-3 text-left align-middle bg-primary/5 min-w-[140px] whitespace-nowrap">
                        {(() => {
                          const sub = calcItemSubtotal(item);
                          const formatted = fmtCurrency(sub);
                          const sizeClass =
                            formatted.length <= 10
                              ? "text-[13px]"
                              : formatted.length <= 14
                              ? "text-[12px]"
                              : formatted.length <= 18
                              ? "text-[11px]"
                              : "text-[10px]";
                          return (
                            <span
                              dir="ltr"
                              title={formatted}
                              aria-label={formatted}
                              className={`block whitespace-nowrap font-bold text-primary tabular-nums ${sizeClass}`}
                            >
                              {formatted}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Delete */}
                      <td className="py-2 px-2 text-center align-middle">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-muted-foreground/40 hover:text-destructive transition-colors disabled:opacity-20 disabled:hover:text-muted-foreground/40 opacity-0 group-hover:opacity-100"
                          disabled={form.items.length <= 1}
                          title={tt("حذف البند")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-border/40">
            {form.items.map((item, idx) => (
              <div key={item.id} className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground">#{idx + 1}</span>
                  <button onClick={() => removeItem(item.id)} className="text-destructive/60 hover:text-destructive disabled:opacity-30" disabled={form.items.length <= 1}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <InlineProductAutocomplete
                  value={productSearchByRow[item.id] ?? item.description}
                  products={products}
                  invoiceType={form.type}
                  currencySymbol={currSymbol}
                  onChange={(value) => {
                    setProductSearchByRow(prev => ({ ...prev, [item.id]: value }));
                    setForm(prev => ({
                      ...prev,
                      items: prev.items.map(it => it.id === item.id ? { ...it, description: value, productId: undefined } : it),
                    }));
                  }}
                  onSelect={(productId) => selectProduct(item.id, productId)}
                  onQuickAdd={() => setShowQuickAdd(true)}
                  inputProps={{
                    "data-invoice-product-input": idx === 0 ? "true" : undefined,
                    "data-row-id": item.id,
                  }}
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[9px] text-muted-foreground">{tt("الكمية")}</Label>
                    <Input type="number" min={0} step="any" data-invoice-qty={item.id} data-no-enter-nav="true" value={item.quantity} onChange={e => { const n = e.target.value === "" ? 0 : Number(e.target.value); updateItem(item.id, "quantity", Number.isFinite(n) && n >= 0 ? n : 0); }} onKeyDown={handleCellEnter("qty", item.id)} className="h-8 text-[11px] text-center" dir="ltr" />
                  </div>
                  <div>
                    <Label className="text-[9px] text-muted-foreground">{tt("السعر")}</Label>
                    <Input type="number" min={0} data-invoice-price={item.id} data-no-enter-nav="true" value={item.unitPrice} onChange={e => updateItem(item.id, "unitPrice", Number(e.target.value))} onKeyDown={handleCellEnter("price", item.id)} className="h-8 text-[11px] text-center" dir="ltr" />
                  </div>
                  <div>
                    <Label className="text-[9px] text-muted-foreground">{tt("الإجمالي")}</Label>
                    <div className="h-8 flex items-center justify-center text-[12px] font-bold tabular-nums">{fmtCurrency(calcItemSubtotal(item))}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Zebra footer: subtle green tint, total on the right, add-row action on the left */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-emerald-50/60 dark:bg-emerald-950/20 border-t border-border">
            <button
              onClick={addItem}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-primary transition-colors"
            >
              <Plus className="h-4 w-4" />{tt("إضافة بند جديد")}
            </button>
            <div className="flex items-center gap-4 text-[12.5px] flex-wrap justify-end">
              {/* Invoice-level discount (on the entire invoice, not per item) */}
              <div className="flex items-center gap-1.5" dir="rtl">
                <span className="text-muted-foreground text-[11.5px]">{tt("خصم الفاتورة")}</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  data-smart-skip="true"
                  data-no-enter-nav="true"
                  value={form.invoiceDiscount || ""}
                  onChange={e => setForm(p => ({ ...p, invoiceDiscount: Number(e.target.value) || 0 }))}
                  placeholder="0"
                  className="h-8 w-24 text-[12px] text-center"
                  dir="ltr"
                  // 🛡️ Enter in the invoice-level discount MUST NOT stay here —
                  // the accountant expects Enter to jump back to the items grid
                  // to add another product. Route it to a new row via the same
                  // overflow used by the last row's Enter.
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      addItemAndFocus();
                    }
                  }}
                />
                <div className="inline-flex rounded-md border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, invoiceDiscountType: "amount" }))}
                    className={`px-2 h-8 text-[11px] font-semibold ${form.invoiceDiscountType === "amount" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                  >
                    {currSymbol}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, invoiceDiscountType: "percent" }))}
                    className={`px-2 h-8 text-[11px] font-semibold ${form.invoiceDiscountType === "percent" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                  >
                    %
                  </button>
                </div>
                {summary.invoiceDiscountAmount > 0 && (
                  <span className="text-[11px] text-red-600 tabular-nums" dir="ltr">
                    −{fmtCurrency(summary.invoiceDiscountAmount)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{tt("الإجمالي الكلي")}</span>
                <span className="font-bold tabular-nums text-foreground" dir="ltr">
                  {fmtCurrency(summary.total)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Price warning summary */}
      {form.type === "purchase" && form.items.some(item => {
        const prod = item.productId ? products.find(p => p.id === item.productId) : null;
        const storedPrice = prod ? Number(prod.buy_price) || 0 : 0;
        return storedPrice > 0 && item.unitPrice > storedPrice;
      }) && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border-r-4 border-amber-400 text-amber-800 text-sm" dir="rtl">
          <TriangleAlert className="h-4 w-4 flex-shrink-0" />
          <span>{tt("تنبيه: بعض الأسعار أعلى من أسعار الشراء المثبتة — يرجى المراجعة قبل إنشاء الفاتورة")}</span>
        </div>
      )}

      </div>

      {/* ═══ BOTTOM ROW: Notes/Terms/Attach (8 cols)  +  Final Totals (4 cols) ═══ */}
      {/* ═══ BOTTOM ROW: Notes / Terms / Attachments — full width 12 cols ═══
          The duplicate "Final Totals" card was removed; the top sticky summary
          + the sticky action bar are the single source of truth for totals. */}
      <div className="lg:col-span-12 min-w-0 grid grid-cols-1 lg:grid-cols-3 gap-4">

      {/* ─── SECTION 4: Notes (Collapsible) ─── */}
      <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
        <Card className="border-0 shadow-sm rounded-2xl">
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-0 pt-4 px-5 cursor-pointer hover:bg-muted/30 rounded-t-2xl transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />{tt("ملاحظات")}
                  {(form.notes?.trim() || form.notesInternal?.trim()) && (
                    <Badge variant="secondary" className="text-[9px] h-4 px-1.5">●</Badge>
                  )}
                </CardTitle>
                {notesOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="px-5 pb-5 pt-3 space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block font-medium flex items-center gap-1.5">
                  {tt("ملاحظة على الفاتورة")}
                  <span className="text-[9px] text-muted-foreground/60">{tt("(تظهر في PDF)")}</span>
                </label>
                <Textarea
                  placeholder={companySettings.invoice_default_notes || tt("شكراً لتعاملكم معنا...")}
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="rounded-xl text-sm min-h-[60px] resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block font-medium flex items-center gap-1.5">
                  {tt("ملاحظة داخلية")}
                  <span className="text-[9px] text-muted-foreground/60">{tt("(لا تظهر في PDF)")}</span>
                </label>
                <Textarea
                  placeholder={tt("ملاحظات داخلية للفريق...")}
                  value={form.notesInternal}
                  onChange={e => setForm(p => ({ ...p, notesInternal: e.target.value }))}
                  className="rounded-xl text-sm min-h-[50px] resize-none bg-muted/30"
                />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ─── SECTION 5: Terms & Conditions (Collapsible) ─── */}
      <Collapsible open={termsOpen} onOpenChange={setTermsOpen}>
        <Card className="border-0 shadow-sm rounded-2xl">
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-0 pt-4 px-5 cursor-pointer hover:bg-muted/30 rounded-t-2xl transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-primary" />{tt("الشروط والأحكام")}
                  <span className="text-[9px] text-muted-foreground/60 font-normal">{tt("(تظهر في PDF)")}</span>
                </CardTitle>
                {termsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="px-5 pb-5 pt-3">
              <Textarea
                placeholder={tt("أدخل الشروط والأحكام...")}
                value={invoiceTerms}
                onChange={e => setInvoiceTerms(e.target.value)}
                className="rounded-xl text-sm min-h-[80px] resize-none"
                rows={4}
              />
              <p className="text-[10px] text-muted-foreground mt-1.5">{tt("القيمة الافتراضية يمكن تخصيصها من إعدادات الشركة")}</p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ─── SECTION 6: Attachments (Collapsible) ─── */}
      <Collapsible open={attachmentsOpen} onOpenChange={setAttachmentsOpen}>
        <Card className="border-0 shadow-sm rounded-2xl">
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-0 pt-4 px-5 cursor-pointer hover:bg-muted/30 rounded-t-2xl transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-primary" />{tt("المرفقات")}
                  {attachments.length > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{attachments.length}</Badge>}
                </CardTitle>
                {attachmentsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="px-5 pb-5 pt-3 space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files || !user) return;
                  const maxFiles = 5;
                  const maxSize = 10 * 1024 * 1024; // 10MB

                  if (attachments.length + files.length > maxFiles) {
                    toast({ title: `الحد الأقصى ${maxFiles} ملفات`, variant: "destructive" });
                    return;
                  }

                  setUploadingFile(true);
                  const newAttachments = [...attachments];

                  for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (file.size > maxSize) {
                      toast({ title: `${file.name} أكبر من 10MB`, variant: "destructive" });
                      continue;
                    }
                    const filePath = `${user.id}/${Date.now()}-${file.name}`;
                    const { error } = await supabase.storage.from("invoice-attachments").upload(filePath, file);
                    if (error) {
                      toast({ title: `فشل رفع ${file.name}`, variant: "destructive" });
                      continue;
                    }
                    const { data: urlData } = supabase.storage.from("invoice-attachments").getPublicUrl(filePath);
                    newAttachments.push({
                      name: file.name,
                      url: urlData.publicUrl,
                      size: file.size,
                      type: file.type,
                      uploaded_at: new Date().toISOString(),
                    });
                  }

                  setAttachments(newAttachments);
                  setUploadingFile(false);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />

              <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploadingFile || attachments.length >= 5}>
                {uploadingFile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {tt("رفع ملف")}
              </Button>
              <p className="text-[10px] text-muted-foreground">{tt("PDF, JPG, PNG, XLSX — حد أقصى 5 ملفات / 10MB للملف")}</p>

              {attachments.length > 0 && (
                <div className="space-y-1.5">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium truncate">{att.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{(att.size / 1024).toFixed(0)} KB</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive/60 hover:text-destructive shrink-0" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      </div>

      </div>

      </fieldset>


      {/* Quick Add Product Dialog */}
      <Dialog open={showQuickAdd} onOpenChange={(o) => { if (!o) { setShowQuickAdd(false); } else { setShowQuickAdd(true); } }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>{tt("تعريف منتج جديد")}</DialogTitle><DialogDescription>{tt("أضف منتج سريعاً واستخدمه في الفاتورة")}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground">{tt("اسم المنتج *")}</label><Input value={quickAddForm.name} onChange={e => setQuickAddForm({ ...quickAddForm, name: e.target.value })} className="rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{tt("النوع")}</label>
                <Select
                  value={quickAddForm.product_type}
                  onValueChange={(v: "product" | "service") =>
                    setQuickAddForm({
                      ...quickAddForm,
                      product_type: v,
                      service_direction: v === "service"
                        ? (quickAddForm.service_direction || (form.type === "sales" ? "provided" : "received"))
                        : "",
                    })
                  }
                >
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">{tt("منتج (مخزون)")}</SelectItem>
                    <SelectItem value="service">{tt("خدمة (بدون مخزون)")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {quickAddForm.product_type === "service" && (
                <div>
                  <label className="text-xs text-muted-foreground">{tt("اتجاه الخدمة")}</label>
                  <Select
                    value={quickAddForm.service_direction || (form.type === "sales" ? "provided" : "received")}
                    onValueChange={(v: "provided" | "received") =>
                      setQuickAddForm({ ...quickAddForm, service_direction: v })
                    }
                  >
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="provided">{tt("خدمة مقدّمة (نبيعها)")}</SelectItem>
                      <SelectItem value="received">{tt("خدمة متلقّاة (نشتريها)")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">{tt("سعر البيع")}</label><Input type="number" value={quickAddForm.sell_price} onChange={e => setQuickAddForm({ ...quickAddForm, sell_price: Number(e.target.value) })} className="rounded-xl" dir="ltr" /></div>
              <div><label className="text-xs text-muted-foreground">{tt("سعر الشراء")}</label><Input type="number" value={quickAddForm.buy_price} onChange={e => setQuickAddForm({ ...quickAddForm, buy_price: Number(e.target.value) })} className="rounded-xl" dir="ltr" /></div>
            </div>
            {quickAddForm.product_type !== "service" && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">{tt("الوحدة")}</label>
                <Select value={quickAddForm.unit} onValueChange={v => setQuickAddForm({ ...quickAddForm, unit: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{["قطعة", "كغ", "طن", "متر", "لتر", "علبة", "كرتون", "حبة"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="text-xs text-muted-foreground">{tt("الكمية المبدئية")}</label><Input type="number" value={quickAddForm.quantity} onChange={e => setQuickAddForm({ ...quickAddForm, quantity: Number(e.target.value) })} className="rounded-xl" dir="ltr" /></div>
            </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => { clearProductDraft(); setQuickAddForm({ name: "", sell_price: 0, buy_price: 0, unit: "قطعة", quantity: 0, product_type: "product", service_direction: "" }); setShowQuickAdd(false); }}>{tt("إلغاء")}</Button>
            <Button onClick={handleQuickAddProduct}>{tt("إضافة المنتج")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Add Sales Rep Dialog */}
      <Dialog open={showQuickAddRep} onOpenChange={(o) => setShowQuickAddRep(o)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>{tt("تعريف مندوب جديد")}</DialogTitle><DialogDescription>{tt("أضف مندوب مبيعات واربطه بالفاتورة مباشرة")}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground">{tt("اسم المندوب *")}</label><Input value={quickRepForm.full_name} onChange={e => setQuickRepForm({ ...quickRepForm, full_name: e.target.value })} className="rounded-xl" placeholder={tt("الاسم الكامل")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">{tt("الهاتف")}</label><Input value={quickRepForm.phone} onChange={e => setQuickRepForm({ ...quickRepForm, phone: e.target.value })} className="rounded-xl" dir="ltr" placeholder="05xxxxxxxx" /></div>
              <div><label className="text-xs text-muted-foreground">{tt("المنطقة")}</label><Input value={quickRepForm.region} onChange={e => setQuickRepForm({ ...quickRepForm, region: e.target.value })} className="rounded-xl" placeholder={tt("مثال: رام الله")} /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">{tt("نسبة العمولة %")}</label><Input type="number" value={quickRepForm.sales_commission_rate} onChange={e => setQuickRepForm({ ...quickRepForm, sales_commission_rate: Number(e.target.value) })} className="rounded-xl w-32" dir="ltr" min={0} max={100} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => { clearRepDraft(); setQuickRepForm({ full_name: "", phone: "", region: "", sales_commission_rate: 0 }); setShowQuickAddRep(false); }}>{tt("إلغاء")}</Button>
            <Button onClick={handleQuickAddRep}>{tt("إضافة المندوب")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />{tt("حذف الفاتورة")}
            </DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف الفاتورة رقم {nextInvoiceNumber}؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>{tt("إلغاء")}</Button>
            <Button variant="destructive" onClick={() => { setShowDeleteConfirm(false); handleDeleteInvoice(); }}>{tt("تأكيد الحذف")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Warranty Cards Dialog */}
      {isEditMode && editInvoiceId && (
        <CreateWarrantyCardsDialog
          open={showWarrantyDialog}
          onOpenChange={setShowWarrantyDialog}
          invoiceId={editInvoiceId}
          contactId={selectedContact?.id || null}
          contactName={selectedContact?.contact_name || form.contactName || null}
          invoiceDate={form.date}
        />
      )}

      {/* Drafts history dialog */}
      <DraftsHistoryDialog
        open={showDraftsHistory}
        onOpenChange={setShowDraftsHistory}
        scope={draftScope}
        onRestore={(data) => restoreDraftFromHistory(data)}
        currencySymbol={currSymbol}
      />

      {/* Advanced product search popup (مثل حساباتي) */}
      <ProductSearchDialog
        open={productSearchDialog.open}
        onOpenChange={(open) =>
          setProductSearchDialog((prev) => ({ open, itemId: open ? prev.itemId : null }))
        }
        products={products as any}
        warehouseStock={warehouseStock}
        warehouseName={warehouses.find((w) => w.id === form.warehouseId)?.name || null}
        invoiceType={form.type}
        currencySymbol={currSymbol}
        lastPrices={lastPrices}
        onSelect={(productId) => {
          if (productSearchDialog.itemId) {
            selectProduct(productSearchDialog.itemId, productId);
            // Stock warning if not enough.
            const stock = warehouseStock[productId];
            const prod = products.find((p) => p.id === productId);
            if (
              prod &&
              prod.product_type !== "service" &&
              form.type === "sales" &&
              stock !== undefined &&
              stock <= 0
            ) {
              toast({
                title: tt("تنبيه مخزون"),
                description: `الكمية غير متوفرة في المستودع المحدد (${prod.name}).`,
                variant: "destructive",
              });
            }
          }
        }}
      />
    </div>
    </SmartFormScope>
    </AccountingShell>
    </>
  );
};

export default InvoiceCreatePage;
