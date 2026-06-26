import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowRight, Plus, Minus, Trash2, ShoppingCart, Save } from "lucide-react";
import { toast } from "sonner";

interface Customer { id: string; name: string; balance: number; }
interface Product { id: string; name: string; sku: string | null; sell_price: number; quantity: number; }
interface CartItem { product: Product; qty: number; price: number; }

export default function SpartaVanSale() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const dayId = params.get("day") || "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custId, setCustId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payMethod, setPayMethod] = useState<"cash" | "credit">("cash");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: cs }, { data: ps }] = await Promise.all([
        (supabase as any).from("sparta_customers").select("id, name, balance").eq("is_active", true).order("name"),
        (supabase as any).from("products").select("id, name, sku, sell_price, quantity").eq("is_active", true).order("name").limit(500),
      ]);
      setCustomers((cs as Customer[]) || []);
      setProducts((ps as Product[]) || []);
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 30);
    return products.filter((p) => p.name?.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s)).slice(0, 40);
  }, [q, products]);

  function addToCart(p: Product) {
    setCart((c) => {
      const ex = c.find((i) => i.product.id === p.id);
      if (ex) return c.map((i) => (i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...c, { product: p, qty: 1, price: p.sell_price }];
    });
  }

  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);

  async function save() {
    if (!dayId) return toast.error("جلسة غير صالحة");
    if (!custId) return toast.error("اختر زبون");
    if (!cart.length) return toast.error("أضف أصناف");
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("sparta_van_create_sale", {
      _van_day_id: dayId,
      _customer_id: custId,
      _items: cart.map((i) => ({
        product_id: i.product.id,
        product_name: i.product.name,
        quantity: i.qty,
        unit_price: i.price,
      })),
      _payment_method: payMethod,
      _paid_amount: payMethod === "cash" ? subtotal : 0,
      _warehouse_id: null,
      _notes: null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`تم حفظ الفاتورة ${data?.invoice_number || ""}`);
    nav(-1);
  }

  return (
    <div className="min-h-[100dvh] bg-background" dir="rtl">
      <header className="px-4 py-4 flex items-center gap-3 border-b" style={{ background: "var(--gradient-sparta)", color: "white" }}>
        <Link to={`/sparta/m/van`}><ArrowRight className="h-5 w-5 rotate-180" /></Link>
        <div className="flex-1 font-bold">فاتورة سريعة</div>
        <ShoppingCart className="h-5 w-5" />
      </header>

      <div className="p-4 max-w-md mx-auto space-y-3 pb-32">
        <div>
          <Label>الزبون</Label>
          <select value={custId} onChange={(e) => setCustId(e.target.value)} className="w-full mt-1 h-10 rounded-md border bg-background px-3">
            <option value="">-- اختر --</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.balance > 0 ? `· مدين ₪${c.balance.toFixed(0)}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>بحث صنف</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم أو SKU" />
          <div className="mt-2 border rounded-lg divide-y max-h-56 overflow-auto bg-card">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => addToCart(p)} className="w-full px-3 py-2 text-right hover:bg-muted/50 flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">{p.sku || ""} · متوفر {p.quantity}</div>
                </div>
                <div className="text-sm font-bold tabular-nums">₪ {Number(p.sell_price).toFixed(2)}</div>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted-foreground">لا نتائج</div>}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-bold">السلة ({cart.length})</div>
          {cart.map((i, idx) => (
            <div key={idx} className="flex items-center gap-2 border rounded-lg p-2 bg-card">
              <div className="flex-1">
                <div className="text-sm font-medium">{i.product.name}</div>
                <div className="text-[11px] text-muted-foreground">₪ {i.price.toFixed(2)} × {i.qty} = ₪ {(i.price * i.qty).toFixed(2)}</div>
              </div>
              <Button size="icon" variant="outline" onClick={() => setCart((c) => c.map((x, j) => j === idx ? { ...x, qty: Math.max(1, x.qty - 1) } : x))}><Minus className="h-4 w-4" /></Button>
              <div className="w-8 text-center tabular-nums">{i.qty}</div>
              <Button size="icon" variant="outline" onClick={() => setCart((c) => c.map((x, j) => j === idx ? { ...x, qty: x.qty + 1 } : x))}><Plus className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => setCart((c) => c.filter((_, j) => j !== idx))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>

        <div>
          <Label>طريقة الدفع</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <Button variant={payMethod === "cash" ? "default" : "outline"} onClick={() => setPayMethod("cash")}>نقدي</Button>
            <Button variant={payMethod === "credit" ? "default" : "outline"} onClick={() => setPayMethod("credit")}>آجل</Button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-3 flex items-center gap-3" dir="rtl">
        <div className="flex-1">
          <div className="text-[11px] text-muted-foreground">الإجمالي</div>
          <div className="font-bold text-lg tabular-nums">₪ {subtotal.toFixed(2)}</div>
        </div>
        <Button onClick={save} disabled={saving || !cart.length || !custId} className="min-w-36">
          <Save className="h-4 w-4 ms-2" /> {saving ? "جاري الحفظ..." : "حفظ الفاتورة"}
        </Button>
      </div>
    </div>
  );
}