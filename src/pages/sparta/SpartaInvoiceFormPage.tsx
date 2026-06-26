import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { Button } from "@/components/ui/button";
import spartaLogoAsset from "@/assets/sparta-logo.png.asset.json";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowRight, Trash2, Plus, CheckCircle2, XCircle, Printer, DollarSign, Loader2 } from "lucide-react";

interface Invoice {
  id: string; invoice_number: string; invoice_date: string; due_date: string | null;
  status: "draft" | "posted" | "cancelled"; warehouse_id: string | null;
  currency: string; exchange_rate: number;
  subtotal: number; discount_amount: number; tax_rate: number; tax_amount: number;
  total: number; paid_amount: number; balance_due: number; notes: string | null;
  customer_id: string; sales_rep_id: string | null;
  posted_at: string | null; cancelled_at: string | null;
}
interface Item {
  id: string; product_id: string; product_name: string; sku: string | null;
  quantity: number; unit_price: number; discount: number; line_total: number;
  consumed_batches: any;
}
interface Product { id: string; name: string; sku: string | null; sell_price: number; quantity: number; }
interface Customer { id: string; name: string; clinic_name: string | null; balance: number; credit_limit: number; }
interface Payment { id: string; payment_date: string; amount: number; method: string; reference: string | null; is_voided: boolean; }

