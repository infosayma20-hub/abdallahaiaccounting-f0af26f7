import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import { Loader2, Save, Send, Plus, Trash2, Search, AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useCompanySettings";

type TaxCategory = "taxable" | "zero" | "exempt";

interface Item {
  id: string;
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxCategory: TaxCategory;
  taxRate: number;
}

interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
}

interface InvoiceLite {
  id: string;
  invoice_number: string | null;
  contact_name: string | null;
  contact_id: string | null;
  total_amount: number | null;
  invoice_date: string | null;
}

interface Props {
  noteType: "credit" | "debit";
}

const TAX_OPTS: { value: TaxCategory; label: string; rate: number }[] = [
  { value: "taxable", label: "خاضع 16%", rate: 16 },
  { value: "zero", label: "صفري", rate: 0 },
  { value: "exempt", label: "معفى", rate: 0 },
];

const newItem = (): Item => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unitPrice: 0,
  discount: 0,
  taxCategory: "taxable",
  taxRate: 16,
});

const REASONS_CREDIT = [
  "إرجاع بضاعة من العميل",
  "خصم إضافي على الفاتورة",
  "خطأ في السعر / الكمية",
  "إلغاء جزئي للفاتورة",
  "تسوية محاسبية",
  "أخرى",
];

const REASONS_DEBIT = [
  "إرجاع بضاعة للمورد",
  "خصم إضافي من المورد",
  "خطأ في فاتورة المشتريات",
  "تعويض عن نقص أو عيب",
  "تسوية محاسبية",
  "أخرى",
];

const REASONS_SALES_RETURN = [
  "إرجاع منتج معيب",
  "إرجاع منتج غير مطابق للطلب",
  "إلغاء جزئي للطلب",
  "خطأ في الكمية المسلّمة",
  "اتفاق مع العميل",
  "أخرى",
];

const REASONS_PURCHASE_RETURN = [
  "بضاعة معيبة من المورد",
  "بضاعة غير مطابقة للمواصفات",
  "إلغاء جزء من الطلبية",
  "خطأ في الكمية المستلمة",
  "اتفاق مع المورد",
  "أخرى",
];

