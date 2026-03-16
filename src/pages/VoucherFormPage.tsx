import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { ArrowRight, FileText, Search, CheckCircle, AlertTriangle, Info, Printer, Save, Landmark, CreditCard, Building2, Receipt as ReceiptIcon, Banknote, User, Users, UserCheck } from "lucide-react";
import DuplicateBanner from "@/components/DuplicateBanner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompanyContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";

interface Contact {
  id: string;
  contact_name: string;
  current_balance: number;
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
  selected?: boolean;
  allocatedAmount?: number;
}

interface CashBox {
  id: string;
  name: string;
  gl_account_code: string | null;
}

interface BankAccount {
  id: string;
  name: string;
  bank_name: string;
  gl_account_code: string | null;
}

interface Employee {
  id: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
}

const PAYMENT_METHODS = [
  { value: "نقدي", label: "نقدي", icon: Banknote },
  { value: "شيك", label: "شيك", icon: ReceiptIcon },
  { value: "تحويل", label: "تحويل بنكي", icon: Building2 },
  { value: "بطاقة", label: "بطاقة", icon: CreditCard },
];

const EMP_TRANSACTION_CATEGORIES = [
  { value: "سلفة", label: "سلفة", emoji: "💰" },
  { value: "أكل", label: "أكل / وجبات", emoji: "🍽️" },
  { value: "عجز", label: "عجز صندوق", emoji: "📉" },
  { value: "مشتريات", label: "مشتريات", emoji: "🛒" },
  { value: "توصيل", label: "توصيل", emoji: "🚗" },
  { value: "مخالفة", label: "مخالفة", emoji: "⚠️" },
  { value: "أخرى", label: "أخرى", emoji: "📝" },
];

type VoucherType = "receipt" | "payment";
type PartyType = "contact" | "employee";

interface VoucherFormPageProps {
  voucherType?: VoucherType;
}

