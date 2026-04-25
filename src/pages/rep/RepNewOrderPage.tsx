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

  const total = items.reduce((s, i) => s + i.qty * i.price, 0);

  const save = async () => {
    if (!day) { toast({ title: "افتح يوم العمل أولاً", variant: "destructive" }); return; }
    if (items.length === 0) { toast({ title: "أضف منتجات للطلب", variant: "destructive" }); return; }
    if (paymentMethod === "credit" && !contactId) { toast({ title: "اختر العميل لطلب آجل", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const invoiceNumber = `REP-${Date.now()}`;
      const { data: inv, error: invErr } = await (supabase as any).from("invoices").insert({
        user_id: rep.user_id,
        warehouse_id: rep.default_warehouse_id,
        contact_id: paymentMethod === "credit" ? contactId : null,
        invoice_number: invoiceNumber,
        invoice_type: "sale",
        status: "posted",
        payment_method: paymentMethod,
        total_amount: total,
      }).select("id").single();
      if (invErr) throw invErr;

      const itemRows = items.map((i) => ({
        invoice_id: inv.id,
        product_id: i.product_id,
        product_name: i.name,
        quantity: i.qty,
        unit_price: i.price,
        total_amount: i.qty * i.price,
      }));
      const { error: itErr } = await (supabase as any).from("invoice_items").insert(itemRows);
      if (itErr) throw itErr;

      toast({ title: "تم حفظ الطلب", description: `الإجمالي: ${total.toFixed(2)} ₪` });
      navigate("/rep");
    } catch (e: any) {
      toast({ title: "تعذّر الحفظ", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!day) return <div className="p-4"><Card className="p-6 text-center text-muted-foreground">يجب فتح يوم العمل أولاً من الرئيسية</Card></div>;

  return (
    <div className="p-4 space-y-4">
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
          <Input placeholder="ابحث بالاسم / الباركود / SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10 h-11" />
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
                <Input type="number" inputMode="decimal" value={it.qty} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value) || 0 } : x))} className="h-9 text-sm" placeholder="الكمية" />
                <Input type="number" inputMode="decimal" value={it.price} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, price: Number(e.target.value) || 0 } : x))} className="h-9 text-sm" placeholder="السعر" />
              </div>
              <div className="text-xs text-muted-foreground mt-1">المجموع: {(it.qty * it.price).toFixed(2)} ₪</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </div>
        ))}
      </Card>

      <Card className="p-4 sticky bottom-20 bg-card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-muted-foreground">الإجمالي</div>
          <div className="text-2xl font-bold text-primary">{total.toFixed(2)} ₪</div>
        </div>
        <Button className="w-full h-12 text-base" onClick={save} disabled={saving || items.length === 0}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 ml-2" /> حفظ الطلب</>}
        </Button>
      </Card>
    </div>
  );
}