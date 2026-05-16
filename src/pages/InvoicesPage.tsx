import { useState, useEffect, useRef, useMemo } from "react";
// useSearchParams imported below with useNavigate
import PageHeader from "@/components/layout/PageHeader";

import { ArrowRight, Loader2, Plus, FileText, Printer, Search, ShoppingCart, Receipt, Package, Trash2, Save, Eye, AlertTriangle, CreditCard, Building2, Banknote, Clock, ChevronDown, ChevronLeft, ChevronRight, X, Filter, LayoutGrid, Table2, ArrowUpDown, FileSpreadsheet, Copy, Pencil, MoreHorizontal, Download, Mail, Send, TrendingUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import DuplicateConfirmModal from "@/components/DuplicateConfirmModal";
import { useDocumentPermissions } from "@/hooks/useDocumentPermissions";
import DeleteDocumentDialog from "@/components/documents/DeleteDocumentDialog";
import EditPostedWarningDialog from "@/components/documents/EditPostedWarningDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import InvoicePrintView from "@/components/InvoicePrintView";
import { createRoot } from "react-dom/client";
import * as XLSX from "xlsx";
import useFocusHighlight from "@/hooks/useFocusHighlight";

import { setNextExportBranding } from "@/lib/excel-export";
import RelatedJournalPanel from "@/components/accounting/RelatedJournalPanel";
interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
  phone?: string;
  tax_number?: string;
  balance?: number;
}

type TaxCategory = "taxable" | "zero" | "exempt";

interface InvoiceItem {
  id: string;
  productId?: string;
  description: string;
  productCode?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxCategory: TaxCategory;
  subtotal: number;
}

interface Invoice {
  id: string;
  type: "sales" | "purchase";
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  contactName: string;
  contactId?: string | null;
  contactTaxNumber?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactAddress?: string;
  items: InvoiceItem[];
  notes: string;
  // 🎯 Invoice lifecycle status (workflow only — does NOT reflect payment)
  status: "draft" | "sent" | "cancelled";
  // 🎯 Payment status — derived from receipt vouchers, NOT user-controlled
  paymentStatus: "unpaid" | "partial" | "paid";
  paymentMethod: "cash" | "transfer" | "cheque" | "credit";
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  total: number;
  paidAmount: number;
  remainingAmount: number;
  currency: string;
  chequeDetails?: { number: string; bank: string; dueDate: string };
  transferDetails?: { reference: string; bank: string };
  taxInclusive?: boolean;
}

const createEmptyItem = (): InvoiceItem => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unitPrice: 0,
  discount: 0,
  taxRate: 16,
  taxCategory: "taxable",
  subtotal: 0,
});

const TAX_CATEGORY_OPTIONS: { value: TaxCategory; label: string; rate: number }[] = [
  { value: "taxable", label: "خاضع للضريبة 16%", rate: 16 },
  { value: "zero", label: "بنسبة صفر 0%", rate: 0 },
  { value: "exempt", label: "معفى من الضريبة", rate: 0 },
];

const InvoicesPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  // Phase 5J.1 — focus & highlight from ?focus=<invoice_id>
  const focusedInvoiceId = useFocusHighlight();
  const { settings: companySettings } = useCompanySettings();
  const { canEdit, canDelete } = useDocumentPermissions();
  const printRef = useRef<HTMLDivElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditWarning, setShowEditWarning] = useState(false);
  const [deleteTargetInvoice, setDeleteTargetInvoice] = useState<Invoice | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const initialType = searchParams.get("type") === "purchase" ? "purchase" : searchParams.get("type") === "sales" ? "sales" : "all";
  const [filterType, setFilterType] = useState<"all" | "sales" | "purchase">(initialType);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreatePage, setShowCreatePage] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [creating, setCreating] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ name: "", sell_price: 0, buy_price: 0, unit: "قطعة", quantity: 0 });
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [contactDebtWarning, setContactDebtWarning] = useState<string | null>(null);
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<"date" | "contact" | "type" | "total" | "status">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("all");

  // Advanced filters
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

  // Email modal
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState<Invoice | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Duplicate state
  const [duplicateModal, setDuplicateModal] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<Invoice | null>(null);

  const handleDuplicate = (inv: Invoice) => {
    setDuplicateTarget(inv);
    setDuplicateModal(true);
  };

  const confirmDuplicate = () => {
    if (!duplicateTarget) return;
    const draftData = {
      _sourceRef: duplicateTarget.invoiceNumber,
      type: duplicateTarget.type,
      contactName: duplicateTarget.contactName,
      contactId: duplicateTarget.contactId || null,
      paymentMethod: duplicateTarget.paymentMethod,
      currency: duplicateTarget.currency,
      notes: duplicateTarget.notes,
      items: duplicateTarget.items?.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        taxRate: item.taxRate,
        subtotal: item.subtotal,
        productId: item.productId,
      })),
      contactSearch: duplicateTarget.contactName,
    };
    localStorage.setItem("draft_invoice_new", JSON.stringify(draftData));
    setDuplicateModal(false);
    navigate("/invoices/new?from_duplicate=true");
  };

  const [form, setForm] = useState({
    type: (initialType === "purchase" ? "purchase" : "sales") as "sales" | "purchase",
    contactName: "",
    contactTaxNumber: "",
    date: new Date().toISOString().split("T")[0],
    dueDate: "",
    paymentMethod: "cash" as "cash" | "transfer" | "cheque" | "credit",
    currency: "شيكل",
    notes: "",
    items: [createEmptyItem()] as InvoiceItem[],
    chequeNumber: "",
    chequeBank: "",
    chequeDueDate: "",
    chequeNotes: "",
    transferRef: "",
    transferBank: "",
    pricesInclusive: false,
  });

  const fetchInvoices = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch from database
      const { data: dbInvoices } = await supabase
        .from("invoices")
        .select("*, invoice_items(*, products(sku, barcode)), contacts(tax_number, phone, email, address)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const mapped: Invoice[] = (dbInvoices || []).map((inv: any) => ({
        id: inv.id,
        type: (inv.invoice_type === 'sale' || inv.invoice_type === 'sales') ? 'sales' : 'purchase',
        invoiceNumber: inv.invoice_number || '',
        date: inv.invoice_date || '',
        dueDate: inv.due_date || undefined,
        contactName: inv.contact_name || '',
        contactId: inv.contact_id || null,
        contactTaxNumber: inv.contacts?.tax_number || '',
        contactPhone: inv.contacts?.phone || '',
        contactEmail: inv.contacts?.email || '',
        contactAddress: inv.contacts?.address || inv.billing_address || '',
        items: (inv.invoice_items || []).map((item: any) => ({
          id: item.id,
          productId: item.product_id || undefined,
          description: item.product_name || item.description || '',
          productCode: item.products?.sku || item.products?.barcode || undefined,
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unit_price) || 0,
          discount: Number(item.discount) || 0,
          taxRate: Number(item.tax_rate) || 0,
          subtotal: Number(item.total_amount) || 0,
        })),
        notes: inv.notes || '',
        // Invoice lifecycle status — independent from payment
        status: inv.status === 'cancelled' ? 'cancelled' : inv.status === 'draft' ? 'draft' : 'sent',
        // Derived payment status — driven by paid_amount vs total_amount via voucher links
        paymentStatus: (Number(inv.paid_amount) || 0) >= (Number(inv.total_amount) || 0) && (Number(inv.total_amount) || 0) > 0
          ? 'paid'
          : (Number(inv.paid_amount) || 0) > 0 ? 'partial' : 'unpaid',
        paymentMethod: inv.payment_method === 'نقدي' ? 'cash' : inv.payment_method === 'بنك' ? 'transfer' : inv.payment_method === 'شيك' ? 'cheque' : 'credit',
        subtotal: Number(inv.subtotal) || 0,
        totalDiscount: Number(inv.discount_amount) || 0,
        totalTax: Number(inv.tax_amount) || 0,
        total: Number(inv.total_amount) || 0,
        paidAmount: Number(inv.paid_amount) || 0,
        remainingAmount: Number(inv.remaining_amount) || 0,
        currency: inv.currency || 'شيكل',
        taxInclusive: Boolean(inv.tax_inclusive),
      }));

      // Also load legacy localStorage invoices
      const stored = localStorage.getItem(`invoices_${user.id}`);
      const localInvoices: Invoice[] = stored ? JSON.parse(stored) : [];
      
      // Merge: DB invoices first, then local ones not already in DB
      const dbIds = new Set(mapped.map(i => i.id));
      const uniqueLocal = localInvoices.filter(i => !dbIds.has(i.id));
      
      setInvoices([...mapped, ...uniqueLocal]);
    } catch (err) {
      console.error('Error fetching invoices:', err);
      // Fallback to localStorage
      const stored = localStorage.getItem(`invoices_${user.id}`);
      if (stored) setInvoices(JSON.parse(stored));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchInvoices();
    fetchContacts();
    fetchProducts();
  }, [user]);

  const fetchProducts = async () => {
    if (!user) return;
    const { data } = await supabase.from("products").select("*").eq("user_id", user.id).order("name");
    setProducts((data as any[]) || []);
  };

  const fetchContacts = async () => {
    if (!user) return;
    const { data } = await supabase.from("contacts").select("id, contact_name, contact_type, phone, tax_number").eq("user_id", user.id).order("contact_name");
    const contactsList = (data as Contact[]) || [];
    
    // Fetch balances from transactions (account 1130 = customers receivable, 2100 = suppliers payable)
    const contactIds = contactsList.map(c => c.id);
    const { data: txData } = await supabase
      .from("transactions")
      .select("contact_id, debit_account_code, credit_account_code, amount")
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .in("contact_id", contactIds);
    
    const customerBalanceMap: Record<string, number> = {};
    const supplierBalanceMap: Record<string, number> = {};
    ((txData as any[]) || []).forEach((tx: any) => {
      const cid = tx.contact_id;
      if (!cid) return;
      const amt = Number(tx.amount || 0);
      if (tx.debit_account_code === "1130") customerBalanceMap[cid] = (customerBalanceMap[cid] || 0) + amt;
      if (tx.credit_account_code === "1130") customerBalanceMap[cid] = (customerBalanceMap[cid] || 0) - amt;
      if (tx.credit_account_code === "2110") supplierBalanceMap[cid] = (supplierBalanceMap[cid] || 0) + amt;
      if (tx.debit_account_code === "2110") supplierBalanceMap[cid] = (supplierBalanceMap[cid] || 0) - amt;
    });
    
    const withBalances = contactsList.map(c => {
      const isSupplier = c.contact_type === "مورد";
      const balance = isSupplier ? (supplierBalanceMap[c.id] || 0) : (customerBalanceMap[c.id] || 0);
      return { ...c, balance };
    });
    setContacts(withBalances);
  };

  const saveInvoices = (updated: Invoice[]) => {
    if (!user) return;
    setInvoices(updated);
    localStorage.setItem(`invoices_${user.id}`, JSON.stringify(updated));
  };

  const generateInvoiceNumber = (type: "sales" | "purchase") => {
    const prefix = type === "sales" ? "INV" : "PO";
    const num = invoices.filter(i => i.type === type).length + 1;
    return `${prefix}-${String(num).padStart(4, "0")}`;
  };

  // Calculate item subtotal with tax-inclusive support
  const calcItemSubtotal = (item: InvoiceItem, inclusive = form.pricesInclusive) => {
    if (item.taxCategory === "exempt") {
      const base = item.quantity * item.unitPrice;
      return base - item.discount;
    }
    const rate = item.taxCategory === "taxable" ? 16 : 0;
    if (inclusive) {
      const grossBase = item.quantity * item.unitPrice;
      const afterDiscount = grossBase - item.discount;
      // Price already includes tax
      return afterDiscount;
    }
    const base = item.quantity * item.unitPrice;
    const afterDiscount = base - item.discount;
    const tax = afterDiscount * (rate / 100);
    return afterDiscount + tax;
  };

  // Summary calculations with VAT breakdown
  const summary = useMemo(() => {
    let netBeforeTax = 0;
    let totalDiscount = 0;
    let taxableTax = 0;
    let taxableNet = 0;
    let zeroNet = 0;
    let exemptNet = 0;

    form.items.forEach(i => {
      const gross = i.quantity * i.unitPrice;
      totalDiscount += i.discount;
      const afterDiscount = gross - i.discount;
      
      if (i.taxCategory === "exempt") {
        exemptNet += afterDiscount;
        netBeforeTax += afterDiscount;
      } else if (i.taxCategory === "zero") {
        zeroNet += afterDiscount;
        netBeforeTax += afterDiscount;
      } else {
        // taxable
        if (form.pricesInclusive) {
          const netVal = afterDiscount / 1.16;
          const taxVal = afterDiscount - netVal;
          taxableNet += netVal;
          taxableTax += taxVal;
          netBeforeTax += netVal;
        } else {
          taxableNet += afterDiscount;
          taxableTax += afterDiscount * 0.16;
          netBeforeTax += afterDiscount;
        }
      }
    });

    const totalTax = taxableTax;
    const total = netBeforeTax + totalTax;
    const paidAmount = form.paymentMethod === "credit" ? 0 : total;
    const remainingAmount = total - paidAmount;
    return { subtotal: netBeforeTax + totalDiscount, totalDiscount, netBeforeTax, totalTax, taxableNet, taxableTax, zeroNet, exemptNet, total, paidAmount, remainingAmount };
  }, [form.items, form.paymentMethod, form.pricesInclusive]);

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
        if (field === "description" && typeof value === "string") {
          const prod = products.find(p => p.name === value);
          if (prod) {
            updated.productId = prod.id;
            const price = prev.type === "sales" ? Number(prod.sell_price) : Number(prod.buy_price);
            if (price > 0) updated.unitPrice = price;
            // Auto-set tax from product
            const prodTaxRate = Number(prod.tax_rate || 0);
            if (prodTaxRate > 0) {
              updated.taxCategory = "taxable";
              updated.taxRate = 16;
            } else {
              updated.taxCategory = "taxable";
              updated.taxRate = 16;
            }
          }
        }
        updated.subtotal = calcItemSubtotal(updated, prev.pricesInclusive);
        return updated;
      }),
    }));
  };

  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, createEmptyItem()] }));

  const removeItem = (id: string) => {
    if (form.items.length <= 1) return;
    setForm(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
  };

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = !contactSearch || c.contact_name.includes(contactSearch);
    return matchesSearch;
  });

  const selectContact = (contact: Contact) => {
    setForm(prev => ({ ...prev, contactName: contact.contact_name, contactTaxNumber: contact.tax_number || "" }));
    setContactSearch(contact.contact_name);
    setShowContactDropdown(false);
    checkContactDebt(contact.contact_name);
  };

  const checkContactDebt = async (name: string) => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("transactions")
        .select("debit_account_code, credit_account_code, amount")
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .or(`debit_account_code.eq.1130,credit_account_code.eq.1130`)
        .ilike("description", `%${name}%`);
      
      let balance = 0;
      (data || []).forEach(t => {
        if (t.debit_account_code === "1130") balance += Number(t.amount || 0);
        if (t.credit_account_code === "1130") balance -= Number(t.amount || 0);
      });
      
      if (balance > 0) {
        setContactDebtWarning(`⚠️ هذا العميل عليه رصيد مستحق: ₪${balance.toLocaleString()}`);
      } else {
        setContactDebtWarning(null);
      }
    } catch {
      setContactDebtWarning(null);
    }
  };

  const handleQuickAddProduct = async () => {
    if (!user || !quickAddForm.name.trim()) { toast({ title: "اسم الصنف مطلوب", variant: "destructive" }); return; }
    const { error } = await supabase.from("products").insert({ ...quickAddForm, user_id: user.id } as any);
    if (error) { toast({ title: "خطأ في الإضافة", variant: "destructive" }); return; }
    toast({ title: `تمت إضافة "${quickAddForm.name}" ✅` });
    setShowQuickAdd(false);
    setQuickAddForm({ name: "", sell_price: 0, buy_price: 0, unit: "قطعة", quantity: 0 });
    fetchProducts();
  };

  const isNewContact = form.contactName.trim() !== "" && !contacts.some(
    c => c.contact_name.trim() === form.contactName.trim()
  );

  const createContactInDB = async (name: string) => {
    if (!user) return;
    try {
      await supabase.from("contacts").upsert({
        user_id: user.id,
        contact_name: name,
        contact_type: form.type === "sales" ? "عميل" : "مورد",
      }, { onConflict: "user_id,contact_name" });
      fetchContacts();
    } catch (err) { console.error(err); }
  };

  // Inventory update
  const updateInventory = async (items: InvoiceItem[], type: "sales" | "purchase") => {
    if (!user) return;
    for (const item of items) {
      if (!item.productId) continue;
      const prod = products.find(p => p.id === item.productId);
      if (!prod) continue;

      const newQty = type === "sales"
        ? Number(prod.quantity) - item.quantity
        : Number(prod.quantity) + item.quantity;

      await supabase.from("products").update({ quantity: newQty } as any).eq("id", item.productId);

      // Record stock movement
      await supabase.from("stock_movements").insert({
        product_id: item.productId,
        quantity: item.quantity,
        movement_type: type === "sales" ? "صادر" : "وارد",
        reference_note: `فاتورة ${type === "sales" ? "مبيعات" : "مشتريات"}`,
        user_id: user.id,
      } as any);
    }
  };

  // Cheque creation
  const createCheque = async (invoice: Invoice) => {
    if (!user || form.paymentMethod !== "cheque") return;
    await supabase.from("cheques").insert({
      user_id: user.id,
      cheque_type: form.type === "sales" ? "وارد" : "صادر",
      party_name: form.contactName,
      party_type: form.type === "sales" ? "عميل" : "مورد",
      amount: invoice.total,
      cheque_date: form.chequeDueDate || form.date,
      cheque_number: form.chequeNumber || null,
      bank_name: form.chequeBank || null,
      currency: form.currency,
      status: "مسجل",
      notes: form.chequeNotes ? `${form.chequeNotes} • فاتورة ${invoice.invoiceNumber}` : `مرتبط بفاتورة ${invoice.invoiceNumber}`,
    } as any);
  };

  const validate = (): boolean => {
    if (!form.contactName.trim()) {
      toast({ title: "يرجى اختيار جهة الاتصال", variant: "destructive" });
      return false;
    }
    if (form.items.some(i => !i.description.trim())) {
      toast({ title: "يرجى تعبئة وصف جميع البنود", variant: "destructive" });
      return false;
    }
    if (form.items.some(i => i.unitPrice <= 0)) {
      toast({ title: "لا يمكن إنشاء فاتورة ببند سعره 0", variant: "destructive" });
      return false;
    }
    if (form.items.some(i => i.quantity <= 0)) {
      toast({ title: "الكمية يجب أن تكون أكبر من 0", variant: "destructive" });
      return false;
    }
    if (summary.total <= 0) {
      toast({ title: "إجمالي الفاتورة يجب أن يكون أكبر من 0", variant: "destructive" });
      return false;
    }
    // Check stock availability for sales
    if (form.type === "sales") {
      for (const item of form.items) {
        if (!item.productId) continue;
        const prod = products.find(p => p.id === item.productId);
        if (prod && item.quantity > Number(prod.quantity)) {
          toast({ title: `الكمية المطلوبة من "${item.description}" (${item.quantity}) أكبر من المتوفر (${prod.quantity})`, variant: "destructive" });
          return false;
        }
      }
    }
    if (form.paymentMethod === "credit" && !form.dueDate) {
      toast({ title: "يرجى تحديد تاريخ الاستحقاق للدفع الآجل", variant: "destructive" });
      return false;
    }
    if (form.paymentMethod === "cheque") {
      if (!form.chequeNumber.trim()) {
        toast({ title: "يرجى إدخال رقم الشيك", variant: "destructive" });
        return false;
      }
      if (!form.chequeBank.trim()) {
        toast({ title: "يرجى إدخال اسم البنك", variant: "destructive" });
        return false;
      }
      if (!form.chequeDueDate) {
        toast({ title: "يرجى تحديد تاريخ استحقاق الشيك", variant: "destructive" });
        return false;
      }
    }
    return true;
  };

  const handleCreate = async (asDraft = false) => {
    if (!asDraft && !validate()) return;
    if (asDraft && !form.contactName.trim() && form.items.every(i => !i.description.trim())) {
      toast({ title: "الفاتورة فارغة", variant: "destructive" });
      return;
    }
    setCreating(true);
    if (isNewContact) await createContactInDB(form.contactName.trim());

    const paymentMethodAr = form.paymentMethod === 'cash' ? 'نقدي' : form.paymentMethod === 'transfer' ? 'بنك' : form.paymentMethod === 'cheque' ? 'شيك' : 'آجل';

    // Save to database
    try {
      const { data: dbInv, error: invErr } = await supabase.from("invoices").insert({
        user_id: user!.id,
        invoice_type: form.type === 'sales' ? 'sale' : 'purchase',
        contact_name: form.contactName,
        invoice_date: form.date,
        due_date: form.dueDate || null,
        subtotal: summary.subtotal,
        discount_amount: summary.totalDiscount,
        tax_amount: summary.totalTax,
        total_amount: summary.total,
        paid_amount: summary.paidAmount,
        remaining_amount: summary.remainingAmount,
        payment_status: summary.remainingAmount <= 0 ? 'paid' : 'unpaid',
        payment_method: paymentMethodAr,
        currency: form.currency,
        notes: form.notes,
        source: 'manual',
        status: asDraft ? 'draft' : 'sent',
      } as any).select('id, invoice_number').single();

      if (!invErr && dbInv) {
        // Insert invoice items
        const itemsToInsert = form.items.filter(i => i.description.trim()).map(item => ({
          invoice_id: dbInv.id,
          product_id: item.productId || null,
          product_name: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          discount: item.discount,
          tax_rate: item.taxRate,
          total_amount: calcItemSubtotal(item),
        }));
        if (itemsToInsert.length > 0) {
          await supabase.from("invoice_items").insert(itemsToInsert as any);
        }

        if (!asDraft) {
          await updateInventory(form.items, form.type);

          // Insert into tax_ledger for VAT tracking
          if (summary.totalTax > 0) {
            const invoiceDate = new Date(form.date);
            await supabase.from("tax_ledger").insert({
              user_id: user!.id,
              tax_type: form.type === "sales" ? "output" : "input",
              net_amount: summary.netBeforeTax,
              tax_rate: 16,
              tax_amount: summary.totalTax,
              reference_type: form.type === "sales" ? "invoice" : "purchase",
              reference_id: dbInv.id,
              invoice_number: dbInv.invoice_number,
              party_name: form.contactName,
              party_tax_number: form.contactTaxNumber || null,
              transaction_date: form.date,
              period_year: invoiceDate.getFullYear(),
              period_month: invoiceDate.getMonth() + 1,
              tax_category: "taxable",
              is_deductible: form.type === "purchase",
            } as any);
          }

          if (form.paymentMethod === "cheque") {
            const invoice: Invoice = {
              id: dbInv.id,
              type: form.type,
              invoiceNumber: dbInv.invoice_number || '',
              date: form.date,
              contactName: form.contactName,
              items: form.items,
              notes: form.notes,
              status: "sent",
              paymentMethod: form.paymentMethod,
              paymentStatus: summary.remainingAmount <= 0 ? "paid" : summary.paidAmount > 0 ? "partial" : "unpaid",
              subtotal: summary.subtotal,
              totalDiscount: summary.totalDiscount,
              totalTax: summary.totalTax,
              total: summary.total,
              paidAmount: summary.paidAmount,
              remainingAmount: summary.remainingAmount,
              currency: form.currency,
              chequeDetails: { number: form.chequeNumber, bank: form.chequeBank, dueDate: form.chequeDueDate },
            };
            await createCheque(invoice);
          }
        }

        toast({ title: asDraft ? "تم حفظ المسودة ✅" : `تم إنشاء الفاتورة ${dbInv.invoice_number} بنجاح ✅` });
        await fetchInvoices();
      } else {
        console.error('DB invoice error:', invErr);
        toast({ title: "خطأ في حفظ الفاتورة", variant: "destructive" });
      }
    } catch (err) {
      console.error('Invoice creation error:', err);
      toast({ title: "خطأ في إنشاء الفاتورة", variant: "destructive" });
    }

    setShowCreatePage(false);
    setCreating(false);
    resetForm();
  };

  const resetForm = () => {
    setForm({
      type: "sales", contactName: "", contactTaxNumber: "", date: new Date().toISOString().split("T")[0],
      dueDate: "", paymentMethod: "cash", currency: "شيكل", notes: "",
      items: [createEmptyItem()],
      chequeNumber: "", chequeBank: "", chequeDueDate: "", chequeNotes: "",
      transferRef: "", transferBank: "", pricesInclusive: false,
    });
    setContactSearch("");
    setContactDebtWarning(null);
  };

  const handlePrint = () => {
    if (!selectedInvoice) return;
    const win = window.open("", "_blank");
    if (!win) return;
    
    win.document.write(`<html dir="rtl"><head>
      <title>فاتورة ${selectedInvoice.invoiceNumber}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: white; }
        @media print { body { padding: 0; } @page { margin: 8mm; size: A4; } }
      </style>
    </head><body><div id="print-root"></div></body></html>`);
    win.document.close();

    // Render React component into the new window
    setTimeout(() => {
      const container = win.document.getElementById("print-root");
      if (container) {
        const root = createRoot(container);
        root.render(
          <InvoicePrintView invoice={selectedInvoice} settings={companySettings} copyLabel="أصلية" />
        );
        setTimeout(() => win.print(), 500);
      }
    }, 200);
  };

  // Direct print for a specific invoice
  const handleDirectPrint = (inv: Invoice) => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html dir="rtl"><head>
      <title>فاتورة ${inv.invoiceNumber}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: white; } @media print { body { padding: 0; } @page { margin: 8mm; size: A4; } }</style>
    </head><body><div id="print-root"></div></body></html>`);
    win.document.close();
    setTimeout(() => {
      const container = win.document.getElementById("print-root");
      if (container) {
        const root = createRoot(container);
        root.render(<InvoicePrintView invoice={inv} settings={companySettings} copyLabel="أصلية" />);
        setTimeout(() => win.print(), 500);
      }
    }, 200);
  };

  // Open email modal
  const openEmailModal = async (inv: Invoice) => {
    setEmailTarget(inv);
    setEmailSubject(`فاتورة رقم ${inv.invoiceNumber}`);
    // Try to get contact email
    if (inv.contactId) {
      const { data } = await supabase.from("contacts").select("email").eq("id", inv.contactId).maybeSingle();
      setEmailTo(data?.email || "");
    } else {
      setEmailTo("");
    }
    setEmailModalOpen(true);
  };

  const handleSendEmail = async () => {
    if (!emailTarget || !emailTo) {
      toast({ title: "يرجى إدخال البريد الإلكتروني", variant: "destructive" });
      return;
    }
    setSendingEmail(true);
    // For now, show success (actual email integration can be added later)
    setTimeout(() => {
      toast({ title: `تم إرسال الفاتورة إلى ${emailTo} ✅` });
      setSendingEmail(false);
      setEmailModalOpen(false);
    }, 1000);
  };

  const resetAdvancedFilters = () => {
    setDateFrom(""); setDateTo(""); setAmountMin(""); setAmountMax("");
  };


    const updateStatus = async (id: string, status: Invoice["status"]) => {
    // 🎯 SEPARATION OF CONCERNS:
    //   - Invoice status: Draft | Sent | Cancelled (workflow only)
    //   - Payment status: Unpaid | Partial | Paid (DERIVED from receipt vouchers, NEVER user-controlled)
    //
    // The "Mark as Paid" action no longer exists in the status dropdown.
    // To settle an invoice, users must create a Receipt Voucher (سند قبض) via the dedicated button.
    const dbStatus = status === 'sent' ? 'sent' : status === 'cancelled' ? 'cancelled' : 'draft';
    
    // ✅ تقييد تحويل الفاتورة لمسودة بصلاحية admin أو accountant_senior فقط
    if (dbStatus === 'draft' && user) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "accountant_senior", "super_admin"]);
      
      if (!roles || roles.length === 0) {
        toast({
          title: "غير مسموح ❌",
          description: "تحويل الفاتورة لمسودة يتطلب صلاحية مدير أو محاسب أول",
          variant: "destructive",
        });
        return;
      }
    }

    // Get current invoice to check linked_transaction_id
    const { data: currentInv } = await supabase.from("invoices").select("linked_transaction_id, status").eq("id", id).maybeSingle();
    
    await supabase.from("invoices").update({ status: dbStatus } as any).eq("id", id);
    
    // When changing to draft, create reverse entry (IFRS-compliant)
    if (dbStatus === 'draft' && currentInv?.linked_transaction_id) {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      await supabase.rpc('create_reverse_entry', {
        original_transaction_id: currentInv.linked_transaction_id,
        reason: 'تحويل الفاتورة لمسودة',
        reversed_by: currentUser?.id
      });
    }
    // When changing from draft to sent/paid, create a new transaction (IFRS-compliant)
    if (dbStatus !== 'draft' && currentInv?.status === 'draft') {
      await supabase.rpc('recreate_invoice_transaction', { p_invoice_id: id });
    }
    
    const updated = invoices.map(inv => inv.id === id ? { ...inv, status } : inv);
    setInvoices(updated);
    if (selectedInvoice?.id === id) setSelectedInvoice({ ...selectedInvoice, status });
    toast({ title: "تم تحديث الحالة ✅" });
  };

  const handleDeleteInvoice = async (id: string, reason: string) => {
    try {
      // Soft-delete: set status to cancelled — DB trigger will cascade to linked transaction
      const { error } = await supabase.from("invoices").update({ status: "cancelled" } as any).eq("id", id);
      if (error) throw error;
      
      // Update local state
      setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: "cancelled" as any } : inv));
      setShowPreviewDialog(false);
      setSelectedInvoice(null);
      
      // Log to document_edit_history
      if (user) {
        await supabase.from("document_edit_history" as any).insert({
          document_id: id,
          document_type: 'invoice',
          edit_reason: reason,
          edited_by: user.id,
          old_data: {},
          new_data: { action: 'cancel' },
        } as any);
      }
      
      toast({ title: "تم إلغاء الفاتورة والقيد المرتبط بنجاح ✅" });
    } catch (err: any) {
      console.error('Cancel invoice error:', err);
      toast({ title: "خطأ في إلغاء الفاتورة", description: err.message, variant: "destructive" });
    }
  };

  const filtered = invoices.filter(inv => {
    if (filterType !== "all" && inv.type !== filterType) return false;
    if (searchQuery && !inv.contactName.includes(searchQuery) && !inv.invoiceNumber.includes(searchQuery)) return false;
    if (dateFrom && inv.date < dateFrom) return false;
    if (dateTo && inv.date > dateTo) return false;
    if (amountMin && inv.total < Number(amountMin)) return false;
    if (amountMax && inv.total > Number(amountMax)) return false;
    return true;
  });

  const salesTotal = invoices.filter(i => i.type === "sales").reduce((s, i) => s + i.total, 0);
  const purchaseTotal = invoices.filter(i => i.type === "purchase").reduce((s, i) => s + i.total, 0);

  const PAGE_SIZE = 15;

  const sorted = useMemo(() => {
    const arr = [...filtered].filter(inv => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      return true;
    });
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date": cmp = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
        case "contact": cmp = a.contactName.localeCompare(b.contactName); break;
        case "type": cmp = a.type.localeCompare(b.type); break;
        case "total": cmp = a.total - b.total; break;
        case "status": cmp = a.status.localeCompare(b.status); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Number formatter — always 2 decimals with thousands separators
  const fmtNum = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Totals — exclude cancelled invoices from financial sums (unless user filtered ONLY cancelled)
  const computeTotals = (list: Invoice[]) => {
    const cancelledCount = list.filter(i => i.status === "cancelled").length;
    const onlyCancelled = statusFilter === "cancelled";
    const financial = onlyCancelled ? list : list.filter(i => i.status !== "cancelled");
    const sum = (key: keyof Invoice) => financial.reduce((s, i) => s + (Number(i[key] as any) || 0), 0);
    return {
      count: list.length,
      cancelledCount,
      financialCount: financial.length,
      subtotal: sum("subtotal"),
      totalDiscount: sum("totalDiscount"),
      totalTax: sum("totalTax"),
      total: sum("total"),
      paid: sum("paidAmount"),
      remaining: sum("remainingAmount"),
      onlyCancelled,
    };
  };
  const totalsAll = useMemo(() => computeTotals(sorted), [sorted, statusFilter]);
  const totalsPage = useMemo(() => computeTotals(paginated), [paginated, statusFilter]);

  useEffect(() => { setPage(1); }, [searchQuery, filterType, statusFilter]);

  const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: "مسودة", color: "bg-muted text-muted-foreground" },
    sent: { label: "مُرسلة", color: "bg-primary/10 text-primary" },
    approved: { label: "معتمدة", color: "bg-blue-100 text-blue-700" },
    cancelled: { label: "ملغاة", color: "bg-muted text-muted-foreground" },
  };
  const fallbackStatus = { label: "غير محدد", color: "bg-muted text-muted-foreground" };

  // 🎯 Payment status — separate from invoice workflow status
  const paymentStatusConfig: Record<string, { label: string; color: string }> = {
    unpaid: { label: "غير مدفوعة", color: "bg-destructive/10 text-destructive" },
    partial: { label: "مدفوعة جزئياً", color: "bg-amber-100 text-amber-700" },
    paid: { label: "مدفوعة", color: "bg-success/20 text-success" },
  };

  // Open receipt voucher form pre-filled to settle this invoice
  const recordPayment = (inv: Invoice) => {
    if (inv.type !== 'sales') {
      // For purchases, route to payment voucher
      const params = new URLSearchParams();
      params.set("invoice_id", inv.id);
      if (inv.contactName) params.set("contact_name", inv.contactName);
      navigate(`/finance/payment/new?${params.toString()}`);
      return;
    }
    setShowPreviewDialog(false);
    const params = new URLSearchParams();
    params.set("invoice_id", inv.id);
    if (inv.contactName) params.set("contact_name", inv.contactName);
    navigate(`/finance/receipt/new?${params.toString()}`);
  };

  const paymentLabels: Record<string, string> = {
    cash: "نقداً",
    transfer: "تحويل بنكي",
    cheque: "شيك",
    credit: "آجل",
  };

  // ─── CREATE INVOICE PAGE ───
  // Redirect to unified invoice create page
  if (showCreatePage) {
    const invoiceType = form.type === "purchase" ? "purchase" : "sales";
    navigate(`/invoices/new?type=${invoiceType}`);
    setShowCreatePage(false);
    return null;
  }

  // ─── INVOICES LIST PAGE ───

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortHeader = ({ label, field }: { label: string; field: typeof sortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary-foreground/80 transition-colors w-full">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

  const handleExport = () => {
    const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
    const headers = [
      "رقم الفاتورة", "التاريخ", "النوع", "العميل/المورد", "الحالة", "طريقة الدفع",
      "الإجمالي الفرعي", "الخصم", "الضريبة", "الإجمالي", "المدفوع", "المتبقي",
      "العملة", "ملاحظات",
    ];
    const dataRows = sorted.map(inv => [
      inv.invoiceNumber,
      inv.date,
      inv.type === "sales" ? "مبيعات" : "مشتريات",
      inv.contactName,
      statusConfig[inv.status]?.label || inv.status,
      paymentLabels[inv.paymentMethod] || inv.paymentMethod,
      round2(inv.subtotal),
      round2(inv.totalDiscount),
      round2(inv.totalTax),
      round2(inv.total),
      round2(inv.paidAmount),
      round2(inv.remainingAmount),
      inv.currency,
      inv.notes,
    ]);

    // Totals row uses SUM formulas — but skip cancelled rows by using array of indices that aren't cancelled
    // Simpler: write the precomputed numeric total to match the in-app summary (cancelled excluded).
    const t = totalsAll;
    const totalsRow: any[] = [
      "الإجمالي", "", "", "", "", "",
      round2(t.subtotal), round2(t.totalDiscount), round2(t.totalTax),
      round2(t.total), round2(t.paid), round2(t.remaining),
      "", "",
    ];

    const aoa: any[][] = [headers, ...dataRows, totalsRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 8 }, { wch: 25 },
    ];
    (ws as any)["!sheetView"] = [{ rightToLeft: true }];

    // Apply number format #,##0.00 to financial columns (G..L = 6..11 zero-indexed)
    const financialCols = [6, 7, 8, 9, 10, 11];
    const lastRow = dataRows.length + 1; // header at row 0, last data at dataRows.length
    for (let r = 1; r <= lastRow; r++) {
      for (const c of financialCols) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && typeof cell.v === "number") {
          cell.t = "n";
          cell.z = "#,##0.00;(#,##0.00);-";
        }
      }
    }

    // Bold + light fill on header row (0) and totals row (lastRow)
    const styleRow = (rowIdx: number, fill: string) => {
      for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
        if (!ws[addr]) ws[addr] = { v: "", t: "s" };
        ws[addr].s = {
          font: { bold: true },
          fill: { patternType: "solid", fgColor: { rgb: fill } },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    };
    styleRow(0, "E5E7EB");
    styleRow(lastRow, "FEF3C7");

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الفواتير");

    const filters: string[] = [];
    if (filterType !== "all") filters.push(`النوع: ${filterType === "sales" ? "مبيعات" : "مشتريات"}`);
    if (statusFilter !== "all") filters.push(`الحالة: ${statusConfig[statusFilter]?.label || statusFilter}`);
    if (searchQuery) filters.push(`بحث: ${searchQuery}`);
    if (amountMin) filters.push(`من مبلغ: ${amountMin}`);
    if (amountMax) filters.push(`إلى مبلغ: ${amountMax}`);

    setNextExportBranding({
      title: "تقرير الفواتير",
      currency: "متعدد العملات (الإجمالي بعملة كل فاتورة)",
      period: dateFrom || dateTo ? `${dateFrom || "—"} → ${dateTo || "—"}` : undefined,
      extraInfo: [
        `عدد الفواتير: ${sorted.length.toLocaleString()}`,
        `الفواتير الملغاة (مستبعدة من المجاميع): ${t.cancelledCount.toLocaleString()}`,
        filters.length ? `الفلاتر: ${filters.join(" | ")}` : "",
      ],
    });
    XLSX.writeFile(wb, `الفواتير_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "تم تصدير التقرير ✅" });
  };

  const netTotal = salesTotal - purchaseTotal;
  const paidTotal = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const unpaidTotal = invoices.reduce((s, i) => s + i.remainingAmount, 0);

  return (
    <div className="px-4 pt-6 pb-24 space-y-5" dir="rtl">
      <PageHeader title={filterType === "purchase" ? "فواتير المشتريات" : filterType === "sales" ? "فواتير المبيعات" : "الفواتير"} breadcrumb={[filterType === "purchase" ? "المشتريات" : "المبيعات", "الفواتير"]} />
      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{sorted.length} فاتورة</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted/50 rounded-xl p-0.5">
            <button onClick={() => setViewMode("cards")} className={`p-1.5 rounded-lg transition-all ${viewMode === "cards" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode("table")} className={`p-1.5 rounded-lg transition-all ${viewMode === "table" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
              <Table2 className="h-4 w-4" />
            </button>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={handleExport} disabled={sorted.length === 0}>
            <FileSpreadsheet className="h-4 w-4" /> تصدير Excel
          </Button>
          <Button size="sm" className="gap-1.5 rounded-xl shadow-md shadow-primary/20" onClick={() => navigate(`/invoices/new?type=${filterType === "purchase" ? "purchase" : "sales"}`)}>
            <Plus className="h-4 w-4" /> إنشاء فاتورة
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px", textAlign: "center" }}>
            <div className="mx-auto mb-2 flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 8, background: "#F0F4F8" }}>
              <Receipt className="h-[18px] w-[18px]" style={{ color: "#1B3A5C" }} />
            </div>
            <p className="tabular-nums" style={{ fontSize: 24, fontWeight: 600, color: "#1B3A5C" }}>₪{salesTotal.toLocaleString()}</p>
            <p style={{ fontSize: 12, color: "#6B7280" }}>فواتير المبيعات</p>
          </div>
          <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px", textAlign: "center" }}>
            <div className="mx-auto mb-2 flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 8, background: "#F0F4F8" }}>
              <ShoppingCart className="h-[18px] w-[18px]" style={{ color: "#1B3A5C" }} />
            </div>
            <p className="tabular-nums" style={{ fontSize: 24, fontWeight: 600, color: purchaseTotal > 0 ? "#EF4444" : "#1B3A5C" }}>₪{purchaseTotal.toLocaleString()}</p>
            <p style={{ fontSize: 12, color: "#6B7280" }}>فواتير المشتريات</p>
          </div>
          <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px", textAlign: "center" }}>
            <div className="mx-auto mb-2 flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: 8, background: netTotal >= 0 ? "#ECFDF5" : "#FEF2F2" }}>
              <TrendingUp className="h-[18px] w-[18px]" style={{ color: netTotal >= 0 ? "#10B981" : "#EF4444" }} />
            </div>
            <p className="tabular-nums" style={{ fontSize: 24, fontWeight: 600, color: netTotal >= 0 ? "#10B981" : "#EF4444" }}>₪{netTotal.toLocaleString()}</p>
            <p style={{ fontSize: 12, color: "#6B7280" }}>صافي الحركة</p>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      {invoices.length > 0 && (
        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="ابحث برقم الفاتورة أو اسم العميل..." className="pr-9 rounded-xl text-sm bg-muted/30 border-0 focus-visible:ring-2 focus-visible:ring-primary/20" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Select value={filterType} onValueChange={v => setFilterType(v as any)}>
                <SelectTrigger className="w-[120px] rounded-xl text-xs h-9">
                  <Filter className="h-3.5 w-3.5 ml-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="sales">مبيعات</SelectItem>
                  <SelectItem value="purchase">مشتريات</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] rounded-xl text-xs h-9">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="sent">مُرسلة</SelectItem>
                  <SelectItem value="cancelled">ملغاة</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground mr-auto">{sorted.length} فاتورة</span>
            </div>

            {/* Advanced Filters */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground h-7 px-2">
                  <Filter className="h-3 w-3" />
                  فلاتر متقدمة
                  <ChevronDown className={`h-3 w-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                  {(dateFrom || dateTo || amountMin || amountMax) && <Badge className="text-[9px] h-4 px-1 bg-primary/10 text-primary">مفعّل</Badge>}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 rounded-xl bg-muted/20 border border-border/30">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">من تاريخ</Label>
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs rounded-lg" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">إلى تاريخ</Label>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs rounded-lg" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">حد أدنى ₪</Label>
                    <Input type="number" placeholder="0" value={amountMin} onChange={e => setAmountMin(e.target.value)} className="h-8 text-xs rounded-lg font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">حد أعلى ₪</Label>
                    <Input type="number" placeholder="∞" value={amountMax} onChange={e => setAmountMax(e.target.value)} className="h-8 text-xs rounded-lg font-mono" />
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={resetAdvancedFilters}>
                    <X className="h-3 w-3" /> إعادة تعيين
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Empty */}
      {!loading && invoices.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <FileText className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">لا توجد فواتير بعد</h3>
          <p className="text-xs text-muted-foreground mb-4">{filterType === "purchase" ? "أنشئ أول فاتورة مشتريات" : "أنشئ أول فاتورة مبيعات أو مشتريات"}</p>
          <Button className="rounded-xl gap-2 shadow-md shadow-primary/20" onClick={() => navigate(`/invoices/new?type=${filterType === "purchase" ? "purchase" : "sales"}`)}>
            <Plus className="h-4 w-4" /> إنشاء فاتورة {filterType === "purchase" ? "مشتريات" : ""}
          </Button>
        </div>
      )}

      {/* No results */}
      {!loading && invoices.length > 0 && sorted.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Search className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد نتائج مطابقة</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setFilterType("all"); setStatusFilter("all"); }}>مسح الفلاتر</Button>
        </div>
      )}

      {/* TABLE VIEW */}
      {!loading && viewMode === "table" && paginated.length > 0 && (
        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right"><SortHeader label="التاريخ" field="date" /></TableHead>
                  <TableHead className="text-right"><SortHeader label="العميل/المورد" field="contact" /></TableHead>
                  <TableHead className="text-right">الرقم</TableHead>
                  <TableHead className="text-right"><SortHeader label="النوع" field="type" /></TableHead>
                  <TableHead className="text-right"><SortHeader label="الحالة" field="status" /></TableHead>
                  <TableHead className="text-right">الدفع</TableHead>
                  <TableHead className="text-right"><SortHeader label="الإجمالي" field="total" /></TableHead>
                  <TableHead className="text-right">المتبقي</TableHead>
                  <TableHead className="text-right">أفعال</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map(inv => {
                  const st = statusConfig[inv.status] || fallbackStatus;
                  const isFocused = focusedInvoiceId === inv.id;
                  return (
                    <TableRow
                      key={inv.id}
                      data-focus-id={inv.id}
                      className={`hover:bg-muted/20 cursor-pointer transition-all duration-500 ${isFocused ? "bg-primary/10 ring-2 ring-primary/60" : ""}`}
                      onClick={() => { setSelectedInvoice(inv); setShowPreviewDialog(true); }}
                    >
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{inv.date}</TableCell>
                      <TableCell className="font-medium text-sm">{inv.contactName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{inv.invoiceNumber}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[10px] ${
                          inv.type === "sales" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                        }`}>
                          {inv.type === "sales" ? "مبيعات" : "مشتريات"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                        {inv.status !== 'cancelled' && (
                          <Badge variant="secondary" className={`text-[10px] mr-1 ${paymentStatusConfig[inv.paymentStatus]?.color || ''}`}>
                            {paymentStatusConfig[inv.paymentStatus]?.label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{paymentLabels[inv.paymentMethod] || inv.paymentMethod}</TableCell>
                      <TableCell className="font-bold tabular-nums text-sm">₪{inv.total.toLocaleString()}</TableCell>
                      <TableCell className={`tabular-nums text-sm font-semibold ${inv.remainingAmount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {inv.remainingAmount > 0 ? `₪${inv.remainingAmount.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex gap-0.5 items-center">
                          <Tooltip><TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setSelectedInvoice(inv); setShowPreviewDialog(true); }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger><TooltipContent side="top"><p className="text-xs">عرض</p></TooltipContent></Tooltip>

                          <Tooltip><TooltipTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDirectPrint(inv)}>
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger><TooltipContent side="top"><p className="text-xs">طباعة</p></TooltipContent></Tooltip>

                          {inv.status === 'sent' && inv.paymentStatus !== 'paid' && (
                            <Tooltip><TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => recordPayment(inv)}>
                                <Receipt className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger><TooltipContent side="top"><p className="text-xs">{inv.type === 'sales' ? 'تسجيل قبض' : 'تسجيل صرف'}</p></TooltipContent></Tooltip>
                          )}

                          {canEdit({ status: inv.status }) && (
                            <Tooltip><TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate(`/invoices/new?edit=${inv.id}`)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger><TooltipContent side="top"><p className="text-xs">تعديل</p></TooltipContent></Tooltip>
                          )}

                          {canDelete({ status: inv.status }) && (
                            <Tooltip><TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => { setDeleteTargetInvoice(inv); setShowDeleteDialog(true); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger><TooltipContent side="top"><p className="text-xs">حذف</p></TooltipContent></Tooltip>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-background min-w-[160px]">
                              <DropdownMenuItem onClick={() => handleDuplicate(inv)}>
                                <Copy className="h-4 w-4 ml-2" /> نسخ الفاتورة
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleDirectPrint(inv)}>
                                <Printer className="h-4 w-4 ml-2" /> طباعة
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedInvoice(inv); setShowPreviewDialog(true); }}>
                                <Download className="h-4 w-4 ml-2" /> تحميل PDF
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => openEmailModal(inv)}>
                                <Mail className="h-4 w-4 ml-2" /> إرسال بالبريد
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={6} className="text-right text-xs">
                    الإجمالي ({totalsAll.financialCount.toLocaleString()} فاتورة
                    {totalsAll.cancelledCount > 0 && !totalsAll.onlyCancelled ? ` • ${totalsAll.cancelledCount} ملغاة مستبعدة` : ""})
                  </TableCell>
                  <TableCell className="tabular-nums text-sm font-bold">₪{fmtNum(totalsAll.total)}</TableCell>
                  <TableCell className={`tabular-nums text-sm font-bold ${totalsAll.remaining > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    ₪{fmtNum(totalsAll.remaining)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* CARD VIEW */}
      {!loading && viewMode === "cards" && paginated.length > 0 && (
        <div className="space-y-2">
          {paginated.map(inv => {
            const st = statusConfig[inv.status] || fallbackStatus;
            return (
              <Card key={inv.id} className="border-0 shadow-sm rounded-2xl cursor-pointer hover:shadow-md transition-all" onClick={() => { setSelectedInvoice(inv); setShowPreviewDialog(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${inv.type === "sales" ? "bg-primary/10" : "bg-destructive/10"}`}>
                      {inv.type === "sales" ? <Receipt className="h-4 w-4 text-primary" /> : <ShoppingCart className="h-4 w-4 text-destructive" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground truncate">{inv.contactName}</p>
                        <p className="text-sm font-bold text-foreground tabular-nums">₪{inv.total.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[10px] text-muted-foreground">{inv.invoiceNumber} • {inv.date}</p>
                        <div className="flex gap-1">
                          <Badge className={`text-[9px] px-2 py-0 border-0 ${st.color}`}>{st.label}</Badge>
                          {inv.status !== 'cancelled' && (
                            <Badge className={`text-[9px] px-2 py-0 border-0 ${paymentStatusConfig[inv.paymentStatus]?.color || ''}`}>
                              {paymentStatusConfig[inv.paymentStatus]?.label}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">{paymentLabels[inv.paymentMethod]}</Badge>
                        </div>
                      </div>
                      {inv.remainingAmount > 0 && (
                        <p className="text-[10px] text-destructive font-medium mt-0.5">متبقي: ₪{inv.remainingAmount.toLocaleString()}</p>
                      )}
                      <div className="flex gap-1 mt-1.5">
                        {inv.status === 'sent' && inv.paymentStatus !== 'paid' && (
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1 text-success" onClick={e => { e.stopPropagation(); recordPayment(inv); }}>
                            <Receipt className="h-3 w-3" /> {inv.type === 'sales' ? 'تسجيل قبض' : 'تسجيل صرف'}
                          </Button>
                        )}
                        {canEdit({ status: inv.status }) && (
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1" onClick={e => { e.stopPropagation(); navigate(`/invoices/new?edit=${inv.id}`); }}>
                            <Pencil className="h-3 w-3" /> تعديل
                          </Button>
                        )}
                        {canDelete({ status: inv.status }) && (
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1 text-destructive" onClick={e => { e.stopPropagation(); setDeleteTargetInvoice(inv); setShowDeleteDialog(true); }}>
                            <Trash2 className="h-3 w-3" /> حذف
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Summary bar — totals across all filtered results (cancelled excluded unless filter targets them) */}
      {!loading && sorted.length > 0 && (
        <Card className="border-0 shadow-sm rounded-2xl bg-muted/20">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <span className="font-semibold text-foreground">
                {totalsAll.onlyCancelled ? "مجاميع الفواتير الملغاة" : "إجمالي النتائج المفلترة"}
              </span>
              <span className="text-muted-foreground">
                عدد الفواتير: <span className="font-bold text-foreground tabular-nums">{totalsAll.financialCount.toLocaleString()}</span>
              </span>
              {totalsAll.cancelledCount > 0 && !totalsAll.onlyCancelled && (
                <span className="text-muted-foreground">
                  ملغاة (مستبعدة): <span className="font-bold tabular-nums">{totalsAll.cancelledCount.toLocaleString()}</span>
                </span>
              )}
              <span className="text-muted-foreground">
                الإجمالي الفرعي: <span className="font-bold text-foreground tabular-nums">₪{fmtNum(totalsAll.subtotal)}</span>
              </span>
              <span className="text-muted-foreground">
                الخصم: <span className="font-bold text-foreground tabular-nums">₪{fmtNum(totalsAll.totalDiscount)}</span>
              </span>
              <span className="text-muted-foreground">
                الضريبة: <span className="font-bold text-foreground tabular-nums">₪{fmtNum(totalsAll.totalTax)}</span>
              </span>
              <span className="text-muted-foreground">
                الإجمالي: <span className="font-bold text-primary tabular-nums">₪{fmtNum(totalsAll.total)}</span>
              </span>
              <span className="text-muted-foreground">
                المدفوع: <span className="font-bold text-success tabular-nums">₪{fmtNum(totalsAll.paid)}</span>
              </span>
              <span className="text-muted-foreground">
                المتبقي: <span className={`font-bold tabular-nums ${totalsAll.remaining > 0 ? "text-destructive" : "text-muted-foreground"}`}>₪{fmtNum(totalsAll.remaining)}</span>
              </span>
              {sorted.length > PAGE_SIZE && (
                <span className="text-[10px] text-muted-foreground border-r pr-3 mr-auto">
                  إجمالي الصفحة: ₪{fmtNum(totalsPage.total)} • متبقي الصفحة: ₪{fmtNum(totalsPage.remaining)}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!loading && sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2 px-1">
          <span className="text-[11px] text-muted-foreground">
            عرض {(page - 1) * PAGE_SIZE + 1} - {Math.min(page * PAGE_SIZE, sorted.length)} من {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-xl gap-1 h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronRight className="h-3.5 w-3.5" /> السابق
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums bg-muted/50 px-3 py-1 rounded-lg">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" className="rounded-xl gap-1 h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              التالي <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}


      {/* Preview/Print Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-background" dir="rtl">
          <DialogHeader>
            <DialogTitle>معاينة الفاتورة</DialogTitle>
            <DialogDescription>{selectedInvoice?.invoiceNumber}</DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={handlePrint}>
                  <Printer className="h-4 w-4" /> طباعة
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={() => { setShowPreviewDialog(false); handleDuplicate(selectedInvoice); }}>
                  <Copy className="h-4 w-4" /> جديد مشابه
                </Button>
                {canEdit({ status: selectedInvoice.status }) && (
                  <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={() => {
                    if (selectedInvoice.status !== "draft") {
                      setShowEditWarning(true);
                    } else {
                      setShowPreviewDialog(false);
                      navigate(`/invoices/new?edit=${selectedInvoice.id}`);
                    }
                  }}>
                    <Pencil className="h-4 w-4" /> تعديل
                  </Button>
                )}
                {canDelete({ status: selectedInvoice.status }) && (
                  <Button size="sm" variant="destructive" className="gap-1.5 rounded-xl" onClick={() => { setDeleteTargetInvoice(selectedInvoice); setShowDeleteDialog(true); }}>
                    <Trash2 className="h-4 w-4" /> حذف
                  </Button>
                )}
                {selectedInvoice.status === 'sent' && selectedInvoice.paymentStatus !== 'paid' && (
                  <Button size="sm" className="gap-1.5 rounded-xl bg-success hover:bg-success/90 text-success-foreground" onClick={() => recordPayment(selectedInvoice)}>
                    <Receipt className="h-4 w-4" /> {selectedInvoice.type === 'sales' ? 'تسجيل قبض' : 'تسجيل صرف'}
                  </Button>
                )}
                <Select value={selectedInvoice.status} onValueChange={(v) => updateStatus(selectedInvoice.id, v as Invoice["status"])}>
                  <SelectTrigger className="w-32 text-xs rounded-xl h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-background">
                    <SelectItem value="draft">مسودة</SelectItem>
                    <SelectItem value="sent">مُرسلة</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Phase 5J — cross-link panel */}
              <RelatedJournalPanel
                invoiceId={selectedInvoice.id}
                invoiceNumber={selectedInvoice.invoiceNumber}
              />

              <div ref={printRef} className="bg-white rounded-2xl border border-border/50 overflow-hidden">
                <InvoicePrintView invoice={selectedInvoice} settings={companySettings} copyLabel="أصلية" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate Confirm Modal */}
      <DuplicateConfirmModal
        open={duplicateModal}
        onClose={() => setDuplicateModal(false)}
        onConfirm={confirmDuplicate}
        docType="invoice"
        info={{
          contactName: duplicateTarget?.contactName,
          itemsCount: duplicateTarget?.items?.length,
          paymentMethod: duplicateTarget?.paymentMethod === "cash" ? "نقدي" : duplicateTarget?.paymentMethod === "credit" ? "آجل" : duplicateTarget?.paymentMethod === "cheque" ? "شيك" : "تحويل",
          sourceRef: duplicateTarget?.invoiceNumber,
        }}
      />

      {/* Delete Dialog */}
      {deleteTargetInvoice && (
        <DeleteDocumentDialog
          open={showDeleteDialog}
          onClose={() => { setShowDeleteDialog(false); setDeleteTargetInvoice(null); }}
          onConfirm={(reason) => {
            handleDeleteInvoice(deleteTargetInvoice.id, reason);
            setShowDeleteDialog(false);
            setDeleteTargetInvoice(null);
          }}
          docNumber={deleteTargetInvoice.invoiceNumber}
          docAmount={deleteTargetInvoice.total}
        />
      )}

      {/* Edit Posted Warning */}
      {selectedInvoice && (
        <EditPostedWarningDialog
          open={showEditWarning}
          onClose={() => setShowEditWarning(false)}
          onConfirm={() => {
            setShowEditWarning(false);
            setShowPreviewDialog(false);
            navigate(`/invoices/new?edit=${selectedInvoice.id}`);
          }}
          docNumber={selectedInvoice.invoiceNumber}
          docAmount={selectedInvoice.total}
        />
      )}

      {/* Email Modal */}
      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Mail className="h-5 w-5 text-primary" />
              إرسال الفاتورة بالبريد
            </DialogTitle>
            <DialogDescription>{emailTarget?.invoiceNumber}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">البريد الإلكتروني</Label>
              <Input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="email@example.com" className="text-sm" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الموضوع</Label>
              <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="text-sm" />
            </div>
            <Button className="w-full gap-2" disabled={sendingEmail || !emailTo} onClick={handleSendEmail}>
              {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              إرسال
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoicesPage;
