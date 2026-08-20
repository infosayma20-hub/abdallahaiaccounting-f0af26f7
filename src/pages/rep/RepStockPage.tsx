import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Search, PackageX, TriangleAlert, Boxes, RefreshCw } from "lucide-react";

interface Prod {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  quantity: number;
  min_quantity: number | null;
  sell_price: number | null;
}

type Filter = "الكل" | "سالب" | "صفر" | "منخفض" | "متوفر";

export default function RepStockPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Prod[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("سالب");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: rep } = await (supabase as any)
      .from("sales_representatives")
      .select("user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!rep) { setRows([]); setLoading(false); return; }
    const { data } = await (supabase as any)
      .from("products")
      .select("id, name, sku, unit, quantity, min_quantity, sell_price")
      .eq("user_id", rep.user_id)
      .eq("is_deleted", false)
      .order("quantity", { ascending: true })
      .limit(2000);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const counts = useMemo(() => ({
    neg: rows.filter((p) => Number(p.quantity) < 0).length,
    zero: rows.filter((p) => Number(p.quantity) === 0).length,
    low: rows.filter((p) => Number(p.quantity) > 0 && Number(p.min_quantity) > 0 && Number(p.quantity) <= Number(p.min_quantity)).length,
    all: rows.length,
  }), [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((p) => {
      const qty = Number(p.quantity);
      if (filter === "سالب" && !(qty < 0)) return false;
      if (filter === "صفر" && qty !== 0) return false;
      if (filter === "متوفر" && !(qty > 0)) return false;
      if (filter === "منخفض" && !(qty > 0 && Number(p.min_quantity) > 0 && qty <= Number(p.min_quantity))) return false;
      if (!term) return true;
      return (p.name || "").toLowerCase().includes(term) || (p.sku || "").toLowerCase().includes(term);
    });
  }, [rows, q, filter]);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "سالب", label: "سالب", count: counts.neg },
    { key: "صفر", label: "صفر", count: counts.zero },
    { key: "منخفض", label: "منخفض", count: counts.low },
    { key: "متوفر", label: "متوفر", count: counts.all - counts.neg - counts.zero },
    { key: "الكل", label: "الكل", count: counts.all },
  ];

  return (
    <div dir="rtl" className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">أرصدة المخزون</h1>
          <p className="text-sm text-muted-foreground mt-1">الأصناف الصفر والسالبة قبل ما تبيع</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-border text-muted-foreground" aria-label="تحديث">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-center">
          <PackageX className="w-4 h-4 mx-auto text-destructive" />
          <div className="text-lg font-bold text-destructive tabular-nums">{counts.neg}</div>
          <div className="text-[10px] text-muted-foreground">سالب</div>
        </div>
        <div className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
          <Boxes className="w-4 h-4 mx-auto text-muted-foreground" />
          <div className="text-lg font-bold text-foreground tabular-nums">{counts.zero}</div>
          <div className="text-[10px] text-muted-foreground">صفر</div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-center">
          <TriangleAlert className="w-4 h-4 mx-auto text-amber-600" />
          <div className="text-lg font-bold text-amber-600 tabular-nums">{counts.low}</div>
          <div className="text-[10px] text-muted-foreground">منخفض</div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الصنف أو الكود..." className="pr-9" />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs border transition-colors ${
              filter === t.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
            }`}
          >
            {t.label} <span className="tabular-nums">({t.count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground border border-border rounded-xl">
          لا توجد أصناف مطابقة
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const qty = Number(p.quantity);
            const tone = qty < 0
              ? "border-destructive/40 bg-destructive/5"
              : qty === 0
                ? "border-border bg-secondary/30"
                : Number(p.min_quantity) > 0 && qty <= Number(p.min_quantity)
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-border bg-card";
            const qtyColor = qty < 0 ? "text-destructive" : qty === 0 ? "text-muted-foreground" : "text-foreground";
            return (
              <div key={p.id} className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${tone}`}>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {p.sku || "بدون كود"}{p.unit ? ` · ${p.unit}` : ""}
                    {Number(p.min_quantity) > 0 ? ` · الحد الأدنى ${p.min_quantity}` : ""}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className={`text-lg font-bold tabular-nums ${qtyColor}`}>{qty.toLocaleString()}</div>
                  {qty < 0 && <div className="text-[10px] text-destructive">رصيد سالب</div>}
                  {qty === 0 && <div className="text-[10px] text-muted-foreground">نفد</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