const CreditDebitNoteCreatePage = ({ noteType }: Props) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings } = useCompanySettings();
  const taxEnabled = settings?.vat_enabled ?? true;

  const editId = params.get("edit");
  const viewId = params.get("view");
  const isView = !!viewId;
  const recordId = editId || viewId;

  const isCredit = noteType === "credit";
  const isCustomerSide = isCredit;
  const dbType = noteType === "credit" ? "credit_note" : "debit_note";
  const titleAr = noteType === "credit" ? "إشعار دائن" : "إشعار مدين";

  const partyLabel = isCustomerSide ? "العميل" : "المورد";
  const partyType = isCustomerSide ? "عميل" : "مورد";
  const linkedType = isCustomerSide ? "sale" : "purchase";
  const accent = isCustomerSide ? "emerald" : "rose";

  const reasons = noteType === "credit" ? REASONS_CREDIT : REASONS_DEBIT;
  const listPath = noteType === "credit" ? "/credit-notes" : "/debit-notes";

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [linkedInvoices, setLinkedInvoices] = useState<InvoiceLite[]>([]);
  const [contactPopover, setContactPopover] = useState(false);
  const [invoicePopover, setInvoicePopover] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    contactId: null as string | null,
    contactName: "",
    date: new Date().toISOString().split("T")[0],
    linkedInvoiceId: null as string | null,
    linkedInvoiceNumber: "",
    reason: "",
    reasonOther: "",
    notes: "",
    items: [newItem()] as Item[],
    status: "draft" as "draft" | "sent" | "cancelled",
  });

  // ─── Load contacts + linked invoices ───
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: cts } = await supabase
        .from("contacts")
        .select("id, contact_name, contact_type")
        .eq("user_id", user.id)
        .eq("contact_type", partyType)
        .order("contact_name");
      setContacts((cts as Contact[]) || []);
      setLoading(false);
    })();
  }, [user, partyType]);

  // Load linked invoices when contact changes
  useEffect(() => {
    if (!user || !form.contactId) { setLinkedInvoices([]); return; }
    (async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, contact_name, contact_id, total_amount, invoice_date")
        .eq("user_id", user.id)
        .eq("contact_id", form.contactId)
        .eq("invoice_type", linkedType)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(50);
      setLinkedInvoices((data as InvoiceLite[]) || []);
    })();
  }, [user, form.contactId, linkedType]);

  // ─── Load existing record (edit/view) ───
  useEffect(() => {
    if (!user || !recordId) return;
    (async () => {
      const { data: inv } = await supabase
        .from("invoices")
        .select("*, invoice_items(*)")
        .eq("id", recordId)
        .eq("user_id", user.id)
        .single();
      if (!inv) return;
      const items = ((inv as any).invoice_items || []).map((it: any) => ({
        id: it.id,
        productId: it.product_id || null,
        description: it.product_name || it.description || "",
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unit_price) || 0,
        discount: Number(it.discount) || 0,
        taxCategory: (Number(it.tax_rate) > 0 ? "taxable" : "zero") as TaxCategory,
        taxRate: Number(it.tax_rate) || 0,
      }));
      setForm({
        contactId: (inv as any).contact_id || null,
        contactName: (inv as any).contact_name || "",
        date: (inv as any).invoice_date || new Date().toISOString().split("T")[0],
        linkedInvoiceId: (inv as any).original_invoice_id || null,
        linkedInvoiceNumber: "",
        reason: (inv as any).correction_reason || "",
        reasonOther: "",
        notes: (inv as any).notes || "",
        items: items.length > 0 ? items : [newItem()],
        status: (inv as any).status || "draft",
      });
      // Fetch linked invoice number
      if ((inv as any).original_invoice_id) {
        const { data: linked } = await supabase
          .from("invoices")
          .select("invoice_number")
          .eq("id", (inv as any).original_invoice_id)
          .single();
        if (linked) setForm(p => ({ ...p, linkedInvoiceNumber: (linked as any).invoice_number || "" }));
      }
    })();
  }, [user, recordId]);

  // ─── Pull items from linked invoice ───
  const pullItemsFromInvoice = async (invId: string) => {
    const { data } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invId);
    const items = ((data as any[]) || []).map((it: any) => ({
      id: crypto.randomUUID(),
      productId: it.product_id || null,
      description: it.product_name || it.description || "",
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unit_price) || 0,
      discount: Number(it.discount) || 0,
      taxCategory: (Number(it.tax_rate) > 0 ? "taxable" : "zero") as TaxCategory,
      taxRate: Number(it.tax_rate) || 0,
    }));
    if (items.length > 0) {
      setForm(p => ({ ...p, items }));
      toast({ title: `تم نسخ ${items.length} بند من الفاتورة الأصلية ✅` });
    }
  };

  // ─── Calculations ───
  const summary = useMemo(() => {
    let net = 0, discount = 0, tax = 0;
    form.items.forEach(it => {
      const gross = it.quantity * it.unitPrice;
      const afterDisc = gross - it.discount;
      discount += it.discount;
      net += afterDisc;
      if (taxEnabled && it.taxCategory === "taxable") {
        tax += afterDisc * 0.16;
      }
    });
    return { subtotal: net + discount, discount, net, tax, total: net + tax };
  }, [form.items, taxEnabled]);

  // ─── Item ops ───
  const updateItem = (id: string, patch: Partial<Item>) => {
    setForm(p => ({
      ...p,
      items: p.items.map(it => {
        if (it.id !== id) return it;
        const upd = { ...it, ...patch };
        if (patch.taxCategory) {
          const opt = TAX_OPTS.find(o => o.value === patch.taxCategory);
          upd.taxRate = opt?.rate || 0;
        }
        return upd;
      }),
    }));
  };

  const addItem = () => setForm(p => ({ ...p, items: [...p.items, newItem()] }));
  const removeItem = (id: string) => setForm(p => ({
    ...p,
    items: p.items.length > 1 ? p.items.filter(it => it.id !== id) : p.items,
  }));

  // ─── Validation ───
  const validate = (asDraft: boolean): boolean => {
    if (!form.contactName.trim()) { toast({ title: `يرجى اختيار ${partyLabel}`, variant: "destructive" }); return false; }
    const finalReason = form.reason === "أخرى" ? form.reasonOther.trim() : form.reason;
    if (!asDraft && !finalReason) { toast({ title: "يرجى تحديد سبب الإشعار", variant: "destructive" }); return false; }
    if (!asDraft && form.items.some(it => !it.description.trim() || it.quantity <= 0 || it.unitPrice <= 0)) {
      toast({ title: "تأكد من تعبئة جميع البنود (الوصف، الكمية، السعر)", variant: "destructive" });
      return false;
    }
    if (!asDraft && summary.total <= 0) {
      toast({ title: "إجمالي الإشعار يجب أن يكون أكبر من صفر", variant: "destructive" });
      return false;
    }
    return true;
  };

  // ─── Save ───
  const handleSave = async (asDraft: boolean) => {
    if (!user) return;
    if (!validate(asDraft)) return;
    setSaving(true);
    try {
      const finalReason = form.reason === "أخرى" ? form.reasonOther.trim() : form.reason;

      const payload: any = {
        user_id: user.id,
        invoice_type: dbType,
        is_credit_note: isCustomerSide,
        contact_id: form.contactId,
        contact_name: form.contactName,
        invoice_date: form.date,
        original_invoice_id: form.linkedInvoiceId,
        correction_reason: finalReason,
        subtotal: summary.subtotal,
        discount_amount: summary.discount,
        tax_amount: summary.tax,
        total_amount: summary.total,
        paid_amount: 0,
        remaining_amount: summary.total,
        payment_status: "unpaid",
        payment_method: "آجل",
        currency: "شيكل",
        notes: form.notes || null,
        source: "manual",
        status: asDraft ? "draft" : "sent",
      };

      let noteId = editId;
      let noteNumber = "";

      if (editId) {
        const { error } = await supabase.from("invoices").update(payload).eq("id", editId).eq("user_id", user.id);
        if (error) throw error;
        await supabase.from("invoice_items").delete().eq("invoice_id", editId);
        const { data: row } = await supabase.from("invoices").select("invoice_number").eq("id", editId).single();
        noteNumber = (row as any)?.invoice_number || "";
      } else {
        const { data: ins, error } = await supabase.from("invoices").insert(payload).select("id, invoice_number").single();
        if (error) throw error;
        noteId = (ins as any).id;
        noteNumber = (ins as any).invoice_number || "";
      }

      const itemsPayload = form.items
        .filter(it => it.description.trim())
        .map(it => ({
          invoice_id: noteId,
          product_id: it.productId || null,
          product_name: it.description,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          discount: it.discount,
          tax_rate: it.taxRate,
          total_amount: (it.quantity * it.unitPrice - it.discount) * (1 + (it.taxCategory === "taxable" && taxEnabled ? 0.16 : 0)),
        }));
      if (itemsPayload.length > 0) {
        await supabase.from("invoice_items").insert(itemsPayload as any);
      }

      // ─── Post accounting entry (reverse of original invoice) ───
      if (!asDraft && summary.total > 0) {
        const txDescription = `${titleAr} ${noteNumber} - ${form.contactName}`;
        // Credit Note     : Dr Sales Revenue (4100), Cr AR (1130)
        // Debit Note      : Dr AP (2110),           Cr Purchases (5110)
        // Sales Return    : Dr Sales Returns (4150 contra-revenue), Cr AR (1130)
        // Purchase Return : Dr AP (2110),           Cr Purchase Returns (5150 contra-expense)
        let debitCode = "4100";
        let creditCode = "1130";
        if (noteType === "credit")          { debitCode = "4100"; creditCode = "1130"; }
        else if (noteType === "debit")      { debitCode = "2110"; creditCode = "5110"; }
        const txType = dbType;

        const { data: txInsert } = await supabase.from("transactions").insert({
          user_id: user.id,
          transaction_date: form.date,
          description: txDescription,
          debit_account_code: debitCode,
          credit_account_code: creditCode,
          amount: summary.total,
          currency: "شيكل",
          transaction_type: txType,
          contact_id: form.contactId,
          reference: noteNumber,
          payment_method: "آجل",
          idempotency_key: `${dbType.toUpperCase()}-${noteId}`,
        } as any).select("id").single();

        if (txInsert) {
          await supabase.from("invoices").update({ linked_transaction_id: (txInsert as any).id } as any).eq("id", noteId);
        }

        // Tax ledger reversal
        if (summary.tax > 0) {
          const d = new Date(form.date);
          await supabase.from("tax_ledger").insert({
            user_id: user.id,
            tax_type: isCustomerSide ? "output" : "input",
            net_amount: -summary.net,
            tax_rate: 16,
            tax_amount: -summary.tax,
            total_amount: -summary.total,
            reference_type: dbType,
            reference_id: noteId,
            reference_number: noteNumber,
            contact_name: form.contactName,
            description: txDescription,
            transaction_date: form.date,
            period_year: d.getFullYear(),
            period_month: d.getMonth() + 1,
          } as any);
        }
      }

      toast({ title: asDraft ? "تم حفظ المسودة ✅" : `تم ترحيل ${titleAr} ${noteNumber} ✅` });
      navigate(listPath);
    } catch (err: any) {
      console.error(err);
      toast({ title: "خطأ في الحفظ", description: err?.message || "حدث خطأ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const isPosted = form.status !== "draft" && !!recordId;
  const readonly = isView || isPosted;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4" dir="rtl">
      <PageHeader
        title={isView ? `معاينة ${titleAr}` : recordId ? `تعديل ${titleAr}` : `إنشاء ${titleAr}`}
        breadcrumb={["الرئيسية", isCustomerSide ? "المبيعات" : "المشتريات", titleAr]}
      />
      <div className="flex justify-between items-start gap-3">
        <p className="text-sm text-muted-foreground">
          {noteType === "credit"
            ? "تخفيض / إلغاء جزئي على فاتورة مبيعات"
            : "تخفيض / إرجاع على فاتورة مشتريات"}
        </p>
        <Button variant="outline" onClick={() => navigate(listPath)} className="gap-2">
          <ArrowRight className="h-4 w-4" /> رجوع للقائمة
        </Button>
      </div>

      {readonly && (
        <Card className={`border-${accent}-200 bg-${accent}-50/40 dark:bg-${accent}-950/20`}>
          <CardContent className="p-3 flex items-center gap-2 text-sm">
            <AlertTriangle className={`h-4 w-4 text-${accent}-600`} />
            {isPosted ? "هذا الإشعار مرحَّل ولا يقبل التعديل." : "وضع المعاينة فقط."}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ─── Main form ─── */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">معلومات الإشعار</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>{partyLabel} *</Label>
                  <Popover open={contactPopover} onOpenChange={setContactPopover}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between" disabled={readonly}>
                        {form.contactName || `اختر ${partyLabel}...`}
                        <Search className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="بحث..." />
                        <CommandList>
                          <CommandEmpty>لا توجد نتائج</CommandEmpty>
                          <CommandGroup>
                            {contacts.map(c => (
                              <CommandItem
                                key={c.id}
                                onSelect={() => {
                                  setForm(p => ({
                                    ...p,
                                    contactId: c.id,
                                    contactName: c.contact_name,
                                    linkedInvoiceId: null,
                                    linkedInvoiceNumber: "",
                                  }));
                                  setContactPopover(false);
                                }}
                              >
                                {c.contact_name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label>التاريخ</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                    disabled={readonly}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>مرتبط بفاتورة (اختياري)</Label>
                  <Popover open={invoicePopover} onOpenChange={setInvoicePopover}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between" disabled={readonly || !form.contactId}>
                        {form.linkedInvoiceNumber || (form.contactId ? "اختر فاتورة..." : `اختر ${partyLabel} أولاً`)}
                        <Search className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="بحث..." />
                        <CommandList>
                          <CommandEmpty>لا توجد فواتير</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                setForm(p => ({ ...p, linkedInvoiceId: null, linkedInvoiceNumber: "" }));
                                setInvoicePopover(false);
                              }}
                            >
                              — بدون ربط —
                            </CommandItem>
                            {linkedInvoices.map(inv => (
                              <CommandItem
                                key={inv.id}
                                onSelect={async () => {
                                  setForm(p => ({
                                    ...p,
                                    linkedInvoiceId: inv.id,
                                    linkedInvoiceNumber: inv.invoice_number || "",
                                  }));
                                  setInvoicePopover(false);
                                  await pullItemsFromInvoice(inv.id);
                                }}
                              >
                                <div className="flex justify-between w-full">
                                  <span className="font-mono">{inv.invoice_number}</span>
                                  <span className="text-muted-foreground text-xs">
                                    ₪{Number(inv.total_amount || 0).toLocaleString()} • {inv.invoice_date}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label>سبب الإشعار *</Label>
                  <Select
                    value={form.reason}
                    onValueChange={v => setForm(p => ({ ...p, reason: v }))}
                    disabled={readonly}
                  >
                    <SelectTrigger><SelectValue placeholder="اختر السبب..." /></SelectTrigger>
                    <SelectContent>
                      {reasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.reason === "أخرى" && (
                <div>
                  <Label>اكتب السبب</Label>
                  <Input
                    value={form.reasonOther}
                    onChange={e => setForm(p => ({ ...p, reasonOther: e.target.value }))}
                    disabled={readonly}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Items ─── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">البنود</CardTitle>
              {!readonly && (
                <Button size="sm" variant="outline" onClick={addItem} className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> إضافة بند
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {form.items.map((it, idx) => (
                <div key={it.id} className="grid grid-cols-12 gap-2 items-end p-2 border rounded-lg">
                  <div className="col-span-12 sm:col-span-4">
                    <Label className="text-xs">الوصف</Label>
                    <Input
                      value={it.description}
                      onChange={e => updateItem(it.id, { description: e.target.value })}
                      disabled={readonly}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-xs">الكمية</Label>
                    <Input
                      type="number"
                      value={it.quantity}
                      onChange={e => updateItem(it.id, { quantity: Number(e.target.value) || 0 })}
                      disabled={readonly}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-xs">السعر</Label>
                    <Input
                      type="number"
                      value={it.unitPrice}
                      onChange={e => updateItem(it.id, { unitPrice: Number(e.target.value) || 0 })}
                      disabled={readonly}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-xs">خصم</Label>
                    <Input
                      type="number"
                      value={it.discount}
                      onChange={e => updateItem(it.id, { discount: Number(e.target.value) || 0 })}
                      disabled={readonly}
                    />
                  </div>
                  {taxEnabled && (
                    <div className="col-span-8 sm:col-span-2">
                      <Label className="text-xs">الضريبة</Label>
                      <Select
                        value={it.taxCategory}
                        onValueChange={v => updateItem(it.id, { taxCategory: v as TaxCategory })}
                        disabled={readonly}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TAX_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {!readonly && (
                    <div className="col-span-12 flex justify-end">
                      <Button size="icon" variant="ghost" onClick={() => removeItem(it.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">ملاحظات</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                rows={3}
                placeholder="ملاحظات إضافية..."
                disabled={readonly}
              />
            </CardContent>
          </Card>
        </div>

        {/* ─── Summary sidebar ─── */}
        <div className="space-y-4">
          <Card className={`border-${accent}-200`}>
            <CardHeader>
              <CardTitle className={`text-base text-${accent}-700 dark:text-${accent}-400 flex items-center justify-between`}>
                <span>الإجمالي</span>
                <Badge className={isCustomerSide ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>
                  {titleAr}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>الصافي</span><span className="font-mono">₪{summary.net.toFixed(2)}</span></div>
              {summary.discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>الخصم</span><span className="font-mono">-₪{summary.discount.toFixed(2)}</span>
                </div>
              )}
              {taxEnabled && summary.tax > 0 && (
                <div className="flex justify-between"><span>الضريبة 16%</span><span className="font-mono">₪{summary.tax.toFixed(2)}</span></div>
              )}
              <div className={`flex justify-between pt-2 border-t font-bold text-lg text-${accent}-700`}>
                <span>الإجمالي</span><span className="font-mono">₪{summary.total.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          {!readonly && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <Button
                  className="w-full gap-2"
                  onClick={() => handleSave(false)}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  ترحيل الإشعار
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => handleSave(true)}
                  disabled={saving}
                >
                  <Save className="h-4 w-4" /> حفظ كمسودة
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreditDebitNoteCreatePage;
