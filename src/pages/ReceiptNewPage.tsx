import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Search, CheckCircle, AlertTriangle, Info, Printer, Save, Landmark, CreditCard, Building2, Receipt as ReceiptIcon, Banknote, User, Eye, Download, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateReceiptPDF, type ReceiptPDFData, type CompanyPDFData } from "@/utils/generateReceiptPDF";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompanyContext";
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
  calculated_balance?: number;
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

const PAYMENT_METHODS = [
  { value: "نقدي", label: "نقدي", icon: Banknote },
  { value: "شيك", label: "شيك", icon: ReceiptIcon },
  { value: "تحويل", label: "تحويل بنكي", icon: Building2 },
  { value: "بطاقة", label: "بطاقة", icon: CreditCard },
];

const ReceiptNewPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { company } = useCompany();

  // Form state
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("نقدي");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [checkBank, setCheckBank] = useState("");

  // Multiple cheque lines
  interface ChequeLine { id: string; cheque_number: string; amount: string; due_date: string; bank_name: string; }
  const [chequeLines, setChequeLines] = useState<ChequeLine[]>([{ id: crypto.randomUUID(), cheque_number: '', amount: '', due_date: '', bank_name: '' }]);
  const addChequeLine = () => setChequeLines(prev => [...prev, { id: crypto.randomUUID(), cheque_number: '', amount: '', due_date: '', bank_name: '' }]);
  const removeChequeLine = (id: string) => { if (chequeLines.length > 1) setChequeLines(prev => prev.filter(l => l.id !== id)); };
  const updateChequeLine = (id: string, field: keyof ChequeLine, value: string) => setChequeLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  const chequesTotal = chequeLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  // Sync amount with cheques total
  useEffect(() => { if (paymentMethod === 'شيك' && chequesTotal > 0) setAmount(String(chequesTotal)); }, [chequesTotal, paymentMethod]);

  // Contact
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDropdown, setShowContactDropdown] = useState(false);

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
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfDataUri, setPdfDataUri] = useState("");

  // Load contacts
  useEffect(() => {
    if (!user) return;
    supabase.from("contacts").select("id, contact_name, current_balance")
      .eq("user_id", user.id)
      .order("contact_name")
      .then(({ data }) => setContacts(data || []));
  }, [user]);

  // Load cash boxes and bank accounts
  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("cash_boxes").select("id, name, gl_account_code").eq("user_id", user.id).eq("is_active", true),
      supabase.from("bank_accounts").select("id, name, bank_name, gl_account_code").eq("user_id", user.id).eq("is_active", true),
    ]).then(([cbRes, baRes]) => {
      setCashBoxes(cbRes.data || []);
      setBankAccounts(baRes.data || []);
      if (cbRes.data?.length) setSelectedCashBox(cbRes.data[0].id);
      if (baRes.data?.length) setSelectedBankAccount(baRes.data[0].id);
    });
  }, [user]);

  // Calculate real balance from transactions when contact is selected
  useEffect(() => {
    if (!user || !selectedContact) return;
    
    // Find all contact IDs with the same name (handles duplicates)
    const sameNameIds = contacts
      .filter(c => c.contact_name === selectedContact.contact_name)
      .map(c => c.id);
    const contactIds = [...new Set([selectedContact.id, ...sameNameIds])];
    
    // Calculate balance from transactions: debit to 1130 (receivables) minus credit to 1130
    supabase.from("transactions")
      .select("amount, debit_account_code, credit_account_code")
      .eq("user_id", user.id)
      .in("contact_id", contactIds)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .then(({ data: txns }) => {
        let balance = 0;
        (txns || []).forEach(t => {
          if (t.debit_account_code === '1130') balance += Number(t.amount);
          if (t.credit_account_code === '1130') balance -= Number(t.amount);
        });
        setSelectedContact(prev => prev ? { ...prev, calculated_balance: balance } : prev);
      });
  }, [user, selectedContact?.id, contacts]);

  // Load invoices when contact is selected — also fetch from duplicate contacts with same name
  useEffect(() => {
    if (!user || !selectedContact) { setInvoices([]); return; }
    
    // Find all contact IDs with the same name (handles duplicates)
    const sameNameIds = contacts
      .filter(c => c.contact_name === selectedContact.contact_name)
      .map(c => c.id);
    
    // Always include the selected contact's ID
    const contactIds = [...new Set([selectedContact.id, ...sameNameIds])];
    
    supabase.from("invoices")
      .select("id, invoice_number, invoice_date, due_date, total_amount, paid_amount, remaining_amount, status")
      .eq("user_id", user.id)
      .in("contact_id", contactIds)
      .in("payment_status", ["unpaid", "partial"])
      .order("invoice_date", { ascending: true })
      .then(({ data }) => {
        setInvoices((data || []).map(inv => ({
          ...inv,
          selected: false,
          allocatedAmount: Math.max(0, (inv.remaining_amount ?? inv.total_amount) - (inv.paid_amount ?? 0)),
        })));
      });
  }, [user, selectedContact, contacts]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts.slice(0, 10);
    const q = contactSearch.toLowerCase();
    return contacts.filter(c => c.contact_name.toLowerCase().includes(q)).slice(0, 10);
  }, [contacts, contactSearch]);

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

  const selectOldestFirst = () => selectAll(); // Already sorted by date

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
    if (!user || !selectedContact || amountNum <= 0) {
      toast.error("الرجاء تعبئة جميع الحقول المطلوبة");
      return;
    }
    setSaving(true);

    try {
      // Determine deposit account
      let depositAccountCode = "1110";
      let cashBoxId: string | null = null;
      let bankAccountId: string | null = null;

      if (paymentMethod === "شيك") {
        depositAccountCode = "1150";
      } else if (depositType === "cash_box" && selectedCashBox) {
        const cb = cashBoxes.find(c => c.id === selectedCashBox);
        depositAccountCode = cb?.gl_account_code || "1110";
        cashBoxId = selectedCashBox;
      } else if (depositType === "bank" && selectedBankAccount) {
        const ba = bankAccounts.find(b => b.id === selectedBankAccount);
        depositAccountCode = ba?.gl_account_code || "1120";
        bankAccountId = selectedBankAccount;
      }

      // Create journal entry via RPC
      let txId: string | null = null;
      if (!asDraft) {
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

      // Insert receipt voucher
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

      // Link invoices
      const selectedInvoices = invoices.filter(i => i.selected && (i.allocatedAmount || 0) > 0);
      if (selectedInvoices.length > 0 && receipt) {
        const links = selectedInvoices.map(inv => ({
          payment_id: receipt.id,
          invoice_id: inv.id,
          allocated_amount: inv.allocatedAmount || 0,
        }));
        await supabase.from("payment_invoice_links").insert(links);

        // Update invoice paid amounts
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

      // Register cheques if payment method is cheque
      if (paymentMethod === "شيك" && !asDraft) {
        for (const line of chequeLines) {
          if (!line.cheque_number && !line.amount) continue;
          await supabase.from("cheques").insert({
            user_id: user.id,
            cheque_type: "وارد" as const,
            cheque_number: line.cheque_number || null,
            cheque_date: line.due_date || paymentDate,
            amount: parseFloat(line.amount) || 0,
            party_name: selectedContact.contact_name,
            bank_name: line.bank_name || null,
            status: "مسجل" as const,
            currency: "شيكل",
            receipt_voucher_id: receipt?.id || null,
          });
        }
      }

      toast.success(asDraft ? "تم حفظ المسودة" : `تم ترحيل سند القبض ${receipt?.receipt_number}`);
      setSaved(true);
      setSavedReceiptNumber(receipt?.receipt_number || "");
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const buildReceiptData = useCallback((): ReceiptPDFData => {
    const selectedInvs = invoices.filter(i => i.selected && (i.allocatedAmount || 0) > 0);
    const cbName = cashBoxes.find(c => c.id === selectedCashBox)?.name;
    const baName = bankAccounts.find(b => b.id === selectedBankAccount)?.name;

    return {
      receipt_number: savedReceiptNumber,
      payment_date: paymentDate,
      amount: amountNum,
      payment_method: paymentMethod,
      check_number: paymentMethod === 'شيك' ? checkNumber : undefined,
      check_date: paymentMethod === 'شيك' ? checkDate : undefined,
      bank_name: paymentMethod === 'شيك' ? checkBank : undefined,
      cash_box_name: depositType === 'cash_box' ? cbName : undefined,
      bank_account_name: depositType === 'bank' ? baName : undefined,
      notes: notes || undefined,
      contact_name: selectedContact?.contact_name || '',
      linked_invoices: selectedInvs.length > 0 ? selectedInvs.map(inv => ({
        invoice_number: inv.invoice_number || '—',
        invoice_date: inv.invoice_date || '',
        total_amount: inv.total_amount,
        allocated_amount: inv.allocatedAmount || 0,
        remaining_after: Math.max(0, (inv.remaining_amount ?? inv.total_amount) - (inv.paid_amount ?? 0) - (inv.allocatedAmount || 0)),
      })) : undefined,
    };
  }, [savedReceiptNumber, paymentDate, amountNum, paymentMethod, checkNumber, checkDate, checkBank, depositType, selectedCashBox, selectedBankAccount, cashBoxes, bankAccounts, notes, selectedContact, invoices]);

  const getCompanyData = useCallback(async (): Promise<CompanyPDFData> => {
    if (!user) return {};
    const { data } = await supabase.from("company_settings")
      .select("company_name, phone, email, address, tax_number, logo_url")
      .eq("user_id", user.id)
      .maybeSingle();
    return data || {};
  }, [user]);

  const handlePreviewPDF = useCallback(async () => {
    try {
      const [receiptData, companyData] = await Promise.all([
        Promise.resolve(buildReceiptData()),
        getCompanyData(),
      ]);
      const doc = generateReceiptPDF(receiptData, companyData);
      const dataUri = doc.output('datauristring');
      setPdfDataUri(dataUri);
      setShowPdfModal(true);
    } catch (err: any) {
      toast.error('خطأ في إنشاء PDF: ' + (err.message || ''));
    }
  }, [buildReceiptData, getCompanyData]);

  const handleDownloadPDF = useCallback(async () => {
    try {
      const [receiptData, companyData] = await Promise.all([
        Promise.resolve(buildReceiptData()),
        getCompanyData(),
      ]);
      const doc = generateReceiptPDF(receiptData, companyData);
      doc.save(`سند-قبض-${savedReceiptNumber}.pdf`);
    } catch (err: any) {
      toast.error('خطأ: ' + (err.message || ''));
    }
  }, [buildReceiptData, getCompanyData, savedReceiptNumber]);

  const handlePrintPDF = useCallback(async () => {
    try {
      const [receiptData, companyData] = await Promise.all([
        Promise.resolve(buildReceiptData()),
        getCompanyData(),
      ]);
      const doc = generateReceiptPDF(receiptData, companyData);
      doc.autoPrint();
      const blobUrl = doc.output('bloburl');
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = String(blobUrl);
      document.body.appendChild(iframe);
      iframe.onload = () => iframe.contentWindow?.print();
    } catch (err: any) {
      toast.error('خطأ: ' + (err.message || ''));
    }
  }, [buildReceiptData, getCompanyData]);

  const formatAmount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (saved) {
    return (
      <div className="max-w-2xl mx-auto space-y-6" dir="rtl">
        <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">تم حفظ سند القبض بنجاح</h2>
          <p className="text-muted-foreground">رقم السند: <span className="font-mono font-bold text-foreground">{savedReceiptNumber}</span></p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <button onClick={handlePreviewPDF} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-all">
              <Eye className="h-4 w-4" /> معاينة PDF
            </button>
            <button onClick={handlePrintPDF} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-all">
              <Printer className="h-4 w-4" /> طباعة الإيصال
            </button>
            <button onClick={handleDownloadPDF} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-all">
              <Download className="h-4 w-4" /> تحميل PDF
            </button>
            <button onClick={() => navigate("/finance/receipts")} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all">
              العودة للسندات
            </button>
            <button onClick={() => { setSaved(false); setAmount(""); setNotes(""); setSelectedContact(null); setInvoices([]); setShowPdfModal(false); setPdfDataUri(""); }} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-foreground text-sm hover:bg-secondary/50 transition-all">
              سند قبض جديد
            </button>
          </div>
        </div>

        {/* PDF Preview Modal */}
        {showPdfModal && pdfDataUri && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#1B3A5C', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '15px' }}>
                معاينة سند القبض {savedReceiptNumber}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleDownloadPDF} style={{ background: '#C9A84C', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 16px', cursor: 'pointer', fontWeight: 'bold' }}>
                  ⬇️ تحميل PDF
                </button>
                <button onClick={handlePrintPDF} style={{ background: 'white', color: '#1B3A5C', border: 'none', borderRadius: '6px', padding: '6px 16px', cursor: 'pointer', fontWeight: 'bold' }}>
                  🖨️ طباعة
                </button>
                <button onClick={() => setShowPdfModal(false)} style={{ background: 'transparent', color: 'white', border: '1px solid white', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer' }}>
                  ✕
                </button>
              </div>
            </div>
            <iframe src={pdfDataUri} style={{ flex: 1, width: '100%', border: 'none' }} title="سند القبض" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            سند قبض جديد
          </h1>
          <p className="text-xs text-muted-foreground">تسجيل دفعة من زبون وربطها بالفواتير</p>
        </div>
      </div>

      {/* Row 1: Basic Info */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">التاريخ</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
            <div className="md:col-span-2 relative">
              <Label className="text-xs mb-1.5 block">الزبون / المورد</Label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={selectedContact ? selectedContact.contact_name : contactSearch}
                  onChange={e => { setContactSearch(e.target.value); setSelectedContact(null); setShowContactDropdown(true); }}
                  onFocus={() => setShowContactDropdown(true)}
                  placeholder="ابحث عن زبون..."
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
          </div>

          {/* Contact Info Badge */}
          {selectedContact && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-wrap items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                💰 رصيد الزبون: <span className={`font-bold ${(selectedContact.calculated_balance ?? (selectedContact.current_balance || 0)) > 0 ? 'text-destructive' : 'text-primary'}`}>₪{formatAmount(selectedContact.calculated_balance ?? (selectedContact.current_balance || 0))}</span>
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
              <Label className="text-xs mb-1.5 block">إيداع في</Label>
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
              <Label className="text-xs mb-1.5 block">المبلغ المقبوض</Label>
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

          {/* Cheque details — multiple cheques */}
          {paymentMethod === "شيك" && (
            <div className="pt-2 border-t border-border/30 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">📋 الشيكات الواردة</h4>
                <span className="text-[10px] text-muted-foreground">{chequeLines.length} شيك — ₪{chequesTotal.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="p-2 text-right font-medium">#</th>
                      <th className="p-2 text-right font-medium">رقم الشيك</th>
                      <th className="p-2 text-right font-medium">المبلغ</th>
                      <th className="p-2 text-right font-medium">الاستحقاق</th>
                      <th className="p-2 text-right font-medium">البنك</th>
                      <th className="p-2 text-right font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {chequeLines.map((line, idx) => (
                      <tr key={line.id} className="border-t border-border/30">
                        <td className="p-2 text-muted-foreground">{idx + 1}</td>
                        <td className="p-2"><Input value={line.cheque_number} onChange={e => updateChequeLine(line.id, 'cheque_number', e.target.value)} placeholder="رقم الشيك" className="h-7 text-xs" /></td>
                        <td className="p-2"><Input type="number" value={line.amount} onChange={e => updateChequeLine(line.id, 'amount', e.target.value)} placeholder="0" className="h-7 text-xs font-mono text-left" /></td>
                        <td className="p-2"><Input type="date" value={line.due_date} onChange={e => updateChequeLine(line.id, 'due_date', e.target.value)} className="h-7 text-xs" /></td>
                        <td className="p-2"><Input value={line.bank_name} onChange={e => updateChequeLine(line.id, 'bank_name', e.target.value)} placeholder="البنك" className="h-7 text-xs" /></td>
                        <td className="p-2">{chequeLines.length > 1 && <button onClick={() => removeChequeLine(line.id)} className="text-destructive hover:text-destructive/80"><X className="h-3.5 w-3.5" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={addChequeLine} className="flex items-center gap-1.5 w-full justify-center py-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:bg-muted/30 transition-colors">
                + إضافة شيك آخر
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Linking Section */}
      {selectedContact && (
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

            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)} placeholder="ابحث برقم الفاتورة..." className="pr-9" />
            </div>

            {/* Invoice Table */}
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
                <p className="text-xs">لا توجد فواتير مفتوحة لهذا الزبون</p>
              </div>
            )}

            {/* Distribution Summary */}
            {amountNum > 0 && (
              <div className={`rounded-xl p-4 space-y-2 text-xs ${unallocated === 0 && totalAllocated > 0 ? "bg-primary/5 border border-primary/20" : unallocated > 0 ? "bg-warning/5 border border-warning/20" : "bg-destructive/5 border border-destructive/20"}`}>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المبلغ المقبوض:</span>
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
                  <p className="flex items-center gap-1.5 text-warning"><AlertTriangle className="h-3.5 w-3.5" /> يوجد فائض — سيُضاف لرصيد الزبون</p>
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
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات تظهر في إيصال القبض..." rows={3} />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between bg-card rounded-2xl border border-border p-4">
        <button onClick={() => handleSave(true)} disabled={saving}
          className="px-5 py-2.5 rounded-xl border border-border text-foreground text-sm hover:bg-secondary/50 transition-all disabled:opacity-50">
          حفظ كمسودة
        </button>
        <div className="flex items-center gap-3">
          <button onClick={handlePrintPDF}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
            <Printer className="h-4 w-4" /> طباعة
          </button>
          <button onClick={() => handleSave(false)} disabled={saving || amountNum <= 0 || !selectedContact}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50">
            <Save className="h-4 w-4" />
            {saving ? "جارٍ الحفظ..." : "حفظ وترحيل"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptNewPage;