const VoucherFormPage = ({ voucherType = "receipt" }: VoucherFormPageProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: editId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { company } = useCompany();
  const { settings } = useCompanySettings();

  const fromDuplicate = searchParams.get("from_duplicate") === "true";
  const [duplicateSourceRef, setDuplicateSourceRef] = useState<string | null>(null);
  const isEditMode = !!editId;

  const isReceipt = voucherType === "receipt";
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
  const [checkNumber, setCheckNumber] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [checkBank, setCheckBank] = useState("");

  // Contact
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [computedBalance, setComputedBalance] = useState<number | null>(null);

  // Deposit
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [depositType, setDepositType] = useState<"cash_box" | "bank">("cash_box");
  const [selectedCashBox, setSelectedCashBox] = useState("");
  const [selectedBankAccount, setSelectedBankAccount] = useState("");

  // Invoices
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedReceiptNumber, setSavedReceiptNumber] = useState("");

  // Employee party type (for payment vouchers)
  const [partyType, setPartyType] = useState<PartyType>("contact");
  const [employeeList, setEmployeeList] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [empCategory, setEmpCategory] = useState("سلفة");
  const [empCategoryCustom, setEmpCategoryCustom] = useState("");
  const [violationReason, setViolationReason] = useState("");

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
      if (data.paymentMethod) setPaymentMethod(data.paymentMethod);
      if (data.notes) setNotes(data.notes);
      if (data.depositType) setDepositType(data.depositType);
      if (data.selectedCashBox) setSelectedCashBox(data.selectedCashBox);
      if (data.selectedBankAccount) setSelectedBankAccount(data.selectedBankAccount);
      if (data.contactId) {
        // Will be resolved after contacts load
        (window as any).__duplicateContactId = data.contactId;
      }
      // Amount is NOT copied (user must enter)
      // Date is today (default)
    } catch (e) { /* ignore */ }
  }, [fromDuplicate, voucherType]);

  // Load contacts
  useEffect(() => {
    if (!user) return;
    supabase.from("contacts").select("id, contact_name, current_balance")
      .eq("user_id", user.id)
      .order("contact_name")
      .then(({ data }) => {
        const contactsList = data || [];
        setContacts(contactsList);
        // Resolve duplicate contact
        const dupContactId = (window as any).__duplicateContactId;
        if (dupContactId) {
          const found = contactsList.find(c => c.id === dupContactId);
          if (found) {
            setSelectedContact(found);
            setContactSearch(found.contact_name);
          }
          delete (window as any).__duplicateContactId;
        }
      });
  }, [user]);

  // Load employees (for payment vouchers)
  useEffect(() => {
    if (!user || isReceipt) return;
    supabase.from("employees")
      .select("id, full_name, department, job_title")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setEmployeeList(data || []));
  }, [user, isReceipt]);

  // ─── Compute real balance from transactions ───
  useEffect(() => {
    if (!selectedContact || !user) { setComputedBalance(null); return; }
    const accountCode = isReceipt ? "1130" : "2100";
    supabase.from("transactions")
      .select("debit_account_code, credit_account_code, amount")
      .eq("user_id", user.id)
      .eq("is_deleted", false)
      .eq("contact_id", selectedContact.id)
      .then(({ data }) => {
        if (!data) { setComputedBalance(0); return; }
        let balance = 0;
        for (const t of data) {
          if (t.debit_account_code === accountCode) balance += t.amount;
          if (t.credit_account_code === accountCode) balance -= t.amount;
        }
        setComputedBalance(balance);
      });
  }, [selectedContact, user, isReceipt]);

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
            .eq("user_id", user.id)
            .single();
          if (data) {
            setPaymentDate(data.payment_date || new Date().toISOString().split("T")[0]);
            setRefNumber(data.receipt_number || "");
            setPaymentMethod(data.payment_method || "نقدي");
            setAmount(String(data.amount || ""));
            setNotes(data.notes || "");
            setCheckNumber(data.check_number || "");
            setCheckDate(data.check_date || "");
            setCheckBank(data.bank_name || "");
            setEditVoucherStatus(data.status || "posted");
            if (data.cash_box_id) { setDepositType("cash_box"); setSelectedCashBox(data.cash_box_id); }
            if (data.bank_account_id) { setDepositType("bank"); setSelectedBankAccount(data.bank_account_id); }
            // Resolve contact
            if (data.contact_id) {
              const { data: c } = await supabase.from("contacts").select("id, contact_name, current_balance").eq("id", data.contact_id).single();
              if (c) { setSelectedContact(c); setContactSearch(c.contact_name); }
            }
          }
        } else {
          const { data } = await supabase
            .from("vouchers")
            .select("*")
            .eq("id", editId)
            .eq("user_id", user.id)
            .single();
          if (data) {
            setPaymentDate(data.date || new Date().toISOString().split("T")[0]);
            setRefNumber(data.ref_number || "");
            const methodMap: Record<string, string> = { cash: "نقدي", cheque: "شيك", transfer: "تحويل", card: "بطاقة" };
            setPaymentMethod(methodMap[data.payment_method] || data.payment_method || "نقدي");
            setAmount(String(data.amount || data.amount_ils || ""));
            setNotes(data.notes || data.description || "");
            setCheckNumber(data.cheque_number || "");
            setCheckDate(data.cheque_due_date || "");
            setCheckBank(data.cheque_bank_name || "");
            setEditVoucherStatus(data.status || "posted");
            if (data.bank_account_id) { setDepositType("bank"); setSelectedBankAccount(data.bank_account_id); }
            // Resolve contact
            if (data.contact_id) {
              const { data: c } = await supabase.from("contacts").select("id, contact_name, current_balance").eq("id", data.contact_id).single();
              if (c) { setSelectedContact(c); setContactSearch(c.contact_name); }
            }
          }
        }
      } catch (e) { /* ignore */ }
      setEditLoading(false);
    };
    loadVoucher();
  }, [editId, user, isReceipt]);

  // Load cash boxes, bank accounts, and generate ref number for payments
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [cbRes, baRes] = await Promise.all([
        supabase.from("cash_boxes").select("id, name, gl_account_code").eq("user_id", user.id).eq("is_active", true),
        supabase.from("bank_accounts").select("id, name, bank_name, gl_account_code").eq("user_id", user.id).eq("is_active", true),
      ]);
      setCashBoxes(cbRes.data || []);
      setBankAccounts(baRes.data || []);
      if (cbRes.data?.length) setSelectedCashBox(cbRes.data[0].id);
      if (baRes.data?.length) setSelectedBankAccount(baRes.data[0].id);
      if (!isReceipt) {
        const { data: vData } = await supabase.from("vouchers").select("ref_number").eq("user_id", user.id).eq("type", "payment").order("created_at", { ascending: false }).limit(1);
        const lastRef = (vData || [])[0]?.ref_number || "";
        const match = lastRef.match(/(\d+)$/);
        const nextNum = match ? String(parseInt(match[1]) + 1).padStart(Math.max(match[1].length, 4), "0") : "0001";
        setRefNumber(`PV-${new Date().getFullYear()}-${nextNum}`);
      }
    };
    load();
  }, [user, isReceipt]);

  // Load invoices when contact is selected
  useEffect(() => {
    if (!user || !selectedContact) { setInvoices([]); return; }
    const paymentStatusFilter = isReceipt ? ["unpaid", "partial"] : ["unpaid", "partial"];
    supabase.from("invoices")
      .select("id, invoice_number, invoice_date, due_date, total_amount, paid_amount, remaining_amount, status")
      .eq("user_id", user.id)
      .eq("contact_id", selectedContact.id)
      .in("payment_status", paymentStatusFilter)
      .order("invoice_date", { ascending: true })
      .then(({ data }) => {
        setInvoices((data || []).map(inv => ({
          ...inv,
          selected: false,
          allocatedAmount: Math.max(0, (inv.remaining_amount ?? inv.total_amount) - (inv.paid_amount ?? 0)),
        })));
      });
  }, [user, selectedContact, isReceipt]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts.slice(0, 10);
    const q = contactSearch.toLowerCase();
    return contacts.filter(c => c.contact_name.toLowerCase().includes(q)).slice(0, 10);
  }, [contacts, contactSearch]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employeeList.slice(0, 10);
    const q = employeeSearch.toLowerCase();
    return employeeList.filter(e => e.full_name.toLowerCase().includes(q)).slice(0, 10);
  }, [employeeList, employeeSearch]);

  const filteredInvoices = useMemo(() => {
    if (!invoiceSearch.trim()) return invoices;
    const q = invoiceSearch.toLowerCase();
    return invoices.filter(inv => (inv.invoice_number || "").toLowerCase().includes(q));
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
  const unallocated = amountNum - totalAllocated;

  const toggleInvoice = (id: string) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== id) return inv;
      const remaining = (inv.remaining_amount ?? inv.total_amount) - (inv.paid_amount ?? 0);
      return { ...inv, selected: !inv.selected, allocatedAmount: !inv.selected ? Math.min(remaining, Math.max(0, amountNum - totalAllocated + (inv.selected ? (inv.allocatedAmount || 0) : 0))) : 0 };
    }));
  };

  const selectAll = () => {
    let remaining = amountNum;
    setInvoices(prev => prev.map(inv => {
      const invRemaining = (inv.remaining_amount ?? inv.total_amount) - (inv.paid_amount ?? 0);
      const alloc = Math.min(invRemaining, remaining);
      remaining -= alloc;
      return { ...inv, selected: alloc > 0, allocatedAmount: alloc > 0 ? alloc : 0 };
    }));
  };

  const selectOldestFirst = () => selectAll();

  const clearSelection = () => {
    setInvoices(prev => prev.map(inv => ({ ...inv, selected: false, allocatedAmount: 0 })));
  };

  const updateAllocation = (id: string, val: number) => {
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, allocatedAmount: val } : inv));
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
    const isEmployeePayment = !isReceipt && partyType === "employee";
    if (!user || amountNum <= 0) {
      toast.error("الرجاء تعبئة جميع الحقول المطلوبة");
      return;
    }
    if (isEmployeePayment && !selectedEmployee) {
      toast.error("الرجاء اختيار الموظف");
      return;
    }
    if (!isEmployeePayment && !selectedContact) {
      toast.error("الرجاء اختيار الجهة");
      return;
    }
    setSaving(true);

    try {
      let depositAccountCode = "1110";
      let cashBoxId: string | null = null;
      let bankAccountId: string | null = null;

      if (paymentMethod === "شيك") {
        depositAccountCode = isReceipt ? "1150" : "2110";
      } else if (depositType === "cash_box" && selectedCashBox) {
        const cb = cashBoxes.find(c => c.id === selectedCashBox);
        depositAccountCode = cb?.gl_account_code || "1110";
        cashBoxId = selectedCashBox;
      } else if (depositType === "bank" && selectedBankAccount) {
        const ba = bankAccounts.find(b => b.id === selectedBankAccount);
        depositAccountCode = ba?.gl_account_code || "1120";
        bankAccountId = selectedBankAccount;
      }

      // ─── EDIT MODE: Update existing voucher ───
      if (isEditMode && editId) {
        if (isReceipt) {
          const { error } = await supabase
            .from("receipt_vouchers")
            .update({
              contact_id: selectedContact.id,
              contact_name: selectedContact.contact_name,
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
            })
            .eq("id", editId)
            .eq("user_id", user.id);
          if (error) throw error;
          toast.success(`تم تحديث ${voucherLabel} بنجاح`);
        } else {
          const payMethodMap: Record<string, string> = { "نقدي": "cash", "شيك": "cheque", "تحويل": "transfer", "بطاقة": "card" };
          const { error } = await supabase
            .from("vouchers")
            .update({
              date: paymentDate,
              contact_id: selectedContact.id,
              payment_method: payMethodMap[paymentMethod] || "cash",
              amount: amountNum,
              amount_ils: amountNum,
              description: notes || `سند صرف إلى ${selectedContact.contact_name}`,
              notes: notes || null,
              bank_account_id: bankAccountId,
              cheque_number: paymentMethod === "شيك" ? checkNumber : null,
              cheque_due_date: paymentMethod === "شيك" && checkDate ? checkDate : null,
              cheque_bank_name: paymentMethod === "شيك" ? checkBank : null,
            })
            .eq("id", editId)
            .eq("user_id", user.id);
          if (error) throw error;
          toast.success(`تم تحديث ${voucherLabel} بنجاح`);
        }
        navigate(listPath);
        return;
      }

      // ─── CREATE MODE: Original insert logic ───
      let txId: string | null = null;
      if (!asDraft && isReceipt) {
        const { data: txResult } = await supabase.rpc("create_receipt_with_entry", {
          p_user_id: user.id,
          p_contact_id: selectedContact.id,
          p_contact_name: selectedContact.contact_name,
          p_amount: amountNum,
          p_payment_method: paymentMethod === "شيك" ? "شيك" : paymentMethod === "تحويل" ? "بنك" : "نقدي",
          p_description: notes || `سند قبض من ${selectedContact.contact_name}`,
          p_currency: "شيكل",
          p_idempotency_key: `RCV-NEW-${Date.now()}`,
        });
        txId = (txResult as any)?.transaction_id || null;
      }

      if (!asDraft && !isReceipt) {
        const payMethodMap: Record<string, string> = { "نقدي": "نقدي", "شيك": "شيك", "تحويل": "بنك", "بطاقة": "بطاقة" };
        
        let debitAccountCode = "2100"; // Default: supplier payables
        let txDescription = notes || `سند صرف إلى ${selectedContact?.contact_name || ""}`;
        let txContactId = selectedContact?.id || null;

        // Employee payment: find their account under 1180
        if (isEmployeePayment && selectedEmployee) {
          const categoryLabel = empCategory === "أخرى" ? empCategoryCustom : empCategory;
          const violationNote = empCategory === "مخالفة" && violationReason ? ` - السبب: ${violationReason}` : "";
          txDescription = `${categoryLabel} - ${selectedEmployee.full_name}${violationNote}`;
          if (notes) txDescription += ` | ${notes}`;
          txContactId = null;

          // Find employee account under 1180
          const { data: empAccount } = await supabase
            .from("accounts")
            .select("account_code")
            .eq("user_id", user.id)
            .like("parent_code", "1180")
            .like("account_name", `%${selectedEmployee.full_name}%`)
            .limit(1)
            .single();

          if (empAccount) {
            debitAccountCode = empAccount.account_code;
          } else {
            // Auto-create employee account
            const { data: maxCode } = await supabase
              .from("accounts")
              .select("account_code")
              .eq("user_id", user.id)
              .like("parent_code", "1180")
              .order("account_code", { ascending: false })
              .limit(1)
              .single();
            const nextCode = maxCode ? String(parseInt(maxCode.account_code) + 1) : "1181";
            await supabase.from("accounts").insert({
              user_id: user.id,
              account_code: nextCode,
              account_name: `ذمم موظف - ${selectedEmployee.full_name}`,
              account_type: "asset",
              parent_code: "1180",
              is_system: false,
            });
            debitAccountCode = nextCode;
          }
        }

        const { data: txData } = await supabase.from("transactions").insert({
          user_id: user.id,
          transaction_date: paymentDate,
          description: txDescription,
          debit_account_code: debitAccountCode,
          credit_account_code: depositAccountCode,
          amount: amountNum,
          currency: "شيكل",
          transaction_type: isEmployeePayment ? "employee_payment" : "payment",
          contact_id: txContactId,
          payment_method: payMethodMap[paymentMethod] || "نقدي",
          idempotency_key: `PAY-NEW-${Date.now()}`,
        }).select("id").single();
        txId = txData?.id || null;
      }

      if (isReceipt) {
        const { data: receipt, error: receiptError } = await supabase
          .from("receipt_vouchers")
          .insert({
            user_id: user.id,
            contact_id: selectedContact.id,
            contact_name: selectedContact.contact_name,
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
          })
          .select("id, receipt_number")
          .single();

        if (receiptError) throw receiptError;

        const selectedInvoices = invoices.filter(i => i.selected && (i.allocatedAmount || 0) > 0);
        if (selectedInvoices.length > 0 && receipt) {
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

        if (paymentMethod === "شيك" && !asDraft && checkNumber) {
          await supabase.from("cheques").insert({
            user_id: user.id,
            cheque_type: "وارد" as const,
            cheque_number: checkNumber,
            cheque_date: checkDate || paymentDate,
            amount: amountNum,
            party_name: selectedContact.contact_name,
            bank_name: checkBank,
            status: "مسجل" as const,
            currency: "شيكل",
          });
        }

        toast.success(asDraft ? "تم حفظ المسودة" : `تم ترحيل ${voucherLabel} ${receipt?.receipt_number}`);
        setSaved(true);
        setSavedReceiptNumber(receipt?.receipt_number || "");
      } else {
        const payMethodMap: Record<string, string> = { "نقدي": "cash", "شيك": "cheque", "تحويل": "transfer", "بطاقة": "card" };
        const isEmpPay = partyType === "employee" && selectedEmployee;
        const categoryLabel = empCategory === "أخرى" ? empCategoryCustom : empCategory;
        const violationNote = empCategory === "مخالفة" && violationReason ? ` - السبب: ${violationReason}` : "";
        const empDesc = isEmpPay ? `${categoryLabel} - ${selectedEmployee.full_name}${violationNote}` : "";

        const { data: voucher, error: voucherError } = await supabase
          .from("vouchers")
          .insert({
            user_id: user.id,
            type: "payment" as const,
            ref_number: refNumber || `PV-${new Date().getFullYear()}-0001`,
            date: paymentDate,
            contact_id: isEmpPay ? null : selectedContact?.id,
            payment_method: payMethodMap[paymentMethod] || "cash",
            amount: amountNum,
            amount_ils: amountNum,
            currency: "ILS",
            exchange_rate: 1,
            description: isEmpPay ? (empDesc + (notes ? ` | ${notes}` : "")) : (notes || `سند صرف إلى ${selectedContact?.contact_name || ""}`),
            notes: notes || null,
            status: asDraft ? "draft" : "posted",
            linked_transaction_id: txId,
            bank_account_id: bankAccountId,
            cheque_number: paymentMethod === "شيك" ? checkNumber : null,
            cheque_due_date: paymentMethod === "شيك" && checkDate ? checkDate : null,
            cheque_bank_name: paymentMethod === "شيك" ? checkBank : null,
            posted_by: !asDraft ? user.id : null,
            posted_at: !asDraft ? new Date().toISOString() : null,
          })
          .select("id, ref_number")
          .single();

        if (voucherError) throw voucherError;

        if (paymentMethod === "شيك" && !asDraft && checkNumber) {
          await supabase.from("cheques").insert({
            user_id: user.id,
            cheque_type: "صادر" as const,
            cheque_number: checkNumber,
            cheque_date: checkDate || paymentDate,
            amount: amountNum,
            party_name: selectedContact.contact_name,
            bank_name: checkBank,
            status: "مسجل" as const,
            currency: "شيكل",
          });
        }

        const selectedInvoices = invoices.filter(i => i.selected && (i.allocatedAmount || 0) > 0);
        if (selectedInvoices.length > 0 && voucher) {
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

        toast.success(asDraft ? "تم حفظ المسودة" : `تم ترحيل ${voucherLabel} ${voucher?.ref_number}`);
        setSaved(true);
        setSavedReceiptNumber(voucher?.ref_number || "");
      }
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const partyName = partyType === "employee" && selectedEmployee
      ? selectedEmployee.full_name
      : selectedContact?.contact_name || "";
    const amt = amountNum;
    const fmtAmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dateFormatted = new Date(paymentDate).toLocaleDateString("ar-PS", { year: "numeric", month: "2-digit", day: "2-digit" });
    const typeLabel = isReceipt ? "سند قبض" : "سند صرف";
    const typeBadge = isReceipt ? "Receipt Voucher" : "Payment Voucher";

    // Amount in words (simple Arabic)
    const amountInWords = `${Math.floor(amt)} شيكل${amt % 1 > 0 ? ` و ${Math.round((amt % 1) * 100)} أغورة` : ""} فقط لا غير`;

    // Cheque section
    const chequeHtml = paymentMethod === "شيك" ? `
      <div style="margin-top:16px;">
        <div style="font-size:11px;font-weight:700;color:#1B3A5C;margin-bottom:8px;">بيانات الشيك</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#1B3A5C;">
              <th style="padding:6px 10px;color:#C9A84C;text-align:right;font-weight:600;">رقم الشيك</th>
              <th style="padding:6px 10px;color:#C9A84C;text-align:right;font-weight:600;">تاريخ الاستحقاق</th>
              <th style="padding:6px 10px;color:#C9A84C;text-align:right;font-weight:600;">اسم البنك</th>
              <th style="padding:6px 10px;color:#C9A84C;text-align:left;font-weight:600;">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid #edf0f4;">
              <td style="padding:6px 10px;">${checkNumber || "—"}</td>
              <td style="padding:6px 10px;">${checkDate ? new Date(checkDate).toLocaleDateString("ar-PS") : "—"}</td>
              <td style="padding:6px 10px;">${checkBank || "—"}</td>
              <td style="padding:6px 10px;text-align:left;font-weight:700;">₪${fmtAmt(amt)}</td>
            </tr>
          </tbody>
        </table>
      </div>` : "";

    // Employee category
    const categoryLabel = !isReceipt && partyType === "employee" && empCategory ? empCategory : "";

    // Linked invoices
    const linkedInvs = invoices.filter(i => i.selected && (i.allocatedAmount || 0) > 0);
    const invoiceRows = linkedInvs.map(inv => `
      <tr style="border-bottom:1px solid #edf0f4;">
        <td style="padding:5px 10px;font-size:11px;">${inv.invoice_date}</td>
        <td style="padding:5px 10px;font-size:11px;font-family:monospace;">${inv.invoice_number || "—"}</td>
        <td style="padding:5px 10px;font-size:11px;">${notes || (isReceipt ? "سند قبض" : "سند صرف")}</td>
        <td style="padding:5px 10px;font-size:11px;">${typeLabel}</td>
        <td style="padding:5px 10px;font-size:11px;text-align:left;font-family:monospace;">${fmtAmt(inv.allocatedAmount || 0)}</td>
        <td style="padding:5px 10px;font-size:11px;text-align:left;">—</td>
      </tr>`).join("");

    // If no linked invoices, show single row
    const tableBody = linkedInvs.length > 0 ? invoiceRows : `
      <tr style="border-bottom:1px solid #edf0f4;">
        <td style="padding:5px 10px;font-size:11px;">${dateFormatted}</td>
        <td style="padding:5px 10px;font-size:11px;font-family:monospace;">${savedReceiptNumber || refNumber || "—"}</td>
        <td style="padding:5px 10px;font-size:11px;">${notes || (categoryLabel ? `${categoryLabel} - ${partyName}` : typeLabel)}</td>
        <td style="padding:5px 10px;font-size:11px;">${typeLabel}</td>
        <td style="padding:5px 10px;font-size:11px;text-align:left;font-family:monospace;">${isReceipt ? "" : fmtAmt(amt)}</td>
        <td style="padding:5px 10px;font-size:11px;text-align:left;font-family:monospace;">${isReceipt ? fmtAmt(amt) : ""}</td>
      </tr>`;

    const depositLabel = depositType === "cash_box"
      ? (cashBoxes.find(c => c.id === selectedCashBox)?.name || "صندوق")
      : (bankAccounts.find(b => b.id === selectedBankAccount)?.name || "بنك");

    const printHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${typeLabel} - ${savedReceiptNumber || refNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'IBM Plex Sans Arabic',Arial,sans-serif; background:#fff; color:#222; }
    .page { max-width:210mm; margin:0 auto; padding:0; }
    @media print { 
      body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .page { padding:0; }
    }
  </style>
</head>
<body>
<div class="page">
  <!-- HEADER -->
  <div style="background:#1B3A5C;padding:20px 28px;display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;align-items:center;gap:14px;">
      ${settings.logo_url ? `<img src="${settings.logo_url}" style="height:48px;object-fit:contain;border-radius:6px;" />` : ""}
      <div>
        <div style="color:#fff;font-size:18px;font-weight:700;">${settings.company_name || "الشركة"}</div>
        ${settings.address ? `<div style="color:rgba(255,255,255,0.7);font-size:11px;margin-top:2px;">${settings.address}${settings.city ? ` - ${settings.city}` : ""}</div>` : ""}
        ${settings.phone ? `<div style="color:rgba(255,255,255,0.7);font-size:11px;">${settings.phone}${settings.tax_number ? ` | ض.ق: ${settings.tax_number}` : ""}</div>` : ""}
      </div>
    </div>
    <div style="text-align:left;">
      <div style="color:#C9A84C;font-size:20px;font-weight:700;">${typeLabel}</div>
      <div style="color:rgba(255,255,255,0.6);font-size:10px;margin-top:2px;">${typeBadge}</div>
    </div>
  </div>

  <!-- Gold separator -->
  <div style="height:3px;background:#C9A84C;"></div>

  <!-- META SECTION -->
  <div style="padding:18px 28px;display:flex;gap:40px;">
    <div style="flex:1;">
      <div style="font-size:10px;color:#888;margin-bottom:3px;">${isReceipt ? "المستلم من" : "المدفوع إلى"}</div>
      <div style="font-size:14px;font-weight:700;color:#1B3A5C;">${partyName}</div>
      ${categoryLabel ? `<div style="font-size:10px;color:#888;margin-top:4px;">التصنيف: <span style="font-weight:600;color:#222;">${categoryLabel}</span></div>` : ""}
    </div>
    <div style="flex:1;">
      <table style="font-size:11px;width:100%;">
        <tr><td style="color:#888;padding:2px 0;width:90px;">رقم السند</td><td style="font-weight:700;font-family:monospace;">${savedReceiptNumber || refNumber || "—"}</td></tr>
        <tr><td style="color:#888;padding:2px 0;">التاريخ</td><td>${dateFormatted}</td></tr>
        <tr><td style="color:#888;padding:2px 0;">طريقة الدفع</td><td>${paymentMethod}</td></tr>
        <tr><td style="color:#888;padding:2px 0;">${isReceipt ? "إيداع في" : "الدفع من"}</td><td>${depositLabel}</td></tr>
      </table>
    </div>
  </div>

  <!-- TABLE -->
  <div style="padding:0 28px;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#1B3A5C;">
          <th style="padding:7px 10px;color:#C9A84C;text-align:right;font-size:11px;font-weight:600;">التاريخ</th>
          <th style="padding:7px 10px;color:#C9A84C;text-align:right;font-size:11px;font-weight:600;">المرجع</th>
          <th style="padding:7px 10px;color:#C9A84C;text-align:right;font-size:11px;font-weight:600;">البيان</th>
          <th style="padding:7px 10px;color:#C9A84C;text-align:right;font-size:11px;font-weight:600;">النوع</th>
          <th style="padding:7px 10px;color:#C9A84C;text-align:left;font-size:11px;font-weight:600;">مدين</th>
          <th style="padding:7px 10px;color:#C9A84C;text-align:left;font-size:11px;font-weight:600;">دائن</th>
        </tr>
      </thead>
      <tbody>
        ${tableBody}
      </tbody>
      <tfoot>
        <tr style="background:#1B3A5C;">
          <td colspan="4" style="padding:7px 10px;color:#fff;font-size:11px;font-weight:700;">رصيد ختامي</td>
          <td style="padding:7px 10px;color:#fff;font-size:12px;font-weight:700;text-align:left;font-family:monospace;">${!isReceipt ? "₪" + fmtAmt(amt) : ""}</td>
          <td style="padding:7px 10px;color:#fff;font-size:12px;font-weight:700;text-align:left;font-family:monospace;">${isReceipt ? "₪" + fmtAmt(amt) : ""}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- AMOUNT IN WORDS -->
  <div style="margin:16px 28px;padding:10px 14px;background:#fff;border:1px solid #edf0f4;border-right:3px solid #C9A84C;border-radius:4px;">
    <div style="font-size:10px;color:#888;margin-bottom:2px;">المبلغ كتابةً</div>
    <div style="font-size:12px;font-weight:600;color:#1B3A5C;">${amountInWords}</div>
  </div>

  ${chequeHtml ? `<div style="padding:0 28px;">${chequeHtml}</div>` : ""}

  ${notes ? `<div style="margin:12px 28px;padding:8px 14px;background:#fff;border:1px solid #edf0f4;border-radius:4px;font-size:11px;"><span style="color:#888;">ملاحظات: </span>${notes}</div>` : ""}

  <!-- SIGNATURES -->
  <div style="display:flex;justify-content:space-between;padding:30px 28px 16px;margin-top:20px;">
    <div style="text-align:center;flex:1;">
      <div style="border-bottom:1px solid #ccc;width:140px;margin:0 auto 6px;"></div>
      <div style="font-size:10px;color:#888;">المحاسب</div>
    </div>
    <div style="text-align:center;flex:1;">
      <div style="border-bottom:1px solid #ccc;width:140px;margin:0 auto 6px;"></div>
      <div style="font-size:10px;color:#888;">المدير المالي</div>
    </div>
    <div style="text-align:center;flex:1;">
      <div style="border-bottom:1px solid #ccc;width:140px;margin:0 auto 6px;"></div>
      <div style="font-size:10px;color:#888;">${isReceipt ? "المستلم" : "المستفيد"}</div>
    </div>
  </div>

  <!-- FOOTER -->
  <div style="background:#f7f8fa;border-top:1px solid #edf0f4;padding:10px 28px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:9px;color:#aaa;">${settings.company_name || ""} ${settings.phone ? "| " + settings.phone : ""} ${settings.email ? "| " + settings.email : ""}</div>
    <div style="font-size:9px;color:#C9A84C;font-weight:600;">QOYOD ERP Software</div>
  </div>
</div>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(printHtml);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 400);
  };

  const formatAmount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
          <div className="flex items-center justify-center gap-3 pt-4">
            <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-all">
              <Printer className="h-4 w-4" /> طباعة الإيصال
            </button>
            <button onClick={() => navigate(listPath)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all">
              العودة للسندات
            </button>
            <button onClick={() => { setSaved(false); setAmount(""); setNotes(""); setSelectedContact(null); setInvoices([]); setCheckNumber(""); setCheckDate(""); setCheckBank(""); }} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-foreground text-sm hover:bg-secondary/50 transition-all">
              {isReceipt ? "سند قبض جديد" : "سند صرف جديد"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5" dir="rtl">
      {/* Duplicate Banner */}
      {duplicateSourceRef && <DuplicateBanner sourceRef={duplicateSourceRef} />}
      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            {pageTitle}
          </h1>
          <p className="text-xs text-muted-foreground">{pageDesc}</p>
        </div>
      </div>

      {/* Row 1: Basic Info */}
      <Card>
        <CardContent className="p-5 space-y-4">
          {/* Party Type Toggle (Payment vouchers only) */}
          {!isReceipt && (
            <div>
              <Label className="text-xs mb-1.5 block">نوع الجهة</Label>
              <div className="flex gap-1.5">
                <button onClick={() => { setPartyType("contact"); setSelectedEmployee(null); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 p-2 rounded-lg text-[11px] transition-all border ${partyType === "contact" ? "bg-primary/10 border-primary/40 text-primary font-bold" : "bg-secondary/50 border-border/30 text-muted-foreground hover:bg-secondary"}`}>
                  <Users className="h-4 w-4" /> مورد / جهة
                </button>
                <button onClick={() => { setPartyType("employee"); setSelectedContact(null); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 p-2 rounded-lg text-[11px] transition-all border ${partyType === "employee" ? "bg-primary/10 border-primary/40 text-primary font-bold" : "bg-secondary/50 border-border/30 text-muted-foreground hover:bg-secondary"}`}>
                  <UserCheck className="h-4 w-4" /> موظف
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">التاريخ</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>

            {/* Contact Search (default) */}
            {(isReceipt || partyType === "contact") && (
              <div className="md:col-span-2 relative">
                <Label className="text-xs mb-1.5 block">{contactLabel}</Label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={selectedContact ? selectedContact.contact_name : contactSearch}
                    onChange={e => { setContactSearch(e.target.value); setSelectedContact(null); setShowContactDropdown(true); }}
                    onFocus={() => setShowContactDropdown(true)}
                    placeholder={contactPlaceholder}
                    className="pr-9"
                  />
                </div>
                {showContactDropdown && !selectedContact && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredContacts.map(c => (
                      <button key={c.id} onClick={() => { setSelectedContact(c); setContactSearch(""); setShowContactDropdown(false); }}
                        className="w-full text-right px-4 py-2.5 hover:bg-secondary transition-colors flex items-center justify-between">
                        <span className="text-sm">{c.contact_name}</span>
                        <span className="text-xs text-muted-foreground">₪{formatAmount(c.current_balance || 0)}</span>
                      </button>
                    ))}
                    {filteredContacts.length === 0 && <p className="text-center py-3 text-xs text-muted-foreground">لا توجد نتائج</p>}
                  </div>
                )}
              </div>
            )}

            {/* Employee Search */}
            {!isReceipt && partyType === "employee" && (
              <div className="md:col-span-2 relative">
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
                <Label className="text-xs mb-1.5 block">نوع العملية</Label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {EMP_TRANSACTION_CATEGORIES.map(cat => (
                    <button key={cat.value} onClick={() => setEmpCategory(cat.value)}
                      className={`flex flex-col items-center gap-0.5 p-2 rounded-lg text-[10px] transition-all border ${empCategory === cat.value ? "bg-primary/10 border-primary/40 text-primary font-bold" : "bg-secondary/50 border-border/30 text-muted-foreground hover:bg-secondary"}`}>
                      <span className="text-base">{cat.emoji}</span>
                      {cat.label}
                    </button>
                  ))}
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

          {/* Contact Info Badge */}
          {selectedContact && (isReceipt || partyType === "contact") && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                💰 رصيد {isReceipt ? "الزبون" : "المورد"}: <span className={`font-bold ${(computedBalance ?? 0) > 0 ? "text-destructive" : "text-primary"}`}>₪{formatAmount(computedBalance ?? selectedContact.current_balance ?? 0)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                📄 فواتير مفتوحة: <span className="font-bold text-foreground">{openInvoiceCount} فاتورة</span>
              </span>
              {oldestInvoiceDays > 0 && (
                <span className="flex items-center gap-1.5">
                  ⏰ أقدم فاتورة: <span className="font-bold text-destructive">منذ {oldestInvoiceDays} يوم</span>
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 2: Payment Method & Amount */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">طريقة الدفع</Label>
              <div className="flex gap-1.5">
                {PAYMENT_METHODS.map(m => (
                  <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                    className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg text-[11px] transition-all border ${paymentMethod === m.value ? "bg-primary/10 border-primary/40 text-primary font-bold" : "bg-secondary/50 border-border/30 text-muted-foreground hover:bg-secondary"}`}>
                    <m.icon className="h-4 w-4" strokeWidth={1.6} />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">{isReceipt ? "إيداع في" : "الدفع من"}</Label>
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  <button onClick={() => setDepositType("cash_box")} className={`flex-1 text-[11px] py-1.5 rounded-lg border transition-all ${depositType === "cash_box" ? "bg-primary/10 border-primary/40 text-primary font-bold" : "bg-secondary/50 border-border/30 text-muted-foreground"}`}>
                    صندوق
                  </button>
                  <button onClick={() => setDepositType("bank")} className={`flex-1 text-[11px] py-1.5 rounded-lg border transition-all ${depositType === "bank" ? "bg-primary/10 border-primary/40 text-primary font-bold" : "bg-secondary/50 border-border/30 text-muted-foreground"}`}>
                    بنك
                  </button>
                </div>
                {depositType === "cash_box" ? (
                  <Select value={selectedCashBox} onValueChange={setSelectedCashBox}>
                    <SelectTrigger><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                    <SelectContent>{cashBoxes.map(cb => <SelectItem key={cb.id} value={cb.id}>{cb.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
                    <SelectTrigger><SelectValue placeholder="اختر البنك" /></SelectTrigger>
                    <SelectContent>{bankAccounts.map(ba => <SelectItem key={ba.id} value={ba.id}>{ba.name} - {ba.bank_name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">{amountLabel}</Label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
                <Input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="pr-8 text-left font-mono text-lg font-bold"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* Cheque details */}
          {paymentMethod === "شيك" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border/30">
              <div>
                <Label className="text-xs mb-1.5 block">رقم الشيك</Label>
                <Input value={checkNumber} onChange={e => setCheckNumber(e.target.value)} placeholder="رقم الشيك" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">تاريخ الشيك</Label>
                <Input type="date" value={checkDate} onChange={e => setCheckDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">اسم البنك</Label>
                <Input value={checkBank} onChange={e => setCheckBank(e.target.value)} placeholder="اسم البنك" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Linking Section */}
      {selectedContact && (isReceipt || partyType === "contact") && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                📄 ربط بفاتورة
              </h3>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-[10px] px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all">✓ تحديد الكل</button>
                <button onClick={selectOldestFirst} className="text-[10px] px-2.5 py-1 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-all">الأقدم أولاً</button>
                <button onClick={clearSelection} className="text-[10px] px-2.5 py-1 rounded-lg bg-secondary text-muted-foreground hover:bg-secondary/80 transition-all">مسح</button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)} placeholder="ابحث برقم الفاتورة..." className="pr-9" />
            </div>

            {filteredInvoices.length > 0 ? (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-right" style={{ background: "#0D1B2A" }}>
                      <th className="p-2.5 text-white font-medium w-10">✓</th>
                      <th className="p-2.5 text-white font-medium">رقم الفاتورة</th>
                      <th className="p-2.5 text-white font-medium">تاريخ الإصدار</th>
                      <th className="p-2.5 text-white font-medium">الاستحقاق</th>
                      <th className="p-2.5 text-white font-medium text-left">الإجمالي</th>
                      <th className="p-2.5 text-white font-medium text-left">المتبقي</th>
                      <th className="p-2.5 text-white font-medium">التأخير</th>
                      <th className="p-2.5 text-white font-medium text-left w-28">المبلغ المخصص</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((inv, idx) => {
                      const remaining = (inv.remaining_amount ?? inv.total_amount) - (inv.paid_amount ?? 0);
                      const days = getDaysOverdue(inv.due_date);
                      return (
                        <tr key={inv.id} className={`border-t border-border/30 transition-colors ${inv.selected ? "bg-primary/5" : idx % 2 === 0 ? "bg-background" : "bg-secondary/20"}`}>
                          <td className="p-2.5 text-center">
                            <input type="checkbox" checked={inv.selected || false} onChange={() => toggleInvoice(inv.id)}
                              className="w-4 h-4 rounded border-border accent-primary" />
                          </td>
                          <td className="p-2.5 font-mono font-medium text-foreground">{inv.invoice_number || "-"}</td>
                          <td className="p-2.5 text-muted-foreground">{inv.invoice_date}</td>
                          <td className="p-2.5 text-muted-foreground">{inv.due_date || "-"}</td>
                          <td className="p-2.5 text-left font-mono">₪{formatAmount(inv.total_amount)}</td>
                          <td className="p-2.5 text-left font-mono font-bold">₪{formatAmount(remaining)}</td>
                          <td className="p-2.5">
                            <span className={`${getOverdueColor(days)} text-[10px]`}>
                              {getOverdueIcon(days)} {getOverdueLabel(days)}
                            </span>
                          </td>
                          <td className="p-2.5">
                            {inv.selected && (
                              <Input type="number" value={inv.allocatedAmount || ""} onChange={e => updateAllocation(inv.id, parseFloat(e.target.value) || 0)}
                                className="h-7 text-xs font-mono text-left w-24" min={0} max={remaining} step={0.01} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">لا توجد فواتير مفتوحة لهذا {isReceipt ? "الزبون" : "المورد"}</p>
              </div>
            )}

            {/* Distribution Summary */}
            {amountNum > 0 && (
              <div className={`rounded-xl p-4 space-y-2 text-xs ${unallocated === 0 && totalAllocated > 0 ? "bg-primary/5 border border-primary/20" : unallocated > 0 ? "bg-warning/5 border border-warning/20" : "bg-destructive/5 border border-destructive/20"}`}>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{amountLabel}:</span>
                  <span className="font-mono font-bold">₪{formatAmount(amountNum)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الموزَّع على الفواتير:</span>
                  <span className="font-mono">(₪{formatAmount(totalAllocated)})</span>
                </div>
                <div className="border-t border-border/30 pt-2 flex justify-between font-bold">
                  <span>المبلغ غير الموزَّع:</span>
                  <span className="font-mono">₪{formatAmount(Math.abs(unallocated))}</span>
                </div>
                {unallocated === 0 && totalAllocated > 0 && (
                  <p className="flex items-center gap-1.5 text-primary"><CheckCircle className="h-3.5 w-3.5" /> مطابق تام ✓</p>
                )}
                {unallocated > 0 && totalAllocated > 0 && (
                  <p className="flex items-center gap-1.5 text-warning"><AlertTriangle className="h-3.5 w-3.5" /> يوجد فائض — سيُضاف لرصيد {isReceipt ? "الزبون" : "المورد"}</p>
                )}
                {unallocated < 0 && (
                  <p className="flex items-center gap-1.5 text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> غير كافٍ — سيُسجَّل كدفع جزئي</p>
                )}
                {totalAllocated === 0 && (
                  <p className="flex items-center gap-1.5 text-muted-foreground"><Info className="h-3.5 w-3.5" /> لم يتم ربط أي فاتورة — سيُسجل كدفعة على الحساب</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      <Card>
        <CardContent className="p-5">
          <Label className="text-xs mb-1.5 block">ملاحظات</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={`ملاحظات تظهر في إيصال ${isReceipt ? "القبض" : "الصرف"}...`} rows={3} />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between bg-card rounded-2xl border border-border p-4">
        {!isEditMode ? (
          <button onClick={() => handleSave(true)} disabled={saving}
            className="px-5 py-2.5 rounded-xl border border-border text-foreground text-sm hover:bg-secondary/50 transition-all disabled:opacity-50">
            حفظ كمسودة
          </button>
        ) : <div />}
        <div className="flex items-center gap-3">
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
            <Printer className="h-4 w-4" /> طباعة
          </button>
          <button onClick={() => handleSave(false)} disabled={saving || amountNum <= 0 || (!selectedContact && !selectedEmployee)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50">
            <Save className="h-4 w-4" />
            {saving ? "جارٍ الحفظ..." : isEditMode ? "تحديث السند" : "حفظ وترحيل"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoucherFormPage;
