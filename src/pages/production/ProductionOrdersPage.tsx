import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, Factory, PlayCircle } from "lucide-react";
import BackButton from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Order {
  id: string;
  order_number?: string | null;
  formula_id: string;
  quantity: number;
  warehouse_id?: string | null;
  status: string;
  posted_at?: string | null;
  notes?: string | null;
  created_at: string;
}
interface Formula { id: string; name: string; output_product_id: string; output_quantity: number; }
interface Warehouse { id: string; name: string; }

const STATUS_LABEL: Record<string, string> = { draft: "مسودة", posted: "مرحّل", cancelled: "ملغي" };
const STATUS_COLOR: Record<string, string> = { draft: "bg-gray-500", posted: "bg-emerald-600", cancelled: "bg-red-500" };

export default function ProductionOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);

  const fmap = useMemo(() => Object.fromEntries(formulas.map(f => [f.id, f])), [formulas]);
  const wmap = useMemo(() => Object.fromEntries(warehouses.map(w => [w.id, w])), [warehouses]);

  const load = async () => {
    setLoading(true);
    const [{ data: o }, { data: f }, { data: w }] = await Promise.all([
      supabase.from("production_orders" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("production_formulas" as any).select("id,name,output_product_id,output_quantity").eq("is_deleted", false).eq("is_active", true),
      supabase.from("warehouses").select("id,name") as any,
    ]);
    setOrders((o ?? []) as any);
    setFormulas((f ?? []) as any);
    setWarehouses((w ?? []) as any);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing({ id: "", formula_id: "", quantity: 1, status: "draft", created_at: "" }); setOpen(true); };

  const save = async () => {
    if (!editing || !user) return;
    if (!editing.formula_id) return toast.error("اختر معادلة");
    if (!(editing.quantity > 0)) return toast.error("الكمية يجب أن تكون أكبر من صفر");
    try {
      const payload = {
        user_id: user.id,
        formula_id: editing.formula_id,
        quantity: Number(editing.quantity),
        warehouse_id: editing.warehouse_id || null,
        notes: editing.notes || null,
        order_number: editing.order_number || null,
      };
      if (editing.id) {
        const { error } = await supabase.from("production_orders" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("production_orders" as any).insert(payload);
        if (error) throw error;
      }
      toast.success("تم الحفظ");
      setOpen(false); setEditing(null); load();
    } catch (e: any) { toast.error(e?.message ?? "فشل الحفظ"); }
  };

  const execute = async (id: string) => {
    if (!confirm("ترحيل الأمر سينزّل المواد الخام ويضيف المنتج النهائي إلى المخزون. متابعة؟")) return;
    const { data, error } = await supabase.rpc("execute_production_order" as any, { _order_id: id });
    if (error) return toast.error(error.message);
    toast.success(`تم الترحيل — ${(data as any)?.moves ?? 0} حركة مخزون`);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("حذف الأمر؟ (فقط أوامر المسودة)")) return;
    const { error } = await supabase.from("production_orders" as any).delete().eq("id", id);
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
          <h1 className="text-xl font-bold text-gray-900">أوامر الإنتاج</h1>
          <p className="text-xs text-gray-500">تشغيل معادلات الإنتاج وترحيلها للمخزون</p>
        </div>
      </div>

      <div className="flex justify-end mb-3">
        <Button onClick={openNew}><Plus className="w-4 h-4 ml-1" /> أمر جديد</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="p-2 text-right">الرقم</th>
                <th className="p-2 text-right">المعادلة</th>
                <th className="p-2 text-center">الكمية</th>
                <th className="p-2 text-right">المستودع</th>
                <th className="p-2 text-center">الحالة</th>
                <th className="p-2 text-right">التاريخ</th>
                <th className="p-2 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="p-6 text-center text-gray-500">جاري التحميل…</td></tr>}
              {!loading && orders.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-gray-500">لا توجد أوامر</td></tr>}
              {orders.map(o => (
                <tr key={o.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{o.order_number ?? o.id.slice(0, 8)}</td>
                  <td className="p-2 font-semibold">{fmap[o.formula_id]?.name ?? "—"}</td>
                  <td className="p-2 text-center">{o.quantity}</td>
                  <td className="p-2">{o.warehouse_id ? wmap[o.warehouse_id]?.name ?? "—" : "—"}</td>
                  <td className="p-2 text-center"><Badge className={`${STATUS_COLOR[o.status]} text-white`}>{STATUS_LABEL[o.status] ?? o.status}</Badge></td>
                  <td className="p-2 text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString("ar-EG")}</td>
                  <td className="p-2 text-center">
                    {o.status === "draft" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => execute(o.id)} title="ترحيل"><PlayCircle className="w-4 h-4 text-emerald-600" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(o.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>أمر إنتاج جديد</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600">رقم الأمر (اختياري)</label>
                <Input value={editing.order_number ?? ""} onChange={e => setEditing({ ...editing, order_number: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-600">المعادلة</label>
                <select className="w-full border rounded p-2" value={editing.formula_id} onChange={e => setEditing({ ...editing, formula_id: e.target.value })}>
                  <option value="">اختر…</option>
                  {formulas.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">الكمية المطلوب إنتاجها</label>
                <Input type="number" step="0.001" value={editing.quantity} onChange={e => setEditing({ ...editing, quantity: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-gray-600">المستودع</label>
                <select className="w-full border rounded p-2" value={editing.warehouse_id ?? ""} onChange={e => setEditing({ ...editing, warehouse_id: e.target.value || null })}>
                  <option value="">— بدون —</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
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