export default function SpartaInvoiceFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { companyId, isAdmin } = useSpartaContext();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openPay, setOpenPay] = useState(false);
  const [openCancel, setOpenCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [payForm, setPayForm] = useState({ amount: 0, method: "cash", reference: "", notes: "" });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: i }, { data: it }, { data: cs }, { data: ps }, { data: pays }] = await Promise.all([
      supabase.from("sparta_invoices").select("*").eq("id", id).maybeSingle(),
      supabase.from("sparta_invoice_items").select("*").eq("invoice_id", id).order("created_at"),
      supabase.from("sparta_customers").select("id, name, clinic_name, balance, credit_limit").eq("company_id", companyId!).order("name"),
      supabase.from("products").select("id, name, sku, sell_price, quantity").order("name").limit(500),
      supabase.from("sparta_payments").select("id, payment_date, amount, method, reference, is_voided").eq("invoice_id", id).order("payment_date", { ascending: false }),
    ]);
    setInv((i as any) || null);
    setItems((it as any) || []);
    setCustomers((cs as any) || []);
    setProducts((ps as any) || []);
    setPayments((pays as any) || []);
    setLoading(false);
  }, [id, companyId]);

  useEffect(() => { if (companyId && id) load(); }, [companyId, id, load]);

  if (loading || !inv) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline ml-2" /> جاري التحميل...</div>;
  }

  const isDraft = inv.status === "draft";
  const canEdit = isAdmin && isDraft;

  const updateInv = async (patch: Partial<Invoice>) => {
    const { error } = await supabase.from("sparta_invoices").update(patch).eq("id", inv.id);
    if (error) return toast.error(error.message);
    setInv({ ...inv, ...patch } as Invoice);
    setTimeout(load, 200);
  };

  const addItem = async (p: Product) => {
    if (!canEdit) return;
    const { error } = await supabase.from("sparta_invoice_items").insert({
      invoice_id: inv.id, product_id: p.id, product_name: p.name, sku: p.sku,
      quantity: 1, unit_price: Number(p.sell_price || 0), discount: 0,
    });
    if (error) return toast.error(error.message);
    load();
  };

  const updateItem = async (it: Item, patch: Partial<Item>) => {
    if (!canEdit) return;
    const { error } = await supabase.from("sparta_invoice_items").update(patch).eq("id", it.id);
    if (error) return toast.error(error.message);
    setItems((arr) => arr.map((x) => (x.id === it.id ? { ...x, ...patch, line_total: (patch.quantity ?? x.quantity) * (patch.unit_price ?? x.unit_price) - (patch.discount ?? x.discount) } : x)));
    setTimeout(load, 300);
  };

  const removeItem = async (it: Item) => {
    if (!canEdit) return;
    const { error } = await supabase.from("sparta_invoice_items").delete().eq("id", it.id);
    if (error) return toast.error(error.message);
    load();
  };

  const post = async () => {
    if (!isAdmin) return;
    if (items.length === 0) return toast.error("لا يمكن اعتماد فاتورة فارغة");
    setBusy(true);
    const { error } = await supabase.rpc("sparta_post_invoice", { _invoice_id: inv.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("تم اعتماد الفاتورة وخصم المخزون");
    load();
  };

  const cancel = async () => {
    if (!isAdmin) return;
    setBusy(true);
    const { error } = await supabase.rpc("sparta_cancel_invoice", { _invoice_id: inv.id, _reason: cancelReason || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("تم إلغاء الفاتورة" + (inv.status === "posted" ? " وإرجاع البضاعة" : ""));
    setOpenCancel(false);
    load();
  };

  const recordPayment = async () => {
    if (!isAdmin) return;
    if (payForm.amount <= 0) return toast.error("أدخل قيمة الدفعة");
    setBusy(true);
    const { error } = await supabase.rpc("sparta_record_payment", {
      _invoice_id: inv.id, _amount: payForm.amount, _method: payForm.method,
      _currency: inv.currency, _reference: payForm.reference || null, _notes: payForm.notes || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("تم تسجيل الدفعة");
    setOpenPay(false);
    setPayForm({ amount: 0, method: "cash", reference: "", notes: "" });
    load();
  };

  const customer = customers.find((c) => c.id === inv.customer_id);

  return (
    <div className="space-y-4 max-w-6xl mx-auto print:max-w-full" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <Button variant="ghost" size="sm" onClick={() => nav("/sparta/invoices")}>
          <ArrowRight className="h-4 w-4 ml-1" /> رجوع
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 ml-1" /> طباعة</Button>
          {isAdmin && inv.status === "posted" && inv.balance_due > 0 && (
            <Button size="sm" onClick={() => { setPayForm({ ...payForm, amount: inv.balance_due }); setOpenPay(true); }}>
              <DollarSign className="h-4 w-4 ml-1" /> تسجيل دفعة
            </Button>
          )}
          {isAdmin && isDraft && items.length > 0 && (
            <Button size="sm" onClick={post} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="h-4 w-4 ml-1" /> اعتماد الفاتورة
            </Button>
          )}
          {isAdmin && inv.status !== "cancelled" && (
            <Button size="sm" variant="destructive" onClick={() => setOpenCancel(true)}>
              <XCircle className="h-4 w-4 ml-1" /> إلغاء
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Banner & Details */}
      <div className="bg-card border rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <img src={spartaLogoAsset.url} alt="Sparta Trade" className="h-20 w-auto object-contain bg-white rounded-md p-1 border" />
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Sparta Trade</h1>
            <p className="text-xs text-muted-foreground">شركة سبارتا للتجارة واستيراد زرعات الأسنان</p>
          </div>
        </div>
        <div className="flex flex-wrap md:flex-nowrap gap-6 w-full md:w-auto items-center">
          <div className="px-4 border-r dark:border-slate-800 rtl:border-l">
            <div className="text-xs text-muted-foreground">رقم الفاتورة</div>
            <div className="text-lg font-bold font-mono">{inv.invoice_number}</div>
            <Badge className="mt-1" variant={inv.status === "posted" ? "secondary" : inv.status === "cancelled" ? "destructive" : "outline"}>
              {inv.status === "draft" ? "مسودة" : inv.status === "posted" ? "معتمدة" : "ملغاة"}
            </Badge>
          </div>
          <div className="px-4 border-r dark:border-slate-800 rtl:border-l">
            <Label className="text-xs">العميل</Label>
            {canEdit ? (
              <select className="w-full border rounded-md px-2 py-1.5 bg-background text-sm mt-1" value={inv.customer_id} onChange={(e) => updateInv({ customer_id: e.target.value })}>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.clinic_name ? ` — ${c.clinic_name}` : ""}</option>)}
              </select>
            ) : (
              <div className="font-medium mt-1">{customer?.name} {customer?.clinic_name && <span className="text-muted-foreground">— {customer.clinic_name}</span>}</div>
            )}
            {customer && (
              <div className="text-xs text-muted-foreground mt-1">
                الرصيد الجاري: ₪ {Number(customer.balance).toFixed(2)}
                {customer.credit_limit > 0 && ` / حد الائتمان: ₪ ${Number(customer.credit_limit).toFixed(2)}`}
              </div>
            )}
          </div>
          <div className="px-4 grid grid-cols-2 gap-2 border-r dark:border-slate-800 rtl:border-l">
            <div>
              <Label className="text-xs">التاريخ</Label>
              <Input type="date" value={inv.invoice_date} disabled={!canEdit} onChange={(e) => updateInv({ invoice_date: e.target.value })} className="mt-1 h-8" />
            </div>
            <div>
              <Label className="text-xs">تاريخ الاستحقاق</Label>
              <Input type="date" value={inv.due_date || ""} disabled={!canEdit} onChange={(e) => updateInv({ due_date: e.target.value || null })} className="mt-1 h-8" />
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <h3 className="font-semibold">الأصناف</h3>
          {canEdit && (
            <select
              className="border rounded-md px-2 py-1.5 bg-background text-sm max-w-xs"
              value=""
              onChange={(e) => {
                const p = products.find((x) => x.id === e.target.value);
                if (p) addItem(p);
                e.target.value = "";
              }}
            >
              <option value="">+ إضافة منتج...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id} disabled={p.quantity <= 0}>
                  {p.name}{p.sku ? ` (${p.sku})` : ""} — متاح: {p.quantity}
                </option>
              ))}
            </select>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-right">
            <tr>
              <th className="p-2">الصنف</th>
              <th className="p-2 w-24">الكمية</th>
              <th className="p-2 w-28">السعر</th>
              <th className="p-2 w-24">خصم</th>
              <th className="p-2 w-28">الإجمالي</th>
              {canEdit && <th className="p-2 w-12"></th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد أصناف{canEdit ? " — أضف منتجاً من القائمة أعلاه" : ""}</td></tr>
            )}
            {items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="p-2">
                  <div className="font-medium">{it.product_name}</div>
                  {it.sku && <div className="text-xs text-muted-foreground font-mono">{it.sku}</div>}
                  {Array.isArray(it.consumed_batches) && it.consumed_batches.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      LOT: {it.consumed_batches.map((b: any) => `${b.batch_number} (${b.taken})`).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="p-2">
                  {canEdit ? <Input type="number" min={1} step="1" value={it.quantity} onChange={(e) => updateItem(it, { quantity: Number(e.target.value) })} className="h-8" /> : it.quantity}
                </td>
                <td className="p-2">
                  {canEdit ? <Input type="number" step="0.01" value={it.unit_price} onChange={(e) => updateItem(it, { unit_price: Number(e.target.value) })} className="h-8" /> : Number(it.unit_price).toFixed(2)}
                </td>
                <td className="p-2">
                  {canEdit ? <Input type="number" step="0.01" value={it.discount} onChange={(e) => updateItem(it, { discount: Number(e.target.value) })} className="h-8" /> : Number(it.discount).toFixed(2)}
                </td>
                <td className="p-2 font-medium">{inv.currency} {Number(it.line_total).toFixed(2)}</td>
                {canEdit && (
                  <td className="p-2">
                    <Button size="sm" variant="ghost" onClick={() => removeItem(it)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-sm">الخصم والضريبة</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">خصم على الفاتورة (₪)</Label>
              <Input type="number" step="0.01" disabled={!canEdit} value={inv.discount_amount} onChange={(e) => updateInv({ discount_amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">نسبة الضريبة (مثال 0.16)</Label>
              <Input type="number" step="0.001" disabled={!canEdit} value={inv.tax_rate} onChange={(e) => updateInv({ tax_rate: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Textarea rows={3} disabled={!canEdit} value={inv.notes || ""} onChange={(e) => setInv({ ...inv, notes: e.target.value })} onBlur={() => updateInv({ notes: inv.notes })} />
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4">
          <h3 className="font-semibold text-sm mb-3">الإجمالي</h3>
          <Row label="المجموع الفرعي" value={`${inv.currency} ${Number(inv.subtotal).toFixed(2)}`} />
          <Row label="الخصم" value={`- ${inv.currency} ${Number(inv.discount_amount).toFixed(2)}`} />
          <Row label="الضريبة" value={`+ ${inv.currency} ${Number(inv.tax_amount).toFixed(2)}`} />
          <div className="border-t my-2"></div>
          <Row label="الإجمالي النهائي" value={`${inv.currency} ${Number(inv.total).toFixed(2)}`} bold />
          <Row label="المدفوع" value={`${inv.currency} ${Number(inv.paid_amount).toFixed(2)}`} className="text-emerald-600" />
          <Row label="الرصيد المستحق" value={`${inv.currency} ${Number(inv.balance_due).toFixed(2)}`} bold className="text-amber-600" />
        </div>
      </div>

      {/* Payments */}
      {payments.length > 0 && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="p-3 border-b bg-muted/30"><h3 className="font-semibold">المدفوعات</h3></div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-right">
              <tr><th className="p-2">التاريخ</th><th className="p-2">طريقة الدفع</th><th className="p-2">المرجع</th><th className="p-2">القيمة</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className={"border-t " + (p.is_voided ? "opacity-50 line-through" : "")}>
                  <td className="p-2">{p.payment_date}</td>
                  <td className="p-2">{methodLabel(p.method)}</td>
                  <td className="p-2 text-muted-foreground">{p.reference || "—"}</td>
                  <td className="p-2 font-medium">{inv.currency} {Number(p.amount).toFixed(2)}</td>
                  <td className="p-2">{p.is_voided && <Badge variant="destructive">ملغاة</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment Dialog */}
      <Dialog open={openPay} onOpenChange={setOpenPay}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تسجيل دفعة على الفاتورة {inv.invoice_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>القيمة (الرصيد المستحق: {inv.currency} {Number(inv.balance_due).toFixed(2)})</Label>
              <Input type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>طريقة الدفع</Label>
              <select className="w-full border rounded-md px-2 py-2 bg-background text-sm" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                <option value="cash">نقدي</option>
                <option value="transfer">تحويل بنكي</option>
                <option value="cheque">شيك</option>
                <option value="card">بطاقة</option>
              </select>
            </div>
            <div><Label>المرجع (اختياري)</Label><Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} placeholder="رقم الشيك / مرجع التحويل" /></div>
            <div><Label>ملاحظات</Label><Input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPay(false)}>إلغاء</Button>
            <Button onClick={recordPayment} disabled={busy}>تسجيل</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={openCancel} onOpenChange={setOpenCancel}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إلغاء الفاتورة {inv.invoice_number}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {inv.status === "posted" ? "سيتم إرجاع البضاعة المخصومة إلى المخزون تلقائياً." : "ستُلغى الفاتورة (لم يتم اعتمادها بعد)."}
          </p>
          <div><Label>سبب الإلغاء</Label><Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCancel(false)}>تراجع</Button>
            <Button variant="destructive" onClick={cancel} disabled={busy}>تأكيد الإلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, bold, className }: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div className={`flex items-center justify-between py-1 ${bold ? "font-bold text-base" : "text-sm"} ${className || ""}`}>
      <span>{label}</span><span className="font-mono">{value}</span>
    </div>
  );
}
function methodLabel(m: string) {
  return ({ cash: "نقدي", transfer: "تحويل بنكي", cheque: "شيك", card: "بطاقة" } as any)[m] || m;
}