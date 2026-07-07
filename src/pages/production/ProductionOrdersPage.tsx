import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, Factory, PlayCircle, CheckCircle2, XCircle, Settings2 } from "lucide-react";
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
  planned_quantity?: number | null;
  actual_quantity?: number | null;
  scrap_quantity?: number | null;
  warehouse_id?: string | null;
  raw_warehouse_id?: string | null;
  output_warehouse_id?: string | null;
  status: string;
  posted_at?: string | null;
  released_at?: string | null;
  completed_at?: string | null;
  production_date?: string | null;
  lot_number?: string | null;
  total_material_cost?: number | null;
  total_labor_cost?: number | null;
  total_overhead_cost?: number | null;
  total_cost?: number | null;
  unit_cost?: number | null;
  variance_amount?: number | null;
  notes?: string | null;
  created_at: string;
}
interface Formula { id: string; name: string; output_product_id: string; output_quantity: number; }
interface Warehouse { id: string; name: string; }

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة", approved: "معتمد", released: "مصروف",
  in_progress: "قيد التنفيذ", completed: "مكتمل", closed: "مقفل",
  cancelled: "ملغي", posted: "مرحّل (قديم)",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-500", approved: "bg-sky-600", released: "bg-amber-500",
  in_progress: "bg-blue-600", completed: "bg-emerald-600", closed: "bg-slate-700",
  cancelled: "bg-red-500", posted: "bg-emerald-600",
};

