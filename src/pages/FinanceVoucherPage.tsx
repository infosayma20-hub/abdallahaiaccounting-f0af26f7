import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Loader2, Plus, Search, RefreshCw,
  ArrowDown, ArrowUp, FileText, Pencil, Trash2, Eye, Printer,
  X, ChevronDown, Calendar, CreditCard, Landmark, Receipt, ArrowLeftRight
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type VoucherType = "receipt" | "payment";

interface Props {
  voucherType: VoucherType;
}

const FinanceVoucherPage = ({ voucherType }: Props) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const isReceipt = voucherType === "receipt";
  const accentColor = isReceipt ? "#16A34A" : "#DC2626";
  const accentBg = isReceipt ? "bg-emerald-50" : "bg-red-50";
  const title = isReceipt ? "سندات القبض" : "سندات الصرف";
  const newTitle = isReceipt ? "سند قبض جديد" : "سند صرف جديد";
  const contactLabel = isReceipt ? "المستلم من" : "المدفوع لـ";

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formRefNumber, setFormRefNumber] = useState("");
  const [formContactId, setFormContactId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCurrency, setFormCurrency] = useState("ILS");
  const [formExchangeRate, setFormExchangeRate] = useState("1");
  const [formPaymentMethod, setFormPaymentMethod] = useState("cash");
  const [formBankAccountId, setFormBankAccountId] = useState("");
  const [formChequeNumber, setFormChequeNumber] = useState("");
  const [formChequeDueDate, setFormChequeDueDate] = useState("");
  const [formChequeBankName, setFormChequeBankName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [vRes, cRes, aRes, bRes] = await Promise.all([
      supabase.from("vouchers").select("*").eq("user_id", user.id).eq("type", voucherType).order("created_at", { ascending: false }),
      supabase.from("contacts").select("id, contact_name, contact_type, current_balance").eq("user_id", user.id),
      supabase.from("accounts").select("account_code, account_name, account_type").eq("user_id", user.id).eq("is_active", true),
      supabase.from("bank_accounts").select("*").eq("user_id", user.id).eq("is_active", true),
    ]);
    setVouchers(vRes.data || []);
    setContacts(cRes.data || []);
    setAccounts(aRes.data || []);
    setBankAccounts(bRes.data || []);
    setLoading(false);
  }, [user, voucherType]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (searchParams.get("new") === "1") setDrawerOpen(true); }, [searchParams]);

  const resetForm = () => {
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormRefNumber("");
    setFormContactId("");
    setFormAmount("");
    setFormCurrency("ILS");
    setFormExchangeRate("1");
    setFormPaymentMethod("cash");
    setFormBankAccountId("");
    setFormChequeNumber("");
    setFormChequeDueDate("");
    setFormChequeBankName("");
    setFormDescription("");
    setFormNotes("");
  };

  const handleSave = async (status: "draft" | "posted") => {
    if (!user) return;
    if (!formDescription.trim()) { toast({ title: "خطأ", description: "البيان مطلوب", variant: "destructive" }); return; }
    if (!formAmount || Number(formAmount) <= 0) { toast({ title: "خطأ", description: "أدخل مبلغاً صحيحاً", variant: "destructive" }); return; }

    setSaving(true);
    const amount = Number(formAmount);
    const rate = Number(formExchangeRate) || 1;
    const amountIls = formCurrency === "ILS" ? amount : amount * rate;

    // Determine debit/credit accounts
    let debitCode: string, creditCode: string;
    if (isReceipt) {
      debitCode = formPaymentMethod === "cash" ? "1110" : formPaymentMethod === "bank" ? "1120" : formPaymentMethod === "cheque" ? "1150" : "1120";
      creditCode = "1130"; // ذمم عملاء
    } else {
      debitCode = "2100"; // ذمم موردين
      creditCode = formPaymentMethod === "cash" ? "1110" : formPaymentMethod === "bank" ? "1120" : formPaymentMethod === "cheque" ? "1150" : "1120";
    }

    const { data: voucher, error } = await supabase.from("vouchers").insert({
      user_id: user.id,
      type: voucherType,
      ref_number: formRefNumber || "",
      date: formDate,
      contact_id: formContactId || null,
      payment_method: formPaymentMethod,
      bank_account_id: formBankAccountId || null,
      amount,
      currency: formCurrency,
      exchange_rate: rate,
      amount_ils: amountIls,
      description: formDescription,
      notes: formNotes || null,
      status,
      cheque_number: formChequeNumber || null,
      cheque_due_date: formChequeDueDate || null,
      cheque_bank_name: formChequeBankName || null,
      posted_by: status === "posted" ? user.id : null,
      posted_at: status === "posted" ? new Date().toISOString() : null,
    }).select().single();

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Create voucher lines
    if (voucher) {
      const debitAccountName = accounts.find(a => a.account_code === debitCode)?.account_name || debitCode;
      const creditAccountName = accounts.find(a => a.account_code === creditCode)?.account_name || creditCode;

      await supabase.from("voucher_lines").insert([
        { voucher_id: voucher.id, account_code: debitCode, account_name: debitAccountName, debit: amountIls, credit: 0, line_order: 1 },
        { voucher_id: voucher.id, account_code: creditCode, account_name: creditAccountName, debit: 0, credit: amountIls, line_order: 2 },
      ]);

      // If posted, also create transaction
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
      }
    }

    toast({ title: status === "posted" ? `✅ تم ترحيل ${isReceipt ? "سند القبض" : "سند الصرف"} ${voucher?.ref_number}` : "تم الحفظ كمسودة" });
    setSaving(false);
    setDrawerOpen(false);
    resetForm();
    fetchData();
  };

  const filtered = useMemo(() => {
    if (!searchQuery) return vouchers;
    const q = searchQuery.toLowerCase();
    return vouchers.filter(v => v.ref_number?.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q));
  }, [vouchers, searchQuery]);

  const totalAll = vouchers.filter(v => v.status === "posted").reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const thisMonth = vouchers.filter(v => v.status === "posted" && v.date >= monthStart);
  const totalMonth = thisMonth.reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const formatAmount = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const paymentMethods = [
    { value: "cash", label: "نقدي", icon: Receipt },
    { value: "bank", label: "بنك", icon: Landmark },
    { value: "cheque", label: "شيك", icon: FileText },
    { value: "transfer", label: "تحويل", icon: ArrowLeftRight },
  ];

  const selectedContact = contacts.find(c => c.id === formContactId);
  const amountIlsPreview = formCurrency !== "ILS" && formAmount ? (Number(formAmount) * Number(formExchangeRate || 1)) : null;

  // Auto journal entry
  let journalDebitCode = isReceipt 
    ? (formPaymentMethod === "cash" ? "1110" : formPaymentMethod === "bank" ? "1120" : formPaymentMethod === "cheque" ? "1150" : "1120")
    : "2100";
  let journalCreditCode = isReceipt 
    ? "1130" 
    : (formPaymentMethod === "cash" ? "1110" : formPaymentMethod === "bank" ? "1120" : formPaymentMethod === "cheque" ? "1150" : "1120");

  const journalDebitName = accounts.find(a => a.account_code === journalDebitCode)?.account_name || journalDebitCode;
  const journalCreditName = accounts.find(a => a.account_code === journalCreditCode)?.account_name || journalCreditCode;
  const journalAmount = formAmount ? Number(formAmount) * (formCurrency !== "ILS" ? Number(formExchangeRate || 1) : 1) : 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/finance")} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: accentColor, fontFamily: "Tajawal, sans-serif" }}>{title}</h1>
          </div>
        </div>
        <Button size="sm" className="gap-2" style={{ backgroundColor: accentColor }} onClick={() => { resetForm(); setDrawerOpen(true); }}>
          <Plus className="h-4 w-4" />{newTitle}
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className={accentBg}>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">{isReceipt ? "إجمالي المقبوضات" : "إجمالي المدفوعات"}</p>
            <p className="text-lg font-bold font-mono" style={{ color: accentColor }}>₪{formatAmount(totalAll)}</p>
          </CardContent>
        </Card>
        <Card className={accentBg}>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">هذا الشهر</p>
            <p className="text-lg font-bold font-mono" style={{ color: accentColor }}>₪{formatAmount(totalMonth)}</p>
          </CardContent>
        </Card>
        <Card className={accentBg}>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">عدد السندات</p>
            <p className="text-lg font-bold font-mono" style={{ color: accentColor }}>{vouchers.length}</p>
          </CardContent>
        </Card>
        <Card className={accentBg}>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">متوسط {isReceipt ? "القبض" : "الصرف"}</p>
            <p className="text-lg font-bold font-mono" style={{ color: accentColor }}>₪{vouchers.length > 0 ? formatAmount(totalAll / vouchers.length) : "0.00"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`ابحث بالرقم، الاسم، البيان...`}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pr-10"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">لا توجد سندات بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-xs">
                    <th className="text-right py-2.5 px-3">رقم السند</th>
                    <th className="text-right py-2.5 px-3">التاريخ</th>
                    <th className="text-right py-2.5 px-3">{contactLabel}</th>
                    <th className="text-right py-2.5 px-3">البيان</th>
                    <th className="text-right py-2.5 px-3">طريقة الدفع</th>
                    <th className="text-right py-2.5 px-3">المبلغ</th>
                    <th className="text-right py-2.5 px-3">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => {
                    const contact = contacts.find(c => c.id === v.contact_id);
                    return (
                      <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-xs font-medium">{v.ref_number}</td>
                        <td className="py-2.5 px-3 text-xs">{v.date}</td>
                        <td className="py-2.5 px-3 text-xs">{contact?.contact_name || "—"}</td>
                        <td className="py-2.5 px-3 text-xs truncate max-w-[200px]">{v.description}</td>
                        <td className="py-2.5 px-3 text-xs">
                          {v.payment_method === "cash" ? "نقدي" : v.payment_method === "bank" ? "بنك" : v.payment_method === "cheque" ? "شيك" : v.payment_method === "transfer" ? "تحويل" : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs font-bold" style={{ color: accentColor }}>₪{formatAmount(Number(v.amount_ils || v.amount || 0))}</td>
                        <td className="py-2.5 px-3">
                          {v.status === "posted" ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">مرحّل</Badge> :
                           v.status === "cancelled" ? <Badge className="bg-red-100 text-red-700 text-[10px]">ملغي</Badge> :
                           <Badge variant="secondary" className="text-[10px]">مسودة</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drawer Form */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-full sm:w-[600px] p-0 overflow-y-auto">
          {/* Header */}
          <div className="p-4 text-white" style={{ background: isReceipt ? "linear-gradient(135deg, #14532D, #16A34A)" : "linear-gradient(135deg, #7F1D1D, #DC2626)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3" dir="rtl">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  {isReceipt ? <ArrowDown className="h-5 w-5" /> : <ArrowUp className="h-5 w-5" />}
                </div>
                <div>
                  <h2 className="text-base font-bold">{newTitle}</h2>
                  {formRefNumber && <p className="text-[11px] text-white/60">{formRefNumber}</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-5" dir="rtl">
            {/* Date & Ref */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">التاريخ *</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">رقم السند</Label>
                <Input value={formRefNumber} onChange={e => setFormRefNumber(e.target.value)} placeholder="تلقائي" className="mt-1 font-mono" />
              </div>
            </div>

            {/* Contact */}
            <div>
              <Label className="text-xs">{contactLabel} *</Label>
              <Select value={formContactId} onValueChange={setFormContactId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="اختر جهة الاتصال..." /></SelectTrigger>
                <SelectContent>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.contact_name} ({c.contact_type === "customer" ? "عميل" : "مورد"})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedContact && (
                <p className="text-[11px] text-muted-foreground mt-1">الرصيد الحالي: ₪{formatAmount(Number(selectedContact.current_balance || 0))}</p>
              )}
            </div>

            {/* Amount */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <Label className="text-xs">المبلغ *</Label>
                <Input type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" className="mt-1 font-mono text-lg" />
              </div>
              <div>
                <Label className="text-xs">العملة</Label>
                <Select value={formCurrency} onValueChange={setFormCurrency}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ILS">₪ شيكل</SelectItem>
                    <SelectItem value="USD">$ دولار</SelectItem>
                    <SelectItem value="JOD">د.أ دينار</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formCurrency !== "ILS" && (
                <div>
                  <Label className="text-xs">سعر الصرف</Label>
                  <Input type="number" value={formExchangeRate} onChange={e => setFormExchangeRate(e.target.value)} className="mt-1 font-mono" step="0.01" />
                  {amountIlsPreview && <p className="text-[10px] text-muted-foreground mt-1">المبلغ بالشيكل: ₪{formatAmount(amountIlsPreview)}</p>}
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div>
              <Label className="text-xs mb-2 block">طريقة الدفع</Label>
              <div className="grid grid-cols-4 gap-2">
                {paymentMethods.map(pm => (
                  <button key={pm.value} onClick={() => setFormPaymentMethod(pm.value)} className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-all ${formPaymentMethod === pm.value ? "border-2 bg-muted" : "border-muted hover:bg-muted/50"}`} style={formPaymentMethod === pm.value ? { borderColor: accentColor } : undefined}>
                    <pm.icon className="h-4 w-4" />
                    <span>{pm.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {formPaymentMethod === "bank" && bankAccounts.length > 0 && (
              <div>
                <Label className="text-xs">حساب البنك</Label>
                <Select value={formBankAccountId} onValueChange={setFormBankAccountId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="اختر حساب البنك..." /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} - {b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formPaymentMethod === "cheque" && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">رقم الشيك *</Label>
                  <Input value={formChequeNumber} onChange={e => setFormChequeNumber(e.target.value)} className="mt-1 font-mono" />
                </div>
                <div>
                  <Label className="text-xs">تاريخ الاستحقاق</Label>
                  <Input type="date" value={formChequeDueDate} onChange={e => setFormChequeDueDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">اسم البنك</Label>
                  <Input value={formChequeBankName} onChange={e => setFormChequeBankName(e.target.value)} className="mt-1" />
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <Label className="text-xs">البيان *</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder={isReceipt ? "مثال: قبض دفعة من العميل رقم الفاتورة 445" : "مثال: دفع مستحقات المورد"} rows={3} className="mt-1" />
              <p className="text-[10px] text-muted-foreground text-left mt-1">{formDescription.length}/200</p>
            </div>

            {/* Auto Journal Entry */}
            <div className="rounded-lg border p-3 space-y-2">
              <h3 className="text-xs font-bold">القيد المحاسبي التلقائي</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-right py-1.5 px-2">#</th>
                    <th className="text-right py-1.5 px-2">الحساب</th>
                    <th className="text-right py-1.5 px-2">مدين</th>
                    <th className="text-right py-1.5 px-2">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-1.5 px-2">1</td>
                    <td className="py-1.5 px-2 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isReceipt ? "#16A34A" : "#DC2626" }} />
                      {journalDebitName}
                    </td>
                    <td className="py-1.5 px-2 font-mono">₪{journalAmount > 0 ? formatAmount(journalAmount) : "—"}</td>
                    <td className="py-1.5 px-2"></td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2">2</td>
                    <td className="py-1.5 px-2 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isReceipt ? "#DC2626" : "#16A34A" }} />
                      {journalCreditName}
                    </td>
                    <td className="py-1.5 px-2"></td>
                    <td className="py-1.5 px-2 font-mono">₪{journalAmount > 0 ? formatAmount(journalAmount) : "—"}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t font-bold">
                    <td colSpan={2} className="py-1.5 px-2">الإجمالي</td>
                    <td className="py-1.5 px-2 font-mono">₪{journalAmount > 0 ? formatAmount(journalAmount) : "0.00"}</td>
                    <td className="py-1.5 px-2 font-mono">₪{journalAmount > 0 ? formatAmount(journalAmount) : "0.00"}</td>
                  </tr>
                </tfoot>
              </table>
              {journalAmount > 0 && <p className="text-[10px] text-emerald-600 font-medium">✓ متوازن</p>}
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs">ملاحظات (اختياري)</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} className="mt-1" placeholder="ملاحظات داخلية..." />
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-background border-t p-4 flex items-center gap-2 flex-wrap" dir="rtl">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)} disabled={saving}>إلغاء</Button>
            <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving}>حفظ كمسودة</Button>
            <Button className="flex-1" style={{ backgroundColor: accentColor }} onClick={() => handleSave("posted")} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
              ✓ ترحيل السند
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default FinanceVoucherPage;
