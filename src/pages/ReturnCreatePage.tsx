import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import { Loader2, Save, Send, Plus, Trash2, AlertTriangle, Package, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

type TaxCategory = "taxable" | "zero" | "exempt";

interface Item {
  id: string;
  productId?: string | null;
  sourceInvoiceItemId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxCategory: TaxCategory;
  taxRate: number;
  maxReturnableQty?: number | null; // for invoice-linked items
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

interface ProductLite {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  sell_price: number | null;
  buy_price: number | null;
  unit: string | null;
  product_type: string | null;
  quantity: number | null;
}

interface Props {
  returnType: "sales" | "purchase";
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

const REASONS_SALES = [
  "إرجاع منتج معيب",
  "إرجاع منتج غير مطابق للطلب",
  "إلغاء جزئي للطلب",
  "خطأ في الكمية المسلّمة",
  "اتفاق مع العميل",
  "أخرى",
];

const REASONS_PURCHASE = [
  "بضاعة معيبة من المورد",
  "بضاعة غير مطابقة للمواصفات",
  "إلغاء جزء من الطلبية",
  "خطأ في الكمية المستلمة",
  "اتفاق مع المورد",
  "أخرى",
];

const ReturnCreatePage = ({ returnType }: Props) => {
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

  const isSales = returnType === "sales";
  const titleAr = isSales ? "مردود مبيعات" : "مردود مشتريات";
  const partyLabel = isSales ? "العميل" : "المورد";
  const partyType = isSales ? "عميل" : "مورد";
  const linkedInvoiceType = isSales ? "sale" : "purchase";
  const reasons = isSales ? REASONS_SALES : REASONS_PURCHASE;
  const listPath = isSales ? "/sales/returns" : "/purchases/returns";

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [linkedInvoices, setLinkedInvoices] = useState<InvoiceLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [productPopoverFor, setProductPopoverFor] = useState<string | null>(null);
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
    refundMethod: "credit" as "credit" | "cash" | "bank",
    items: [newItem()] as Item[],
    status: "draft" as "draft" | "confirmed" | "cancelled",
  });

  // Load contacts
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: cts } = await supabase
        .from("contacts")
        .select("id, contact_name, contact_type")
        .eq("user_id", dataOwnerId!)
        .eq("contact_type", partyType)
        .order("contact_name");
      setContacts((cts as Contact[]) || []);
      setLoading(false);
    })();
  }, [user, partyType]);

  // Load products (for line-item selection)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, barcode, category, sell_price, buy_price, unit, product_type, quantity")
        .eq("user_id", dataOwnerId!)
        .order("name");
      setProducts((data as ProductLite[]) || []);
    })();
  }, [user]);

  // Load linked invoices when contact changes
  useEffect(() => {
    if (!user || !form.contactId) { setLinkedInvoices([]); return; }
    (async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, contact_name, contact_id, total_amount, invoice_date")
        .eq("user_id", dataOwnerId!)
        .eq("contact_id", form.contactId)
        .eq("invoice_type", linkedInvoiceType)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(50);
      setLinkedInvoices((data as InvoiceLite[]) || []);
    })();
  }, [user, form.contactId, linkedInvoiceType]);

  // Load existing record (edit/view)
  useEffect(() => {
    if (!user || !recordId) return;
    (async () => {
      const { data: ret } = await supabase
        .from("returns" as any)
        .select("*")
        .eq("id", recordId)
        .eq("user_id", dataOwnerId!)
        .single();
      if (!ret) return;
      const r = ret as any;
      const { data: items } = await supabase
        .from("return_items" as any)
        .select("*")
        .eq("return_id", recordId);
      const mapped: Item[] = ((items as any[]) || []).map((it: any) => ({
        id: it.id,
        productId: it.product_id || null,
        sourceInvoiceItemId: it.source_invoice_item_id || null,
        description: it.description || "",
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unit_price) || 0,
        discount: Number(it.discount) || 0,
        taxCategory: (Number(it.tax_rate) > 0 ? "taxable" : "zero") as TaxCategory,
        taxRate: Number(it.tax_rate) || 0,
      }));
      setForm({
        contactId: r.contact_id || null,
        contactName: r.contact_name || "",
        date: r.return_date || new Date().toISOString().split("T")[0],
        linkedInvoiceId: r.related_invoice_id || null,
        linkedInvoiceNumber: "",
        reason: r.reason || "",
        reasonOther: "",
        notes: r.notes || "",
        refundMethod: (r.refund_method as any) || "credit",
        items: mapped.length > 0 ? mapped : [newItem()],
        status: r.status || "draft",
      });
      if (r.related_invoice_id) {
        const { data: linked } = await supabase
          .from("invoices")
          .select("invoice_number")
          .eq("id", r.related_invoice_id)
          .single();
        if (linked) setForm(p => ({ ...p, linkedInvoiceNumber: (linked as any).invoice_number || "" }));
      }
    })();
  }, [user, recordId]);

  // Pull items from linked invoice (with returnable quantities)
  const pullItemsFromInvoice = async (invId: string) => {
    const { data } = await supabase
      .from("invoice_items_returnable" as any)
      .select("*")
      .eq("invoice_id", invId);
    const items: Item[] = ((data as any[]) || [])
      .filter((it: any) => Number(it.remaining_returnable_quantity) > 0)
      .map((it: any) => ({
        id: crypto.randomUUID(),
        productId: it.product_id || null,
        sourceInvoiceItemId: it.invoice_item_id,
        description: it.description || "",
        quantity: Number(it.remaining_returnable_quantity) || 0,
        unitPrice: Number(it.unit_price) || 0,
        discount: 0,
        taxCategory: (Number(it.tax_rate) > 0 ? "taxable" : "zero") as TaxCategory,
        taxRate: Number(it.tax_rate) || 0,
        maxReturnableQty: Number(it.remaining_returnable_quantity) || 0,
      }));
    if (items.length > 0) {
      setForm(p => ({ ...p, items }));
      toast({ title: `تم نسخ ${items.length} بند قابل للإرجاع ✅` });
    } else {
      toast({ title: "لا توجد بنود قابلة للإرجاع في هذه الفاتورة", variant: "destructive" });
    }
  };

  // Calculations
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
        // Enforce max returnable quantity if linked
        if (patch.quantity !== undefined && it.maxReturnableQty != null && patch.quantity > it.maxReturnableQty) {
          toast({ title: "تجاوز الكمية المتبقية", description: `الحد الأقصى: ${it.maxReturnableQty}`, variant: "destructive" });
          upd.quantity = it.maxReturnableQty;
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

  const validate = (asDraft: boolean): boolean => {
    if (!form.contactName.trim()) { toast({ title: `يرجى اختيار ${partyLabel}`, variant: "destructive" }); return false; }
    const finalReason = form.reason === "أخرى" ? form.reasonOther.trim() : form.reason;
    if (!asDraft && !finalReason) { toast({ title: "يرجى تحديد سبب المردود", variant: "destructive" }); return false; }
    if (!asDraft && form.items.some(it => (!it.productId && !it.description.trim()) || it.quantity <= 0 || it.unitPrice <= 0)) {
      toast({ title: "تأكد من اختيار الصنف وتعبئة الكمية والسعر لكل بند", variant: "destructive" });
      return false;
    }
    if (!asDraft && summary.total <= 0) {
      toast({ title: "إجمالي المردود يجب أن يكون أكبر من صفر", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSave = async (asDraft: boolean) => {
    if (!user) return;
    if (!validate(asDraft)) return;
    setSaving(true);
    try {
      const finalReason = form.reason === "أخرى" ? form.reasonOther.trim() : form.reason;
      const targetStatus: "draft" | "confirmed" = asDraft ? "draft" : "confirmed";

      const payload: any = {
        user_id: user.id,
        return_type: returnType,
        contact_id: form.contactId,
        contact_name: form.contactName,
        return_date: form.date,
        related_invoice_id: form.linkedInvoiceId,
        reason: finalReason,
        notes: form.notes || null,
        refund_method: form.refundMethod,
        subtotal: summary.subtotal,
        discount_amount: summary.discount,
        tax_amount: summary.tax,
        total_amount: summary.total,
        // status set after save (so stock trigger fires on UPDATE only)
      };

      let returnId = editId;
      let returnNumber = "";

      if (editId) {
        // Update existing (always start as draft to allow item replacement, then re-confirm)
        const { error } = await supabase.from("returns" as any).update({ ...payload, status: "draft" } as any).eq("id", editId).eq("user_id", dataOwnerId!);
        if (error) throw error;
        await supabase.from("return_items" as any).delete().eq("return_id", editId);
        const { data: row } = await supabase.from("returns" as any).select("return_number").eq("id", editId).single();
        returnNumber = (row as any)?.return_number || "";
      } else {
        const { data: ins, error } = await supabase
          .from("returns" as any)
          .insert({ ...payload, status: "draft" } as any)
          .select("id, return_number")
          .single();
        if (error) throw error;
        returnId = (ins as any).id;
        returnNumber = (ins as any).return_number || "";
      }

      const itemsPayload = form.items
        .filter(it => it.description.trim())
        .map(it => ({
          return_id: returnId,
          user_id: dataOwnerId!,
          product_id: it.productId || null,
          source_invoice_item_id: it.sourceInvoiceItemId || null,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          discount: it.discount,
          tax_rate: it.taxRate,
          tax_amount: (it.quantity * it.unitPrice - it.discount) * (it.taxCategory === "taxable" && taxEnabled ? 0.16 : 0),
          line_total: (it.quantity * it.unitPrice - it.discount) * (1 + (it.taxCategory === "taxable" && taxEnabled ? 0.16 : 0)),
        }));
      if (itemsPayload.length > 0) {
        await supabase.from("return_items" as any).insert(itemsPayload as any);
      }

      // Confirm AFTER items are written so stock trigger sees them
      if (targetStatus === "confirmed" && summary.total > 0) {
        const { error: confirmErr } = await supabase
          .from("returns" as any)
          .update({ status: "confirmed" } as any)
          .eq("id", returnId);
        if (confirmErr) throw confirmErr;

        // Accounting entry
        // Sales Return:    Dr 4150 Sales Returns       Cr 1130 AR (or 1110 cash / 1120 bank)
        // Purchase Return: Dr 2110 AP (or cash/bank)   Cr 5150 Purchase Returns
        const cashCode = "1110";
        const bankCode = "1120";
        const arCode = "1130";
        const apCode = "2110";

        let debitCode: string, creditCode: string;
        if (isSales) {
          debitCode = "4150";
          creditCode = form.refundMethod === "cash" ? cashCode : form.refundMethod === "bank" ? bankCode : arCode;
        } else {
          debitCode = form.refundMethod === "cash" ? cashCode : form.refundMethod === "bank" ? bankCode : apCode;
          creditCode = "5160";
        }

        const txDescription = `${titleAr} ${returnNumber} - ${form.contactName}`;
        const { data: txInsert } = await supabase.from("transactions").insert({
          user_id: dataOwnerId!,
          transaction_date: form.date,
          description: txDescription,
          debit_account_code: debitCode,
          credit_account_code: creditCode,
          amount: summary.total,
          currency: "شيكل",
          transaction_type: isSales ? "sales_return" : "purchase_return",
          contact_id: form.contactId,
          reference: returnNumber,
          payment_method: form.refundMethod === "cash" ? "نقدي" : form.refundMethod === "bank" ? "بنك" : "آجل",
          return_id: returnId,
          idempotency_key: `RETURN-${returnId}`,
        } as any).select("id").single();

        if (txInsert) {
          await supabase.from("returns" as any).update({ journal_entry_id: (txInsert as any).id } as any).eq("id", returnId);
        }

        // Tax ledger reversal
        if (summary.tax > 0) {
          const d = new Date(form.date);
          await supabase.from("tax_ledger").insert({
            user_id: dataOwnerId!,
            tax_type: isSales ? "output" : "input",
            net_amount: -summary.net,
            tax_rate: 16,
            tax_amount: -summary.tax,
            reference_type: isSales ? "sales_return" : "purchase_return",
            reference_id: returnId,
            invoice_number: returnNumber,
            party_name: form.contactName,
            notes: txDescription,
            transaction_date: form.date,
            period_year: d.getFullYear(),
            period_month: d.getMonth() + 1,
          } as any);
        }
      }

      toast({ title: asDraft ? "تم حفظ المسودة ✅" : `تم تأكيد ${titleAr} ${returnNumber} ✅` });
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

  const isPosted = form.status === "confirmed" && !!recordId;
  const readonly = isView || isPosted;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 pb-32" dir="rtl">
      <PageHeader
        title={isView ? `معاينة ${titleAr}` : recordId ? `تعديل ${titleAr}` : `إنشاء ${titleAr}`}
        breadcrumb={["الرئيسية", isSales ? "المبيعات" : "المشتريات", titleAr]}
      />
      <p className="text-sm text-muted-foreground">
        {isSales
          ? "إرجاع بضاعة من العميل وإعادتها إلى المخزون تلقائياً"
          : "إرجاع بضاعة للمورد وخصمها من المخزون تلقائياً"}
      </p>

      {isPosted && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <AlertTriangle className="h-4 w-4" />
          هذا المردود مؤكد ومرحَّل محاسبياً ومخزنياً — لا يمكن تعديله.
        </div>
      )}

      {/* Header data */}
      <Card>
        <CardHeader><CardTitle className="text-base">بيانات المردود</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>{partyLabel} <span className="text-destructive">*</span></Label>
            <Popover open={contactPopover} onOpenChange={setContactPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" disabled={readonly} className="w-full justify-between">
                  {form.contactName || `اختر ${partyLabel}...`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[320px]">
                <Command>
                  <CommandInput placeholder={`بحث عن ${partyLabel}...`} />
                  <CommandList>
                    <CommandEmpty>لا يوجد</CommandEmpty>
                    <CommandGroup>
                      {contacts.map(c => (
                        <CommandItem
                          key={c.id}
                          onSelect={() => {
                            setForm(p => ({ ...p, contactId: c.id, contactName: c.contact_name, linkedInvoiceId: null, linkedInvoiceNumber: "" }));
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

          <div className="space-y-1">
            <Label>التاريخ</Label>
            <Input type="date" value={form.date} disabled={readonly} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>

          <div className="space-y-1">
            <Label>الفاتورة الأصلية (اختياري)</Label>
            <Popover open={invoicePopover} onOpenChange={setInvoicePopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" disabled={readonly || !form.contactId} className="w-full justify-between">
                  {form.linkedInvoiceNumber || (form.contactId ? "اختر الفاتورة الأصلية..." : `اختر ${partyLabel} أولاً`)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[360px]">
                <Command>
                  <CommandInput placeholder="بحث برقم الفاتورة..." />
                  <CommandList>
                    <CommandEmpty>لا توجد فواتير</CommandEmpty>
                    <CommandGroup>
                      <CommandItem onSelect={() => {
                        setForm(p => ({ ...p, linkedInvoiceId: null, linkedInvoiceNumber: "" }));
                        setInvoicePopover(false);
                      }}>
                        — بدون ربط —
                      </CommandItem>
                      {linkedInvoices.map(inv => (
                        <CommandItem
                          key={inv.id}
                          onSelect={async () => {
                            setForm(p => ({ ...p, linkedInvoiceId: inv.id, linkedInvoiceNumber: inv.invoice_number || "" }));
                            setInvoicePopover(false);
                            await pullItemsFromInvoice(inv.id);
                          }}
                        >
                          {inv.invoice_number} — ₪{Number(inv.total_amount || 0).toLocaleString()} — {inv.invoice_date}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label>طريقة الاسترداد</Label>
            <Select value={form.refundMethod} disabled={readonly} onValueChange={v => setForm(p => ({ ...p, refundMethod: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">{isSales ? "على ذمة العميل (آجل)" : "على ذمة المورد (آجل)"}</SelectItem>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="bank">بنك</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>السبب</Label>
            <Select value={form.reason} disabled={readonly} onValueChange={v => setForm(p => ({ ...p, reason: v }))}>
              <SelectTrigger><SelectValue placeholder="اختر السبب..." /></SelectTrigger>
              <SelectContent>
                {reasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.reason === "أخرى" && (
              <Input
                placeholder="حدّد السبب..."
                value={form.reasonOther}
                disabled={readonly}
                onChange={e => setForm(p => ({ ...p, reasonOther: e.target.value }))}
              />
            )}
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>ملاحظات</Label>
            <Textarea rows={2} value={form.notes} disabled={readonly} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="flex-row justify-between items-center">
          <CardTitle className="text-base">البنود المرتجعة</CardTitle>
          {!readonly && (
            <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
              <Plus className="h-4 w-4" /> إضافة بند
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {form.items.map((it, idx) => (
            <div key={it.id} className="grid grid-cols-12 gap-2 items-end p-2 rounded border">
              <div className="col-span-12 md:col-span-4 space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Package className="h-3 w-3" /> الصنف <span className="text-destructive">*</span>
                </Label>
                <Popover
                  open={productPopoverFor === it.id}
                  onOpenChange={(o) => setProductPopoverFor(o ? it.id : null)}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={readonly}
                      className="w-full justify-between h-9 text-xs font-normal"
                    >
                      <span className="truncate">
                        {it.description || "اختر الصنف..."}
                      </span>
                      <Search className="h-3 w-3 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[360px]" align="start">
                    <Command>
                      <CommandInput placeholder="ابحث بالاسم / SKU / الباركود / التصنيف..." />
                      <CommandList>
                        <CommandEmpty>لا توجد منتجات</CommandEmpty>
                        <CommandGroup>
                          {products.map((p) => {
                            const defaultPrice = isSales ? Number(p.sell_price || 0) : Number(p.buy_price || 0);
                            const keywords = [p.name, p.sku, p.barcode, p.category].filter(Boolean).join(" ");
                            return (
                              <CommandItem
                                key={p.id}
                                value={`${keywords} ${p.id}`}
                                onSelect={() => {
                                  updateItem(it.id, {
                                    productId: p.id,
                                    description: p.name,
                                    unitPrice: it.unitPrice > 0 ? it.unitPrice : defaultPrice,
                                  });
                                  setProductPopoverFor(null);
                                }}
                              >
                                <div className="flex flex-col gap-0.5 w-full">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium truncate">{p.name}</span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                      ₪{defaultPrice.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    {p.sku && <span>SKU: {p.sku}</span>}
                                    {p.barcode && <span>• {p.barcode}</span>}
                                    {p.category && <span>• {p.category}</span>}
                                    {p.product_type === "service" && <span className="text-primary">• خدمة</span>}
                                  </div>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="col-span-4 md:col-span-2 space-y-1">
                <Label className="text-xs">
                  الكمية
                  {it.maxReturnableQty != null && <span className="text-muted-foreground"> (الحد: {it.maxReturnableQty})</span>}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={it.maxReturnableQty ?? undefined}
                  value={it.quantity}
                  disabled={readonly}
                  onChange={e => updateItem(it.id, { quantity: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="col-span-4 md:col-span-2 space-y-1">
                <Label className="text-xs">السعر</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={it.unitPrice}
                  disabled={readonly}
                  onChange={e => updateItem(it.id, { unitPrice: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="col-span-4 md:col-span-2 space-y-1">
                <Label className="text-xs">خصم</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={it.discount}
                  disabled={readonly}
                  onChange={e => updateItem(it.id, { discount: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="col-span-10 md:col-span-1 space-y-1">
                <Label className="text-xs">ضريبة</Label>
                <Select value={it.taxCategory} disabled={readonly || !taxEnabled} onValueChange={v => updateItem(it.id, { taxCategory: v as TaxCategory })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAX_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 md:col-span-1 flex justify-end">
                {!readonly && form.items.length > 1 && (
                  <Button size="icon" variant="ghost" onClick={() => removeItem(it.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">الصافي قبل الضريبة</div>
              <div className="text-lg font-semibold">₪{summary.net.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">إجمالي الخصم</div>
              <div className="text-lg font-semibold">₪{summary.discount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">ضريبة (16%)</div>
              <div className="text-lg font-semibold">₪{summary.tax.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">الإجمالي</div>
              <div className={`text-2xl font-bold ${isSales ? "text-emerald-600" : "text-rose-600"}`}>
                ₪{summary.total.toLocaleString()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {!readonly && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-3 z-30">
          <div className="container mx-auto flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate(listPath)}>إلغاء</Button>
            <Button variant="secondary" disabled={saving} onClick={() => handleSave(true)} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ كمسودة
            </Button>
            <Button disabled={saving} onClick={() => handleSave(false)} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} تأكيد وترحيل
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnCreatePage;