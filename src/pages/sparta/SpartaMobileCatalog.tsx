import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, ShoppingCart, Box, Tag } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  sell_price: number;
  buy_price: number;
  quantity: number;
  category: string | null;
}

export default function SpartaMobileCatalog() {
  const { ownerUserId } = useSpartaContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProducts() {
      if (!ownerUserId) return;
      try {
        setLoading(true);
        // Cast as any to prevent excessively deep type instantiation in complex Supabase client schemas
        const { data, error } = await (supabase
          .from("products") as any)
          .select("id, name, sku, sell_price, buy_price, quantity, category")
          .eq("user_id", ownerUserId)
          .eq("is_deleted", false)
          .order("name");

        if (error) throw error;
        setProducts(data as Product[] || []);
      } catch (err: any) {
        toast.error("خطأ في تحميل الكتالوج: " + err.message);
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, [ownerUserId]);

  const filtered = products.filter((p) => {
    const term = q.toLowerCase().trim();
    if (!term) return true;
    return (
      p.name.toLowerCase().includes(term) ||
      (p.sku || "").toLowerCase().includes(term) ||
      (p.category || "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-8 flex flex-col" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/sparta/m" className="p-1 hover:bg-muted rounded-full">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold">كتالوج المنتجات والأسعار</h1>
        </div>
        <Badge variant="outline" className="font-semibold text-xs px-2.5 py-0.5">
          {filtered.length} صنف
        </Badge>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث باسم المنتج أو الكود أو الفئة..."
            className="pr-9"
          />
        </div>

        {/* Product List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-2">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-xs text-muted-foreground">جاري تحميل كتالوج الأصناف...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-card border rounded-2xl p-6">
            <Tag className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">لم نعثر على أي منتجات مطابقة</p>
            <p className="text-xs text-muted-foreground mt-1">تأكد من صحة كلمة البحث وحاول مجدداً.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((p) => (
              <div key={p.id} className="bg-card border rounded-xl p-4 flex items-start gap-3 hover:shadow-sm transition-shadow">
                <div className="p-2.5 rounded-lg bg-primary/5 text-primary self-start">
                  <Box className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">{p.sku || "بدون كود"}</span>
                    <Badge variant="secondary" className="font-semibold">
                      ₪ {Number(p.sell_price).toFixed(2)}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-sm text-foreground leading-tight truncate">{p.name}</h3>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      المخزون الإجمالي: <strong className="text-foreground font-semibold">{p.quantity}</strong>
                    </span>
                    <Link to={`/sparta/m/sale?product_id=${p.id}`}>
                      <Button size="sm" className="h-7 text-[11px] gap-1 px-2.5">
                        <ShoppingCart className="h-3 w-3" />
                        بيع سريع
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}