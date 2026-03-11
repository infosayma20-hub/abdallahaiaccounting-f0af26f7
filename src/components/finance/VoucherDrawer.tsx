import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, Loader2, Plus, Trash2, AlertTriangle, Check,
  Receipt, Landmark, FileText, ArrowLeftRight, ArrowDown, ArrowUp,
  Search, User, Building2, Users, Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type VoucherType = "receipt" | "payment";

interface ChequeRow {
  id: string;
  number: string;
  due_date: string;
  amount: string;
}

interface VoucherDrawerProps {
  open: boolean;
  onClose: () => void;
  voucherType: VoucherType;
  onSaved: () => void;
  editVoucherId?: string | null;
}

const VoucherDrawer = ({ open, onClose, voucherType, onSaved, editVoucherId }: VoucherDrawerProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const isReceipt = voucherType === "receipt";

  // Data
  const [contacts, setContacts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Form
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formRefNumber, setFormRefNumber] = useState("");
  const [formContactId, setFormContactId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCurrency, setFormCurrency] = useState("ILS");
  const [formExchangeRate, setFormExchangeRate] = useState("1");
  const [formPaymentMethod, setFormPaymentMethod] = useState("cash");
  const [formCashAccountCode, setFormCashAccountCode] = useState("");
  const [formBankAccountId, setFormBankAccountId] = useState("");
  const [formTransferAccountCode, setFormTransferAccountCode] = useState("");
  const [formTransferRef, setFormTransferRef] = useState("");
  const [formChequeBankName, setFormChequeBankName] = useState("");
  const [formChequeDate, setFormChequeDate] = useState(new Date().toISOString().split("T")[0]);
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickType, setQuickType] = useState<string>(isReceipt ? "عميل" : "مورد");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);

  // Multi-cheque
  const [cheques, setCheques] = useState<ChequeRow[]>([
    { id: "1", number: "", due_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split("T")[0], amount: "" },
  ]);

  const fetchData = useCallback(async () => {
    if (!user || dataLoaded) return;
    const [cRes, aRes, bRes, vRes] = await Promise.all([
      supabase.from("contacts").select("id, contact_name, contact_type, current_balance").eq("user_id", user.id),
      supabase.from("accounts").select("account_code, account_name, account_type").eq("user_id", user.id).eq("is_active", true),
      supabase.from("bank_accounts").select("*").eq("user_id", user.id).eq("is_active", true),
      supabase.from("vouchers").select("ref_number").eq("user_id", user.id).eq("type", voucherType).order("created_at", { ascending: false }).limit(1),
    ]);
    setContacts(cRes.data || []);
    setAccounts(aRes.data || []);
    setBankAccounts(bRes.data || []);
    setDataLoaded(true);

    // Auto-generate next voucher number
    const prefix = isReceipt ? "RV" : "PV";
    const lastRef = (vRes.data || [])[0]?.ref_number || "";
    const match = lastRef.match(/(\d+)$/);
    const nextNum = match ? String(parseInt(match[1]) + 1).padStart(Math.max(match[1].length, 4), "0") : "0001";
    setFormRefNumber(`${prefix}-${new Date().getFullYear()}-${nextNum}`);

    // Auto-select single cash account
    const cashAccs = (aRes.data || []).filter((a: any) => a.account_code?.startsWith("111"));
    if (cashAccs.length === 1) setFormCashAccountCode(cashAccs[0].account_code);
  }, [user, dataLoaded, voucherType, isReceipt]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const resetForm = () => {
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormRefNumber("");
    setFormContactId("");
    setFormAmount("");
    setFormCurrency("ILS");
    setFormExchangeRate("1");
    setFormPaymentMethod("cash");
    setFormCashAccountCode("");
    setFormBankAccountId("");
    setFormTransferAccountCode("");
    setFormTransferRef("");
    setFormChequeBankName("");
    setFormChequeDate(new Date().toISOString().split("T")[0]);
    setFormDescription("");
    setFormNotes("");
    setContactSearch("");
    setCheques([{ id: "1", number: "", due_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split("T")[0], amount: "" }]);
    // Re-auto-select single cash account
    const cashAccs = accounts.filter(a => a.account_code?.startsWith("111"));
    if (cashAccs.length === 1) setFormCashAccountCode(cashAccs[0].account_code);
  };

  // Load existing voucher for editing
  const loadVoucherForEdit = useCallback(async (voucherId: string) => {
    const { data } = await supabase.from("vouchers").select("*").eq("id", voucherId).single();
    if (data) {
      setFormDate(data.date || new Date().toISOString().split("T")[0]);
      setFormRefNumber(data.ref_number || "");
      setFormContactId(data.contact_id || "");
      setFormAmount(String(data.amount || ""));
      setFormCurrency(data.currency || "ILS");
      setFormExchangeRate(String(data.exchange_rate || "1"));
      setFormPaymentMethod(data.payment_method || "cash");
      setFormBankAccountId(data.bank_account_id || "");
      setFormDescription(data.description || "");
      setFormNotes(data.notes || "");
      setFormChequeBankName(data.cheque_bank_name || "");
      if (data.cheque_due_date) setFormChequeDate(data.cheque_due_date);
    }
  }, []);

  useEffect(() => {
    if (open && editVoucherId) {
      loadVoucherForEdit(editVoucherId);
    } else if (open) {
      resetForm();
    }
  }, [open, editVoucherId]);

  // Derived
  const cashAccounts = useMemo(() => accounts.filter(a => a.account_code?.startsWith("111")), [accounts]);
  const selectedContact = contacts.find(c => c.id === formContactId);
  const selectedBank = bankAccounts.find(b => b.id === formBankAccountId);
  const amountNum = Number(formAmount) || 0;
  const rate = Number(formExchangeRate) || 1;
  const amountIls = formCurrency === "ILS" ? amountNum : amountNum * rate;

  // Helper to normalize contact types (handle both EN and AR values)
  const isCustomer = (c: any) => ["customer", "عميل", "زبون"].includes(c.contact_type);
  const isSupplier = (c: any) => ["supplier", "مورد"].includes(c.contact_type);
  const isEmployee = (c: any) => ["employee", "موظف"].includes(c.contact_type);

  // Grouped contacts
  const customers = useMemo(() => contacts.filter(isCustomer), [contacts]);
  const suppliers = useMemo(() => contacts.filter(isSupplier), [contacts]);
  const employees = useMemo(() => contacts.filter(isEmployee), [contacts]);
  const others = useMemo(() => contacts.filter(c => !isCustomer(c) && !isSupplier(c) && !isEmployee(c)), [contacts]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contacts;
    const q = contactSearch.toLowerCase();
    return contacts.filter(c => c.contact_name?.toLowerCase().includes(q));
  }, [contacts, contactSearch]);

  // Transfer accounts: banks + other financial accounts
  const transferAccounts = useMemo(() => {
    const bankOptions = bankAccounts.map(b => ({
      code: b.gl_account_code || "1120",
      label: `🏦 ${b.bank_name} — ${b.name}`,
      type: "bank" as const,
    }));
    const otherAccs = accounts.filter(a =>
      (a.account_type === "bank" || a.account_code?.startsWith("112") || a.account_code?.startsWith("113")) &&
      !bankOptions.some(bo => bo.code === a.account_code)
    ).map(a => ({
      code: a.account_code,
      label: `${a.account_code} — ${a.account_name}`,
      type: "other" as const,
    }));
    return [...bankOptions, ...otherAccs];
  }, [bankAccounts, accounts]);

  // Cheque total
  const chequeTotal = cheques.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const chequeTotalMatches = Math.abs(chequeTotal - amountNum) < 0.01;

  const addCheque = () => {
    const last = cheques[cheques.length - 1];
    const lastNum = last?.number;
    const newNumber = lastNum ? String(parseInt(lastNum) + 1).padStart(lastNum.length, "0") : "";
    const lastDate = last?.due_date;
    let newDate = "";
    if (lastDate) {
      const d = new Date(lastDate);
      d.setMonth(d.getMonth() + 1);
      newDate = d.toISOString().split("T")[0];
    }
    setCheques([...cheques, { id: String(Date.now()), number: newNumber, due_date: newDate, amount: "" }]);
  };

  const removeCheque = (id: string) => {
    if (cheques.length <= 1) return;
    setCheques(cheques.filter(c => c.id !== id));
  };

  const updateCheque = (id: string, field: keyof ChequeRow, value: string) => {
    setCheques(cheques.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  // Journal entry calculation
  const getJournalAccounts = () => {
    let debitCode = "", creditCode = "";
    if (isReceipt) {
      // Receipt: Dr = payment account, Cr = contact account (ذمم عملاء)
      switch (formPaymentMethod) {
        case "cash": debitCode = formCashAccountCode || "1110"; break;
        case "bank": debitCode = selectedBank?.gl_account_code || "1120"; break;
        case "cheque": debitCode = selectedBank?.incoming_checks_account_code || "1150"; break;
        case "transfer": debitCode = formTransferAccountCode || "1120"; break;
      }
      creditCode = isSupplier(selectedContact || {}) ? "2100" : isEmployee(selectedContact || {}) ? "1180" : "1130";
    } else {
      // Payment: Dr = contact account, Cr = payment account
      debitCode = isCustomer(selectedContact || {}) ? "1130" : isEmployee(selectedContact || {}) ? "1180" : "2100";
      switch (formPaymentMethod) {
        case "cash": creditCode = formCashAccountCode || "1110"; break;
        case "bank": creditCode = selectedBank?.gl_account_code || "1120"; break;
        case "cheque": creditCode = selectedBank?.outgoing_checks_account_code || "2110"; break;
        case "transfer": creditCode = formTransferAccountCode || "1120"; break;
      }
    }
    return { debitCode, creditCode };
  };

  const { debitCode, creditCode } = getJournalAccounts();
  const debitName = accounts.find(a => a.account_code === debitCode)?.account_name || debitCode;
  const creditName = accounts.find(a => a.account_code === creditCode)?.account_name || creditCode;

  const paymentMethods = [
    { value: "cash", label: "نقدي", icon: Receipt },
    { value: "bank", label: "بنك", icon: Landmark },
    { value: "cheque", label: "شيك", icon: FileText },
    { value: "transfer", label: "تحويل", icon: ArrowLeftRight },
  ];

  const formatAmount = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const handleSave = async (status: "draft" | "posted") => {
    if (!user) return;
    if (!formDescription.trim()) { toast({ title: "خطأ", description: "البيان مطلوب", variant: "destructive" }); return; }
    if (amountNum <= 0) { toast({ title: "خطأ", description: "أدخل مبلغاً صحيحاً", variant: "destructive" }); return; }

    setSaving(true);

    const voucherPayload = {
      user_id: user.id,
      type: voucherType,
      ref_number: formRefNumber || "",
      date: formDate,
      contact_id: formContactId || null,
      payment_method: formPaymentMethod,
      bank_account_id: formBankAccountId || null,
      amount: amountNum,
      currency: formCurrency,
      exchange_rate: rate,
      amount_ils: amountIls,
      description: formDescription,
      notes: formNotes || null,
      status,
      cheque_number: cheques[0]?.number || null,
      cheque_due_date: cheques[0]?.due_date || null,
      cheque_bank_name: formChequeBankName || null,
      posted_by: status === "posted" ? user.id : null,
      posted_at: status === "posted" ? new Date().toISOString() : null,
    };

    let voucher: any = null;
    let error: any = null;

    if (editVoucherId) {
      // Update existing voucher
      const res = await supabase.from("vouchers").update(voucherPayload).eq("id", editVoucherId).select().single();
      voucher = res.data;
      error = res.error;
      // Delete old lines to re-create
      if (voucher) await supabase.from("voucher_lines").delete().eq("voucher_id", editVoucherId);
    } else {
      const res = await supabase.from("vouchers").insert(voucherPayload).select().single();
      voucher = res.data;
      error = res.error;
    }

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    if (voucher) {
      const debitAccountName = accounts.find(a => a.account_code === debitCode)?.account_name || debitCode;
      const creditAccountName = accounts.find(a => a.account_code === creditCode)?.account_name || creditCode;

      await supabase.from("voucher_lines").insert([
        { voucher_id: voucher.id, account_code: debitCode, account_name: debitAccountName, debit: amountIls, credit: 0, line_order: 1 },
        { voucher_id: voucher.id, account_code: creditCode, account_name: creditAccountName, debit: 0, credit: amountIls, line_order: 2 },
      ]);

      if (status === "posted") {
        await supabase.from("transactions").insert({
          user_id: user.id,
          transaction_date: formDate,
          description: formDescription,
          debit_account_code: debitCode,
          credit_account_code: creditCode,
          amount: amountIls,
          currency: formCurrency === "ILS" ? "شيكل" : formCurrency === "USD" ? "دولار" : "دينار",
          transaction_type: voucherType,
          contact_id: formContactId || null,
          reference: voucher.ref_number,
          payment_method: formPaymentMethod === "cash" ? "نقدي" : formPaymentMethod === "bank" ? "بنك" : formPaymentMethod === "cheque" ? "شيك" : "تحويل",
          idempotency_key: `VOUCHER-${voucher.id}`,
        });

        // Create cheque records if payment method is cheque
        if (formPaymentMethod === "cheque" && cheques.length > 0) {
          const chequeRecords = cheques.filter(c => c.number || c.amount).map(c => ({
            user_id: user.id,
            cheque_type: isReceipt ? "وارد" as const : "صادر" as const,
            cheque_number: c.number || null,
            cheque_date: c.due_date || formDate,
            amount: Number(c.amount) || amountNum,
            party_name: selectedContact?.contact_name || "",
            party_type: isCustomer(selectedContact || {}) ? "عميل" : "مورد",
            bank_name: formChequeBankName || null,
            currency: formCurrency === "ILS" ? "شيكل" : formCurrency,
            status: "مسجل" as const,
            linked_transaction_id: voucher.id,
            notes: `سند ${isReceipt ? "قبض" : "صرف"} رقم ${voucher.ref_number}`,
          }));
          if (chequeRecords.length > 0) {
            await supabase.from("cheques").insert(chequeRecords);
          }
        }
      }
    }

    toast({ title: status === "posted" ? `✅ تم ترحيل ${isReceipt ? "سند القبض" : "سند الصرف"} ${voucher?.ref_number}` : "تم الحفظ كمسودة" });
    setSaving(false);
    onClose();
    onSaved();
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={onClose}
      />

      {/* Centered Modal */}
      <div
        className="fixed z-50 bg-background shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300 rounded-2xl"
        style={{ width: "min(680px, 95vw)", maxHeight: "min(92vh, 900px)", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
        dir="rtl"
      >
        {/* Header */}
        <div className="p-5 text-white shrink-0 rounded-t-2xl" style={{ background: "var(--gradient-navy)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                {isReceipt ? <ArrowDown className="h-5 w-5" /> : <ArrowUp className="h-5 w-5" />}
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: "Tajawal, sans-serif" }}>
                  {isReceipt ? "سند قبض جديد" : "سند صرف جديد"}
                </h2>
                {formRefNumber && <p className="text-xs text-white/60">{formRefNumber}</p>}
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Date & Ref */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>التاريخ *</Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="mt-1.5 h-11" />
            </div>
            <div>
              <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>رقم السند</Label>
              <Input value={formRefNumber} readOnly className="mt-1.5 h-11 font-mono bg-muted/50 cursor-default" />
            </div>
          </div>

          {/* Contact */}
          <div>
            <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>
              {isReceipt ? "المستلم من" : "المدفوع لـ"} *
            </Label>
            <Select value={formContactId} onValueChange={setFormContactId}>
              <SelectTrigger className="mt-1.5 h-11"><SelectValue placeholder="اختر جهة الاتصال..." /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <div className="px-2 py-1.5 sticky top-0 bg-background z-10">
                  <div className="relative">
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      className="w-full h-8 pr-8 pl-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="بحث..."
                      value={contactSearch}
                      onChange={e => setContactSearch(e.target.value)}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                </div>
                {filteredContacts.filter(isCustomer).length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="flex items-center gap-1.5 text-xs"><User className="h-3 w-3" /> العملاء</SelectLabel>
                    {filteredContacts.filter(isCustomer).map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span>{c.contact_name}</span>
                          <span className={`text-[10px] font-mono ${Number(c.current_balance || 0) > 0 ? "text-emerald-600" : Number(c.current_balance || 0) < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                            ₪{formatAmount(Math.abs(Number(c.current_balance || 0)))}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {filteredContacts.filter(isSupplier).length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="flex items-center gap-1.5 text-xs"><Building2 className="h-3 w-3" /> الموردين</SelectLabel>
                    {filteredContacts.filter(isSupplier).map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span>{c.contact_name}</span>
                          <span className={`text-[10px] font-mono ${Number(c.current_balance || 0) > 0 ? "text-emerald-600" : Number(c.current_balance || 0) < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                            ₪{formatAmount(Math.abs(Number(c.current_balance || 0)))}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {filteredContacts.filter(isEmployee).length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="flex items-center gap-1.5 text-xs"><Users className="h-3 w-3" /> موظفون</SelectLabel>
                    {filteredContacts.filter(isEmployee).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {filteredContacts.filter(c => !isCustomer(c) && !isSupplier(c) && !isEmployee(c)).length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs">أخرى</SelectLabel>
                    {filteredContacts.filter(c => !isCustomer(c) && !isSupplier(c) && !isEmployee(c)).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>

            {selectedContact && (
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="secondary" className="text-[10px]">
                  {isCustomer(selectedContact) ? "عميل" : isSupplier(selectedContact) ? "مورد" : isEmployee(selectedContact) ? "موظف" : "أخرى"}
                </Badge>
                <Badge className={`text-[10px] ${Number(selectedContact.current_balance || 0) >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  الرصيد: ₪{formatAmount(Math.abs(Number(selectedContact.current_balance || 0)))}
                  {Number(selectedContact.current_balance || 0) >= 0 ? " (لنا)" : " (علينا)"}
                </Badge>
              </div>
            )}

            {/* Quick Add Contact */}
            {!showQuickAdd ? (
              <button
                onClick={() => { setShowQuickAdd(true); setQuickName(""); setQuickPhone(""); setQuickType(isReceipt ? "عميل" : "مورد"); }}
                className="mt-2 text-xs flex items-center gap-1 text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> إضافة جهة اتصال جديدة
              </button>
            ) : (
              <div className="mt-2.5 rounded-xl border p-4 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">إضافة جهة اتصال سريعة</span>
                  <button onClick={() => setShowQuickAdd(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">الاسم *</Label>
                    <Input value={quickName} onChange={e => setQuickName(e.target.value)} placeholder="اسم جهة الاتصال" className="mt-1 h-9" />
                  </div>
                  <div>
                    <Label className="text-xs">النوع *</Label>
                    <Select value={quickType} onValueChange={setQuickType}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="عميل">عميل</SelectItem>
                          <SelectItem value="مورد">مورد</SelectItem>
                          <SelectItem value="أخرى">أخرى</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">رقم الهاتف</Label>
                  <Input value={quickPhone} onChange={e => setQuickPhone(e.target.value)} placeholder="اختياري" className="mt-1 h-9" />
                </div>
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={!quickName.trim() || quickSaving}
                  onClick={async () => {
                    if (!user || !quickName.trim()) return;
                    setQuickSaving(true);
                    const { data, error } = await supabase.from("contacts").insert({
                      user_id: user.id,
                      contact_name: quickName.trim(),
                      contact_type: quickType,
                      phone: quickPhone || null,
                    }).select("id, contact_name, contact_type, current_balance").single();
                    if (error) {
                      toast({ title: "خطأ", description: error.message, variant: "destructive" });
                    } else if (data) {
                      setContacts(prev => [...prev, data]);
                      setFormContactId(data.id);
                      setShowQuickAdd(false);
                      toast({ title: `✅ تم إضافة ${data.contact_name}` });
                    }
                    setQuickSaving(false);
                  }}
                >
                  {quickSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  حفظ واختيار
                </Button>
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>المبلغ *</Label>
              <Input type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" className="mt-1.5 h-11 font-mono text-lg" />
            </div>
            <div>
              <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>العملة</Label>
              <Select value={formCurrency} onValueChange={setFormCurrency}>
                <SelectTrigger className="mt-1.5 h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ILS">₪ شيكل</SelectItem>
                  <SelectItem value="USD">$ دولار</SelectItem>
                  <SelectItem value="JOD">د.أ دينار</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formCurrency !== "ILS" && (
              <div>
                <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>سعر الصرف</Label>
                <Input type="number" value={formExchangeRate} onChange={e => setFormExchangeRate(e.target.value)} className="mt-1.5 h-11 font-mono" step="0.01" />
                {amountNum > 0 && <p className="text-[10px] text-muted-foreground mt-1">= ₪{formatAmount(amountIls)}</p>}
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div>
            <Label className="text-[13px] font-semibold mb-2.5 block" style={{ fontFamily: "Tajawal, sans-serif" }}>طريقة الدفع</Label>
            <div className="grid grid-cols-4 gap-3">
              {paymentMethods.map(pm => (
                <button
                  key={pm.value}
                  onClick={() => setFormPaymentMethod(pm.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-medium transition-all ${formPaymentMethod === pm.value ? "bg-accent/10 border-accent shadow-sm" : "border-transparent hover:bg-muted/50"}`}
                >
                  <pm.icon className="h-5 w-5" />
                  <span>{pm.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* CASH: Select cash box */}
          {formPaymentMethod === "cash" && (
            <div className="rounded-xl border p-4 space-y-3 bg-muted/30">
              <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>💵 الصندوق *</Label>
              {cashAccounts.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    لا يوجد حساب صندوق معرّف
                  </p>
                </div>
              ) : (
                <Select value={formCashAccountCode} onValueChange={setFormCashAccountCode}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="اختر الصندوق..." /></SelectTrigger>
                  <SelectContent>
                    {cashAccounts.map(a => (
                      <SelectItem key={a.account_code} value={a.account_code}>
                        💵 {a.account_code} — {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* BANK: Select bank account */}
          {formPaymentMethod === "bank" && (
            <div className="rounded-xl border p-4 space-y-3 bg-muted/30">
              <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>🏦 الحساب البنكي *</Label>
              {bankAccounts.length === 0 ? (
                <div className="text-center py-3 space-y-2">
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    لا توجد حسابات بنكية معرّفة
                  </p>
                  <Button variant="outline" size="sm" onClick={() => navigate("/finance/bank-accounts?new=1")}>
                    <Plus className="h-3.5 w-3.5 ml-1" />إضافة حساب بنكي
                  </Button>
                </div>
              ) : (
                <Select value={formBankAccountId} onValueChange={setFormBankAccountId}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="اختر حساب البنك..." /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="flex items-center gap-2">
                          <span>🏦 {b.bank_name} — {b.name}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {b.currency === "ILS" ? "₪" : b.currency === "USD" ? "$" : "د.أ"}{formatAmount(Number(b.opening_balance || 0))}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* TRANSFER: Select account + reference */}
          {formPaymentMethod === "transfer" && (
            <div className="rounded-xl border p-4 space-y-4 bg-muted/30">
              <div>
                <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>
                  وُجِّه التحويل إلى *
                </Label>
                <Select value={formTransferAccountCode} onValueChange={setFormTransferAccountCode}>
                  <SelectTrigger className="mt-1.5 h-11"><SelectValue placeholder="اختر الحساب المستلم..." /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-xs">حسابات بنكية</SelectLabel>
                        {bankAccounts.map(b => (
                          <SelectItem key={b.id} value={b.gl_account_code || "1120"}>
                            🏦 {b.bank_name} — {b.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    <SelectGroup>
                      <SelectLabel className="text-xs">حسابات أخرى</SelectLabel>
                      {accounts.filter(a => a.account_code?.startsWith("112") || a.account_code?.startsWith("113")).map(a => (
                        <SelectItem key={a.account_code} value={a.account_code}>
                          {a.account_code} — {a.account_name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>رقم الحوالة / المرجع</Label>
                <Input value={formTransferRef} onChange={e => setFormTransferRef(e.target.value)} placeholder="TRF-2026-00445" className="mt-1.5 h-11 font-mono" />
              </div>
            </div>
          )}

          {/* CHEQUE: Multi-cheque table */}
          {formPaymentMethod === "cheque" && (
            <div className="rounded-xl border p-4 space-y-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>
                  {isReceipt ? "الشيكات المستلمة" : "الشيكات المُصدرة"}
                </Label>
                <Button variant="outline" size="sm" onClick={addCheque} className="gap-1 text-xs h-8">
                  <Plus className="h-3 w-3" />شيك جديد
                </Button>
              </div>

              {/* Shared cheque fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">اسم البنك المُصدر</Label>
                  <Select value={formChequeBankName} onValueChange={setFormChequeBankName}>
                    <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="اختر البنك..." /></SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map(b => (
                        <SelectItem key={b.id} value={b.bank_name}>{b.bank_name}</SelectItem>
                      ))}
                      <SelectItem value="بنك غير مسجل">بنك غير مسجل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">تاريخ الشيك</Label>
                  <Input type="date" value={formChequeDate} onChange={e => setFormChequeDate(e.target.value)} className="mt-1 h-10" />
                </div>
              </div>

              {/* Cheque rows */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-right py-2 px-2.5 w-8">#</th>
                      <th className="text-right py-2 px-2.5">رقم الشيك</th>
                      <th className="text-right py-2 px-2.5">ت. الاستحقاق</th>
                      <th className="text-right py-2 px-2.5">المبلغ</th>
                      <th className="py-2 px-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cheques.map((c, idx) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-1.5 px-2.5 text-muted-foreground">{idx + 1}</td>
                        <td className="py-1.5 px-1.5">
                          <Input value={c.number} onChange={e => updateCheque(c.id, "number", e.target.value)} className="h-8 font-mono text-xs" placeholder="رقم" />
                        </td>
                        <td className="py-1.5 px-1.5">
                          <Input type="date" value={c.due_date} onChange={e => updateCheque(c.id, "due_date", e.target.value)} className="h-8 text-xs" />
                        </td>
                        <td className="py-1.5 px-1.5">
                          <Input type="number" value={c.amount} onChange={e => updateCheque(c.id, "amount", e.target.value)} className="h-8 font-mono text-xs" placeholder="0.00" />
                        </td>
                        <td className="py-1.5 px-1.5">
                          {cheques.length > 1 && (
                            <button onClick={() => removeCheque(c.id)} className="p-1 text-muted-foreground hover:text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-bold text-xs">
                      <td colSpan={3} className="py-2 px-2.5">الإجمالي</td>
                      <td className="py-2 px-2.5 font-mono">₪{formatAmount(chequeTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Total match check */}
              {amountNum > 0 && chequeTotal > 0 && (
                <div className={`flex items-center gap-1.5 text-xs font-medium ${chequeTotalMatches ? "text-emerald-600" : "text-amber-600"}`}>
                  {chequeTotalMatches ? (
                    <><Check className="h-3.5 w-3.5" /> المبالغ متطابقة</>
                  ) : (
                    <><AlertTriangle className="h-3.5 w-3.5" /> مجموع الشيكات ₪{formatAmount(chequeTotal)} لا يساوي مبلغ السند ₪{formatAmount(amountNum)}</>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div>
            <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>البيان *</Label>
            <Textarea
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              placeholder={isReceipt ? "مثال: قبض دفعة من العميل رقم الفاتورة 445" : "مثال: دفع مستحقات المورد"}
              rows={3}
              className="mt-1.5 text-sm"
            />
            <p className="text-[10px] text-muted-foreground text-left mt-1">{formDescription.length}/200</p>
          </div>

          {/* Auto Journal Entry */}
          <div className="rounded-xl border p-4 space-y-3">
            <h3 className="text-[13px] font-bold" style={{ fontFamily: "Tajawal, sans-serif" }}>القيد المحاسبي التلقائي</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-right py-2 px-2">#</th>
                  <th className="text-right py-2 px-2">الحساب</th>
                  <th className="text-right py-2 px-2">مدين</th>
                  <th className="text-right py-2 px-2">دائن</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 px-2">1</td>
                  <td className="py-2 px-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {debitName}
                  </td>
                  <td className="py-2 px-2 font-mono">{amountIls > 0 ? `₪${formatAmount(amountIls)}` : "—"}</td>
                  <td className="py-2 px-2"></td>
                </tr>
                <tr>
                  <td className="py-2 px-2">2</td>
                  <td className="py-2 px-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    {creditName}
                  </td>
                  <td className="py-2 px-2"></td>
                  <td className="py-2 px-2 font-mono">{amountIls > 0 ? `₪${formatAmount(amountIls)}` : "—"}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t font-bold">
                  <td colSpan={2} className="py-2 px-2">الإجمالي</td>
                  <td className="py-2 px-2 font-mono">₪{amountIls > 0 ? formatAmount(amountIls) : "0.00"}</td>
                  <td className="py-2 px-2 font-mono">₪{amountIls > 0 ? formatAmount(amountIls) : "0.00"}</td>
                </tr>
              </tfoot>
            </table>
            {amountIls > 0 && <p className="text-[10px] text-emerald-600 font-medium">✓ متوازن</p>}
          </div>

          {/* Notes */}
          <div>
            <Label className="text-[13px] font-semibold" style={{ fontFamily: "Tajawal, sans-serif" }}>ملاحظات (اختياري)</Label>
            <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} className="mt-1.5" placeholder="ملاحظات داخلية..." />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-background border-t p-4 flex items-center gap-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving}>حفظ كمسودة</Button>
          <Button className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => handleSave("posted")} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
            ✓ ترحيل السند
          </Button>
        </div>
      </div>
    </>
  );
};

export default VoucherDrawer;
