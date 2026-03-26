import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus, Search, Hammer, Trash2, ArrowLeft, Edit, MoreVertical,
  DollarSign, ChevronDown, UserPlus, Image, AlertTriangle, Receipt, FileText,
  TrendingDown, TrendingUp, Download, BarChart3, ArrowRight, Filter, ChevronUp, Printer,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import BackButton from "@/components/BackButton";
import { generateWorkshopContractPDF, ContractData, ContractCompanyData } from "@/utils/generateWorkshopContractPDF";
import FinancialClaimModal from "@/components/contractor/FinancialClaimModal";
import WorkshopCostModal, { COST_CATEGORIES, PHASES, CATEGORY_GL_MAP, PAYMENT_CREDIT_MAP as NEW_PAYMENT_CREDIT } from "@/components/workshops/WorkshopCostModal";
import WorkshopCostReport from "@/components/workshops/WorkshopCostReport";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/* ── Types ── */
type Workshop = {
  id: string; name: string; customer_name: string | null; customer_phone: string | null;
  address: string | null; description: string | null; status: string; total_budget: number;
  start_date: string | null; expected_end_date: string | null; actual_end_date: string | null;
  notes: string | null; created_at: string; contact_id: string | null;
  area_sqm: number | null; image_url: string | null; workshop_type: string | null;
};
type WorkshopCost = {
  id: string; workshop_id: string; cost_type: string; description: string | null;
  amount: number; cost_date: string; supplier_name: string | null; payment_method: string | null;
  notes: string | null; created_at: string; linked_transaction_id: string | null;
  supplier_contact_id: string | null;
  category?: string | null; quantity?: number | null; unit?: string | null; unit_price?: number | null;
  waste_percentage?: number | null; waste_amount?: number | null; phase?: string | null;
  invoice_number?: string | null; receipt_url?: string | null;
};
type WorkshopPayment = {
  id: string; workshop_id: string; amount: number; payment_method: string;
  payment_date: string; description: string | null; linked_transaction_id: string | null;
  created_at: string;
};
type Contact = { id: string; contact_name: string; contact_type: string; current_balance: number };

/* ── Cost type → GL account mapping ── */
const COST_ACCOUNT_MAP: Record<string, { debit: string; label: string }> = {
  wood:      { debit: "5351", label: "مواد خام (خشب)" },
  paint:     { debit: "5352", label: "دهان ومواد تشطيب" },
  crystal:   { debit: "5352", label: "دهان ومواد تشطيب" },
  labor:     { debit: "5353", label: "أجور عمال الورشات" },
  hardware:  { debit: "5351", label: "مواد خام" },
  glass:     { debit: "5351", label: "مواد خام" },
  marble:    { debit: "5351", label: "مواد خام" },
  transport: { debit: "5354", label: "نقل وتوصيل ورشات" },
  other:     { debit: "5359", label: "تكاليف ورشات أخرى" },
};

const PAYMENT_CREDIT_MAP: Record<string, string> = {
  "نقدي": "1110",
  "بنك":  "1120",
  "آجل":  "2110", // ذمم موردين
};

const COST_TYPES = [
  { value: "wood", label: "خشب", icon: "🪵", color: "text-amber-600 bg-amber-500/10" },
  { value: "paint", label: "دهان", icon: "🎨", color: "text-blue-500 bg-blue-500/10" },
  { value: "crystal", label: "كرستا", icon: "✨", color: "text-purple-500 bg-purple-500/10" },
  { value: "labor", label: "عمال", icon: "👷", color: "text-orange-500 bg-orange-500/10" },
  { value: "hardware", label: "عدد ومسامير", icon: "🔩", color: "text-gray-500 bg-gray-500/10" },
  { value: "glass", label: "زجاج", icon: "🪟", color: "text-cyan-500 bg-cyan-500/10" },
  { value: "marble", label: "رخام/حجر", icon: "🧱", color: "text-stone-500 bg-stone-500/10" },
  { value: "transport", label: "نقل وتوصيل", icon: "🚚", color: "text-green-500 bg-green-500/10" },
  { value: "other", label: "أخرى", icon: "📎", color: "text-muted-foreground bg-muted" },
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "نشطة", variant: "default" },
  completed: { label: "مكتملة", variant: "secondary" },
  paused: { label: "متوقفة", variant: "outline" },
  cancelled: { label: "ملغاة", variant: "destructive" },
};

const getCostType = (v: string) => COST_TYPES.find(c => c.value === v) || COST_TYPES[COST_TYPES.length - 1];

const WORKSHOP_TYPES = [
  { value: "kitchen", label: "مطبخ", icon: "🍳" },
  { value: "bedroom", label: "غرفة نوم", icon: "🛏️" },
  { value: "livingroom", label: "صالون", icon: "🛋️" },
  { value: "closet", label: "خزائن", icon: "🗄️" },
  { value: "door", label: "أبواب", icon: "🚪" },
  { value: "other", label: "أخرى", icon: "📦" },
];

/* ── Ensure workshop GL accounts exist ── */
async function ensureWorkshopAccounts(userId: string) {
  const codes = ["5350", "5351", "5352", "5353", "5354", "5359"];
  const { data: existing } = await supabase
    .from("accounts")
    .select("account_code")
    .in("account_code", codes);

  const existingCodes = new Set((existing || []).map((a: any) => a.account_code));
  const missing = [
    { code: "5350", name: "تكاليف الورشات", type: "مصاريف", parent: null },
    { code: "5351", name: "مواد خام (خشب)", type: "مصاريف", parent: "5350" },
    { code: "5352", name: "دهان ومواد تشطيب", type: "مصاريف", parent: "5350" },
    { code: "5353", name: "أجور عمال الورشات", type: "مصاريف", parent: "5350" },
    { code: "5354", name: "نقل وتوصيل ورشات", type: "مصاريف", parent: "5350" },
    { code: "5359", name: "تكاليف ورشات أخرى", type: "مصاريف", parent: "5350" },
  ].filter(a => !existingCodes.has(a.code));

  if (missing.length > 0) {
    await supabase.from("accounts").insert(
      missing.map(a => ({
        user_id: userId,
        account_code: a.code,
        account_name: a.name,
        account_type: a.type,
        parent_code: a.parent,
        is_system: true,
        is_active: true,
      }))
    );
  }
}

