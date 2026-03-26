import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus, Search, Hammer, Trash2, ArrowLeft, Edit, MoreVertical,
  DollarSign, ChevronDown, UserPlus, Image, AlertTriangle, Receipt,
} from "lucide-react";
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
  const [showNewCost, setShowNewCost] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

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
    cheque_number: "", cheque_bank: "", cheque_date: format(new Date(), "yyyy-MM-dd"),
    cheque_drawer: "", deposit_bank_id: null as string | null,
    currency: "ILS", exchange_rate: 1, cheque_count: 1,
  });
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; bank_name: string; gl_account_code: string | null }[]>([]);
  const [currencies, setCurrencies] = useState<{ code: string; name_ar: string; sell_rate: number }[]>([]);
  const [costForm, setCostForm] = useState({
    cost_type: "wood", description: "", amount: 0, cost_date: format(new Date(), "yyyy-MM-dd"),
    supplier_name: "", payment_method: "نقدي", notes: "",
    supplier_contact_id: null as string | null,
  });
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

  /* ── Add Partial Payment ── */
  const handleAddPayment = async () => {
    if (!selectedWorkshop || paymentForm.amount <= 0) { toast.error("المبلغ مطلوب"); return; }
    const isCheque = paymentForm.payment_method === "شيك";
    const chequeCount = isCheque ? Math.max(1, paymentForm.cheque_count) : 0;

    if (isCheque && !paymentForm.cheque_number.trim()) { toast.error("رقم الشيك مطلوب"); return; }

    const amountILS = paymentForm.currency !== "ILS" ? paymentForm.amount * paymentForm.exchange_rate : paymentForm.amount;
    const currencyLabel = paymentForm.currency === "ILS" ? "شيكل" : paymentForm.currency === "USD" ? "دولار" : paymentForm.currency === "JOD" ? "دينار" : paymentForm.currency;

    // GL: cheque → 1150, bank → 1120, cash → 1110
    const debitCode = isCheque ? "1150" : paymentForm.payment_method === "بنك" ? "1120" : "1110";
    const idempotencyKey = `WS-PAY-${selectedWorkshop.id}-${Date.now()}`;

    const { data: txData, error: txError } = await supabase.from("transactions").insert({
      user_id: user!.id,
      transaction_date: paymentForm.payment_date,
      description: paymentForm.description || `دفعة من ${selectedWorkshop.customer_name || "زبون"} - ورشة ${selectedWorkshop.name}${isCheque ? ` (${chequeCount} شيك)` : ""}`,
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

    // Create cheque records (batch)
    if (isCheque) {
      const perChequeAmount = paymentForm.amount / chequeCount;
      const baseNum = parseInt(paymentForm.cheque_number) || 0;
      const chequeInserts = [];

      for (let i = 0; i < chequeCount; i++) {
        const chequeNum = baseNum > 0 ? String(baseNum + i) : `${paymentForm.cheque_number}${chequeCount > 1 ? `-${i + 1}` : ""}`;
        // Add months to cheque_date for sequential cheques
        const dueDate = new Date(paymentForm.cheque_date);
        if (i > 0) dueDate.setMonth(dueDate.getMonth() + i);

        chequeInserts.push({
          user_id: user!.id,
          cheque_type: "incoming" as any,
          cheque_number: chequeNum,
          party_name: paymentForm.cheque_drawer || selectedWorkshop.customer_name || "زبون",
          party_type: "customer",
          contact_id: selectedWorkshop.contact_id || null,
          amount: perChequeAmount,
          cheque_date: format(dueDate, "yyyy-MM-dd"),
          bank_name: paymentForm.cheque_bank || null,
          status: "registered" as any,
          currency: paymentForm.currency,
          linked_transaction_id: txData?.id || null,
          linked_account: "1150",
          deposit_bank_account_id: paymentForm.deposit_bank_id || null,
          notes: `دفعة ورشة: ${selectedWorkshop.name}${chequeCount > 1 ? ` (${i + 1}/${chequeCount})` : ""}`,
        });
      }

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
    toast.success(isCheque ? `✅ تم تسجيل ${chequeCount} شيك وارد بنجاح` : "✅ تم تسجيل الدفعة بنجاح");
    setShowPaymentDialog(false);
    setPaymentForm({ amount: 0, payment_method: "نقدي", description: "", payment_date: format(new Date(), "yyyy-MM-dd"), cheque_number: "", cheque_bank: "", cheque_date: format(new Date(), "yyyy-MM-dd"), cheque_drawer: "", deposit_bank_id: null, currency: "ILS", exchange_rate: 1, cheque_count: 1 });
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
    let total = 0;
    costs.forEach(c => { summary[c.cost_type] = (summary[c.cost_type] || 0) + c.amount; total += c.amount; });
    return { byType: summary, total };
  }, [costs]);

  const totalPaid = useMemo(() => payments.reduce((s, p) => s + p.amount, 0), [payments]);

  const budgetUsedPct = useMemo(() => {
    if (!selectedWorkshop || !selectedWorkshop.total_budget) return 0;
    return (costSummary.total / selectedWorkshop.total_budget) * 100;
  }, [selectedWorkshop, costSummary.total]);

  const filteredCustomers = useMemo(() =>
    contacts.filter(c => ["customer", "عميل", "both", "كلاهما"].includes(c.contact_type) && (!contactSearch || c.contact_name.toLowerCase().includes(contactSearch.toLowerCase())))
  , [contacts, contactSearch]);

  const filteredSuppliers = useMemo(() =>
    contacts.filter(c => ["supplier", "مورد", "both", "كلاهما"].includes(c.contact_type) && (!supplierSearch || c.contact_name.toLowerCase().includes(supplierSearch.toLowerCase())))
  , [contacts, supplierSearch]);

  /* ════════════════════════════════════════════ */
  /* ── Workshop Detail View ── */
  /* ════════════════════════════════════════════ */
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
                {customerContact && (
                  <Badge variant="outline" className="text-[9px]">
                    رصيد: {customerContact.current_balance.toLocaleString()} ₪
                  </Badge>
                )}
              </div>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => openEditWorkshop(selectedWorkshop)}>
                  <Edit className="h-3.5 w-3.5 ml-2" /> تعديل الورشة
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => { setDeletingWorkshop(selectedWorkshop); setShowDeleteConfirm(true); }}>
                  <Trash2 className="h-3.5 w-3.5 ml-2" /> حذف الورشة
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "الميزانية", value: `${selectedWorkshop.total_budget?.toLocaleString()} ₪`, cls: "text-foreground" },
              { label: "إجمالي التكاليف", value: `${costSummary.total.toLocaleString()} ₪`, cls: "text-destructive" },
              { label: "المقبوض", value: `${totalPaid.toLocaleString()} ₪`, cls: "text-emerald-500" },
              { label: "المتبقي على الزبون", value: `${(selectedWorkshop.total_budget - totalPaid).toLocaleString()} ₪`, cls: (selectedWorkshop.total_budget - totalPaid) > 0 ? "text-amber-600" : "text-emerald-500" },
              { label: "الربح", value: `${(selectedWorkshop.total_budget - costSummary.total).toLocaleString()} ₪`, cls: (selectedWorkshop.total_budget - costSummary.total) >= 0 ? "text-emerald-500" : "text-destructive" },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-xl bg-card border border-border p-3 text-center">
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                <p className={`text-base font-bold ${kpi.cls}`}>{kpi.value}</p>
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
                setPaymentForm({ amount: 0, payment_method: "نقدي", description: "", payment_date: format(new Date(), "yyyy-MM-dd"), cheque_number: "", cheque_bank: "", cheque_date: format(new Date(), "yyyy-MM-dd"), cheque_drawer: "", deposit_bank_id: null, currency: "ILS", exchange_rate: 1, cheque_count: 1 });
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
                    <span className="text-emerald-500 font-bold">+{p.amount.toLocaleString()} ₪</span>
                    <span className="text-muted-foreground">{p.payment_method}</span>
                    <span className="flex-1 text-muted-foreground truncate">{p.description}</span>
                    <span className="text-muted-foreground/60">{p.payment_date}</span>
                  </div>
                ))}
                {/* Progress bar for payments */}
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

          {/* Cost breakdown */}
          {Object.keys(costSummary.byType).length > 0 && (
            <div className="rounded-xl bg-card border border-border p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground">تفصيل التكاليف (مرتبط بالقيود المحاسبية)</h3>
              <div className="space-y-2">
                {COST_TYPES.filter(ct => costSummary.byType[ct.value]).map(ct => {
                  const amount = costSummary.byType[ct.value];
                  const pct = costSummary.total > 0 ? (amount / costSummary.total * 100) : 0;
                  const acct = COST_ACCOUNT_MAP[ct.value];
                  return (
                    <div key={ct.value} className="flex items-center gap-3">
                      <span className="text-lg w-8 text-center">{ct.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-foreground">{ct.label}</span>
                        <span className="text-[10px] text-muted-foreground mr-2">({acct?.debit})</span>
                      </div>
                      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-bold text-foreground w-24 text-left tabular-nums">{amount.toLocaleString()} ₪</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          {selectedWorkshop.status === "active" && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(selectedWorkshop, "paused")} className="flex-1">⏸️ إيقاف</Button>
              <Button size="sm" onClick={() => {
                setInvoiceForm({ amount: selectedWorkshop.total_budget - totalPaid, payment_method: "آجل", description: "" });
                setShowInvoiceDialog(true);
              }} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">💰 فوترة واكتمال</Button>
            </div>
          )}
          {selectedWorkshop.status === "paused" && (
            <Button size="sm" onClick={() => handleUpdateStatus(selectedWorkshop, "active")} className="w-full">▶️ استئناف</Button>
          )}

          {/* Add cost */}
          <Button onClick={() => setShowNewCost(true)} className="w-full gap-2">
            <Plus className="h-4 w-4" /> إضافة تكلفة (مع قيد محاسبي)
          </Button>

          {/* Costs list */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground">سجل التكاليف</h3>
            {loadingCosts ? (
              <p className="text-sm text-muted-foreground text-center py-8">جاري التحميل...</p>
            ) : costs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد تكاليف مسجلة بعد</p>
              </div>
            ) : (
              <div className="space-y-2">
                {costs.map(cost => {
                  const ct = getCostType(cost.cost_type);
                  const acct = COST_ACCOUNT_MAP[cost.cost_type];
                  return (
                    <motion.div key={cost.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${ct.color}`}>{ct.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{ct.label}</p>
                          {cost.supplier_name && <span className="text-[10px] text-muted-foreground">— {cost.supplier_name}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{cost.description || cost.payment_method}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground/60">{format(new Date(cost.cost_date), "dd/MM/yyyy")}</span>
                          {cost.linked_transaction_id && (
                            <Badge variant="outline" className="text-[8px] h-4 px-1">قيد {acct?.debit}</Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-bold text-destructive tabular-nums">{cost.amount.toLocaleString()} ₪</p>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteCost(cost)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Add Cost Dialog ── */}
        <Dialog open={showNewCost} onOpenChange={setShowNewCost}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة تكلفة (مع قيد محاسبي تلقائي)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>نوع التكلفة</Label>
                <div className="grid grid-cols-3 gap-2">
                  {COST_TYPES.map(ct => (
                    <button key={ct.value} onClick={() => setCostForm(f => ({ ...f, cost_type: ct.value }))}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        costForm.cost_type === ct.value ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border hover:bg-accent/5"
                      }`}>
                      <span className="text-xl block">{ct.icon}</span>
                      <span className="text-[10px] font-medium text-foreground">{ct.label}</span>
                    </button>
                  ))}
                </div>
                {/* Show GL mapping */}
                <p className="text-[10px] text-muted-foreground text-center">
                  القيد: مدين {COST_ACCOUNT_MAP[costForm.cost_type]?.debit} ← دائن {PAYMENT_CREDIT_MAP[costForm.payment_method]}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>المبلغ (₪)</Label>
                  <Input type="number" value={costForm.amount || ""} onChange={e => setCostForm(f => ({ ...f, amount: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label>التاريخ</Label>
                  <Input type="date" value={costForm.cost_date} onChange={e => setCostForm(f => ({ ...f, cost_date: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>الوصف</Label>
                <Input value={costForm.description} onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))} placeholder="مثل: خشب سويدي 18مم" />
              </div>

              {/* Supplier picker */}
              <div className="space-y-1">
                <Label>المورد</Label>
                {costForm.supplier_contact_id ? (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/5 border border-border">
                    <span className="text-sm flex-1 text-foreground">
                      {contacts.find(c => c.id === costForm.supplier_contact_id)?.contact_name || costForm.supplier_name}
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => {
                      setCostForm(f => ({ ...f, supplier_contact_id: null, supplier_name: "" }));
                    }}>✕</Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="relative">
                      <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input value={supplierSearch} onChange={e => { setSupplierSearch(e.target.value); setShowSupplierPicker(true); }}
                        onFocus={() => setShowSupplierPicker(true)}
                        placeholder="ابحث عن مورد أو اكتب الاسم مباشرة..." className="pr-8 h-9 text-sm" />
                    </div>
                    {showSupplierPicker && supplierSearch && (
                      <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-card">
                        {filteredSuppliers.slice(0, 5).map(s => (
                          <button key={s.id} onClick={() => {
                            setCostForm(f => ({ ...f, supplier_contact_id: s.id, supplier_name: s.contact_name }));
                            setShowSupplierPicker(false); setSupplierSearch("");
                          }} className="w-full text-right px-3 py-1.5 text-sm hover:bg-accent/10 text-foreground">
                            {s.contact_name}
                          </button>
                        ))}
                        {filteredSuppliers.length === 0 && supplierSearch.trim().length > 1 && (
                          <button onClick={async () => {
                            const name = supplierSearch.trim();
                            const { data, error } = await supabase.from("contacts").upsert(
                              { contact_name: name, contact_type: "مورد", user_id: user!.id, current_balance: 0 },
                              { onConflict: "contact_name,user_id" }
                            ).select().single();
                            if (error) { toast.error("خطأ في إضافة المورد"); return; }
                            toast.success(`تم إضافة المورد "${name}"`);
                            setCostForm(f => ({ ...f, supplier_contact_id: data.id, supplier_name: data.contact_name }));
                            setShowSupplierPicker(false); setSupplierSearch("");
                            loadContacts();
                          }} className="w-full text-right px-3 py-2 text-sm hover:bg-primary/10 text-primary font-medium flex items-center gap-2">
                            <UserPlus className="h-3.5 w-3.5" />
                            إضافة مورد جديد "{supplierSearch.trim()}"
                          </button>
                        )}
                      </div>
                    )}
                    <Input value={costForm.supplier_name} onChange={e => setCostForm(f => ({ ...f, supplier_name: e.target.value }))}
                      placeholder="أو اكتب اسم المورد يدوياً" className="h-8 text-xs" />
                  </div>
                )}
              </div>

              {/* Payment method */}
              <div className="space-y-1">
                <Label>طريقة الدفع</Label>
                <div className="flex gap-1">
                  {["نقدي", "بنك", "آجل"].map(m => (
                    <button key={m} onClick={() => setCostForm(f => ({ ...f, payment_method: m }))}
                      className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-all ${
                        costForm.payment_method === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      }`}>{m}</button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowNewCost(false)}>إلغاء</Button>
              <Button onClick={handleAddCost} disabled={costForm.amount <= 0}>إضافة + قيد</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

        {/* ── Payment Dialog ── */}
        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>💵 تسجيل دفعة من الزبون</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="p-3 rounded-lg bg-accent/5 border border-border space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">الميزانية</span><span className="font-bold">{selectedWorkshop?.total_budget?.toLocaleString()} ₪</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">المدفوع سابقاً</span><span className="font-bold text-emerald-500">{totalPaid.toLocaleString()} ₪</span></div>
                <div className="flex justify-between border-t border-border pt-1"><span className="text-muted-foreground">المتبقي</span><span className="font-bold text-amber-600">{((selectedWorkshop?.total_budget || 0) - totalPaid).toLocaleString()} ₪</span></div>
              </div>
              <div className="space-y-1">
                <Label>مبلغ الدفعة (₪)</Label>
                <Input type="number" value={paymentForm.amount || ""} onChange={e => setPaymentForm(f => ({ ...f, amount: Number(e.target.value) }))} />
              </div>
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
                <div className="space-y-2 p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5">
                  <p className="text-xs font-bold text-primary">بيانات الشيك الوارد</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">رقم الشيك *</Label>
                      <Input value={paymentForm.cheque_number} onChange={e => setPaymentForm(f => ({ ...f, cheque_number: e.target.value }))} placeholder="مثال: 1234" dir="ltr" className="text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">اسم الساحب</Label>
                      <Input value={paymentForm.cheque_drawer} onChange={e => setPaymentForm(f => ({ ...f, cheque_drawer: e.target.value }))} placeholder={selectedWorkshop?.customer_name || "اسم صاحب الشيك"} className="text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">البنك المسحوب عليه</Label>
                      <Input value={paymentForm.cheque_bank} onChange={e => setPaymentForm(f => ({ ...f, cheque_bank: e.target.value }))} placeholder="مثال: بنك فلسطين" className="text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">تاريخ الاستحقاق</Label>
                      <Input type="date" value={paymentForm.cheque_date} onChange={e => setPaymentForm(f => ({ ...f, cheque_date: e.target.value }))} className="text-sm" />
                    </div>
                  </div>
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
              <Button onClick={handleAddPayment} disabled={paymentForm.amount <= 0 || (paymentForm.payment_method === "شيك" && !paymentForm.cheque_number.trim())}>تسجيل الدفعة</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  /* ════════════════════════════════════════════ */
  /* ── Workshops List View ── */
  /* ════════════════════════════════════════════ */
  return (
    <div className="min-h-full bg-background pb-24" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Tajawal, sans-serif" }}>🪵 الورشات</h1>
            <p className="text-sm text-muted-foreground">إدارة ورشات العمل وتتبع التكاليف — مرتبط بالمحاسبة</p>
          </div>
          <Button onClick={() => setShowNewWorkshop(true)} className="gap-2">
            <Plus className="h-4 w-4" /> ورشة جديدة
          </Button>
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
    </div>
  );
}
