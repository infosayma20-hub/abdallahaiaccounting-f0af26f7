import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Search, ArrowRight, ShoppingCart, Trash2, Save, FileCheck, Plus, Minus, UserCheck } from "lucide-react";
import { toast } from "sonner";

interface Customer {
  id: string;
  name: string;
  clinic_name: string | null;
  balance: number;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  sell_price: number;
  quantity: number;
}

interface CartItem {
  product: Product;
  quantity: number;
  price: number;
}

export default function SpartaMobileSale() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { companyId, ownerUserId, isAdmin } = useSpartaContext();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustId, setSelectedCustId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");

  const urlCustId = params.get("customer_id");
  const urlProdId = params.get("product_id");

  useEffect(() => {
    async function loadData() {
      if (!companyId || !ownerUserId) return;
      try {
        setLoading(true);
        const [custRes, prodRes] = await Promise.all([
          (supabase.from("sparta_customers") as any)
            .select("id, name, clinic_name, balance")
            .eq("company_id", companyId)
            .eq("is_active", true)
            .order("name"),
          (supabase.from("products") as any)
            .select("id, name, sku, sell_price, quantity")
            .eq("user_id", ownerUserId)
            .eq("is_deleted", false)
            .order("name"),
        ]);

        if (custRes.error) throw custRes.error;
        if (prodRes.error) throw prodRes.error;

        setCustomers(custRes.data || []);
        const prods = prodRes.data || [];
        setProducts(prods);

        // Pre-select customer if in URL
        if (urlCustId) {
          setSelectedCustId(urlCustId);
        }

        // Pre-add product if in URL
        if (urlProdId) {
          const found = prods.find((p: any) => p.id === urlProdId);
          if (found) {
            setCart([{ product: found, quantity: 1, price: found.sell_price }]);
          }
        }
      } catch (err: any) {
        toast.error("خطأ في تحميل البيانات: " + err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [companyId, ownerUserId, urlCustId, urlProdId]);

  const addToCart = (p: Product) => {
    const existing = cart.find((item) => item.product.id === p.id);
    if (existing) {
      setCart(
        cart.map((item) =>
          item.product.id === p.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        ),
      );
    } else {
      setCart([...cart, { product: p, quantity: 1, price: p.sell_price }]);
    }
    toast.success(`تمت إضافة ${p.name}`);
  };

  const updateQty = (productId: string, val: number) => {
    setCart(
      cart
        .map((item) => {
          if (item.product.id === productId) {
            const nQty = Math.max(1, item.quantity + val);
            return { ...item, quantity: nQty };
          }
          return item;
        })
        .filter(Boolean) as CartItem[],
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.product.id !== productId));
  };

  const total = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const handleCreate = async (shouldPost: boolean) => {
    if (!selectedCustId) return toast.error("الرجاء اختيار العميل أولاً");
    if (cart.length === 0) return toast.error("سلة المشتريات فارغة");
    if (!companyId) return;

    try {
      setSaving(true);
      // 1. Get next invoice number
      const { data: invNo, error: numError } = await (supabase.rpc(
        "sparta_next_invoice_number"
      ) as any);
      if (numError) throw numError;

      // 2. Insert invoice draft
      const { data: invoice, error: invError } = await (supabase
        .from("sparta_invoices") as any)
        .insert({
          company_id: companyId,
          customer_id: selectedCustId,
          invoice_number: invNo,
          invoice_date: new Date().toISOString().split("T")[0],
          status: "draft",
          notes: notes || null,
        })
        .select("id")
        .single();

      if (invError) throw invError;
      const invoiceId = invoice.id;

      // 3. Insert items
      const itemsToInsert = cart.map((item) => ({
        invoice_id: invoiceId,
        product_id: item.product.id,
        product_name: item.product.name,
        sku: item.product.sku,
        quantity: item.quantity,
        unit_price: item.price,
        discount: 0,
      }));

      const { error: itemsError } = await (supabase
        .from("sparta_invoice_items") as any)
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // 4. If direct post requested (and is admin)
      if (shouldPost) {
        if (!isAdmin) {
          toast.info("تم حفظ الفاتورة كمسودة؛ لا تملك صلاحية اعتماد الفواتير");
        } else {
          const { error: postError } = await supabase.rpc(
            "sparta_post_invoice",
            { _invoice_id: invoiceId },
          );
          if (postError) throw postError;
          toast.success("تم اعتماد الفاتورة وصرف المخزون بنجاح!");
        }
      } else {
        toast.success("تم حفظ الفاتورة كمسودة بنجاح");
      }

      nav(`/sparta/invoices/${invoiceId}`);
    } catch (err: any) {
      toast.error("فشل حفظ الفاتورة: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-20 flex flex-col" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b p-4 flex items-center gap-2">
        <Link to="/sparta/m" className="p-1 hover:bg-muted rounded-full">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold">فاتورة سريعة للمندوبين</h1>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-2">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs text-muted-foreground">جاري تحميل واجهة الفاتورة السريعة...</p>
        </div>
      ) : (
        <div className="p-4 space-y-5 flex-1">
          {/* Customer Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5" /> العميل / العيادة
            </Label>
            <select
              value={selectedCustId}
              onChange={(e) => setSelectedCustId(e.target.value)}
              className="w-full bg-card border rounded-xl p-3 text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="">-- اختر عميلاً --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.clinic_name ? `(${c.clinic_name})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Cart Contents */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
              <ShoppingCart className="h-3.5 w-3.5" /> زرعات ومستلزمات السلة
            </Label>

            {cart.length === 0 ? (
              <div className="text-center py-8 bg-card border border-dashed rounded-2xl text-xs text-muted-foreground italic">
                السلة فارغة. اختر أصنافاً من الأسفل لإضافتها للفاتورة.
              </div>
            ) : (
              <div className="bg-card border rounded-xl divide-y overflow-hidden shadow-xs">
                {cart.map((item) => (
                  <div key={item.product.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <h4 className="font-bold text-sm truncate">{item.product.name}</h4>
                      <span className="text-muted-foreground text-[10px] block">
                        السعر: ₪ {item.price.toFixed(2)} | المخزون المتاح: {item.product.quantity}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 border rounded-lg bg-muted/30 p-1">
                        <button
                          onClick={() => updateQty(item.product.id, -1)}
                          className="p-1 hover:bg-background rounded-md text-muted-foreground"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="font-bold w-5 text-center text-sm">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.product.id, 1)}
                          className="p-1 hover:bg-background rounded-md text-muted-foreground"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <div className="p-4 bg-muted/10 flex items-center justify-between font-bold text-sm">
                  <span>المجموع الإجمالي:</span>
                  <span className="text-primary text-base">₪ {total.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">ملاحظات الفاتورة</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اكتب أي ملاحظة أو شروط خاصة بالتسليم هنا..."
            />
          </div>

          {/* Product Picker */}
          <div className="space-y-2.5">
            <Label className="text-xs font-bold text-muted-foreground">إضافة أصناف للفاتورة</Label>
            <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
              {products.map((p) => {
                const isAdded = cart.some((item) => item.product.id === p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="bg-card border rounded-xl p-3 flex items-center justify-between text-xs cursor-pointer hover:bg-muted/10 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-foreground">{p.name}</h4>
                      <span className="text-muted-foreground text-[10px] block">
                        كود: {p.sku || "—"} | متاح: {p.quantity} وحدة
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-primary">₪ {p.sell_price.toFixed(2)}</span>
                      <Button size="sm" variant={isAdded ? "secondary" : "outline"} className="h-7 w-7 p-0 rounded-full">
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-3 flex gap-2 z-10 max-w-7xl mx-auto" dir="rtl">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => handleCreate(false)}
            className="flex-1 font-bold gap-1.5 h-12"
          >
            <Save className="h-4 w-4" /> حفظ كمسودة
          </Button>
          <Button
            disabled={saving}
            onClick={() => handleCreate(true)}
            className="flex-1 font-bold gap-1.5 h-12"
          >
            <FileCheck className="h-4 w-4" /> اعتماد وطباعة
          </Button>
        </div>
      )}
    </div>
  );
}