/* ══════════════════════════════════════════════════ */
export default function WorkshopsPage() {
  const { user } = useAuth();
  const { settings } = useCompanySettings();
  const [view, setView] = useState<"workshops" | "reports">("workshops");
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedWorkshop, setSelectedWorkshop] = useState<Workshop | null>(null);
  const [costs, setCosts] = useState<WorkshopCost[]>([]);
  const [payments, setPayments] = useState<WorkshopPayment[]>([]);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [showNewWorkshop, setShowNewWorkshop] = useState(false);
  const [showEditWorkshop, setShowEditWorkshop] = useState(false);
  const [editingWorkshop, setEditingWorkshop] = useState<Workshop | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingWorkshop, setDeletingWorkshop] = useState<Workshop | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showNewCost, setShowNewCost] = useState(false);
  const [showCostReport, setShowCostReport] = useState(false);
  const [costFilter, setCostFilter] = useState("all");
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [customerBalance, setCustomerBalance] = useState(0);

  // Contacts for search
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);

  // Forms
  const [wsForm, setWsForm] = useState({
    name: "", customer_name: "", customer_phone: "", address: "", description: "",
    total_budget: 0, start_date: format(new Date(), "yyyy-MM-dd"), expected_end_date: "",
    contact_id: null as string | null,
    area_sqm: 0, workshop_type: "kitchen", image_url: "",
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: 0, payment_method: "نقدي", description: "", payment_date: format(new Date(), "yyyy-MM-dd"),
    cheque_bank: "", deposit_bank_id: null as string | null,
    currency: "ILS", exchange_rate: 1, cheque_count: 1,
  });
  type ChequeRow = { number: string; drawer: string; bank: string; date: string; amount: number };
  const [chequeRows, setChequeRows] = useState<ChequeRow[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; bank_name: string; gl_account_code: string | null }[]>([]);
  const [currencies, setCurrencies] = useState<{ code: string; name_ar: string; sell_rate: number }[]>([]);
  const [costForm, setCostForm] = useState({
    cost_type: "wood", description: "", amount: 0, cost_date: format(new Date(), "yyyy-MM-dd"),
    supplier_name: "", payment_method: "نقدي", notes: "",
    supplier_contact_id: null as string | null,
  }); // kept for backward compat with delete/etc
  const [invoiceForm, setInvoiceForm] = useState({
    amount: 0, payment_method: "آجل", description: "",
  });

  const [accountsEnsured, setAccountsEnsured] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadWorkshops();
    loadContacts();
    loadBankAccounts();
    loadCurrencies();
    ensureWorkshopAccounts(user.id).then(() => setAccountsEnsured(true));
  }, [user]);

  const loadWorkshops = async () => {
    setLoading(true);
    const { data } = await supabase.from("workshops").select("*").order("created_at", { ascending: false });
    setWorkshops((data as any) || []);
    setLoading(false);
  };

  const loadContacts = async () => {
    const { data } = await supabase.from("contacts").select("id, contact_name, contact_type, current_balance").order("contact_name");
    setContacts((data as any) || []);
  };

  const loadBankAccounts = async () => {
    const { data } = await supabase.from("bank_accounts").select("id, name, bank_name, gl_account_code").eq("is_active", true).order("name");
    setBankAccounts((data as any) || []);
  };

  const loadCurrencies = async () => {
    const { data } = await supabase.from("currencies").select("code, name_ar, sell_rate").eq("is_active", true).order("code");
    setCurrencies((data as any) || []);
  };

  const loadCosts = async (workshopId: string) => {
    setLoadingCosts(true);
    const [costRes, payRes] = await Promise.all([
      supabase.from("workshop_costs").select("*").eq("workshop_id", workshopId).order("cost_date", { ascending: false }),
      supabase.from("workshop_payments").select("*").eq("workshop_id", workshopId).order("payment_date", { ascending: false }),
    ]);
    setCosts((costRes.data as any) || []);
    setPayments((payRes.data as any) || []);
    setLoadingCosts(false);
  };

  const openWorkshop = (ws: Workshop) => { setSelectedWorkshop(ws); loadCosts(ws.id); };

  const defaultWsForm = () => ({
    name: "", customer_name: "", customer_phone: "", address: "", description: "",
    total_budget: 0, start_date: format(new Date(), "yyyy-MM-dd"), expected_end_date: "",
    contact_id: null as string | null, area_sqm: 0, workshop_type: "", image_url: "",
  });

  const toggleWorkshopType = (value: string) => {
    setWsForm(f => {
      const types = f.workshop_type ? f.workshop_type.split(",").filter(Boolean) : [];
      const updated = types.includes(value) ? types.filter(t => t !== value) : [...types, value];
      return { ...f, workshop_type: updated.join(",") };
    });
  };

  const handleImageUpload = async (file: File) => {
    if (!user) return;
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("workshop-images").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("workshop-images").getPublicUrl(path);
      setWsForm(f => ({ ...f, image_url: urlData.publicUrl }));
      toast.success("تم رفع الصورة");
    } catch (e: any) {
      toast.error("فشل رفع الصورة: " + e.message);
    } finally {
      setUploadingImage(false);
    }
  };

  /* ── Create Workshop ── */
  const handleCreateWorkshop = async () => {
    if (!wsForm.name.trim()) { toast.error("اسم الورشة مطلوب"); return; }
    const { error } = await supabase.from("workshops").insert({
      user_id: user!.id, name: wsForm.name,
      customer_name: wsForm.customer_name || null,
      customer_phone: wsForm.customer_phone || null,
      address: wsForm.address || null, description: wsForm.description || null,
      total_budget: wsForm.total_budget || 0, start_date: wsForm.start_date || null,
      expected_end_date: wsForm.expected_end_date || null,
      contact_id: wsForm.contact_id || null,
      area_sqm: wsForm.area_sqm || null,
      workshop_type: wsForm.workshop_type || "kitchen",
      image_url: wsForm.image_url || null,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء الورشة بنجاح");
    setShowNewWorkshop(false);
    setWsForm(defaultWsForm());
    loadWorkshops();
  };

  /* ── Generate default cheque rows ── */
  const generateChequeRows = (count: number, totalAmount: number, startNumber: string, startDate: string, drawer: string, bank: string) => {
    const rows: ChequeRow[] = [];
    const baseNum = parseInt(startNumber) || 0;
    const perAmount = totalAmount > 0 ? Math.round((totalAmount / count) * 100) / 100 : 0;
    for (let i = 0; i < count; i++) {
      const dueDate = new Date(startDate || new Date());
      if (i > 0) dueDate.setMonth(dueDate.getMonth() + i);
      rows.push({
        number: baseNum > 0 ? String(baseNum + i) : (startNumber ? `${startNumber}-${i + 1}` : ""),
        drawer: drawer,
        bank: bank,
        date: format(dueDate, "yyyy-MM-dd"),
        amount: perAmount,
      });
    }
    return rows;
  };

  const updateChequeRow = (index: number, field: keyof ChequeRow, value: string | number) => {
    setChequeRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  /* ── Add Partial Payment ── */
  const handleAddPayment = async () => {
    if (!selectedWorkshop || paymentForm.amount <= 0) { toast.error("المبلغ مطلوب"); return; }
    const isCheque = paymentForm.payment_method === "شيك";

    if (isCheque && chequeRows.some(r => !r.number.trim())) { toast.error("رقم الشيك مطلوب لكل شيك"); return; }

    const amountILS = paymentForm.currency !== "ILS" ? paymentForm.amount * paymentForm.exchange_rate : paymentForm.amount;
    const currencyLabel = paymentForm.currency === "ILS" ? "شيكل" : paymentForm.currency === "USD" ? "دولار" : paymentForm.currency === "JOD" ? "دينار" : paymentForm.currency;

    const debitCode = isCheque ? "1150" : paymentForm.payment_method === "بنك" ? "1120" : "1110";
    const idempotencyKey = `WS-PAY-${selectedWorkshop.id}-${Date.now()}`;

    const { data: txData, error: txError } = await supabase.from("transactions").insert({
      user_id: user!.id,
      transaction_date: paymentForm.payment_date,
      description: paymentForm.description || `دفعة من ${selectedWorkshop.customer_name || "زبون"} - ورشة ${selectedWorkshop.name}${isCheque ? ` (${chequeRows.length} شيك)` : ""}`,
      debit_account_code: debitCode,
      credit_account_code: "4200",
      amount: amountILS,
      currency: currencyLabel,
      transaction_type: "workshop_payment",
      contact_id: selectedWorkshop.contact_id || null,
      reference: `WS-PAY-${selectedWorkshop.name.substring(0, 15)}`,
      payment_method: isCheque ? "شيك" : paymentForm.payment_method,
      idempotency_key: idempotencyKey,
      ...(paymentForm.currency !== "ILS" ? { foreign_amount: paymentForm.amount, exchange_rate: paymentForm.exchange_rate } : {}),
    } as any).select("id").single();

    if (txError) { toast.error("خطأ في إنشاء القيد: " + txError.message); return; }

    // Create cheque records from user-edited rows
    if (isCheque && chequeRows.length > 0) {
      const chequeInserts = chequeRows.map((row, i) => ({
        user_id: user!.id,
        cheque_type: "incoming" as any,
        cheque_number: row.number,
        party_name: row.drawer || selectedWorkshop.customer_name || "زبون",
        party_type: "customer",
        contact_id: selectedWorkshop.contact_id || null,
        amount: row.amount,
        cheque_date: row.date,
        bank_name: row.bank || null,
        status: "registered" as any,
        currency: paymentForm.currency,
        linked_transaction_id: txData?.id || null,
        linked_account: "1150",
        deposit_bank_account_id: paymentForm.deposit_bank_id || null,
        notes: `دفعة ورشة: ${selectedWorkshop.name}${chequeRows.length > 1 ? ` (${i + 1}/${chequeRows.length})` : ""}`,
      }));

      const { error: chequeError } = await supabase.from("cheques").insert(chequeInserts as any);
      if (chequeError) { toast.error("خطأ في تسجيل الشيكات: " + chequeError.message); return; }
    }

    const { error } = await supabase.from("workshop_payments").insert({
      workshop_id: selectedWorkshop.id, user_id: user!.id,
      amount: amountILS, payment_method: isCheque ? "شيك" : paymentForm.payment_method,
      payment_date: paymentForm.payment_date, description: paymentForm.description || null,
      linked_transaction_id: txData?.id || null,
    } as any);

    if (error) { toast.error(error.message); return; }
    toast.success(isCheque ? `✅ تم تسجيل ${chequeRows.length} شيك وارد بنجاح` : "✅ تم تسجيل الدفعة بنجاح");
    setShowPaymentDialog(false);
    const resetForm = { amount: 0, payment_method: "نقدي", description: "", payment_date: format(new Date(), "yyyy-MM-dd"), cheque_bank: "", deposit_bank_id: null, currency: "ILS", exchange_rate: 1, cheque_count: 1 };
    setPaymentForm(resetForm as any);
    setChequeRows([]);
    loadCosts(selectedWorkshop.id);
  };

  /* ── Add Cost + Create Journal Entry ── */
  const handleAddCost = async () => {
    if (!selectedWorkshop || costForm.amount <= 0) { toast.error("المبلغ مطلوب"); return; }

    const costTypeInfo = COST_ACCOUNT_MAP[costForm.cost_type] || COST_ACCOUNT_MAP.other;
    const creditCode = PAYMENT_CREDIT_MAP[costForm.payment_method] || "1110";
    const idempotencyKey = `WS-COST-${selectedWorkshop.id}-${Date.now()}`;

    // 1. Create journal entry (transaction)
    const txDescription = `${costTypeInfo.label} - ورشة ${selectedWorkshop.name}${costForm.supplier_name ? ` (${costForm.supplier_name})` : ""}`;

    const { data: txData, error: txError } = await supabase.from("transactions").insert({
      user_id: user!.id,
      transaction_date: costForm.cost_date,
      description: txDescription,
      debit_account_code: costTypeInfo.debit,
      credit_account_code: creditCode,
      amount: costForm.amount,
      currency: "شيكل",
      transaction_type: "workshop_cost",
      contact_id: costForm.supplier_contact_id || null,
      reference: `WS-${selectedWorkshop.name.substring(0, 20)}`,
      payment_method: costForm.payment_method,
      idempotency_key: idempotencyKey,
    } as any).select("id").single();

    if (txError) { toast.error("خطأ في إنشاء القيد المحاسبي: " + txError.message); return; }

    // 2. Create workshop cost record linked to the transaction
    const { error: costError } = await supabase.from("workshop_costs").insert({
      workshop_id: selectedWorkshop.id, user_id: user!.id,
      cost_type: costForm.cost_type, description: costForm.description || null,
      amount: costForm.amount, cost_date: costForm.cost_date,
      supplier_name: costForm.supplier_name || null,
      payment_method: costForm.payment_method, notes: costForm.notes || null,
      linked_transaction_id: txData?.id || null,
      supplier_contact_id: costForm.supplier_contact_id || null,
    } as any);

    if (costError) { toast.error(costError.message); return; }

    // 3. If payment is on credit (آجل) and supplier has a contact, update balance
    if (costForm.payment_method === "آجل" && costForm.supplier_contact_id) {
      await supabase.from("contacts")
        .update({ current_balance: (contacts.find(c => c.id === costForm.supplier_contact_id)?.current_balance || 0) + costForm.amount } as any)
        .eq("id", costForm.supplier_contact_id);
    }

    toast.success(`✅ تم تسجيل التكلفة وإنشاء القيد المحاسبي (${costTypeInfo.debit} ← ${creditCode})`);
    setShowNewCost(false);
    setCostForm({ cost_type: "wood", description: "", amount: 0, cost_date: format(new Date(), "yyyy-MM-dd"), supplier_name: "", payment_method: "نقدي", notes: "", supplier_contact_id: null });
    loadCosts(selectedWorkshop.id);
    loadContacts();
  };

  /* ── Delete Cost + Soft-delete Transaction ── */
  const handleDeleteCost = async (cost: WorkshopCost) => {
    if (cost.linked_transaction_id) {
      await supabase.from("transactions").update({ is_deleted: true } as any).eq("id", cost.linked_transaction_id);
    }
    await supabase.from("workshop_costs").delete().eq("id", cost.id);
    toast.success("تم حذف التكلفة وإلغاء القيد المحاسبي");
    if (selectedWorkshop) loadCosts(selectedWorkshop.id);
  };

  /* ── Complete Workshop + Create Revenue Entry ── */
  const handleInvoiceWorkshop = async () => {
    if (!selectedWorkshop || invoiceForm.amount <= 0) { toast.error("المبلغ مطلوب"); return; }

    const creditCode = "4200"; // إيرادات خدمات
    const debitCode = PAYMENT_CREDIT_MAP[invoiceForm.payment_method] || "1130";
    // For credit sales, debit receivables (1130)
    const finalDebit = invoiceForm.payment_method === "آجل" ? "1130" : debitCode;
    const idempotencyKey = `WS-REVENUE-${selectedWorkshop.id}`;

    const { error: txError } = await supabase.from("transactions").insert({
      user_id: user!.id,
      transaction_date: format(new Date(), "yyyy-MM-dd"),
      description: invoiceForm.description || `إيرادات ورشة ${selectedWorkshop.name} - ${selectedWorkshop.customer_name || ""}`,
      debit_account_code: finalDebit,
      credit_account_code: creditCode,
      amount: invoiceForm.amount,
      currency: "شيكل",
      transaction_type: "workshop_revenue",
      contact_id: selectedWorkshop.contact_id || null,
      reference: `WS-REV-${selectedWorkshop.name.substring(0, 15)}`,
      payment_method: invoiceForm.payment_method,
      idempotency_key: idempotencyKey,
    } as any);

    if (txError) { toast.error(txError.message); return; }

    // Update workshop status
    await supabase.from("workshops").update({
      status: "completed", actual_end_date: format(new Date(), "yyyy-MM-dd"), updated_at: new Date().toISOString(),
    } as any).eq("id", selectedWorkshop.id);

    // Update customer balance if on credit
    if (invoiceForm.payment_method === "آجل" && selectedWorkshop.contact_id) {
      const contact = contacts.find(c => c.id === selectedWorkshop.contact_id);
      if (contact) {
        await supabase.from("contacts")
          .update({ current_balance: contact.current_balance + invoiceForm.amount } as any)
          .eq("id", selectedWorkshop.contact_id);
      }
    }

    toast.success("✅ تم إكمال الورشة وتسجيل الإيرادات");
    setShowInvoiceDialog(false);
    setSelectedWorkshop({ ...selectedWorkshop, status: "completed" });
    loadWorkshops();
    loadContacts();
  };

  const handleUpdateStatus = async (ws: Workshop, newStatus: string) => {
    const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === "completed") updates.actual_end_date = format(new Date(), "yyyy-MM-dd");
    await supabase.from("workshops").update(updates).eq("id", ws.id);
    toast.success("تم تحديث الحالة");
    loadWorkshops();
    if (selectedWorkshop?.id === ws.id) setSelectedWorkshop({ ...ws, ...updates });
  };

  /* ── Open Edit Workshop ── */
  const openEditWorkshop = (ws: Workshop) => {
    setEditingWorkshop(ws);
    setWsForm({
      name: ws.name, customer_name: ws.customer_name || "", customer_phone: ws.customer_phone || "",
      address: ws.address || "", description: ws.description || "",
      total_budget: ws.total_budget || 0, start_date: ws.start_date || format(new Date(), "yyyy-MM-dd"),
      expected_end_date: ws.expected_end_date || "",
      contact_id: ws.contact_id || null,
      area_sqm: ws.area_sqm || 0, workshop_type: ws.workshop_type || "kitchen",
      image_url: ws.image_url || "",
    });
    setShowEditWorkshop(true);
  };

  /* ── Save Edit Workshop ── */
  const handleEditWorkshop = async () => {
    if (!editingWorkshop || !wsForm.name.trim()) { toast.error("اسم الورشة مطلوب"); return; }
    const { error } = await supabase.from("workshops").update({
      name: wsForm.name, customer_name: wsForm.customer_name || null,
      customer_phone: wsForm.customer_phone || null, address: wsForm.address || null,
      description: wsForm.description || null, total_budget: wsForm.total_budget || 0,
      start_date: wsForm.start_date || null, expected_end_date: wsForm.expected_end_date || null,
      contact_id: wsForm.contact_id || null, area_sqm: wsForm.area_sqm || null,
      workshop_type: wsForm.workshop_type || "kitchen", image_url: wsForm.image_url || null,
      updated_at: new Date().toISOString(),
    } as any).eq("id", editingWorkshop.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تعديل الورشة بنجاح");
    setShowEditWorkshop(false);
    setEditingWorkshop(null);
    setWsForm(defaultWsForm());
    loadWorkshops();
    if (selectedWorkshop?.id === editingWorkshop.id) {
      setSelectedWorkshop({ ...editingWorkshop, ...wsForm, area_sqm: wsForm.area_sqm || null, contact_id: wsForm.contact_id || null, image_url: wsForm.image_url || null } as any);
    }
  };

  /* ── Delete Workshop + related costs/payments/transactions ── */
  const handleDeleteWorkshop = async (ws: Workshop) => {
    // Soft-delete linked transactions
    const { data: costData } = await supabase.from("workshop_costs").select("linked_transaction_id").eq("workshop_id", ws.id);
    const { data: payData } = await supabase.from("workshop_payments").select("linked_transaction_id").eq("workshop_id", ws.id);
    const txIds = [
      ...((costData as any) || []).map((c: any) => c.linked_transaction_id).filter(Boolean),
      ...((payData as any) || []).map((p: any) => p.linked_transaction_id).filter(Boolean),
    ];
    if (txIds.length > 0) {
      await supabase.from("transactions").update({ is_deleted: true } as any).in("id", txIds);
    }
    // Delete costs, payments, then workshop
    await supabase.from("workshop_costs").delete().eq("workshop_id", ws.id);
    await supabase.from("workshop_payments").delete().eq("workshop_id", ws.id);
    await supabase.from("workshops").delete().eq("id", ws.id);
    toast.success("تم حذف الورشة وجميع القيود المرتبطة بها");
    setShowDeleteConfirm(false);
    setDeletingWorkshop(null);
    if (selectedWorkshop?.id === ws.id) setSelectedWorkshop(null);
    loadWorkshops();
  };

  const filteredWorkshops = useMemo(() => {
    return workshops.filter(ws => {
      if (statusFilter !== "all" && ws.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return ws.name.toLowerCase().includes(q) || ws.customer_name?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [workshops, search, statusFilter]);

  const costSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byPhase: Record<string, number> = {};
    let total = 0;
    costs.forEach(c => {
      summary[c.cost_type] = (summary[c.cost_type] || 0) + c.amount;
      const cat = c.category || c.cost_type || "other";
      byCategory[cat] = (byCategory[cat] || 0) + c.amount;
      const ph = c.phase || "preparation";
      byPhase[ph] = (byPhase[ph] || 0) + c.amount;
      total += c.amount;
    });
    return { byType: summary, byCategory, byPhase, total };
  }, [costs]);

  const totalPaid = useMemo(() => payments.reduce((s, p) => s + p.amount, 0), [payments]);

  const budgetUsedPct = useMemo(() => {
    if (!selectedWorkshop || !selectedWorkshop.total_budget) return 0;
    return (costSummary.total / selectedWorkshop.total_budget) * 100;
  }, [selectedWorkshop, costSummary.total]);

  // Filtered costs for table
  const materialCats = ["wood_natural", "mdf", "glass", "paint", "varnish", "marble", "hardware", "countertop", "adhesive", "veneer", "fittings", "wood", "crystal"];
  const laborCats = ["labor"];
  const transportCats = ["transport"];
  const filteredCosts = useMemo(() => {
    if (costFilter === "all") return costs;
    return costs.filter(c => {
      const cat = c.category || c.cost_type || "other";
      if (costFilter === "materials") return materialCats.includes(cat);
      if (costFilter === "labor") return laborCats.includes(cat);
      if (costFilter === "transport") return transportCats.includes(cat);
      if (costFilter === "unpaid") return c.payment_method === "آجل";
      return true;
    });
  }, [costs, costFilter]);

  const filteredCustomers = useMemo(() =>
    contacts.filter(c => ["customer", "عميل", "both", "كلاهما"].includes(c.contact_type) && (!contactSearch || c.contact_name.toLowerCase().includes(contactSearch.toLowerCase())))
  , [contacts, contactSearch]);

  const filteredSuppliers = useMemo(() =>
    contacts.filter(c => ["supplier", "مورد", "both", "كلاهما"].includes(c.contact_type) && (!supplierSearch || c.contact_name.toLowerCase().includes(supplierSearch.toLowerCase())))
  , [contacts, supplierSearch]);

  /* ════════════════════════════════════════════ */
  /* ── Workshop Detail View ── */
  /* ════════════════════════════════════════════ */
  // Calculate real balance from transactions (1130 receivables + 2100 payables)
  useEffect(() => {
    if (!selectedWorkshop?.contact_id) { setCustomerBalance(0); return; }
    const calcBalance = async () => {
      const { data } = await supabase
        .from("transactions")
        .select("debit_account_code, credit_account_code, amount")
        .eq("contact_id", selectedWorkshop.contact_id!)
        .is("is_deleted" as any, null)
        .in("debit_account_code", ["1130", "2100"])
        .or("credit_account_code.in.(1130,2100)");
      
      if (!data) { setCustomerBalance(0); return; }
      let balance = 0;
      data.forEach((tx: any) => {
        if (tx.debit_account_code === "1130") balance += tx.amount;
        if (tx.credit_account_code === "1130") balance -= tx.amount;
        if (tx.debit_account_code === "2100") balance -= tx.amount;
        if (tx.credit_account_code === "2100") balance += tx.amount;
      });
      setCustomerBalance(balance);
    };
    calcBalance();
  }, [selectedWorkshop?.contact_id, costs, payments]);

  if (selectedWorkshop) {
    const status = STATUS_MAP[selectedWorkshop.status] || STATUS_MAP.active;
    const profit = selectedWorkshop.total_budget - costSummary.total;
    const customerContact = contacts.find(c => c.id === selectedWorkshop.contact_id);

    return (
      <div className="min-h-full bg-background pb-24" dir="rtl">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedWorkshop(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate">{selectedWorkshop.name}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{selectedWorkshop.customer_name || "بدون زبون"}</span>
                {selectedWorkshop.contact_id && (
                  <Badge variant="outline" className="text-[9px]">
                    رصيد: {customerBalance.toLocaleString()} ₪
                  </Badge>
                )}
              </div>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => openEditWorkshop(selectedWorkshop)}>
                <Edit className="h-3.5 w-3.5" /> تعديل
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={async () => {
                const { data: settings } = await supabase.from("company_settings").select("company_name, phone, address, logo_url").eq("user_id", user!.id).maybeSingle();
                const workshopTypeLabels = (selectedWorkshop.workshop_type || "").split(",").filter(Boolean).map(t => WORKSHOP_TYPES.find(x => x.value === t)?.label || t).join(" + ");
                const contractData: ContractData = {
                  workshopName: selectedWorkshop.name,
                  workshopType: workshopTypeLabels,
                  customerName: selectedWorkshop.customer_name || "",
                  customerPhone: selectedWorkshop.customer_phone || "",
                  address: selectedWorkshop.address || "",
                  description: selectedWorkshop.description || "",
                  areaSqm: selectedWorkshop.area_sqm || 0,
                  budget: selectedWorkshop.total_budget || 0,
                  startDate: selectedWorkshop.start_date || "",
                  notes: selectedWorkshop.notes || "",
                };
                const companyData: ContractCompanyData = {
                  name: settings?.company_name || "",
                  phone: settings?.phone || "",
                  address: settings?.address || "",
                  logo_url: settings?.logo_url || "",
                };
                try {
                  const pdf = await generateWorkshopContractPDF(contractData, companyData);
                  pdf.save(`عقد-${selectedWorkshop.name}.pdf`);
                  toast.success("تم تحميل العقد بنجاح");
                } catch (e: any) {
                  toast.error("خطأ في إنشاء العقد: " + e.message);
                }
              }}>
                <FileText className="h-3.5 w-3.5" /> عقد PDF
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowClaimModal(true)}>
                <Receipt className="h-3.5 w-3.5" /> مطالبة مالية
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => {
                const printContent = document.getElementById("workshop-print-area");
                if (!printContent) return;
                const printWin = window.open("", "_blank");
                if (!printWin) return;
                printWin.document.write(`
                  <html dir="rtl"><head><title>معاينة طباعة - ${selectedWorkshop.name}</title>
                  <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'IBM Plex Sans Arabic', 'Segoe UI', sans-serif; padding: 24px; direction: rtl; color: #1a1a1a; }
                    h1 { font-size: 22px; margin-bottom: 4px; }
                    .sub { color: #666; font-size: 13px; margin-bottom: 16px; }
                    .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 20px; }
                    .kpi { border: 1px solid #ddd; border-radius: 8px; padding: 10px; text-align: center; }
                    .kpi-label { font-size: 10px; color: #888; }
                    .kpi-value { font-size: 16px; font-weight: bold; margin-top: 2px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
                    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: right; }
                    th { background: #f5f5f5; font-weight: 600; }
                    .section-title { font-size: 14px; font-weight: bold; margin: 16px 0 8px; }
                    .text-red { color: #dc2626; }
                    .text-green { color: #16a34a; }
                    @media print { body { padding: 12px; } }
                  </style></head><body>
                  <h1>🪵 ${selectedWorkshop.name}</h1>
                  <p class="sub">الزبون: ${selectedWorkshop.customer_name || "—"} | التاريخ: ${format(new Date(), "yyyy-MM-dd")}</p>
                  <div class="kpis">
                    <div class="kpi"><div class="kpi-label">الميزانية</div><div class="kpi-value">${selectedWorkshop.total_budget?.toLocaleString()} ₪</div></div>
                    <div class="kpi"><div class="kpi-label">المصروف</div><div class="kpi-value text-red">${costSummary.total.toLocaleString()} ₪</div></div>
                    <div class="kpi"><div class="kpi-label">المتبقي</div><div class="kpi-value">${(selectedWorkshop.total_budget - costSummary.total).toLocaleString()} ₪</div></div>
                    <div class="kpi"><div class="kpi-label">المدفوع</div><div class="kpi-value text-green">${totalPaid.toLocaleString()} ₪</div></div>
                    <div class="kpi"><div class="kpi-label">الربح</div><div class="kpi-value ${profit >= 0 ? "text-green" : "text-red"}">${profit.toLocaleString()} ₪</div></div>
                  </div>
                  ${payments.length > 0 ? `
                    <p class="section-title">💵 الدفعات المقبوضة</p>
                    <table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظات</th></tr></thead><tbody>
                    ${payments.map(p => `<tr><td>${p.payment_date}</td><td>${p.amount.toLocaleString()} ₪</td><td>${p.payment_method}</td><td>${p.description || "—"}</td></tr>`).join("")}
                    </tbody></table>` : ""}
                  ${costs.length > 0 ? `
                    <p class="section-title">📋 سجل التكاليف</p>
                    <table><thead><tr><th>التاريخ</th><th>الفئة</th><th>البند</th><th>المبلغ</th><th>المورد</th></tr></thead><tbody>
                    ${costs.map(c => {
                      const catInfo = COST_CATEGORIES.find(cc => cc.value === (c.category || c.cost_type)) || { icon: "📦", label: c.cost_type };
                      return `<tr><td>${c.cost_date}</td><td>${catInfo.icon} ${catInfo.label}</td><td>${c.description || "—"}</td><td class="text-red">${c.amount.toLocaleString()} ₪</td><td>${c.supplier_name || "—"}</td></tr>`;
                    }).join("")}
                    </tbody></table>` : ""}
                  <script>setTimeout(() => window.print(), 500);</script>
                  </body></html>
                `);
                printWin.document.close();
              }}>
                <Printer className="h-3.5 w-3.5" /> معاينة طباعة
              </Button>
              <Button variant="destructive" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setDeletingWorkshop(selectedWorkshop); setShowDeleteConfirm(true); }}>
                <Trash2 className="h-3.5 w-3.5" /> حذف
              </Button>
            </div>
          </div>

          {/* Area + Type info */}
          {(selectedWorkshop.area_sqm || selectedWorkshop.workshop_type) && (
            <div className="flex gap-2 flex-wrap text-xs">
              {selectedWorkshop.workshop_type && selectedWorkshop.workshop_type.split(",").filter(Boolean).map(t => {
                const wt = WORKSHOP_TYPES.find(x => x.value === t);
                return wt ? <Badge key={t} variant="outline">{wt.icon} {wt.label}</Badge> : null;
              })}
              {selectedWorkshop.area_sqm ? <Badge variant="outline">📐 {selectedWorkshop.area_sqm} م²</Badge> : null}
              {selectedWorkshop.area_sqm && costSummary.total > 0 ? (
                <Badge variant="secondary">تكلفة المتر: {Math.round(costSummary.total / selectedWorkshop.area_sqm).toLocaleString()} ₪/م²</Badge>
              ) : null}
            </div>
          )}

          {/* Image */}
          {selectedWorkshop.image_url && (
            <div className="rounded-xl overflow-hidden border border-border max-h-48">
              <img src={selectedWorkshop.image_url} alt={selectedWorkshop.name} className="w-full h-48 object-cover" />
            </div>
          )}

          {/* Budget Alert */}
          {budgetUsedPct >= 80 && selectedWorkshop.total_budget > 0 && selectedWorkshop.status === "active" && (
            <div className={`flex items-center gap-2 p-3 rounded-xl border ${budgetUsedPct >= 100 ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-amber-500/10 border-amber-500/30 text-amber-700"}`}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="text-xs font-medium">
                {budgetUsedPct >= 100
                  ? `⚠️ تم تجاوز الميزانية! التكاليف ${Math.round(budgetUsedPct)}% من الميزانية`
                  : `⚠️ تنبيه: تم استهلاك ${Math.round(budgetUsedPct)}% من الميزانية`}
              </p>
            </div>
          )}

          {/* KPIs - Professional */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "الميزانية", value: `${selectedWorkshop.total_budget?.toLocaleString()} ₪`, cls: "text-foreground", showBar: false },
              { label: "المصروف", value: `${costSummary.total.toLocaleString()} ₪`, cls: "text-destructive", showBar: false },
              { label: "المتبقي", value: `${(selectedWorkshop.total_budget - costSummary.total).toLocaleString()} ₪`, cls: (selectedWorkshop.total_budget - costSummary.total) >= 0 ? "text-foreground" : "text-destructive", showBar: false },
              { label: "نسبة الإنجاز", value: `${Math.round(budgetUsedPct)}%`, cls: "text-foreground", showBar: true },
              { label: "الربح", value: `${profit.toLocaleString()} ₪`, cls: profit >= 0 ? "text-emerald-600" : "text-destructive", showBar: false },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-xl bg-card border border-border p-3 text-center">
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                <p className={`text-base font-bold ${kpi.cls}`}>{kpi.value}</p>
                {kpi.showBar && (
                  <div className="h-2 bg-muted rounded-full overflow-hidden mt-1.5">
                    <div className={`h-full rounded-full transition-all ${budgetUsedPct > 95 ? "bg-destructive" : budgetUsedPct > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(budgetUsedPct, 100)}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Payments section */}
          <div className="rounded-xl bg-card border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" /> الدفعات المقبوضة
              </h3>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
                setPaymentForm({ amount: 0, payment_method: "نقدي", description: "", payment_date: format(new Date(), "yyyy-MM-dd"), cheque_bank: "", deposit_bank_id: null, currency: "ILS", exchange_rate: 1, cheque_count: 1 });
                setChequeRows([]);
                setShowPaymentDialog(true);
              }}>
                <Plus className="h-3 w-3" /> دفعة جديدة
              </Button>
            </div>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">لم يتم تسجيل دفعات بعد</p>
            ) : (
              <div className="space-y-1.5">
                {payments.map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-accent/5 border border-border">
                    <span className="text-emerald-600 font-bold">+{p.amount.toLocaleString()} ₪</span>
                    <span className="text-muted-foreground">{p.payment_method}</span>
                    <span className="flex-1 text-muted-foreground truncate">{p.description}</span>
                    <span className="text-muted-foreground/60">{p.payment_date}</span>
                  </div>
                ))}
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>المدفوع {Math.round((totalPaid / (selectedWorkshop.total_budget || 1)) * 100)}%</span>
                    <span>{totalPaid.toLocaleString()} / {selectedWorkshop.total_budget.toLocaleString()} ₪</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min((totalPaid / (selectedWorkshop.total_budget || 1)) * 100, 100)}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          {selectedWorkshop.status === "active" && (
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(selectedWorkshop, "paused")} className="flex-1">⏸️ إيقاف</Button>
              <Button size="sm" onClick={() => {
                setInvoiceForm({ amount: selectedWorkshop.total_budget - totalPaid, payment_method: "آجل", description: "" });
                setShowInvoiceDialog(true);
              }} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">💰 فوترة واكتمال</Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setShowCostReport(true)}>
                <BarChart3 className="h-3.5 w-3.5" /> تقرير التكلفة
              </Button>
            </div>
          )}
          {selectedWorkshop.status === "paused" && (
            <Button size="sm" onClick={() => handleUpdateStatus(selectedWorkshop, "active")} className="w-full">▶️ استئناف</Button>
          )}

          {/* Add cost button */}
          <Button onClick={() => setShowNewCost(true)} className="w-full gap-2">
            <Plus className="h-4 w-4" /> إضافة تكلفة
          </Button>

          {/* ── Cost Ledger Table ── */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground">سجل التكاليف</h3>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[
                { key: "all", label: "الكل" },
                { key: "materials", label: "مواد" },
                { key: "labor", label: "عمالة" },
                { key: "transport", label: "نقل" },
                { key: "unpaid", label: "غير مدفوع" },
              ].map(f => (
                <button key={f.key} onClick={() => setCostFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
                    costFilter === f.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent/5"
                  }`}>{f.label}</button>
              ))}
            </div>
            {loadingCosts ? (
              <p className="text-sm text-muted-foreground text-center py-8">جاري التحميل...</p>
            ) : filteredCosts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{costs.length === 0 ? "لا توجد تكاليف مسجلة بعد" : "لا توجد نتائج للفلتر المحدد"}</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-[10px]">التاريخ</TableHead>
                      <TableHead className="text-right text-[10px]">الفئة</TableHead>
                      <TableHead className="text-right text-[10px]">البند</TableHead>
                      <TableHead className="text-right text-[10px]">الكمية</TableHead>
                      <TableHead className="text-right text-[10px]">سعر الوحدة</TableHead>
                      <TableHead className="text-right text-[10px]">المبلغ</TableHead>
                      <TableHead className="text-right text-[10px]">المرحلة</TableHead>
                      <TableHead className="text-right text-[10px]">المورد</TableHead>
                      <TableHead className="text-right text-[10px]">الدفع</TableHead>
                      <TableHead className="text-right text-[10px] w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCosts.map(cost => {
                      const catInfo = COST_CATEGORIES.find(cc => cc.value === (cost.category || cost.cost_type)) || { icon: "📦", label: cost.cost_type };
                      const phaseInfo = PHASES.find(p => p.value === cost.phase);
                      return (
                        <TableRow key={cost.id}>
                          <TableCell className="text-[11px] whitespace-nowrap">{format(new Date(cost.cost_date), "dd/MM")}</TableCell>
                          <TableCell className="text-[11px]"><span className="mr-1">{catInfo.icon}</span>{catInfo.label}</TableCell>
                          <TableCell className="text-[11px] max-w-[120px] truncate">{cost.description || "—"}</TableCell>
                          <TableCell className="text-[11px] tabular-nums">{cost.quantity || "—"} {cost.unit || ""}</TableCell>
                          <TableCell className="text-[11px] tabular-nums">{cost.unit_price ? `${cost.unit_price.toLocaleString()} ₪` : "—"}</TableCell>
                          <TableCell className="text-[11px] font-bold text-destructive tabular-nums">{cost.amount.toLocaleString()} ₪</TableCell>
                          <TableCell className="text-[10px]">{phaseInfo?.label || "—"}</TableCell>
                          <TableCell className="text-[11px] truncate max-w-[80px]">{cost.supplier_name || "—"}</TableCell>
                          <TableCell className="text-[10px]">{cost.payment_method || "—"}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteCost(cost)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* ── Cost Breakdown (Collapsible) ── */}
          {Object.keys(costSummary.byCategory).length > 0 && (
            <Collapsible open={showCostBreakdown} onOpenChange={setShowCostBreakdown}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between text-sm font-bold">
                  📊 توزيع التكاليف حسب النوع
                  {showCostBreakdown ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <div className="rounded-xl bg-card border border-border p-4 space-y-2">
                  {Object.entries(costSummary.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => {
                    const pct = costSummary.total > 0 ? (amount / costSummary.total * 100) : 0;
                    const catInfo = COST_CATEGORIES.find(cc => cc.value === cat) || COST_TYPES.find(ct => ct.value === cat) || { icon: "📦", label: cat };
                    return (
                      <div key={cat} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span>{catInfo.icon} {catInfo.label}</span>
                          <span className="tabular-nums font-medium">{Math.round(pct)}% — {amount.toLocaleString()} ₪</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {Object.keys(costSummary.byPhase).length > 0 && (
                  <div className="rounded-xl bg-card border border-border p-4 space-y-2">
                    <h4 className="text-xs font-bold text-foreground">🏗️ التكاليف حسب مراحل العمل</h4>
                    <div className="flex flex-wrap gap-2">
                      {PHASES.map(p => {
                        const amt = costSummary.byPhase[p.value] || 0;
                        if (amt === 0) return null;
                        return (
                          <div key={p.value} className="rounded-lg bg-accent/5 border border-border px-3 py-2 text-center">
                            <p className="text-[10px] text-muted-foreground">{p.label}</p>
                            <p className="text-sm font-bold text-foreground tabular-nums">{amt.toLocaleString()} ₪</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        {/* ── New Cost Modal ── */}
        <WorkshopCostModal
          open={showNewCost} onOpenChange={setShowNewCost}
          workshopId={selectedWorkshop.id} workshopName={selectedWorkshop.name}
          userId={user!.id} contacts={contacts}
          onSaved={() => loadCosts(selectedWorkshop.id)} onContactsReload={loadContacts}
        />

        {/* ── Cost Report Modal ── */}
        <WorkshopCostReport
          open={showCostReport} onOpenChange={setShowCostReport}
          workshopName={selectedWorkshop.name} customerName={selectedWorkshop.customer_name || "—"}
          budget={selectedWorkshop.total_budget} costs={costs} totalPaid={totalPaid}
        />

        {/* ── Invoice/Complete Dialog ── */}
        <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>💰 فوترة الورشة وإكمالها</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="p-3 rounded-lg bg-accent/5 border border-border space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">إجمالي التكاليف</span>
                  <span className="font-bold text-destructive">{costSummary.total.toLocaleString()} ₪</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">الميزانية</span>
                  <span className="font-bold text-foreground">{selectedWorkshop.total_budget.toLocaleString()} ₪</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label>مبلغ الفاتورة (₪)</Label>
                <Input type="number" value={invoiceForm.amount || ""} onChange={e => setInvoiceForm(f => ({ ...f, amount: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>طريقة الدفع</Label>
                <div className="flex gap-1">
                  {["نقدي", "بنك", "آجل"].map(m => (
                    <button key={m} onClick={() => setInvoiceForm(f => ({ ...f, payment_method: m }))}
                      className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-all ${
                        invoiceForm.payment_method === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      }`}>{m}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>وصف</Label>
                <Input value={invoiceForm.description} onChange={e => setInvoiceForm(f => ({ ...f, description: e.target.value }))}
                  placeholder={`إيرادات ورشة ${selectedWorkshop.name}`} />
              </div>
              {invoiceForm.amount > 0 && (
                <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-center">
                  <p className="text-xs text-muted-foreground">الربح الصافي</p>
                  <p className={`text-lg font-bold ${(invoiceForm.amount - costSummary.total) >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                    {(invoiceForm.amount - costSummary.total).toLocaleString()} ₪
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowInvoiceDialog(false)}>إلغاء</Button>
              <Button onClick={handleInvoiceWorkshop} disabled={invoiceForm.amount <= 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white">تأكيد الفوترة</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Financial Claim Modal ── */}
        <FinancialClaimModal
          open={showClaimModal}
          onOpenChange={setShowClaimModal}
          project={{
            id: selectedWorkshop.id,
            name: selectedWorkshop.name,
            client_name: selectedWorkshop.customer_name,
            phone: selectedWorkshop.customer_phone,
            address: selectedWorkshop.address,
            budget: selectedWorkshop.total_budget,
            total_expenses: costSummary.total,
            total_receipts: totalPaid,
          }}
          userId={user!.id}
          companyName={settings.company_name || "الشركة"}
          companyPhone={settings.phone || ""}
          companyAddress={settings.address || ""}
          companyEmail={settings.email || ""}
          logoUrl={settings.logo_url || ""}
        />

        {/* ── Payment Dialog ── */}
        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>💵 تسجيل دفعة من الزبون</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="p-3 rounded-lg bg-accent/5 border border-border space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">الميزانية</span><span className="font-bold">{selectedWorkshop?.total_budget?.toLocaleString()} ₪</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">المدفوع سابقاً</span><span className="font-bold text-emerald-500">{totalPaid.toLocaleString()} ₪</span></div>
                <div className="flex justify-between border-t border-border pt-1"><span className="text-muted-foreground">المتبقي</span><span className="font-bold text-amber-600">{((selectedWorkshop?.total_budget || 0) - totalPaid).toLocaleString()} ₪</span></div>
              </div>

              {/* Amount + Currency */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label>مبلغ الدفعة</Label>
                  <Input type="number" value={paymentForm.amount || ""} onChange={e => setPaymentForm(f => ({ ...f, amount: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label>العملة</Label>
                  <select
                    value={paymentForm.currency}
                    onChange={e => {
                      const code = e.target.value;
                      const cur = currencies.find(c => c.code === code);
                      setPaymentForm(f => ({ ...f, currency: code, exchange_rate: code === "ILS" ? 1 : (cur?.sell_rate || 1) }));
                    }}
                    className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
                  >
                    <option value="ILS">₪ شيكل</option>
                    {currencies.filter(c => c.code !== "ILS").map(c => (
                      <option key={c.code} value={c.code}>{c.code} {c.name_ar}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Exchange rate */}
              {paymentForm.currency !== "ILS" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">سعر الصرف</Label>
                    <Input type="number" step="0.01" value={paymentForm.exchange_rate || ""} onChange={e => setPaymentForm(f => ({ ...f, exchange_rate: Number(e.target.value) }))} dir="ltr" className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">المعادل بالشيكل</Label>
                    <div className="flex items-center h-10 px-3 rounded-lg border border-border bg-muted/30 text-sm font-bold">
                      {(paymentForm.amount * paymentForm.exchange_rate).toLocaleString()} ₪
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label>طريقة الدفع</Label>
                <div className="flex gap-1">
                  {["نقدي", "بنك", "شيك"].map(m => (
                    <button key={m} onClick={() => setPaymentForm(f => ({ ...f, payment_method: m }))}
                      className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-all ${
                        paymentForm.payment_method === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      }`}>{m}</button>
                  ))}
                </div>
              </div>

              {/* Cheque fields */}
              {paymentForm.payment_method === "شيك" && (
                <div className="space-y-3 p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-primary">بيانات الشيكات الواردة</p>
                    <div className="flex items-center gap-2">
                      <Label className="text-[10px] text-muted-foreground">عدد الشيكات:</Label>
                      <Input type="number" min={1} max={24} value={paymentForm.cheque_count}
                        onChange={e => {
                          const count = Math.max(1, Number(e.target.value));
                          setPaymentForm(f => ({ ...f, cheque_count: count }));
                          setChequeRows(generateChequeRows(count, paymentForm.amount, chequeRows[0]?.number || "", chequeRows[0]?.date || format(new Date(), "yyyy-MM-dd"), selectedWorkshop?.customer_name || "", paymentForm.cheque_bank));
                        }}
                        className="w-14 h-7 text-xs text-center" dir="ltr" />
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => {
                        setChequeRows(generateChequeRows(paymentForm.cheque_count, paymentForm.amount, chequeRows[0]?.number || "1001", chequeRows[0]?.date || format(new Date(), "yyyy-MM-dd"), selectedWorkshop?.customer_name || "", paymentForm.cheque_bank));
                      }}>توليد تلقائي</Button>
                    </div>
                  </div>

                  {/* Editable cheque rows table */}
                  {chequeRows.length > 0 && (
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground border-b border-border">
                            <th className="text-right py-1 px-1 font-medium">#</th>
                            <th className="text-right py-1 px-1 font-medium">رقم الشيك</th>
                            <th className="text-right py-1 px-1 font-medium">الساحب</th>
                            <th className="text-right py-1 px-1 font-medium">البنك</th>
                            <th className="text-right py-1 px-1 font-medium">تاريخ الاستحقاق</th>
                            <th className="text-right py-1 px-1 font-medium">المبلغ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chequeRows.map((row, i) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="py-1 px-1 text-muted-foreground">{i + 1}</td>
                              <td className="py-1 px-1">
                                <Input value={row.number} onChange={e => updateChequeRow(i, "number", e.target.value)}
                                  className="h-7 text-xs w-20" dir="ltr" />
                              </td>
                              <td className="py-1 px-1">
                                <Input value={row.drawer} onChange={e => updateChequeRow(i, "drawer", e.target.value)}
                                  className="h-7 text-xs w-28" />
                              </td>
                              <td className="py-1 px-1">
                                <Input value={row.bank} onChange={e => updateChequeRow(i, "bank", e.target.value)}
                                  className="h-7 text-xs w-24" />
                              </td>
                              <td className="py-1 px-1">
                                <Input type="date" value={row.date} onChange={e => updateChequeRow(i, "date", e.target.value)}
                                  className="h-7 text-xs w-32" />
                              </td>
                              <td className="py-1 px-1">
                                <Input type="number" value={row.amount} onChange={e => updateChequeRow(i, "amount", Number(e.target.value))}
                                  className="h-7 text-xs w-24" dir="ltr" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="font-bold text-xs">
                            <td colSpan={5} className="py-1 px-1 text-left">المجموع</td>
                            <td className="py-1 px-1 text-primary" dir="ltr">{chequeRows.reduce((s, r) => s + r.amount, 0).toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {chequeRows.length === 0 && (
                    <div className="text-center py-3">
                      <p className="text-[10px] text-muted-foreground">اضغط "توليد تلقائي" لإنشاء صفوف الشيكات</p>
                    </div>
                  )}

                  {bankAccounts.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">إيداع في حساب بنكي (اختياري)</Label>
                      <select
                        value={paymentForm.deposit_bank_id || ""}
                        onChange={e => setPaymentForm(f => ({ ...f, deposit_bank_id: e.target.value || null }))}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">-- بدون إيداع فوري --</option>
                        {bankAccounts.map(b => (
                          <option key={b.id} value={b.id}>{b.name} — {b.bank_name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <Label>التاريخ</Label>
                <Input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>ملاحظات</Label>
                <Input value={paymentForm.description} onChange={e => setPaymentForm(f => ({ ...f, description: e.target.value }))} placeholder="مثل: دفعة أولى 50%" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowPaymentDialog(false)}>إلغاء</Button>
              <Button onClick={handleAddPayment} disabled={paymentForm.amount <= 0 || (paymentForm.payment_method === "شيك" && chequeRows.length === 0)}>تسجيل الدفعة</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  /* ════════════════════════════════════════════ */
  /* ── Reports View ── */
  /* ════════════════════════════════════════════ */
  if (view === "reports") {
    const totalBudget = workshops.reduce((s, w) => s + (w.total_budget || 0), 0);
    const exportWorkshopsExcel = () => {
      const data = workshops.map(w => ({
        "الورشة": w.name, "الزبون": w.customer_name || "", "الحالة": STATUS_MAP[w.status]?.label || w.status,
        "الميزانية": w.total_budget, "تاريخ البدء": w.start_date || "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الورشات");
      XLSX.writeFile(wb, "workshops-report.xlsx");
    };

    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5" dir="rtl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setView("workshops")}><ArrowRight className="h-5 w-5" /></Button>
            <h1 className="text-xl font-bold text-foreground">📊 تقارير الورشات</h1>
          </div>
          <Button variant="outline" size="sm" onClick={exportWorkshopsExcel}><Download className="h-4 w-4 ml-1" /> تصدير Excel</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">إجمالي الورشات</p><p className="text-xl font-bold text-foreground">{workshops.length}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">إجمالي الميزانيات</p><p className="text-xl font-bold text-primary">{totalBudget.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">نشطة</p><p className="text-xl font-bold text-emerald-600">{workshops.filter(w => w.status === "active").length}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">مكتملة</p><p className="text-xl font-bold text-muted-foreground">{workshops.filter(w => w.status === "completed").length}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">ملخص الورشات</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الورشة</TableHead>
                  <TableHead className="text-right">الزبون</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">الميزانية</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">تاريخ البدء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workshops.map(w => (
                  <TableRow key={w.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedWorkshop(w); setView("workshops"); }}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-muted-foreground">{w.customer_name || "—"}</TableCell>
                    <TableCell className="text-xs">{(w.workshop_type || "").split(",").filter(Boolean).map(t => WORKSHOP_TYPES.find(x => x.value === t)?.label || t).join(", ")}</TableCell>
                    <TableCell>{(w.total_budget || 0).toLocaleString()} ₪</TableCell>
                    <TableCell><Badge variant={STATUS_MAP[w.status]?.variant || "outline"}>{STATUS_MAP[w.status]?.label || w.status}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{w.start_date ? format(new Date(w.start_date), "dd/MM/yyyy") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ════════════════════════════════════════════ */
  /* ── Workshops List View ── */
  /* ════════════════════════════════════════════ */
  const totalBudgetAll = workshops.reduce((s, w) => s + (w.total_budget || 0), 0);

  return (
    <div className="min-h-full bg-background pb-24" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-2xl font-bold text-foreground">🪵 إدارة الورشات والمناجر</h1>
              <p className="text-sm text-muted-foreground">إدارة ورشات العمل وتتبع التكاليف — مرتبط بالمحاسبة</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setView("reports")}><BarChart3 className="h-4 w-4 ml-1" /> التقارير</Button>
            <Button onClick={() => setShowNewWorkshop(true)} className="gap-2"><Plus className="h-4 w-4" /> ورشة جديدة</Button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">الورشات</p><p className="text-2xl font-bold text-foreground">{workshops.length}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">إجمالي الميزانيات</p><p className="text-2xl font-bold text-primary">{totalBudgetAll.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">نشطة</p><p className="text-2xl font-bold text-emerald-600">{workshops.filter(w => w.status === "active").length}</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">مكتملة</p><p className="text-2xl font-bold text-muted-foreground">{workshops.filter(w => w.status === "completed").length}</p></CardContent></Card>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="pr-9" />
          </div>
          <div className="flex gap-1">
            {[{ v: "all", l: "الكل" }, { v: "active", l: "نشطة" }, { v: "completed", l: "مكتملة" }, { v: "paused", l: "متوقفة" }].map(f => (
              <button key={f.v} onClick={() => setStatusFilter(f.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  statusFilter === f.v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent/5"
                }`}>{f.l}</button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">جاري التحميل...</div>
        ) : filteredWorkshops.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Hammer className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">لا توجد ورشات</p>
            <p className="text-xs mt-1">أنشئ أول ورشة لبدء تتبع التكاليف</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredWorkshops.map((ws, idx) => {
              const status = STATUS_MAP[ws.status] || STATUS_MAP.active;
              return (
                <motion.div key={ws.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => openWorkshop(ws)}
                  className="rounded-2xl bg-card border border-border p-4 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0" onClick={() => openWorkshop(ws)}>
                      <h3 className="font-bold text-foreground">{ws.name}</h3>
                      <p className="text-xs text-muted-foreground">{ws.customer_name || "بدون زبون"}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3.5 w-3.5" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); openEditWorkshop(ws); }}>
                            <Edit className="h-3.5 w-3.5 ml-2" /> تعديل
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={e => { e.stopPropagation(); setDeletingWorkshop(ws); setShowDeleteConfirm(true); }}>
                            <Trash2 className="h-3.5 w-3.5 ml-2" /> حذف
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">الميزانية: <strong className="text-foreground">{ws.total_budget?.toLocaleString()} ₪</strong></span>
                    {ws.start_date && <span className="text-muted-foreground/60">{format(new Date(ws.start_date), "dd/MM/yyyy")}</span>}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── New Workshop Dialog ── */}
      <Dialog open={showNewWorkshop} onOpenChange={setShowNewWorkshop}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>ورشة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>اسم الورشة *</Label>
              <Input value={wsForm.name} onChange={e => setWsForm(f => ({ ...f, name: e.target.value }))} placeholder="مثل: مطبخ أحمد العلي" />
            </div>

            {/* Customer picker */}
            <div className="space-y-1">
              <Label>الزبون (من الجهات)</Label>
              {wsForm.contact_id ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/5 border border-border">
                  <span className="text-sm flex-1 text-foreground">
                    {contacts.find(c => c.id === wsForm.contact_id)?.contact_name || wsForm.customer_name}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => {
                    setWsForm(f => ({ ...f, contact_id: null, customer_name: "" }));
                  }}>✕</Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={contactSearch} onChange={e => { setContactSearch(e.target.value); setShowContactPicker(true); }}
                      onFocus={() => setShowContactPicker(true)}
                      placeholder="ابحث عن زبون..." className="pr-8 h-9 text-sm" />
                  </div>
                  {showContactPicker && contactSearch && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-card">
                      {filteredCustomers.slice(0, 5).map(c => (
                        <button key={c.id} onClick={() => {
                          setWsForm(f => ({ ...f, contact_id: c.id, customer_name: c.contact_name }));
                          setShowContactPicker(false); setContactSearch("");
                        }} className="w-full text-right px-3 py-1.5 text-sm hover:bg-accent/10 text-foreground">
                          {c.contact_name}
                          <span className="text-[10px] text-muted-foreground mr-2">({c.current_balance.toLocaleString()} ₪)</span>
                        </button>
                      ))}
                      {filteredCustomers.length === 0 && contactSearch.trim().length > 1 && (
                        <button onClick={async () => {
                          const name = contactSearch.trim();
                          const { data, error } = await supabase.from("contacts").upsert(
                            { contact_name: name, contact_type: "عميل", user_id: user!.id, current_balance: 0 },
                            { onConflict: "contact_name,user_id" }
                          ).select().single();
                          if (error) { toast.error("خطأ في إضافة الزبون"); return; }
                          toast.success(`تم إضافة الزبون "${name}"`);
                          setWsForm(f => ({ ...f, contact_id: data.id, customer_name: data.contact_name }));
                          setShowContactPicker(false); setContactSearch("");
                          loadContacts();
                        }} className="w-full text-right px-3 py-2 text-sm hover:bg-primary/10 text-primary font-medium flex items-center gap-2">
                          <UserPlus className="h-3.5 w-3.5" />
                          إضافة زبون جديد "{contactSearch.trim()}"
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Workshop Type - Multi Select */}
            <div className="space-y-1">
              <Label>نوع الورشة</Label>
              <div className="grid grid-cols-3 gap-2">
                {WORKSHOP_TYPES.map(wt => {
                  const selected = wsForm.workshop_type.split(",").filter(Boolean).includes(wt.value);
                  return (
                    <button key={wt.value} onClick={() => toggleWorkshopType(wt.value)}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        selected ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border hover:bg-accent/5"
                      }`}>
                      <span className="text-xl block">{wt.icon}</span>
                      <span className="text-[10px] font-medium text-foreground">{wt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>اسم الزبون (يدوي)</Label>
                <Input value={wsForm.customer_name} onChange={e => setWsForm(f => ({ ...f, customer_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>رقم الهاتف</Label>
                <Input value={wsForm.customer_phone} onChange={e => setWsForm(f => ({ ...f, customer_phone: e.target.value }))} dir="ltr" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input value={wsForm.address} onChange={e => setWsForm(f => ({ ...f, address: e.target.value }))} placeholder="المدينة / الحي" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>الميزانية (₪)</Label>
                <Input type="number" value={wsForm.total_budget || ""} onChange={e => setWsForm(f => ({ ...f, total_budget: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>المساحة (م²)</Label>
                <Input type="number" value={wsForm.area_sqm || ""} onChange={e => setWsForm(f => ({ ...f, area_sqm: Number(e.target.value) }))} placeholder="مثال: 12" />
              </div>
              <div className="space-y-1">
                <Label>تاريخ البدء</Label>
                <Input type="date" value={wsForm.start_date} onChange={e => setWsForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>صورة الورشة (اختياري)</Label>
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary/50 cursor-pointer transition-all">
                  <Image className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{uploadingImage ? "جاري الرفع..." : wsForm.image_url ? "تغيير الصورة" : "اختر صورة"}</span>
                  <input type="file" accept="image/*" className="hidden" disabled={uploadingImage}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
                </label>
                {wsForm.image_url && <img src={wsForm.image_url} alt="" className="h-10 w-10 rounded-lg object-cover border" />}
              </div>
            </div>
            <div className="space-y-1">
              <Label>وصف / ملاحظات</Label>
              <Textarea value={wsForm.description} onChange={e => setWsForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="مثل: مطبخ ألمنيوم 3×4 لون أبيض..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewWorkshop(false)}>إلغاء</Button>
            <Button onClick={handleCreateWorkshop}>إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Workshop Dialog ── */}
      <Dialog open={showEditWorkshop} onOpenChange={v => { if (!v) { setShowEditWorkshop(false); setEditingWorkshop(null); setWsForm(defaultWsForm()); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل الورشة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>اسم الورشة *</Label>
              <Input value={wsForm.name} onChange={e => setWsForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>نوع الورشة</Label>
              <div className="grid grid-cols-3 gap-2">
                {WORKSHOP_TYPES.map(wt => {
                  const selected = wsForm.workshop_type.split(",").filter(Boolean).includes(wt.value);
                  return (
                    <button key={wt.value} onClick={() => toggleWorkshopType(wt.value)}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        selected ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border hover:bg-accent/5"
                      }`}>
                      <span className="text-xl block">{wt.icon}</span>
                      <span className="text-[10px] font-medium text-foreground">{wt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>اسم الزبون</Label>
                <Input value={wsForm.customer_name} onChange={e => setWsForm(f => ({ ...f, customer_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>رقم الهاتف</Label>
                <Input value={wsForm.customer_phone} onChange={e => setWsForm(f => ({ ...f, customer_phone: e.target.value }))} dir="ltr" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input value={wsForm.address} onChange={e => setWsForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>الميزانية (₪)</Label>
                <Input type="number" value={wsForm.total_budget || ""} onChange={e => setWsForm(f => ({ ...f, total_budget: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>المساحة (م²)</Label>
                <Input type="number" value={wsForm.area_sqm || ""} onChange={e => setWsForm(f => ({ ...f, area_sqm: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>تاريخ البدء</Label>
                <Input type="date" value={wsForm.start_date} onChange={e => setWsForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>صورة الورشة</Label>
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary/50 cursor-pointer transition-all">
                  <Image className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{uploadingImage ? "جاري الرفع..." : wsForm.image_url ? "تغيير الصورة" : "اختر صورة"}</span>
                  <input type="file" accept="image/*" className="hidden" disabled={uploadingImage}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
                </label>
                {wsForm.image_url && <img src={wsForm.image_url} alt="" className="h-10 w-10 rounded-lg object-cover border" />}
              </div>
            </div>
            <div className="space-y-1">
              <Label>وصف / ملاحظات</Label>
              <Textarea value={wsForm.description} onChange={e => setWsForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowEditWorkshop(false); setEditingWorkshop(null); setWsForm(defaultWsForm()); }}>إلغاء</Button>
            <Button onClick={handleEditWorkshop}>حفظ التعديلات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الورشة "{deletingWorkshop?.name}"؟</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-right">
              <p>سيتم حذف الورشة وجميع البيانات المرتبطة بها بشكل نهائي:</p>
              <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                <li>جميع تكاليف الورشة (خشب، دهان، عمال، إلخ)</li>
                <li>جميع الدفعات المقبوضة من الزبون</li>
                <li>جميع القيود المحاسبية المرتبطة (سيتم إلغاؤها من دفتر اليومية)</li>
                <li>سندات القبض والصرف المرتبطة بالورشة</li>
              </ul>
              <p className="text-destructive font-medium text-xs mt-2">⚠️ هذا الإجراء لا يمكن التراجع عنه</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingWorkshop && handleDeleteWorkshop(deletingWorkshop)}>
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Claim modal removed — now inside detail view */}
    </div>
  );
}
