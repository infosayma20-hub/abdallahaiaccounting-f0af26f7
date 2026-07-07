import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Pencil, Search, Factory } from "lucide-react";
import BackButton from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Product { id: string; name: string; sku?: string | null; }
interface FormulaItem { id?: string; product_id: string; quantity: number; }
interface Formula {
  id: string;
  name: string;
  code?: string | null;
  output_product_id: string;
  output_quantity: number;
  version?: number;
  status?: string;
  items?: FormulaItem[];
}

export default function ProductionFormulasPage() {
  useAuth();
  const nav = useNavigate();
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);

  const load = async () => {
    setLoading(true);
    const [{ data: fData }, { data: pData }] = await Promise.all([
      supabase.from("production_formulas" as any).select("*").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("products").select("id,name,sku").limit(2000) as any,
    ]);
    const list = (fData ?? []) as any as Formula[];
    if (list.length) {
      const ids = list.map(f => f.id);
      const { data: items } = await supabase.from("production_formula_items" as any).select("*").in("formula_id", ids);
      const grp: Record<string, FormulaItem[]> = {};
      (items ?? []).forEach((it: any) => {
        (grp[it.formula_id] ??= []).push({ id: it.id, product_id: it.product_id, quantity: Number(it.quantity) });
      });
      list.forEach(f => { f.items = grp[f.id] ?? []; });
    }
    setFormulas(list);
    setProducts((pData ?? []) as Product[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = formulas.filter(f =>
    !search || f.name.includes(search) || (f.code ?? "").includes(search) || (productMap[f.output_product_id]?.name ?? "").includes(search)
  );

  const openNew = () => nav("/production/formulas/new");
  const openEdit = (f: Formula) => nav(`/production/formulas/${f.id}/edit`);

  const remove = async (id: string) => {
    if (!confirm("حذف المعادلة؟")) return;
    const { error } = await supabase.from("production_formulas" as any).update({ is_deleted: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    load();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4" dir="rtl">
      <BackButton />
      <div className="mb-4 flex items-center gap-2">
        <Factory className="w-6 h-6 text-teal-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">معادلات الإنتاج (BOM)</h1>
          <p className="text-xs text-gray-500">تعريف مكونات المنتجات المصنّعة مع الهدر، العمالة، والتكاليف الصناعية غير المباشرة</p>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-2 top-2.5 w-4 h-4 text-gray-400" />
            <Input className="pr-8" placeholder="بحث…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button onClick={openNew}><Plus className="w-4 h-4 ml-1" /> معادلة جديدة</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="p-2 text-right">الاسم</th>
                <th className="p-2 text-right">الكود</th>
                <th className="p-2 text-right">المنتج النهائي</th>
                <th className="p-2 text-center">الكمية</th>
                <th className="p-2 text-center">عدد المكونات</th>
                <th className="p-2 text-center">النسخة</th>
                <th className="p-2 text-center">الحالة</th>
                <th className="p-2 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="p-6 text-center text-gray-500">جاري التحميل…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-gray-500">لا توجد معادلات</td></tr>}
              {filtered.map(f => (
                <tr key={f.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-semibold">{f.name}</td>
                  <td className="p-2 text-gray-600">{f.code ?? "—"}</td>
                  <td className="p-2">{productMap[f.output_product_id]?.name ?? "—"}</td>
                  <td className="p-2 text-center">{f.output_quantity}</td>
                  <td className="p-2 text-center">{f.items?.length ?? 0}</td>
                  <td className="p-2 text-center">v{f.version ?? 1}</td>
                  <td className="p-2 text-center text-xs">{f.status === "archived" ? "مؤرشفة" : f.status === "draft" ? "مسودة" : "مفعّلة"}</td>
                  <td className="p-2 text-center">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(f)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(f.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}