import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Search, Save } from "lucide-react";
import { callCreateRepSaleAtomic } from "@/lib/rep-sale-rpc";

// ============================================================================
// TODO (post-demo): Add explicit `invoices.sales_rep_id` column and set it here.
// Current linkage between an invoice and its sales rep is INFERRED via:
//   invoices.warehouse_id == sales_representatives.default_warehouse_id
//   AND invoice_number LIKE 'REP-%'
// This is acceptable for the demo, but FAILS when:
//   - Multiple reps share the same warehouse
//   - A rep changes warehouse mid-period
//   - Manual invoices use the rep's warehouse outside van-sales flow
// Migration plan:
//   1) ALTER TABLE invoices ADD COLUMN sales_rep_id uuid REFERENCES sales_representatives(id);
//   2) Set p_sales_rep_id = rep.id when inserting the invoice below.
//   3) Update /admin/sales-rep-orders + reports + commissions to filter by sales_rep_id.
//   4) Backfill historical REP-% invoices via warehouse mapping.
// ============================================================================
type Item = { product_id: string; name: string; qty: number; price: number };

export default function RepNewOrderPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rep, setRep] = useState<any>(null);
  const [day, setDay] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "credit">("cash");
  const [contactId, setContactId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [discountType, setDiscountType] = useState<"value" | "percent">("value");
  const [discountInput, setDiscountInput] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: r } = await (supabase as any)
        .from("sales_representatives")
        .select("id, user_id, default_warehouse_id")
        .eq("auth_user_id", user.id).maybeSingle();
      if (!r) { setLoading(false); return; }
      setRep(r);

      const { data: d } = await (supabase as any)
        .from("van_sales_days").select("*")
        .eq("sales_rep_id", r.id).eq("status", "open")
        .order("opened_at", { ascending: false }).limit(1).maybeSingle();
      setDay(d);

      const [{ data: prods }, { data: cts }] = await Promise.all([
        (supabase as any).from("products").select("id, name, sku, barcode, sell_price").eq("user_id", r.user_id).limit(500),
        (supabase as any)
          .from("contacts")
          .select("id, contact_name, contact_type")
          .eq("user_id", r.user_id)
          .in("contact_type", ["customer", "both", "عميل", "كلاهما"])
          .eq("is_active", true)
          .eq("is_archived", false)
          .limit(200),
      ]);
      setProducts(prods || []);
      // Normalize contact name field
      setContacts((cts || []).map((c: any) => ({ ...c, name: c.contact_name })));
      console.log("[Rep] owner_id:", r.user_id, "warehouse:", r.default_warehouse_id, "products:", prods?.length, "contacts:", cts?.length);
      setLoading(false);
    })();
  }, [user?.id]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q) ||
      (p.barcode || "").toLowerCase().includes(q)
    ).slice(0, 50);
  }, [search, products]);

  const addProduct = (p: any) => {
    const price = Number(p.sell_price ?? 0);
    setItems((prev) => {
      const found = prev.find((i) => i.product_id === p.id);
      if (found) return prev.map((i) => i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product_id: p.id, name: p.name, qty: 1, price }];
    });
    setSearch("");
  };

  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const discountRaw = Number(discountInput) || 0;
  const discountAmount = (() => {
    if (discountRaw <= 0) return 0;
    if (discountType === "percent") {
      const pct = Math.min(discountRaw, 100);
      return +(subtotal * (pct / 100)).toFixed(2);
    }
    return Math.min(discountRaw, subtotal);
  })();
  const total = Math.max(0, subtotal - discountAmount);
  const discountInvalid =
    discountRaw > 0 &&
    ((discountType === "percent" && discountRaw > 100) ||
      (discountType === "value" && discountRaw > subtotal));

  const save = async () => {
    if (!day) { toast({ title: "افتح يوم العمل أولاً", variant: "destructive" }); return; }
    if (items.length === 0) { toast({ title: "أضف منتجات للطلب", variant: "destructive" }); return; }
    if (paymentMethod === "credit" && !contactId) { toast({ title: "اختر العميل لطلب آجل", variant: "destructive" }); return; }
    if (discountInvalid) { toast({ title: "الخصم أكبر من الإجمالي", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const invoiceNumber = `REP-${Date.now()}`;
      const selectedContact = contacts.find((c) => c.id === contactId);
      const result = await callCreateRepSaleAtomic({
        userId: rep.user_id,
        salesRepId: rep.id,
        warehouseId: rep.default_warehouse_id,
        vanDayId: day.id,
        contactId: paymentMethod === "credit" ? contactId : null,
        contactName: paymentMethod === "credit" ? (selectedContact?.name ?? null) : "بيع نقدي - مندوب",
        paymentMethod,
        items: items.map((i) => ({ product_id: i.product_id, name: i.name, qty: i.qty, price: i.price })),
        idempotencyKey: invoiceNumber,
        invoiceNumber,
        discountType: discountAmount > 0 ? discountType : null,
        discountValue: discountAmount > 0 ? discountRaw : 0,
      });
      if (!result.success) throw new Error(result.error || "فشل تنفيذ البيع");
      const profitTxt = result.total_profit != null ? ` — ربح: ${Number(result.total_profit).toFixed(2)} ₪` : "";
      toast({
        title: result.duplicate ? "هذا الطلب موجود مسبقاً" : "تم حفظ الطلب",
        description: `الإجمالي: ${total.toFixed(2)} ₪${profitTxt}`,
      });
      navigate("/rep/orders");
    } catch (e: any) {
      toast({ title: "تعذّر الحفظ", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!day) return <div className="p-4"><Card className="p-6 text-center text-muted-foreground">يجب فتح يوم العمل أولاً من الرئيسية</Card></div>;

  return (
    <div className="p-4 space-y-4 pb-32">
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button variant={paymentMethod === "cash" ? "default" : "outline"} onClick={() => setPaymentMethod("cash")} className="h-11">نقدي</Button>
          <Button variant={paymentMethod === "credit" ? "default" : "outline"} onClick={() => setPaymentMethod("credit")} className="h-11">آجل (زبون)</Button>
        </div>
        {paymentMethod === "credit" && (
          <div className="space-y-2">
            <Label>الزبون</Label>
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">اختر زبون...</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-rep-search="1"
            placeholder="ابحث بالاسم / الباركود / SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filteredProducts.length > 0) {
                e.preventDefault();
                addProduct(filteredProducts[0]);
              }
            }}
            className="pr-10 h-11"
          />
        </div>
        {search && (
          <div className="max-h-64 overflow-y-auto space-y-1 border border-border rounded-md">
            {filteredProducts.map((p) => (
              <button key={p.id} onClick={() => addProduct(p)} className="w-full text-right p-3 hover:bg-muted flex items-center justify-between gap-2 border-b border-border last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.sku || p.barcode || ""}</div>
                </div>
                <Plus className="w-4 h-4 text-primary shrink-0" />
              </button>
            ))}
            {filteredProducts.length === 0 && <div className="p-3 text-sm text-muted-foreground text-center">لا توجد نتائج</div>}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="font-bold text-sm">بنود الطلب ({items.length})</h3>
        {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">لا توجد بنود — ابحث وأضف منتجات</p>}
        {items.map((it, idx) => (
          <div key={it.product_id} className="flex items-center gap-2 p-2 border border-border rounded-md">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{it.name}</div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={it.qty}
                  data-rep-qty={it.product_id}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const el = document.querySelector<HTMLInputElement>(`[data-rep-price="${it.product_id}"]`);
                      el?.focus(); el?.select();
                    }
                  }}
                  onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value) || 0 } : x))}
                  className="h-9 text-sm"
                  placeholder="الكمية"
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  value={it.price}
                  data-rep-price={it.product_id}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      // Move to search to add next item
                      const search = document.querySelector<HTMLInputElement>('[data-rep-search="1"]');
                      search?.focus();
                    }
                  }}
                  onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, price: Number(e.target.value) || 0 } : x))}
                  className="h-9 text-sm"
                  placeholder="السعر"
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">المجموع: {(it.qty * it.price).toFixed(2)} ₪</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </div>
        ))}
      </Card>

      {items.length > 0 && (
        <Card className="p-4 space-y-3">
          <Label className="text-sm font-bold">خصم الفاتورة</Label>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <div className="grid grid-cols-2 gap-1 p-1 border border-border rounded-md">
              <button
                type="button"
                onClick={() => setDiscountType("value")}
                className={`h-8 rounded text-xs font-medium ${discountType === "value" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >₪</button>
              <button
                type="button"
                onClick={() => setDiscountType("percent")}
                className={`h-8 rounded text-xs font-medium ${discountType === "percent" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >%</button>
            </div>
            <Input
              type="number"
              inputMode="decimal"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder={discountType === "percent" ? "نسبة %" : "قيمة ₪"}
              className={`h-10 ${discountInvalid ? "border-destructive" : ""}`}
            />
          </div>
          {discountInvalid && (
            <div className="text-xs text-destructive">الخصم لا يمكن أن يتجاوز الإجمالي{discountType === "percent" ? " أو 100%" : ""}</div>
          )}
        </Card>
      )}

      <Card className="p-4 bg-card">
        <div className="space-y-1 mb-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>المجموع قبل الخصم</span>
            <span>{subtotal.toFixed(2)} ₪</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex items-center justify-between text-sm text-destructive">
              <span>الخصم{discountType === "percent" ? ` (${discountRaw}%)` : ""}</span>
              <span>− {discountAmount.toFixed(2)} ₪</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-sm font-medium">الإجمالي</div>
            <div className="text-2xl font-bold text-primary">{total.toFixed(2)} ₪</div>
          </div>
        </div>
        <Button className="w-full h-12 text-base" onClick={save} disabled={saving || items.length === 0}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 ml-2" /> حفظ الطلب</>}
        </Button>
      </Card>
    </div>
  );
}