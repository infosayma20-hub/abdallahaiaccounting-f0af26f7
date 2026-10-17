import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { scoreSearchMatch, toSearchTokens } from "@/lib/productSearch";
import { shiftSaleLineTotals, validateShiftSale, type ShiftSaleLine } from "@/lib/pos/shift-sale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
type Product = { id: string; name: string; sku: string | null; barcode: string | null; unit: string | null; sell_price: number | null; tax_rate: number | null };
type Customer = { id: string; contact_name: string; phone: string | null };
export default function ShiftAddSaleDialog({ sessionId, ownerId, businessDate, cashBoxId, onDone }: {
  sessionId: string; ownerId: string; businessDate: string; cashBoxId: string | null; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [boxName, setBoxName] = useState("");
  const [query, setQuery] = useState("");
  const [customerQ, setCustomerQ] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [payment, setPayment] = useState<"cash" | "credit">("cash");
  const [lines, setLines] = useState<ShiftSaleLine[]>([]);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchAllRows<Product>((from, to) => supabase.from("products").select("id,name,sku,barcode,unit,sell_price,tax_rate").eq("user_id", ownerId).order("id").range(from, to)),
      fetchAllRows<Customer>((from, to) => supabase.from("contacts").select("id,contact_name,phone").eq("user_id", ownerId).in("contact_type", ["عميل", "عميل ومورد", "customer", "customer_supplier"]).eq("is_active", true).eq("is_archived", false).order("id").range(from, to)),
      cashBoxId ? supabase.from("cash_boxes").select("name").eq("id", cashBoxId).eq("user_id", ownerId).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([ps, cs, box]) => {
      if (cancelled) return;
      setProducts(ps); setCustomers(cs); setBoxName(box.data?.name || "غير مربوط");
    }).catch((e) => { if (!cancelled) toast.error(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, ownerId, cashBoxId]);
  const matches = useMemo(() => {
    const tokens = toSearchTokens(query);
    if (!tokens.length) return [];
    return products.map(p => ({ p, score: scoreSearchMatch(p.name, [p.sku, p.barcode], tokens, query) }))
      .filter(p => p.score >= 0).sort((a,b) => b.score-a.score).slice(0, 30).map(x => x.p);
  }, [products, query]);
  const customerMatches = customers.filter(c => scoreSearchMatch(c.contact_name, [c.phone], toSearchTokens(customerQ), customerQ) >= 0);
  const totals = lines.reduce((t,l) => { const v = shiftSaleLineTotals(l); return { total: t.total+v.total, tax: t.tax+v.tax, discount: t.discount+v.discount, net: t.net+v.net }; }, { total: 0, tax: 0, discount: 0, net: 0 });
  const fmt = (n: number) => `₪${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const add = (p: Product) => {
    setLines(ls => [...ls, { product_id: p.id, name: p.name, unit: p.unit || "قطعة", qty: 1, unit_price: Number(p.sell_price) || 0, discount_pct: 0, tax_rate: Number(p.tax_rate) || 0, notes: "" }]);
    setQuery("");
  };
  const update = (index: number, field: keyof ShiftSaleLine, value: string | number) => setLines(ls => ls.map((l,i) => i===index ? { ...l, [field]: value } : l));
  const start = () => {
    setLines([]); setQuery(""); setCustomerId(""); setCustomerName(""); setCustomerQ(""); setPayment("cash"); setNotes(""); setReason(""); requestId.current=crypto.randomUUID(); setOpen(true);
  };
  const save = async () => {
    if (saving.current) return;
    const error = validateShiftSale(lines, payment, customerId, reason);
    if (error) { toast.error(error); return; }
    saving.current=true; setBusy(true);
    try {
      const { data, error } = await supabase.rpc("pos_shift_add_sale_v1", {
        p_session_id: sessionId, p_items: lines.map(l => ({ product_id: l.product_id, qty: l.qty, unit_price: l.unit_price, discount_pct: l.discount_pct, notes: l.notes })),
        p_payment_type: payment, p_customer_id: customerId || null, p_customer_name: customerName.trim() || null,
        p_notes: notes.trim() || null, p_reason: reason.trim(), p_request_id: requestId.current,
      });
      if (error) throw error;
      const result = data as { success?: boolean; order_number?: string };
      if (!result?.success) throw new Error("لم يتم حفظ الفاتورة");
      toast.success(`تم ترحيل الفاتورة ${result.order_number || ""}`); setOpen(false); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر حفظ الفاتورة"); }
    finally { saving.current=false; setBusy(false); }
  };
  return <>
    <Button size="sm" variant="outline" onClick={start} disabled={!cashBoxId}><Plus className="h-4 w-4" />إضافة فاتورة مبيعات</Button>
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}>
      <DialogContent dir="rtl" className="max-w-4xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="text-right sm:text-right pe-6"><DialogTitle>فاتورة مبيعات على الوردية</DialogTitle><DialogDescription>{businessDate} · {boxName}</DialogDescription></DialogHeader>
        {loading ? <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : <fieldset disabled={busy} className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>طريقة الدفع</Label><Select dir="rtl" value={payment} onValueChange={v => setPayment(v as "cash" | "credit")}><SelectTrigger aria-label="طريقة الدفع"><SelectValue /></SelectTrigger><SelectContent dir="rtl"><SelectItem value="cash">نقدي — {boxName}</SelectItem><SelectItem value="credit">آجل — ذمة الزبون</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>الزبون {payment==="credit" ? "*" : "(اختياري)"}</Label><Input aria-label="بحث الزبون" placeholder="ابحث عن زبون" value={customerQ} onChange={e => setCustomerQ(e.target.value)} /><Select dir="rtl" value={customerId || "__none"} onValueChange={v => setCustomerId(v==="__none" ? "" : v)}><SelectTrigger aria-label="الزبون"><SelectValue placeholder="بدون زبون" /></SelectTrigger><SelectContent dir="rtl"><SelectItem value="__none">بدون زبون</SelectItem>{customerMatches.slice(0,100).map(c => <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>)}</SelectContent></Select></div>
            {payment==="cash" && !customerId && <Input aria-label="اسم الزبون الاختياري" maxLength={200} placeholder="اسم الزبون (اختياري)" value={customerName} onChange={e => setCustomerName(e.target.value)} />}
          </div>
          <div className="space-y-2"><div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="بحث صنف الفاتورة" placeholder="اسم الصنف أو الكود أو الباركود" className="pr-9" value={query} onChange={e => setQuery(e.target.value)} /></div>
            {query.trim() && <div className="max-h-48 overflow-y-auto divide-y divide-border border border-border rounded">{matches.map(p => <Button key={p.id} variant="ghost" className="h-auto w-full justify-between whitespace-normal text-right" onClick={() => add(p)}><span>{p.name} <span className="text-muted-foreground">· {p.unit || "قطعة"}</span></span><span className="shrink-0 flex items-center gap-2">{fmt(Number(p.sell_price)||0)}<Plus className="h-4 w-4" /></span></Button>)}{!matches.length && <div className="p-3 text-sm text-muted-foreground">لا توجد أصناف مطابقة</div>}</div>}
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="bg-muted text-muted-foreground"><tr>{["الصنف / الوحدة", "الكمية", "سعر الوحدة", "خصم %", "ضريبة %", "الإجمالي", ""].map((v,i) => <th key={i} className="px-2 py-2 text-right">{v}</th>)}</tr></thead><tbody>{lines.map((l,i) => <tr key={i} className="border-b border-border"><td className="min-w-40 p-2"><div>{l.name} · {l.unit}</div><Input className="mt-1 h-7 text-xs" aria-label={`ملاحظة صنف ${i+1}`} placeholder="ملاحظة الصنف" maxLength={500} value={l.notes} onChange={e => update(i,"notes",e.target.value)} /></td>{(["qty","unit_price","discount_pct"] as const).map(f => <td key={f} className="p-1"><Input className="w-20" dir="ltr" type="number" step="any" aria-label={`${f==="qty" ? "كمية" : f==="unit_price" ? "سعر" : "خصم"} صنف ${i+1}`} value={Number.isNaN(l[f]) ? "" : l[f]} onChange={e => update(i,f,e.target.value==="" ? NaN : Number(e.target.value))} /></td>)}<td className="p-2 tabular-nums">{l.tax_rate}%</td><td className="p-2 tabular-nums">{fmt(shiftSaleLineTotals(l).total)}</td><td><Button size="icon" variant="ghost" aria-label={`حذف صنف ${i+1}`} onClick={() => setLines(ls => ls.filter((_,j) => j!==i))}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody></table>{!lines.length && <div className="py-6 text-center text-muted-foreground">لا توجد أصناف بالفاتورة</div>}</div>
          <div className="flex flex-wrap justify-end gap-x-6 gap-y-2 text-sm"><span>الخصم {fmt(totals.discount)}</span><span>الصافي {fmt(totals.net)}</span><span>الضريبة {fmt(totals.tax)}</span><strong>الإجمالي {fmt(totals.total)}</strong></div>
          <Textarea aria-label="ملاحظة الفاتورة" placeholder="ملاحظة الفاتورة (اختياري)" maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          <Textarea aria-label="سبب إضافة الفاتورة" placeholder="سبب الإضافة على الوردية (إلزامي)" maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} rows={2} />
          <div className="flex gap-2"><Button onClick={save} disabled={busy || !lines.length}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}حفظ وترحيل الفاتورة</Button><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>إلغاء</Button></div>
        </fieldset>}
      </DialogContent>
    </Dialog>
  </>;
}