export default function ProductionOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState<Order | null>(null);
  const [completeQty, setCompleteQty] = useState<number>(0);
  const [completeLabor, setCompleteLabor] = useState<number>(0);
  const [completeOverhead, setCompleteOverhead] = useState<number>(0);
  const [completeScrap, setCompleteScrap] = useState<number>(0);

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

  const seedAccounts = async () => {
    const { data, error } = await supabase.rpc("seed_production_accounts" as any);
    if (error) return toast.error(error.message);
    toast.success(`جاهز — ${(data as any)?.accounts_created ?? 0} حساب أُضيف`);
  };

  const save = async () => {
    if (!editing || !user) return;
    if (!editing.formula_id) return toast.error("اختر معادلة");
    if (!(editing.quantity > 0)) return toast.error("الكمية يجب أن تكون أكبر من صفر");
    try {
      const payload: any = {
        user_id: user.id,
        formula_id: editing.formula_id,
        quantity: Number(editing.quantity),
        planned_quantity: Number(editing.quantity),
        warehouse_id: editing.warehouse_id || null,
        raw_warehouse_id: editing.raw_warehouse_id || editing.warehouse_id || null,
        output_warehouse_id: editing.output_warehouse_id || editing.warehouse_id || null,
        lot_number: editing.lot_number || null,
        notes: editing.notes || null,
        order_number: editing.order_number || null,
      };
      if (editing.production_date) payload.production_date = editing.production_date;
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

  const release = async (id: string) => {
    if (!confirm("اعتماد الأمر سيصرف المواد الخام من المخزون ويسجّل قيد WIP في المحاسبة. متابعة؟")) return;
    const { data, error } = await supabase.rpc("release_production_order" as any, { _order_id: id });
    if (error) return toast.error(error.message);
    toast.success(`تم الاعتماد — ${(data as any)?.moves ?? 0} حركة، تكلفة مواد ${Number((data as any)?.material_cost ?? 0).toFixed(2)}`);
    load();
  };

  const openComplete = (o: Order) => {
    setCompleting(o);
    setCompleteQty(Number(o.planned_quantity ?? o.quantity ?? 0));
    setCompleteLabor(Number(o.total_labor_cost ?? 0));
    setCompleteOverhead(Number(o.total_overhead_cost ?? 0));
    setCompleteScrap(0);
    setCompleteOpen(true);
  };

  const submitComplete = async () => {
    if (!completing) return;
    const { data, error } = await supabase.rpc("complete_production_order" as any, {
      _order_id: completing.id,
      _actual_qty: completeQty,
      _actual_labor: completeLabor,
      _actual_overhead: completeOverhead,
      _scrap_qty: completeScrap,
    });
    if (error) return toast.error(error.message);
    const r = data as any;
    toast.success(`مكتمل — تكلفة إجمالية ${Number(r?.total_cost ?? 0).toFixed(2)} • فرق ${Number(r?.variance ?? 0).toFixed(2)}`);
    setCompleteOpen(false); setCompleting(null);
    load();
  };

  const cancelOrder = async (id: string) => {
    const reason = prompt("سبب الإلغاء (اختياري):") ?? undefined;
    const { error } = await supabase.rpc("cancel_production_order" as any, { _order_id: id, _reason: reason });
    if (error) return toast.error(error.message);
    toast.success("تم الإلغاء");
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
          <p className="text-xs text-gray-500">دورة كاملة: مسودة → اعتماد (صرف مواد + قيد WIP) → إتمام (استلام منتج + قيد تكلفة + فروقات)</p>
        </div>
      </div>

      <div className="flex justify-end mb-3 gap-2">
        <Button variant="outline" onClick={seedAccounts} title="ينشئ حسابات المواد الخام / WIP / المنتجات التامة / العمالة / التكاليف غير المباشرة إن لم تكن موجودة">
          <Settings2 className="w-4 h-4 ml-1" /> تهيئة حسابات الإنتاج
        </Button>
        <Button onClick={openNew}><Plus className="w-4 h-4 ml-1" /> أمر جديد</Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="p-2 text-right">الرقم</th>
                <th className="p-2 text-right">المعادلة</th>
                <th className="p-2 text-center">الكمية</th>
                <th className="p-2 text-center">التكلفة</th>
                <th className="p-2 text-center">الفرق</th>
                <th className="p-2 text-right">المستودع</th>
                <th className="p-2 text-center">الحالة</th>
                <th className="p-2 text-right">التاريخ</th>
                <th className="p-2 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="p-6 text-center text-gray-500">جاري التحميل…</td></tr>}
              {!loading && orders.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-gray-500">لا توجد أوامر</td></tr>}
              {orders.map(o => (
                <tr key={o.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{o.order_number ?? o.id.slice(0, 8)}</td>
                  <td className="p-2 font-semibold">{fmap[o.formula_id]?.name ?? "—"}</td>
                  <td className="p-2 text-center">{o.actual_quantity ?? o.planned_quantity ?? o.quantity}</td>
                  <td className="p-2 text-center text-xs">{o.total_cost ? Number(o.total_cost).toFixed(2) : "—"}</td>
                  <td className={`p-2 text-center text-xs font-semibold ${Number(o.variance_amount ?? 0) > 0 ? "text-red-600" : Number(o.variance_amount ?? 0) < 0 ? "text-emerald-600" : "text-gray-400"}`}>
                    {o.variance_amount != null ? Number(o.variance_amount).toFixed(2) : "—"}
                  </td>
                  <td className="p-2">{o.warehouse_id ? wmap[o.warehouse_id]?.name ?? "—" : "—"}</td>
                  <td className="p-2 text-center"><Badge className={`${STATUS_COLOR[o.status]} text-white`}>{STATUS_LABEL[o.status] ?? o.status}</Badge></td>
                  <td className="p-2 text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString("ar-EG")}</td>
                  <td className="p-2 text-center whitespace-nowrap">
                    {(o.status === "draft" || o.status === "approved") && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => release(o.id)} title="اعتماد وصرف مواد"><PlayCircle className="w-4 h-4 text-amber-600" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => cancelOrder(o.id)} title="إلغاء"><XCircle className="w-4 h-4 text-red-600" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(o.id)} title="حذف"><Trash2 className="w-4 h-4 text-red-600" /></Button>
                      </>
                    )}
                    {(o.status === "released" || o.status === "in_progress") && (
                      <Button size="sm" variant="ghost" onClick={() => openComplete(o)} title="إتمام واستلام المنتج"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>أمر إنتاج جديد</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">رقم الأمر (اختياري)</label>
                <Input value={editing.order_number ?? ""} onChange={e => setEditing({ ...editing, order_number: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-600">رقم اللوت (اختياري)</label>
                <Input value={editing.lot_number ?? ""} onChange={e => setEditing({ ...editing, lot_number: e.target.value })} />
              </div>
              <div className="col-span-2">
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
                <label className="text-xs text-gray-600">تاريخ الإنتاج</label>
                <Input type="date" value={editing.production_date ?? ""} onChange={e => setEditing({ ...editing, production_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-600">مستودع المواد الخام</label>
                <select className="w-full border rounded p-2" value={editing.raw_warehouse_id ?? ""} onChange={e => setEditing({ ...editing, raw_warehouse_id: e.target.value || null })}>
                  <option value="">— بدون —</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">مستودع المنتج التام</label>
                <select className="w-full border rounded p-2" value={editing.output_warehouse_id ?? ""} onChange={e => setEditing({ ...editing, output_warehouse_id: e.target.value || null })}>
                  <option value="">— بدون —</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
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

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إتمام أمر الإنتاج</DialogTitle></DialogHeader>
          {completing && (
            <div className="space-y-3">
              <div className="text-sm text-gray-700 p-2 bg-gray-50 rounded">
                <div>الأمر: <b>{completing.order_number ?? completing.id.slice(0, 8)}</b></div>
                <div>المعادلة: <b>{fmap[completing.formula_id]?.name ?? "—"}</b></div>
                <div className="text-xs text-gray-500 mt-1">تكلفة المواد المصروفة: {Number(completing.total_material_cost ?? 0).toFixed(2)}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600">الكمية المنتجة فعلياً</label>
                  <Input type="number" step="0.001" value={completeQty} onChange={e => setCompleteQty(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">كمية الهدر</label>
                  <Input type="number" step="0.001" value={completeScrap} onChange={e => setCompleteScrap(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">تكلفة العمالة الفعلية</label>
                  <Input type="number" step="0.01" value={completeLabor} onChange={e => setCompleteLabor(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">تكاليف غير مباشرة فعلية</label>
                  <Input type="number" step="0.01" value={completeOverhead} onChange={e => setCompleteOverhead(Number(e.target.value))} />
                </div>
              </div>
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900">
                عند الحفظ سيتم تسجيل حركة استلام في المخزون + قيد "منتجات تامة / WIP" + قيد فرق تكلفة إن وُجد.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>إلغاء</Button>
            <Button onClick={submitComplete}><CheckCircle2 className="w-4 h-4 ml-1" /> إتمام</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}