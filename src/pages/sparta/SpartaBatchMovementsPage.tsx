import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Activity, Search } from "lucide-react";

interface Movement {
  id: string;
  created_at: string;
  product_id: string;
  batch_id: string;
  warehouse_id: string | null;
  quantity: number;
  direction: "in" | "out" | "transfer" | "adjustment";
  reference_type: string | null;
  notes: string | null;
}

const dirLabel: Record<string, string> = { in: "وارد", out: "صادر", transfer: "تحويل", adjustment: "تسوية" };
const dirVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  in: "secondary", out: "destructive", transfer: "outline", adjustment: "default",
};

export default function SpartaBatchMovementsPage() {
  const { companyId, ownerUserId } = useSpartaContext();
  const [rows, setRows] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Record<string, string>>({});
  const [batches, setBatches] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!companyId || !ownerUserId) return;
    (async () => {
      setLoading(true);
      const [m, p, b] = await Promise.all([
        supabase.from("batch_movements").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(500),
        supabase.from("products").select("id, name").eq("user_id", ownerUserId).limit(2000),
        supabase.from("product_batches").select("id, batch_number").eq("company_id", companyId).limit(2000),
      ]);
      if (m.error) toast.error(m.error.message);
      setRows((m.data as any) || []);
      setProducts(Object.fromEntries(((p.data as any) || []).map((x: any) => [x.id, x.name])));
      setBatches(Object.fromEntries(((b.data as any) || []).map((x: any) => [x.id, x.batch_number])));
      setLoading(false);
    })();
  }, [companyId, ownerUserId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      (products[r.product_id] || "").toLowerCase().includes(t) ||
      (batches[r.batch_id] || "").toLowerCase().includes(t) ||
      (r.reference_type || "").toLowerCase().includes(t)
    );
  }, [rows, q, products, batches]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6" /> حركات الدفعات</h1>
        <p className="text-sm text-muted-foreground">سجل تدقيق كامل لكل وارد/صادر/تسوية على مستوى الدفعة (LOT)</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالمنتج، رقم الدفعة، أو المرجع..." className="pr-9" />
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-right">
            <tr>
              <th className="p-3">التاريخ</th>
              <th className="p-3">المنتج</th>
              <th className="p-3">الدفعة</th>
              <th className="p-3">الاتجاه</th>
              <th className="p-3">الكمية</th>
              <th className="p-3">المرجع</th>
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>)}
            {!loading && filtered.length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد حركات</td></tr>)}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="p-3 text-muted-foreground text-xs">{new Date(r.created_at).toLocaleString("en-GB")}</td>
                <td className="p-3 font-medium">{products[r.product_id] || "—"}</td>
                <td className="p-3">{batches[r.batch_id] || "—"}</td>
                <td className="p-3"><Badge variant={dirVariant[r.direction] || "outline"}>{dirLabel[r.direction] || r.direction}</Badge></td>
                <td className="p-3 font-mono">{r.direction === "out" ? "-" : "+"}{Number(r.quantity).toLocaleString("en-US")}</td>
                <td className="p-3 text-muted-foreground">{r.reference_type || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}