import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, Package } from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  price: number;
  cost: number | null;
  requires_batch_tracking: boolean;
  min_shelf_life_days: number | null;
  category_id?: string | null;
}

export default function SpartaProductsPage() {
  const { company } = useCompany();
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", price: 0, cost: 0, requires_batch_tracking: true, min_shelf_life_days: 180 });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku, quantity, price, cost, requires_batch_tracking, min_shelf_life_days")
      .eq("company_id", company.id)
      .order("name", { ascending: true })
      .limit(500);
    if (error) toast.error(error.message);
    setProducts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { if (company.id) load(); }, [company.id]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products;
    return products.filter((p) => p.name?.toLowerCase().includes(t) || (p.sku || "").toLowerCase().includes(t));
  }, [products, q]);

  const toggleBatch = async (p: Product, next: boolean) => {
    const { error } = await supabase.from("products").update({ requires_batch_tracking: next }).eq("id", p.id);
    if (error) return toast.error(error.message);
    setProducts((arr) => arr.map((x) => (x.id === p.id ? { ...x, requires_batch_tracking: next } : x)));
  };

  const create = async () => {
    if (!form.name.trim()) return toast.error("اسم المنتج مطلوب");
    const { error } = await supabase.from("products").insert({
      company_id: company.id,
      name: form.name,
      sku: form.sku || null,
      price: form.price,
      cost: form.cost,
      quantity: 0,
      requires_batch_tracking: form.requires_batch_tracking,
      min_shelf_life_days: form.min_shelf_life_days || null,
    });
    if (error) return toast.error(error.message);
    toast.success("تمت إضافة المنتج");
    setOpenCreate(false);
    setForm({ name: "", sku: "", price: 0, cost: 0, requires_batch_tracking: true, min_shelf_life_days: 180 });
    load();
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6" /> المنتجات والكتالوج</h1>
          <p className="text-sm text-muted-foreground">Implants · Abutments · Tools — مع تتبع الدفعات (LOT) وتاريخ الصلاحية</p>
        </div>
        <Button onClick={() => setOpenCreate(true)}><Plus className="h-4 w-4 ml-1" /> منتج جديد</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو SKU..." className="pr-9" />
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-right">
            <tr>
              <th className="p-3">الاسم</th>
              <th className="p-3">SKU</th>
              <th className="p-3">الكمية</th>
              <th className="p-3">السعر</th>
              <th className="p-3">تتبع LOT</th>
              <th className="p-3">أدنى صلاحية (يوم)</th>
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>)}
            {!loading && filtered.length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد منتجات</td></tr>)}
            {filtered.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-muted-foreground">{p.sku || "—"}</td>
                <td className="p-3"><Badge variant={p.quantity > 0 ? "secondary" : "destructive"}>{p.quantity}</Badge></td>
                <td className="p-3">₪ {Number(p.price || 0).toFixed(2)}</td>
                <td className="p-3"><Switch checked={p.requires_batch_tracking} onCheckedChange={(v) => toggleBatch(p, v)} /></td>
                <td className="p-3 text-muted-foreground">{p.min_shelf_life_days || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>منتج جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>السعر (₪)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
              <div><Label>التكلفة (₪)</Label><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} /></div>
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <Label>تفعيل تتبع الدفعات (LOT)</Label>
              <Switch checked={form.requires_batch_tracking} onCheckedChange={(v) => setForm({ ...form, requires_batch_tracking: v })} />
            </div>
            <div><Label>أدنى مدة صلاحية مقبولة (يوم)</Label><Input type="number" value={form.min_shelf_life_days} onChange={(e) => setForm({ ...form, min_shelf_life_days: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCreate(false)}>إلغاء</Button>
            <Button onClick={create}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}