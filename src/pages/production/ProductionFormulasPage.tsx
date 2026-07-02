import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Search, Factory, Save, X } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import BackButton from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  notes?: string | null;
  is_active: boolean;
  items?: FormulaItem[];
  output?: Product;
}

export default function ProductionFormulasPage() {
  const { user } = useAuth();
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Formula | null>(null);
  const [open, setOpen] = useState(false);

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);

  const load = async () => {
    setLoading(true);
    const [{ data: fData }, { data: pData }] = await Promise.all([
      supabase.from("production_formulas" as any).select("*").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("products").select("id,name,sku").eq("is_deleted" as any, false).limit(2000),
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

  const openNew = () => {
    setEditing({ id: "", name: "", output_product_id: "", output_quantity: 1, is_active: true, items: [] });
    setOpen(true);
  };
  const openEdit = (f: Formula) => { setEditing({ ...f, items: [...(f.items ?? [])] }); setOpen(true); };

  const save = async () => {
    if (!editing || !user) return;
    if (!editing.name.trim()) return toast.error("أدخل اسم المعادلة");
    if (!editing.output_product_id) return toast.error("اختر المنتج النهائي");
    if (!editing.items?.length) return toast.error("أضف مادة خام واحدة على الأقل");
    if (editing.items.some(i => !i.product_id || !(i.quantity > 0))) return toast.error("تحقق من مكونات المعادلة");

    try {
      let formulaId = editing.id;
      const payload = {
        user_id: user.id,
        name: editing.name.trim(),
        code: editing.code || null,
        output_product_id: editing.output_product_id,
        output_quantity: Number(editing.output_quantity) || 1,
        notes: editing.notes || null,
        is_active: editing.is_active,
      };
      if (formulaId) {
        const { error } = await supabase.from("production_formulas" as any).update(payload).eq("id", formulaId);
        if (error) throw error;
        await supabase.from("production_formula_items" as any).delete().eq("formula_id", formulaId);
      } else {
        const { data, error } = await supabase.from("production_formulas" as any).insert(payload).select("id").single();
        if (error) throw error;
        formulaId = (data as any).id;
      }
      const rows = editing.items.map(i => ({ formula_id: formulaId, product_id: i.product_id, quantity: Number(i.quantity) }));
      const { error: e2 } = await supabase.from("production_formula_items" as any).insert(rows);
      if (e2) throw e2;
      toast.success("تم الحفظ");
      setOpen(false); setEditing(null); await load();
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الحفظ");
    }
  };

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
      <PageHeader icon={Factory} title="معادلات الإنتاج" subtitle="تعريف قوائم المكونات (BOM) للمنتجات المصنّعة" />

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
                <th className="p-2 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="p-6 text-center text-gray-500">جاري التحميل…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-500">لا توجد معادلات</td></tr>}
              {filtered.map(f => (
                <tr key={f.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-semibold">{f.name}</td>
                  <td className="p-2 text-gray-600">{f.code ?? "—"}</td>
                  <td className="p-2">{productMap[f.output_product_id]?.name ?? "—"}</td>
                  <td className="p-2 text-center">{f.output_quantity}</td>
                  <td className="p-2 text-center">{f.items?.length ?? 0}</td>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader><DialogTitle>{editing?.id ? "تعديل معادلة" : "معادلة جديدة"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600">اسم المعادلة</label>
                  <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">الكود</label>
                  <Input value={editing.code ?? ""} onChange={e => setEditing({ ...editing, code: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">المنتج النهائي</label>
                  <select className="w-full border rounded p-2" value={editing.output_product_id} onChange={e => setEditing({ ...editing, output_product_id: e.target.value })}>
                    <option value="">اختر…</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">كمية الإخراج (لكل تشغيلة)</label>
                  <Input type="number" step="0.001" value={editing.output_quantity} onChange={e => setEditing({ ...editing, output_quantity: Number(e.target.value) })} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">المواد الخام</label>
                  <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, items: [...(editing.items ?? []), { product_id: "", quantity: 1 }] })}>
                    <Plus className="w-4 h-4 ml-1" /> إضافة مادة
                  </Button>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr><th className="p-2 text-right">المنتج</th><th className="p-2 w-32 text-center">الكمية</th><th className="p-2 w-16"></th></tr>
                    </thead>
                    <tbody>
                      {(editing.items ?? []).map((it, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-1">
                            <select className="w-full border rounded p-1" value={it.product_id} onChange={e => {
                              const items = [...(editing.items ?? [])]; items[idx].product_id = e.target.value; setEditing({ ...editing, items });
                            }}>
                              <option value="">اختر…</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                          <td className="p-1"><Input type="number" step="0.001" value={it.quantity} onChange={e => {
                            const items = [...(editing.items ?? [])]; items[idx].quantity = Number(e.target.value); setEditing({ ...editing, items });
                          }} /></td>
                          <td className="p-1 text-center">
                            <Button size="sm" variant="ghost" onClick={() => {
                              const items = [...(editing.items ?? [])]; items.splice(idx, 1); setEditing({ ...editing, items });
                            }}><X className="w-4 h-4 text-red-600" /></Button>
                          </td>
                        </tr>
                      ))}
                      {(editing.items ?? []).length === 0 && <tr><td colSpan={3} className="p-4 text-center text-gray-500">لا توجد مواد بعد</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-600">ملاحظات</label>
                <Textarea value={editing.notes ?? ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save}><Save className="w-4 h-4 ml-1" /> حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}