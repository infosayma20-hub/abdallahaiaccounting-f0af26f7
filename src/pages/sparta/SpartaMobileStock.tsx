import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, Layers, AlertTriangle, CheckCircle, Flame } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
}

interface Batch {
  id: string;
  product_id: string;
  batch_number: string;
  lot_number: string | null;
  expiry_date: string;
  quantity_remaining: number;
  status: string;
}

export default function SpartaMobileStock() {
  const { companyId, ownerUserId } = useSpartaContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!companyId || !ownerUserId) return;
      try {
        setLoading(true);
        const [prodRes, batRes] = await Promise.all([
          (supabase.from("products") as any)
            .select("id, name, sku, quantity")
            .eq("user_id", ownerUserId)
            .eq("is_deleted", false)
            .order("name"),
          (supabase.from("product_batches") as any)
            .select("id, product_id, batch_number, lot_number, expiry_date, quantity_remaining, status")
            .eq("company_id", companyId)
            .gt("quantity_remaining", 0)
            .order("expiry_date", { ascending: true }),
        ]);

        if (prodRes.error) throw prodRes.error;
        if (batRes.error) throw batRes.error;

        setProducts(prodRes.data || []);
        setBatches(batRes.data || []);
      } catch (err: any) {
        toast.error("خطأ في جلب بيانات المخزون: " + err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [companyId, ownerUserId]);

  const filteredProducts = products.filter((p) => {
    const term = q.toLowerCase().trim();
    if (!term) return true;
    return (
      p.name.toLowerCase().includes(term) ||
      (p.sku || "").toLowerCase().includes(term)
    );
  });

  const getDaysToExpiry = (expiryStr: string) => {
    const diff = new Date(expiryStr).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-8 flex flex-col" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/sparta/m" className="p-1 hover:bg-muted rounded-full">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold">الرصيد وتواريخ الصلاحية</h1>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث باسم الصنف أو الباركود..."
            className="pr-9"
          />
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-2">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-xs text-muted-foreground">جاري تحميل مستويات المخزون والتشغيلات...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 bg-card border rounded-2xl p-6">
            <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">لا توجد أصناف مطابقة</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProducts.map((p) => {
              const pBatches = batches.filter((b) => b.product_id === p.id);
              return (
                <div key={p.id} className="bg-card border rounded-xl p-4 space-y-3 shadow-xs">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className="text-[10px] bg-muted px-2 py-0.5 rounded-md font-mono text-muted-foreground">
                        {p.sku || "بدون كود"}
                      </span>
                      <h3 className="font-bold text-sm text-foreground mt-1 leading-snug">{p.name}</h3>
                    </div>
                    <div className="text-left">
                      <span className="text-[10px] text-muted-foreground block">الرصيد الإجمالي</span>
                      <strong className="text-base font-bold text-primary">{p.quantity}</strong>
                    </div>
                  </div>

                  {/* Active Batches details for the medical representative */}
                  {pBatches.length > 0 ? (
                    <div className="border-t pt-2 space-y-2">
                      <span className="text-[11px] font-semibold text-muted-foreground block">التشغيلات المتوفرة (FIFO):</span>
                      <div className="grid gap-2">
                        {pBatches.map((b) => {
                          const days = getDaysToExpiry(b.expiry_date);
                          const isExpired = days <= 0;
                          const isNearExpiry = days > 0 && days <= 90;

                          return (
                            <div key={b.id} className="bg-muted/30 rounded-lg p-2.5 flex items-center justify-between text-xs gap-2">
                              <div>
                                <div className="flex items-center gap-1.5 font-semibold">
                                  <span>LOT: {b.batch_number}</span>
                                  {b.lot_number && <span className="text-muted-foreground text-[10px]">({b.lot_number})</span>}
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <span>ينتهي: {b.expiry_date}</span>
                                  {isExpired ? (
                                    <span className="text-red-500 font-bold flex items-center gap-0.5"><Flame className="h-3 w-3" /> منتهي!</span>
                                  ) : isNearExpiry ? (
                                    <span className="text-amber-600 font-semibold flex items-center gap-0.5"><AlertTriangle className="h-3 w-3" /> {days} يوم</span>
                                  ) : (
                                    <span className="text-emerald-600 flex items-center gap-0.5"><CheckCircle className="h-3 w-3" /> آمن</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-left font-semibold">
                                {b.quantity_remaining} وحدة
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="border-t pt-2 text-center py-1 text-xs text-muted-foreground italic">
                      لا يوجد تشغيلات مسجلة لهذه الزرعة / الملحق مخزونياً.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}