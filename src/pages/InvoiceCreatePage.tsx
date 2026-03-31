import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DuplicateBanner from "@/components/DuplicateBanner";
import {
  Loader2, Plus, FileText, Trash2, Save, Eye, AlertTriangle,
  CreditCard, Building2, Banknote, Clock, Search, Package, Receipt,
  ShoppingCart, Send, Percent, Hash, ChevronDown, MessageSquare, Paperclip,
  Upload, X, ExternalLink, FileCheck, ChevronUp
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import PageHeader from "@/components/layout/PageHeader";
import VoucherNavToolbar from "@/components/VoucherNavToolbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import InvoicePrintView from "@/components/InvoicePrintView";
import { createRoot } from "react-dom/client";

// ─── Types ───
interface InvoiceItem {
  id: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountType: "percent" | "amount";
  taxRate: number;
  unitOfMeasure: string;
  subtotal: number;
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

const mapDbPaymentMethod = (method?: string | null): "cash" | "transfer" | "cheque" | "credit" => {
  if (method === "cash" || method === "نقدي") return "cash";
  if (method === "transfer" || method === "بنك") return "transfer";
  if (method === "cheque" || method === "شيك") return "cheque";
  return "credit";
};

const mapPaymentMethodToDb = (method: "cash" | "transfer" | "cheque" | "credit") => {
  if (method === "cash") return "نقدي";
  if (method === "transfer") return "بنك";
  if (method === "cheque") return "شيك";
  return "آجل";
};

const createEmptyItem = (): InvoiceItem => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unitPrice: 0,
  discount: 0,
  discountType: "percent",
  taxRate: 0,
  unitOfMeasure: "قطعة",
  subtotal: 0,
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

const fmtCurrency = (n: number) =>
  `₪${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Component ───
const InvoiceCreatePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings: companySettings } = useCompanySettings();

  const fromDuplicate = searchParams.get("from_duplicate") === "true";
  const editInvoiceId = searchParams.get("edit");
  const prefillContactId = searchParams.get("contact_id");
  const prefillContactName = searchParams.get("contact_name");
  const prefillAmount = searchParams.get("amount");
  const prefillNotes = searchParams.get("notes");
  const workshopId = searchParams.get("workshop_id");
  const isEditMode = Boolean(editInvoiceId);
  const [duplicateSourceRef, setDuplicateSourceRef] = useState<string | null>(null);
  const [loadingEditInvoice, setLoadingEditInvoice] = useState(isEditMode);

  // Data
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; bank_name: string; currency: string; gl_account_code: string | null }[]>([]);
  const [creating, setCreating] = useState(false);
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState<string>("...");

  // Contact search
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [contactDebtWarning, setContactDebtWarning] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Dialogs
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [showQuickAddRep, setShowQuickAddRep] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ name: "", sell_price: 0, buy_price: 0, unit: "قطعة", quantity: 0 });
  const [quickRepForm, setQuickRepForm] = useState({ full_name: "", phone: "", region: "", sales_commission_rate: 0 });

  // Customer detail overrides (on-invoice only)
  const [customerOverrides, setCustomerOverrides] = useState({ phone: "", email: "", tax_number: "", address: "" });

  // Attachments
  const [attachments, setAttachments] = useState<{ name: string; url: string; size: number; type: string; uploaded_at: string }[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);

  // Terms
  const [termsOpen, setTermsOpen] = useState(false);
  const [invoiceTerms, setInvoiceTerms] = useState("");
  const defaultTerms = companySettings?.default_invoice_terms || "يُرجى السداد خلال المدة المتفق عليها.\nفي حال التأخر تُطبق رسوم إضافية.\nشكراً لتعاملكم معنا.";

  // Initialize terms from company settings
  useEffect(() => {
    if (invoiceTerms === "" && !isEditMode) {
      setInvoiceTerms(defaultTerms);
    }
  }, [defaultTerms]);

  // Form state
  const [form, setForm] = useState({
    type: "sales" as "sales" | "purchase",
    contactName: "",
    contactId: null as string | null,
    date: new Date().toISOString().split("T")[0],
    dueDate: "",
    paymentTerms: "net_30",
    paymentMethod: "cash" as "cash" | "transfer" | "cheque" | "credit",
    currency: "شيكل",
    exchangeRate: 1,
    notes: "",
    notesInternal: "",
    salespersonId: null as string | null,
    billingAddress: "",
    taxInclusive: false,
    items: [createEmptyItem()] as InvoiceItem[],
    chequeNumber: "",
    chequeBank: "",
    chequeBankAccountId: "" as string,
    chequeDueDate: "",
    transferRef: "",
    transferBank: "",
  });

  // ─── Load Duplicate Data ───
  useEffect(() => {
    if (!fromDuplicate) return;
    const draftKey = "draft_invoice_new";
    const draft = localStorage.getItem(draftKey);
    if (!draft) return;
    try {
      const data = JSON.parse(draft);
      localStorage.removeItem(draftKey);
      setDuplicateSourceRef(data._sourceRef || null);
      setForm(prev => ({
        ...prev,
        type: data.type || prev.type,
        contactName: data.contactName || "",
        contactId: data.contactId || null,
        paymentTerms: data.paymentTerms || "net_30",
        paymentMethod: data.paymentMethod || "cash",
        currency: data.currency || "شيكل",
        exchangeRate: data.exchangeRate || 1,
        notes: data.notes || "",
        notesInternal: data.notesInternal || "",
        salespersonId: data.salespersonId || null,
        billingAddress: data.billingAddress || "",
        taxInclusive: data.taxInclusive || false,
        items: data.items?.length ? data.items.map((item: any) => ({ ...item, id: crypto.randomUUID() })) : [createEmptyItem()],
        // Reset excluded fields
        date: new Date().toISOString().split("T")[0],
        dueDate: "",
        chequeNumber: "",
        chequeBank: "",
        chequeBankAccountId: "",
        chequeDueDate: "",
        transferRef: "",
        transferBank: "",
      }));
      if (data.contactSearch) setContactSearch(data.contactSearch);
    } catch (e) { /* ignore parse errors */ }
  }, [fromDuplicate]);

  // ─── Data Fetching ───
  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      const [cRes, pRes, sRes, bRes, invCountRes] = await Promise.all([
        supabase.from("contacts").select("id, contact_name, contact_type, phone, email, address, payment_terms_days, current_balance, credit_limit, tax_number, sales_rep_id").eq("user_id", user.id).neq("is_archived", true).order("contact_name"),
        supabase.from("products").select("*").eq("user_id", user.id).order("name"),
        supabase.from("sales_representatives").select("id, full_name").eq("user_id", user.id).eq("is_active", true),
        supabase.from("bank_accounts").select("id, name, bank_name, currency, gl_account_code").eq("user_id", user.id).eq("is_active", true),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      const contactsList = (cRes.data || []) as Contact[];
      setContacts(contactsList);
      setProducts((pRes.data as any[]) || []);
      setSalesReps(((sRes.data || []) as any[]).map(s => ({ id: s.id, name: s.full_name })));
      setBankAccounts((bRes.data || []) as any[]);

      // Generate next invoice number based on current type
      const prefix = form.type === "sales" ? "INV" : "PO";
      const totalCount = invCountRes.count || 0;
      const year = new Date().getFullYear();
      const nextNum = String(totalCount + 1).padStart(4, "0");
      setNextInvoiceNumber(`${prefix}-${year}-${nextNum}`);

      // Resolve duplicate contact after contacts load
      if (fromDuplicate) {
        const draft = form.contactId;
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
            setForm(f => ({ ...f, items: [{ ...createEmptyItem(), description: prefillNotes || "خدمات ورشة عمل", qty: 1, unitPrice: amt, total: amt }] }));
          }
        }
        if (prefillNotes && !prefillAmount) {
          setForm(f => ({ ...f, notes: prefillNotes }));
        }
      } else if (prefillContactName && !prefillContactId && !fromDuplicate && !isEditMode) {
        setContactSearch(prefillContactName);
        setForm(f => ({ ...f, contactName: prefillContactName }));
      }
    };
    fetchAll();
  }, [user]);

  // Update invoice number prefix when type changes
  useEffect(() => {
    setNextInvoiceNumber(prev => {
      const prefix = form.type === "sales" ? "INV" : "PO";
      const parts = prev.split("-");
      if (parts.length === 3) return `${prefix}-${parts[1]}-${parts[2]}`;
      return prev;
    });
  }, [form.type]);

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
    const tax = afterDiscount * (item.taxRate / 100);
    return afterDiscount + tax;
  }, []);

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
          .eq("user_id", user.id)
          .maybeSingle();

        if (error || !data) {
          toast({ title: "تعذر تحميل الفاتورة للتعديل", variant: "destructive" });
          navigate("/invoices");
          return;
        }

        const mappedItems: InvoiceItem[] = (data.invoice_items || []).map((item: any) => {
          const normalized: InvoiceItem = {
            id: item.id || crypto.randomUUID(),
            productId: item.product_id || undefined,
            description: item.product_name || item.description || "",
            quantity: Number(item.quantity) || 1,
            unitPrice: Number(item.unit_price) || 0,
            discount: Number(item.discount) || 0,
            discountType: item.discount_type === "amount" ? "amount" : "percent",
            taxRate: Number(item.tax_rate) || 0,
            unitOfMeasure: item.unit_of_measure || "قطعة",
            subtotal: Number(item.total_amount) || 0,
          };
          normalized.subtotal = calcItemSubtotal(normalized);
          return normalized;
        });

        if (!mounted) return;

        const paymentTerms = data.payment_terms || "net_30";

        setForm(prev => ({
          ...prev,
          type: data.invoice_type === "purchase" ? "purchase" : "sales",
          contactName: data.contact_name || "",
          contactId: data.contact_id || null,
          date: data.invoice_date || prev.date,
          dueDate: data.due_date || "",
          paymentTerms,
          paymentMethod: mapDbPaymentMethod(data.payment_method),
          currency: data.currency || "شيكل",
          exchangeRate: Number(data.exchange_rate) || 1,
          notes: data.notes || "",
          notesInternal: data.notes_internal || "",
          salespersonId: data.salesperson_id || null,
          billingAddress: data.billing_address || "",
          taxInclusive: Boolean(data.tax_inclusive),
          items: mappedItems.length ? mappedItems : [createEmptyItem()],
          chequeNumber: "",
          chequeBank: "",
          chequeBankAccountId: "",
          chequeDueDate: "",
          transferRef: "",
          transferBank: "",
        }));

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
        toast({ title: "خطأ أثناء تحميل الفاتورة", description: err.message, variant: "destructive" });
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
      return;
    }
    const matched = contacts.find(c => c.id === form.contactId) || null;
    setSelectedContact(matched);
  }, [contacts, form.contactId]);

  const getItemDiscountAmount = useCallback((item: InvoiceItem) => {
    const base = item.quantity * item.unitPrice;
    return item.discountType === "percent" ? base * (item.discount / 100) : item.discount;
  }, []);

  const summary = useMemo(() => {
    const grossTotal = form.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const totalDiscount = form.items.reduce((s, i) => s + getItemDiscountAmount(i), 0);

    if (form.taxInclusive) {
      // Tax-inclusive: prices already contain tax, extract it
      let totalTax = 0;
      form.items.forEach(i => {
        const base = i.quantity * i.unitPrice;
        const disc = i.discountType === "percent" ? base * (i.discount / 100) : i.discount;
        const afterDiscount = base - disc;
        const net = afterDiscount / (1 + i.taxRate / 100);
        totalTax += afterDiscount - net;
      });
      const total = grossTotal - totalDiscount; // Same as entered prices (tax included)
      const subtotalExTax = total - totalTax;
      const paidAmount = form.paymentMethod === "credit" ? 0 : total;
      return { subtotal: subtotalExTax, totalDiscount, totalTax, total, paidAmount, remainingAmount: total - paidAmount };
    } else {
      // Tax-exclusive: tax added on top
      const afterDiscount = grossTotal - totalDiscount;
      const totalTax = form.items.reduce((s, i) => {
        const base = i.quantity * i.unitPrice;
        const disc = i.discountType === "percent" ? base * (i.discount / 100) : i.discount;
        return s + (base - disc) * (i.taxRate / 100);
      }, 0);
      const total = afterDiscount + totalTax;
      const paidAmount = form.paymentMethod === "credit" ? 0 : total;
      return { subtotal: grossTotal, totalDiscount, totalTax, total, paidAmount, remainingAmount: total - paidAmount };
    }
  }, [form.items, form.paymentMethod, form.taxInclusive, getItemDiscountAmount]);

  const amountInWords = useMemo(() => numberToArabicWords(Math.round(summary.total)), [summary.total]);

  // ─── Contact Selection ───
  const filteredContacts = useMemo(() => {
    const typeFilter = form.type === "sales" ? "عميل" : "مورد";
    return contacts.filter(c =>
      c.contact_name.includes(contactSearch) &&
      (c.contact_type === typeFilter || c.contact_type === "كلاهما" || !contactSearch)
    );
  }, [contacts, contactSearch, form.type]);

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
    // Debt warning
    if (contact.current_balance && contact.current_balance > 0) {
      setContactDebtWarning(`⚠️ رصيد مستحق: ${fmtCurrency(contact.current_balance)}${contact.credit_limit ? ` من سقف ${fmtCurrency(contact.credit_limit)}` : ""}`);
    } else {
      setContactDebtWarning(null);
    }
  };

  // ─── Item Updates ───
  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        updated.subtotal = calcItemSubtotal(updated);
        return updated;
      }),
    }));
  };

  const selectProduct = (itemId: string, productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
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
        };
        updated.subtotal = calcItemSubtotal(updated);
        return updated;
      }),
    }));
  };

  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, createEmptyItem()] }));
  const removeItem = (id: string) => {
    if (form.items.length <= 1) return;
    setForm(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
  };
  const clearItems = () => setForm(prev => ({ ...prev, items: [createEmptyItem()] }));

  // ─── Quick Add Product ───
  const handleQuickAddProduct = async () => {
    if (!user || !quickAddForm.name.trim()) { toast({ title: "اسم الصنف مطلوب", variant: "destructive" }); return; }
    const { error } = await supabase.from("products").insert({ ...quickAddForm, user_id: user.id } as any);
    if (error) { toast({ title: "خطأ في الإضافة", variant: "destructive" }); return; }
    toast({ title: `تمت إضافة "${quickAddForm.name}" ✅` });
    setShowQuickAdd(false);
    setQuickAddForm({ name: "", sell_price: 0, buy_price: 0, unit: "قطعة", quantity: 0 });
    // Refresh products
    const { data } = await supabase.from("products").select("*").eq("user_id", user.id).order("name");
    setProducts((data as any[]) || []);
  };

  // ─── Quick Add Sales Rep ───
  const handleQuickAddRep = async () => {
    if (!user || !quickRepForm.full_name.trim()) { toast({ title: "اسم المندوب مطلوب", variant: "destructive" }); return; }
    const { data: newRep, error } = await supabase.from("sales_representatives").insert({
      full_name: quickRepForm.full_name,
      phone: quickRepForm.phone || null,
      region: quickRepForm.region || null,
      sales_commission_rate: quickRepForm.sales_commission_rate || 0,
      user_id: user.id,
    } as any).select("id, full_name").single();
    if (error) { toast({ title: "خطأ في الإضافة", variant: "destructive" }); return; }
    toast({ title: `تمت إضافة المندوب "${quickRepForm.full_name}" ✅` });
    setShowQuickAddRep(false);
    setQuickRepForm({ full_name: "", phone: "", region: "", sales_commission_rate: 0 });
    if (newRep) {
      setSalesReps(prev => [...prev, { id: (newRep as any).id, name: (newRep as any).full_name }]);
      setForm(p => ({ ...p, salespersonId: (newRep as any).id }));
    }
  };

  const validate = (): boolean => {
    if (!form.contactName.trim()) { toast({ title: "يرجى اختيار جهة الاتصال", variant: "destructive" }); return false; }
    if (form.items.some(i => !i.description.trim())) { toast({ title: "يرجى تعبئة وصف جميع البنود", variant: "destructive" }); return false; }
    if (form.items.some(i => i.unitPrice <= 0)) { toast({ title: "لا يمكن إنشاء فاتورة ببند سعره 0", variant: "destructive" }); return false; }
    if (form.items.some(i => i.quantity <= 0)) { toast({ title: "الكمية يجب أن تكون أكبر من 0", variant: "destructive" }); return false; }
    if (summary.total <= 0) { toast({ title: "إجمالي الفاتورة يجب أن يكون أكبر من 0", variant: "destructive" }); return false; }
    if (form.paymentMethod === "cheque") {
      if (!form.chequeNumber.trim()) { toast({ title: "يرجى إدخال رقم الشيك", variant: "destructive" }); return false; }
      if (!form.chequeBank.trim()) { toast({ title: "يرجى إدخال اسم البنك", variant: "destructive" }); return false; }
      if (!form.chequeDueDate) { toast({ title: "يرجى تحديد تاريخ استحقاق الشيك", variant: "destructive" }); return false; }
      if (!form.chequeBankAccountId) { toast({ title: "يرجى اختيار الحساب البنكي", variant: "destructive" }); return false; }
    }
    return true;
  };

  // ─── Create / Update Invoice ───
  const handleCreate = async (asDraft = false) => {
    if (!asDraft && !validate()) return;
    if (!user) return;
    setCreating(true);

    const paymentMethodDb = mapPaymentMethodToDb(form.paymentMethod);

    try {
      let contactId = form.contactId;

      if (form.contactName.trim() && !contactId) {
        const { data: newContact, error: contactError } = await supabase
          .from("contacts")
          .insert({
            user_id: user.id,
            contact_name: form.contactName.trim(),
            contact_type: form.type === "sales" ? "عميل" : "مورد",
          } as any)
          .select("id")
          .single();

        if (contactError) throw contactError;
        contactId = newContact?.id ?? null;
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
      };

      const buildItemsPayload = (invoiceId: string) =>
        form.items
          .filter(i => i.description.trim())
          .map(item => ({
            invoice_id: invoiceId,
            product_id: item.productId || null,
            product_name: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            discount: item.discount,
            discount_type: item.discountType,
            tax_rate: item.taxRate,
            total_amount: calcItemSubtotal(item),
            unit_of_measure: item.unitOfMeasure,
          }));

      if (isEditMode && editInvoiceId) {
        const updatePayload: Record<string, any> = { ...invoicePayload };
        if (asDraft) updatePayload.status = "draft";

        const { error: updateError } = await supabase
          .from("invoices")
          .update(updatePayload as any)
          .eq("id", editInvoiceId)
          .eq("user_id", user.id);

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

        await supabase.from("invoice_activity_log").insert({
          invoice_id: editInvoiceId,
          user_id: user.id,
          action: asDraft ? "updated_draft" : "updated",
          details: { total: summary.total, payment_method: paymentMethodDb },
        } as any);

        toast({ title: asDraft ? "تم حفظ التعديلات كمسودة ✅" : "تم تحديث الفاتورة ✅" });
        navigate("/invoices");
        return;
      }

      const { data: dbInv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          ...invoicePayload,
          user_id: user.id,
          source: "manual",
          status: asDraft ? "draft" : "sent",
        } as any)
        .select("id, invoice_number")
        .single();

      if (invErr || !dbInv) throw invErr ?? new Error("Invoice insert failed");

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

          const newQty = form.type === "sales"
            ? Number(prod.quantity) - item.quantity
            : Number(prod.quantity) + item.quantity;

          await supabase.from("products").update({ quantity: newQty } as any).eq("id", item.productId);
          await supabase.from("stock_movements").insert({
            product_id: item.productId,
            quantity: item.quantity,
            movement_type: form.type === "sales" ? "صادر" : "وارد",
            reference_note: `فاتورة ${form.type === "sales" ? "مبيعات" : "مشتريات"} ${dbInv.invoice_number}`,
            user_id: user.id,
          } as any);
        }

        if (form.paymentMethod === "cheque") {
          await supabase.from("cheques").insert({
            user_id: user.id,
            cheque_type: form.type === "sales" ? "وارد" : "صادر",
            party_name: form.contactName,
            party_type: form.type === "sales" ? "عميل" : "مورد",
            amount: summary.total,
            cheque_date: form.chequeDueDate || form.date,
            cheque_number: form.chequeNumber || null,
            bank_name: form.chequeBank || null,
            currency: form.currency,
            status: "مسجل",
            deposit_bank_account_id: form.chequeBankAccountId || null,
            linked_account: bankAccounts.find(b => b.id === form.chequeBankAccountId)?.gl_account_code || null,
            notes: `مرتبط بفاتورة ${dbInv.invoice_number}`,
          } as any);
        }

        const debitCode = form.paymentMethod === "cash" ? "1110" : form.paymentMethod === "transfer" ? "1120" : form.paymentMethod === "cheque" ? "1150" : "1130";
        await supabase.from("transactions").insert({
          user_id: user.id,
          transaction_date: form.date,
          description: `فاتورة ${form.type === "sales" ? "مبيعات" : "مشتريات"} ${dbInv.invoice_number} - ${form.contactName}`,
          debit_account_code: form.type === "sales" ? debitCode : "5110",
          credit_account_code: form.type === "sales" ? "4100" : debitCode === "1130" ? "2110" : debitCode,
          amount: summary.total,
          currency: form.currency,
          transaction_type: form.type === "sales" ? "sale" : "purchase",
          contact_id: contactId,
          reference: dbInv.invoice_number,
          payment_method: paymentMethodDb,
          idempotency_key: `INV-${dbInv.id}`,
        } as any);
      }

      await supabase.from("invoice_activity_log").insert({
        invoice_id: dbInv.id,
        user_id: user.id,
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

      toast({ title: asDraft ? "تم حفظ المسودة ✅" : `تم إنشاء الفاتورة ${dbInv.invoice_number} ✅` });
      navigate(workshopId ? "/workshops" : "/invoices");
    } catch (err: any) {
      console.error("Invoice save error:", err);
      toast({ title: "خطأ في حفظ الفاتورة", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // ─── Print Preview ───
  const handlePrint = () => {
    const previewInvoice = {
      type: form.type,
      invoiceNumber: "معاينة",
      date: form.date,
      dueDate: form.dueDate,
      contactName: form.contactName || "—",
      items: form.items.map(i => ({
        description: i.description || "—",
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discountType === "percent" ? i.quantity * i.unitPrice * (i.discount / 100) : i.discount,
        taxRate: i.taxRate,
        subtotal: calcItemSubtotal(i),
      })),
      notes: form.notes,
      status: "draft",
      paymentMethod: form.paymentMethod,
      subtotal: summary.subtotal,
      totalDiscount: summary.totalDiscount,
      totalTax: summary.totalTax,
      total: summary.total,
      paidAmount: summary.paidAmount,
      remainingAmount: summary.remainingAmount,
      currency: form.currency,
    };

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html dir="rtl"><head><title>معاينة الفاتورة</title>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: white; } @media print { @page { margin: 8mm; size: A4; } }</style>
    </head><body><div id="print-root"></div></body></html>`);
    win.document.close();
    setTimeout(() => {
      const container = win.document.getElementById("print-root");
      if (container) {
        const root = createRoot(container);
        root.render(<InvoicePrintView invoice={previewInvoice} settings={companySettings} copyLabel="معاينة" />);
        /* view only — no browser print */
      }
    }, 200);
  };

  // WhatsApp send
  const handleWhatsApp = () => {
    if (!selectedContact?.phone) {
      toast({ title: "لا يوجد رقم هاتف للزبون", variant: "destructive" });
      return;
    }
    const phone = selectedContact.phone.replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(
      `السلام عليكم ${form.contactName}،\nنرفق فاتورتكم بمبلغ ${fmtCurrency(summary.total)} مستحقة بتاريخ ${form.dueDate || form.date}\n\n${companySettings.company_name || "ZIDNI"} — ${companySettings.phone || ""}`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const paymentLabels: Record<string, string> = { cash: "نقداً", transfer: "تحويل", cheque: "شيك", credit: "آجل" };

  // ─── RENDER ───
  if (loadingEditInvoice) {
    return (
      <div className="px-4 lg:px-8 pt-10 pb-10 max-w-5xl mx-auto" dir="rtl">
        <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          جاري تحميل بيانات الفاتورة...
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 pt-4 pb-32 space-y-4 max-w-5xl mx-auto" dir="rtl">
      {/* Duplicate Banner */}
      {duplicateSourceRef && <DuplicateBanner sourceRef={duplicateSourceRef} />}

      {/* Header */}
      <PageHeader 
        title={isEditMode ? "تعديل الفاتورة" : "إنشاء فاتورة جديدة"} 
        breadcrumb={["المبيعات", "الفواتير", isEditMode ? "تعديل" : "إنشاء فاتورة"]} 
      />

      {/* Navigation Toolbar */}
      <VoucherNavToolbar
        voucherType="invoice"
        currentRef={isEditMode ? nextInvoiceNumber : undefined}
        onPrint={handlePrint}
        showNavigation={isEditMode}
      />

      {/* ─── SECTION 1: Invoice Data ─── */}
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> بيانات الفاتورة
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          {/* Type Toggle */}
          <div className="flex gap-2">
            <button onClick={() => setForm(p => ({ ...p, type: "sales" }))} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${form.type === "sales" ? "bg-primary text-primary-foreground shadow-md" : "bg-muted text-muted-foreground"}`}>
              <Receipt className="h-4 w-4" /> فاتورة مبيعات
            </button>
            <button onClick={() => setForm(p => ({ ...p, type: "purchase" }))} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${form.type === "purchase" ? "bg-primary text-primary-foreground shadow-md" : "bg-muted text-muted-foreground"}`}>
              <ShoppingCart className="h-4 w-4" /> فاتورة مشتريات
            </button>
          </div>

          {/* Row 1: Invoice Number, Issue Date, Due Date, Payment Terms */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">رقم الفاتورة</label>
              <Input value={nextInvoiceNumber} readOnly className="rounded-xl text-sm bg-muted/50 cursor-not-allowed font-mono" dir="ltr" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">تاريخ الإصدار</label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="rounded-xl text-sm" dir="ltr" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">شروط الدفع</label>
              <Select value={form.paymentTerms} onValueChange={v => setForm(p => ({ ...p, paymentTerms: v }))}>
                <SelectTrigger className="rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">تاريخ الاستحقاق</label>
              <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="rounded-xl text-sm" dir="ltr" />
            </div>
          </div>

          {/* Row 2: Contact + Salesperson */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="relative">
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">
                {form.type === "sales" ? "الزبون" : "المورد"}
              </label>
              <div className="relative flex">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={`ابحث عن ${form.type === "sales" ? "زبون" : "مورد"}...`}
                    value={contactSearch}
                    onChange={e => { setContactSearch(e.target.value); setForm(p => ({ ...p, contactName: e.target.value, contactId: null })); setSelectedContact(null); setShowContactDropdown(true); }}
                    onFocus={() => setShowContactDropdown(true)}
                    className="rounded-xl rounded-l-none text-sm pr-9 border-l-0"
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
                    onClick={() => { setShowContactDropdown(false); const name = contactSearch.trim() || (form.type === "sales" ? "زبون جديد" : "مورد جديد"); setContactSearch(name); setForm(p => ({ ...p, contactName: name, contactId: null })); }}
                    className="w-full text-right px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-center gap-2 text-primary font-semibold border-b border-border"
                  >
                    <Plus className="h-3.5 w-3.5" /> إضافة {form.type === "sales" ? "زبون" : "مورد"} جديد
                  </button>
                  {filteredContacts.map(c => (
                    <button key={c.id} onClick={() => selectContact(c)} className="w-full text-right px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{c.contact_name}</span>
                        {c.phone && <span className="text-[10px] text-muted-foreground mr-2">{c.phone}</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {c.current_balance && c.current_balance > 0 && (
                          <Badge variant="outline" className="text-[9px] text-destructive border-destructive/30">{fmtCurrency(c.current_balance)}</Badge>
                        )}
                        <Badge variant="outline" className="text-[9px]">{c.contact_type}</Badge>
                      </div>
                    </button>
                  ))}
                  {filteredContacts.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-3">لا توجد نتائج</p>
                  )}
                </div>
              )}
              {!form.contactId && form.contactName.trim() && (
                <p className="text-[10px] text-primary mt-1 font-medium">✨ سيتم إنشاء جهة اتصال جديدة تلقائياً</p>
              )}
              {contactDebtWarning && (
                <div className="flex items-center gap-1.5 mt-1.5 p-2 rounded-lg bg-warning/10 border border-warning/20">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                  <p className="text-[10px] text-warning font-medium">{contactDebtWarning}</p>
                </div>
              )}
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">المندوب (اختياري)</label>
              <Select value={form.salespersonId || "__none__"} onValueChange={v => {
                if (v === "__new_rep__") { setShowQuickAddRep(true); return; }
                setForm(p => ({ ...p, salespersonId: v === "__none__" ? null : v }));
              }}>
                <SelectTrigger className="rounded-xl text-sm"><SelectValue placeholder="اختر مندوب المبيعات..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new_rep__" className="text-primary font-semibold">+ تعريف مندوب جديد</SelectItem>
                  <SelectItem value="__none__">بدون مندوب</SelectItem>
                  {salesReps.map(sr => <SelectItem key={sr.id} value={sr.id}>{sr.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Auto-filled contact details - editable on invoice */}
          {selectedContact && (
            <div className="bg-muted/30 rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">الهاتف</label>
                  <Input value={customerOverrides.phone} onChange={e => setCustomerOverrides(p => ({ ...p, phone: e.target.value }))} className="rounded-lg text-[11px] h-7 bg-background" placeholder="—" dir="ltr" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">البريد الإلكتروني</label>
                  <Input value={customerOverrides.email} onChange={e => setCustomerOverrides(p => ({ ...p, email: e.target.value }))} className="rounded-lg text-[11px] h-7 bg-background" placeholder="—" dir="ltr" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">الرقم الضريبي</label>
                  <Input value={customerOverrides.tax_number} onChange={e => setCustomerOverrides(p => ({ ...p, tax_number: e.target.value }))} className="rounded-lg text-[11px] h-7 bg-background" placeholder="—" dir="ltr" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">العنوان</label>
                  <Input value={customerOverrides.address} onChange={e => setCustomerOverrides(p => ({ ...p, address: e.target.value }))} className="rounded-lg text-[11px] h-7 bg-background" placeholder="—" />
                </div>
              </div>
              {(!customerOverrides.phone && !customerOverrides.email && !customerOverrides.tax_number && !customerOverrides.address) && (
                <a href={`/contacts`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary font-medium flex items-center gap-1 hover:underline">
                  <ExternalLink className="h-3 w-3" /> إكمال بيانات العميل
                </a>
              )}
            </div>
          )}

          {/* Row 3: Payment Method + Currency */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">طريقة الدفع</label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { val: "cash", icon: Banknote, label: "نقداً" },
                  { val: "cheque", icon: CreditCard, label: "شيك" },
                  { val: "credit", icon: Clock, label: "آجل" },
                  { val: "transfer", icon: Building2, label: "تحويل" },
                ] as const).map(pm => (
                  <button key={pm.val} onClick={() => setForm(p => ({ ...p, paymentMethod: pm.val }))}
                    className={`py-2.5 rounded-xl text-[11px] font-semibold transition-all flex flex-col items-center gap-0.5 ${form.paymentMethod === pm.val ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted"}`}>
                    <pm.icon className="h-4 w-4" />
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block font-medium">العملة</label>
              <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                <SelectTrigger className="rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["شيكل", "دولار", "دينار", "يورو"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.currency !== "شيكل" && (
                <div className="mt-2">
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">سعر الصرف</label>
                  <Input type="number" step="0.01" value={form.exchangeRate} onChange={e => setForm(p => ({ ...p, exchangeRate: Number(e.target.value) }))} className="rounded-xl text-xs h-8" dir="ltr" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">المكافئ بالشيكل: {fmtCurrency(summary.total * form.exchangeRate)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Cheque Details */}
          {form.paymentMethod === "cheque" && (
            <div className="border border-primary/10 rounded-xl p-3 bg-primary/5 space-y-3">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> بيانات الشيك</p>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-[10px] text-muted-foreground mb-0.5 block">رقم الشيك *</label><Input value={form.chequeNumber} onChange={e => setForm(p => ({ ...p, chequeNumber: e.target.value }))} className="rounded-lg text-sm" /></div>
                <div><label className="text-[10px] text-muted-foreground mb-0.5 block">البنك *</label>
                  <Select value={form.chequeBank || "__empty__"} onValueChange={v => setForm(p => ({ ...p, chequeBank: v === "__empty__" ? "" : v }))}>
                    <SelectTrigger className="rounded-lg text-sm"><SelectValue placeholder="اختر البنك" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__empty__" disabled>اختر البنك</SelectItem>
                      {[...new Set(bankAccounts.map(b => b.bank_name).filter(Boolean))].map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><label className="text-[10px] text-muted-foreground mb-0.5 block">تاريخ الشيك *</label><Input type="date" value={form.chequeDueDate} onChange={e => setForm(p => ({ ...p, chequeDueDate: e.target.value }))} className="rounded-lg text-sm" dir="ltr" /></div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-0.5 block">الحساب البنكي *</label>
                <Select value={form.chequeBankAccountId} onValueChange={v => {
                  const ba = bankAccounts.find(b => b.id === v);
                  setForm(p => ({ ...p, chequeBankAccountId: v, chequeBank: ba?.bank_name || p.chequeBank }));
                }}>
                  <SelectTrigger className="rounded-lg text-sm"><SelectValue placeholder="اختر الحساب البنكي" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts
                      .filter(b => {
                        const currMap: Record<string, string> = { "شيكل": "ILS", "دولار": "USD", "دينار": "JOD", "يورو": "EUR" };
                        const targetCode = currMap[form.currency] || form.currency;
                        return !b.currency || b.currency === targetCode || b.currency === form.currency;
                      })
                      .map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name} - {b.bank_name}</SelectItem>
                      ))}
                    {bankAccounts.filter(b => {
                      const currMap: Record<string, string> = { "شيكل": "ILS", "دولار": "USD", "دينار": "JOD", "يورو": "EUR" };
                      const targetCode = currMap[form.currency] || form.currency;
                      return !b.currency || b.currency === targetCode || b.currency === form.currency;
                    }).length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">لا توجد حسابات بنكية بعملة {form.currency}</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {form.paymentMethod === "transfer" && (
            <div className="border border-border rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-primary" /> بيانات التحويل</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[10px] text-muted-foreground mb-0.5 block">رقم المرجع</label><Input value={form.transferRef} onChange={e => setForm(p => ({ ...p, transferRef: e.target.value }))} className="rounded-lg text-sm" /></div>
                <div><label className="text-[10px] text-muted-foreground mb-0.5 block">البنك</label><Input value={form.transferBank} onChange={e => setForm(p => ({ ...p, transferBank: e.target.value }))} className="rounded-lg text-sm" /></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── SECTION 2: Invoice Items ─── */}
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> بنود الفاتورة
            </CardTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="text-[10px] gap-1 h-7 text-primary" onClick={() => setShowQuickAdd(true)}>
                <Plus className="h-3 w-3" /> تعريف منتج
              </Button>
              <Button variant="ghost" size="sm" className="text-[10px] gap-1 h-7 text-destructive" onClick={clearItems}>
                مسح الكل
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {/* Table Header */}
          <div className="hidden lg:grid grid-cols-[30px_1fr_70px_90px_70px_30px_70px_100px_30px] gap-1.5 px-2 mb-2 text-[10px] font-semibold text-muted-foreground">
            <span>#</span>
            <span>المنتج / الخدمة</span>
            <span className="text-center">الكمية</span>
            <span className="text-center">السعر</span>
            <span className="text-center">الخصم</span>
            <span></span>
            <span className="text-center">ضريبة%</span>
            <span className="text-center">الإجمالي</span>
            <span></span>
          </div>

          <div className="space-y-2">
            {form.items.map((item, idx) => (
              <div key={item.id} className="lg:grid lg:grid-cols-[30px_1fr_70px_90px_70px_30px_70px_100px_30px] gap-1.5 items-center bg-muted/20 rounded-xl p-2.5 space-y-2 lg:space-y-0">
                {/* Row number */}
                <span className="hidden lg:block text-[10px] text-muted-foreground font-mono text-center">{idx + 1}</span>

                {/* Product */}
                <div className="space-y-1">
                  <Select
                    value={item.productId || "__manual__"}
                    onValueChange={val => {
                      if (val === "__new__") { setShowQuickAdd(true); return; }
                      if (val === "__manual__") return;
                      selectProduct(item.id, val);
                    }}
                  >
                    <SelectTrigger className="rounded-lg text-[11px] h-8 border-0 bg-background"><SelectValue placeholder="اختر منتج...">{item.description || "اختر منتج..."}</SelectValue></SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem value="__new__" className="text-primary font-semibold"><span className="flex items-center gap-1.5"><Plus className="h-3 w-3" /> تعريف منتج جديد</span></SelectItem>
                      <SelectItem value="__manual__" className="text-muted-foreground"><span className="flex items-center gap-1.5">✏️ إدخال يدوي</span></SelectItem>
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center justify-between gap-2 w-full">
                            <span>{p.name}</span>
                            <span className="text-[9px] text-muted-foreground tabular-nums">
                              {form.type === "sales" ? `₪${p.sell_price}` : `₪${p.buy_price}`} • {p.quantity} {p.unit}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!item.productId && (
                    <Input placeholder="وصف يدوي..." value={item.description} onChange={e => updateItem(item.id, "description", e.target.value)} className="rounded-lg text-[11px] h-7 border-0 bg-muted/30" />
                  )}
                </div>

                {/* Quantity */}
                <div className="flex items-center gap-1">
                  <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(item.id, "quantity", Math.max(1, Number(e.target.value)))} className="rounded-lg text-[11px] h-8 text-center border-0 bg-background" dir="ltr" />
                </div>

                {/* Price */}
                <Input type="number" min={0} value={item.unitPrice} onChange={e => updateItem(item.id, "unitPrice", Number(e.target.value))} className="rounded-lg text-[11px] h-8 text-center border-0 bg-background" dir="ltr" />

                {/* Discount */}
                <Input type="number" min={0} value={item.discount} onChange={e => updateItem(item.id, "discount", Number(e.target.value))} className="rounded-lg text-[11px] h-8 text-center border-0 bg-background" dir="ltr" />

                {/* Discount type toggle */}
                <button
                  onClick={() => updateItem(item.id, "discountType", item.discountType === "percent" ? "amount" : "percent")}
                  className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center text-[10px] font-bold text-muted-foreground hover:bg-muted transition-colors"
                  title={item.discountType === "percent" ? "خصم نسبي" : "خصم ثابت"}
                >
                  {item.discountType === "percent" ? <Percent className="h-3 w-3" /> : "₪"}
                </button>

                {/* Tax */}
                <Select value={String(item.taxRate)} onValueChange={v => updateItem(item.id, "taxRate", Number(v))}>
                  <SelectTrigger className="rounded-lg text-[10px] h-8 border-0 bg-background px-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0%</SelectItem>
                    <SelectItem value="16">16%</SelectItem>
                    <SelectItem value="17">17%</SelectItem>
                  </SelectContent>
                </Select>

                {/* Subtotal */}
                <div className="text-center">
                  <span className="text-xs font-bold text-foreground tabular-nums">{fmtCurrency(calcItemSubtotal(item))}</span>
                </div>

                {/* Delete */}
                <button onClick={() => removeItem(item.id)} className="text-destructive/60 hover:text-destructive transition-colors disabled:opacity-30 mx-auto" disabled={form.items.length <= 1}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" className="flex-1 rounded-xl text-xs gap-1.5 border-dashed h-9" onClick={addItem}>
              <Plus className="h-3.5 w-3.5" /> إضافة بند
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── SECTION 3: Summary ─── */}
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardContent className="p-5 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-foreground">الإجماليات</span>
            <div className="flex items-center gap-2">
              <Switch id="tax-inclusive" checked={form.taxInclusive} onCheckedChange={v => setForm(p => ({ ...p, taxInclusive: v }))} />
              <Label htmlFor="tax-inclusive" className="text-[11px] text-muted-foreground cursor-pointer">
                {form.taxInclusive ? "شامل الضريبة" : "غير شامل الضريبة"}
              </Label>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {form.taxInclusive ? "الإجمالي الفرعي (بدون ضريبة)" : "الإجمالي الفرعي"}
            </span>
            <span className="text-sm font-semibold text-foreground tabular-nums">{fmtCurrency(summary.subtotal)}</span>
          </div>
          {summary.totalDiscount > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-destructive">(-) إجمالي الخصومات</span>
              <span className="text-sm font-semibold text-destructive tabular-nums">({fmtCurrency(summary.totalDiscount)})</span>
            </div>
          )}
          {summary.totalTax > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {form.taxInclusive ? "ضريبة القيمة المضافة (مستخرجة)" : "(+) ضريبة القيمة المضافة"}
              </span>
              <span className="text-sm font-semibold text-foreground tabular-nums">{fmtCurrency(summary.totalTax)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-base font-bold text-foreground">الإجمالي النهائي</span>
            <span className="text-2xl font-black text-primary tabular-nums">{fmtCurrency(summary.total)}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">(-) المدفوع مسبقاً</span>
            <span className="text-sm font-semibold text-foreground tabular-nums">({fmtCurrency(summary.paidAmount)})</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-foreground">المتبقي (البالنس)</span>
            <span className={`text-sm font-bold tabular-nums ${summary.remainingAmount > 0 ? "text-destructive" : "text-primary"}`}>
              {fmtCurrency(summary.remainingAmount)}
            </span>
          </div>

          {/* Amount in words */}
          <div className="bg-muted/30 rounded-xl p-3 mt-2">
            <p className="text-[11px] text-muted-foreground">المبلغ كتابةً:</p>
            <p className="text-xs font-semibold text-foreground">{amountInWords}</p>
          </div>

          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Badge variant="outline" className="text-[10px] gap-1">{paymentLabels[form.paymentMethod]}</Badge>
            {form.dueDate && <Badge variant="outline" className="text-[10px] gap-1 text-warning border-warning/30"><Clock className="h-3 w-3" /> استحقاق: {form.dueDate}</Badge>}
            {form.currency !== "شيكل" && <Badge variant="outline" className="text-[10px]">سعر الصرف: {form.exchangeRate}</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* ─── SECTION 4: Notes ─── */}
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardContent className="p-5 space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block font-medium flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> ملاحظة على الفاتورة
              <span className="text-[9px] text-muted-foreground/60">(تظهر في PDF)</span>
            </label>
            <Textarea
              placeholder={companySettings.invoice_default_notes || "شكراً لتعاملكم معنا..."}
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="rounded-xl text-sm min-h-[60px] resize-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block font-medium flex items-center gap-1.5">
              ملاحظة داخلية
              <span className="text-[9px] text-muted-foreground/60">(لا تظهر في PDF)</span>
            </label>
            <Textarea
              placeholder="ملاحظات داخلية للفريق..."
              value={form.notesInternal}
              onChange={e => setForm(p => ({ ...p, notesInternal: e.target.value }))}
              className="rounded-xl text-sm min-h-[50px] resize-none bg-muted/30"
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── SECTION 5: Terms & Conditions (Collapsible) ─── */}
      <Collapsible open={termsOpen} onOpenChange={setTermsOpen}>
        <Card className="border-0 shadow-sm rounded-2xl">
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-0 pt-4 px-5 cursor-pointer hover:bg-muted/30 rounded-t-2xl transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-primary" /> الشروط والأحكام
                  <span className="text-[9px] text-muted-foreground/60 font-normal">(تظهر في PDF)</span>
                </CardTitle>
                {termsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="px-5 pb-5 pt-3">
              <Textarea
                placeholder="أدخل الشروط والأحكام..."
                value={invoiceTerms}
                onChange={e => setInvoiceTerms(e.target.value)}
                className="rounded-xl text-sm min-h-[80px] resize-none"
                rows={4}
              />
              <p className="text-[10px] text-muted-foreground mt-1.5">القيمة الافتراضية يمكن تخصيصها من إعدادات الشركة</p>
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
                  <Paperclip className="h-4 w-4 text-primary" /> المرفقات
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
                رفع ملف
              </Button>
              <p className="text-[10px] text-muted-foreground">PDF, JPG, PNG, XLSX — حد أقصى 5 ملفات / 10MB للملف</p>

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

      {/* ─── Sticky Bottom Actions ─── */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border/50 p-3 z-50">
        <div className="max-w-5xl mx-auto flex gap-2">
          <Button variant="outline" className="rounded-xl gap-1.5 h-11 text-sm" onClick={() => handleCreate(true)} disabled={creating}>
            <Save className="h-4 w-4" /> حفظ كمسودة
          </Button>
          <Button className="flex-1 rounded-xl gap-1.5 h-11 text-sm font-bold shadow-lg shadow-primary/20" onClick={() => handleCreate(false)} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileText className="h-4 w-4" /> {isEditMode ? "حفظ التعديلات" : "إنشاء الفاتورة"}</>}
          </Button>
          <Button variant="outline" className="rounded-xl gap-1.5 h-11 text-sm" onClick={handlePrint}>
            <Eye className="h-4 w-4" /> معاينة PDF
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-xl gap-1.5 h-11 text-sm">
                <Send className="h-4 w-4" /> إرسال <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleWhatsApp} className="gap-2">📱 إرسال واتساب</DropdownMenuItem>
              <DropdownMenuItem className="gap-2">📧 إرسال إيميل</DropdownMenuItem>
              <DropdownMenuItem className="gap-2">📋 نسخ رابط الفاتورة</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Quick Add Product Dialog */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>تعريف منتج جديد</DialogTitle><DialogDescription>أضف منتج سريعاً واستخدمه في الفاتورة</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground">اسم المنتج *</label><Input value={quickAddForm.name} onChange={e => setQuickAddForm({ ...quickAddForm, name: e.target.value })} className="rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">سعر البيع</label><Input type="number" value={quickAddForm.sell_price} onChange={e => setQuickAddForm({ ...quickAddForm, sell_price: Number(e.target.value) })} className="rounded-xl" dir="ltr" /></div>
              <div><label className="text-xs text-muted-foreground">سعر الشراء</label><Input type="number" value={quickAddForm.buy_price} onChange={e => setQuickAddForm({ ...quickAddForm, buy_price: Number(e.target.value) })} className="rounded-xl" dir="ltr" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">الوحدة</label>
                <Select value={quickAddForm.unit} onValueChange={v => setQuickAddForm({ ...quickAddForm, unit: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{["قطعة", "كغ", "طن", "متر", "لتر", "علبة", "كرتون", "حبة"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="text-xs text-muted-foreground">الكمية المبدئية</label><Input type="number" value={quickAddForm.quantity} onChange={e => setQuickAddForm({ ...quickAddForm, quantity: Number(e.target.value) })} className="rounded-xl" dir="ltr" /></div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3"><Button variant="outline" onClick={() => setShowQuickAdd(false)}>إلغاء</Button><Button onClick={handleQuickAddProduct}>إضافة المنتج</Button></div>
        </DialogContent>
      </Dialog>

      {/* Quick Add Sales Rep Dialog */}
      <Dialog open={showQuickAddRep} onOpenChange={setShowQuickAddRep}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>تعريف مندوب جديد</DialogTitle><DialogDescription>أضف مندوب مبيعات واربطه بالفاتورة مباشرة</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground">اسم المندوب *</label><Input value={quickRepForm.full_name} onChange={e => setQuickRepForm({ ...quickRepForm, full_name: e.target.value })} className="rounded-xl" placeholder="الاسم الكامل" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">الهاتف</label><Input value={quickRepForm.phone} onChange={e => setQuickRepForm({ ...quickRepForm, phone: e.target.value })} className="rounded-xl" dir="ltr" placeholder="05xxxxxxxx" /></div>
              <div><label className="text-xs text-muted-foreground">المنطقة</label><Input value={quickRepForm.region} onChange={e => setQuickRepForm({ ...quickRepForm, region: e.target.value })} className="rounded-xl" placeholder="مثال: رام الله" /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">نسبة العمولة %</label><Input type="number" value={quickRepForm.sales_commission_rate} onChange={e => setQuickRepForm({ ...quickRepForm, sales_commission_rate: Number(e.target.value) })} className="rounded-xl w-32" dir="ltr" min={0} max={100} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-3"><Button variant="outline" onClick={() => setShowQuickAddRep(false)}>إلغاء</Button><Button onClick={handleQuickAddRep}>إضافة المندوب</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoiceCreatePage;
