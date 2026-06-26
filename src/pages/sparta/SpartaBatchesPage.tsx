import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, AlertTriangle, CalendarClock } from "lucide-react";

interface Batch {
  id: string;
  product_id: string;
  warehouse_id: string | null;
  batch_number: string;
  lot_number: string | null;
  manufacture_date: string | null;
  expiry_date: string | null;
  quantity_in: number;
  quantity_remaining: number;
  unit_cost: number;
  status: string;
}

function daysUntil(d?: string | null) {
  if (!d) return null;
  return Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
}

export default function SpartaBatchesPage() {
  const { user } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "expiring" | "expired">("all");
  const [form, setForm] = useState({ product_id: "", warehouse_id: "", batch_number: "", lot_number: "", manufacture_date: "", expiry_date: "", quantity_in: 0, unit_cost: 0 });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [b, p, w] = await Promise.all([
      supabase.from("product_batches").select("*").eq("company_id", user.id).order("expiry_date", { ascending: true, nullsFirst: false }).limit(500),
      supabase.from("products").select("id, name").eq("user_id", user.id).eq("requires_batch_tracking", true).order("name").limit(500),
      supabase.from("warehouses").select("id, name").eq("user_id", user.id).eq("is_active", true).order("name"),
    ]);
    if (b.error) toast.error(b.error.message);
    setBatches((b.data as any) || []);
    setProducts((p.data as any) || []);
    setWarehouses((w.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products]);
  const warehouseMap = useMemo(() => Object.fromEntries(warehouses.map((w) => [w.id, w.name])), [warehouses]);

  const view = useMemo(() => {
    return batches.filter((b) => {
      const d = daysUntil(b.expiry_date);
      if (filter === "expiring") return d !== null && d >= 0 && d <= 90;
      if (filter === "expired") return b.status === "expired" || (d !== null && d < 0);
      return true;
    });
  }, [batches, filter]);

  const stats = useMemo(() => {
    let expiring = 0, expired = 0, active = 0;
    batches.forEach((b) => {
      const d = daysUntil(b.expiry_date);
      if (b.status === "expired" || (d !== null && d < 0)) expired++;
      else if (d !== null && d <= 90) expiring++;
      if (b.status === "active") active++;
    });
    return { expiring, expired, active };
  }, [batches]);

  const create = async () => {
    if (!form.product_id || !form.batch_number.trim() || form.quantity_in <= 0) {
      return toast.error("اختر المنتج، أدخل رقم الدفعة والكمية");
    }
    const { error } = await supabase.from("product_batches").insert({
      company_id: user!.id,
      product_id: form.product_id,
      warehouse_id: form.warehouse_id || null,
      batch_number: form.batch_number,
      lot_number: form.lot_number || null,
      manufacture_date: form.manufacture_date || null,
      expiry_date: form.expiry_date || null,
      quantity_in: form.quantity_in,
      quantity_remaining: form.quantity_in,
      unit_cost: form.unit_cost,
      created_by: user!.id,
    });
    if (error) return toast.error(error.message);
    toast.success("تمت إضافة الدفعة");
    setOpen(false);
    setForm({ product_id: "", warehouse_id: "", batch_number: "", lot_number: "", manufacture_date: "", expiry_date: "", quantity_in: 0, unit_cost: 0 });
    load();
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarClock className="h-6 w-6" /> إدارة الدفعات (LOTs)</h1>
          <p className="text-sm text-muted-foreground">تتبع تواريخ الصلاحية، استهلاك FIFO، وتنبيهات الانتهاء</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" /> دفعة جديدة</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">دفعات نشطة</div>
          <div className="text-2xl font-bold mt-1">{stats.active}</div>
        </div>
        <button onClick={() => setFilter("expiring")} className="bg-card border rounded-xl p-4 text-right hover:bg-muted/40">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> تنتهي خلال 90 يوم</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">{stats.expiring}</div>
        </button>
        <button onClick={() => setFilter("expired")} className="bg-card border rounded-xl p-4 text-right hover:bg-muted/40">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-destructive" /> منتهية الصلاحية</div>
          <div className="text-2xl font-bold mt-1 text-destructive">{stats.expired}</div>
        </button>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>الكل</Button>
        <Button size="sm" variant={filter === "expiring" ? "default" : "outline"} onClick={() => setFilter("expiring")}>تنتهي قريباً</Button>
        <Button size="sm" variant={filter === "expired" ? "default" : "outline"} onClick={() => setFilter("expired")}>منتهية</Button>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-right">
            <tr>
              <th className="p-3">المنتج</th>
              <th className="p-3">رقم الدفعة</th>
              <th className="p-3">LOT</th>
              <th className="p-3">المستودع</th>
              <th className="p-3">المتبقي / الوارد</th>
              <th className="p-3">انتهاء</th>
              <th className="p-3">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={7} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>)}
            {!loading && view.length === 0 && (<tr><td colSpan={7} className="p-8 text-center text-muted-foreground">لا توجد دفعات</td></tr>)}
            {view.map((b) => {
              const d = daysUntil(b.expiry_date);
              const isExpired = b.status === "expired" || (d !== null && d < 0);
              const isExpiring = !isExpired && d !== null && d <= 90;
              return (
                <tr key={b.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-medium">{productMap[b.product_id] || "—"}</td>
                  <td className="p-3">{b.batch_number}</td>
                  <td className="p-3 text-muted-foreground">{b.lot_number || "—"}</td>
                  <td className="p-3">{warehouseMap[b.warehouse_id || ""] || "—"}</td>
                  <td className="p-3">{b.quantity_remaining} / {b.quantity_in}</td>
                  <td className="p-3">
                    {b.expiry_date ? (
                      <span className={isExpired ? "text-destructive" : isExpiring ? "text-amber-600" : ""}>
                        {b.expiry_date} {d !== null && (<span className="text-xs">({d >= 0 ? `${d} يوم` : `منذ ${Math.abs(d)}`})</span>)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="p-3">
                    <Badge variant={b.status === "active" ? "secondary" : b.status === "expired" ? "destructive" : "outline"}>
                      {b.status === "active" ? "نشطة" : b.status === "expired" ? "منتهية" : b.status === "depleted" ? "مستنفدة" : "مسحوبة"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>دفعة جديدة (LOT)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>المنتج</Label>
              <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر منتج..." /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {products.length === 0 && <p className="text-xs text-muted-foreground mt-1">لا توجد منتجات مفعّل عليها تتبع الدفعات. فعّلها من شاشة المنتجات.</p>}
            </div>
            <div>
              <Label>المستودع</Label>
              <Select value={form.warehouse_id} onValueChange={(v) => setForm({ ...form, warehouse_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر مستودع..." /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>رقم الدفعة *</Label><Input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} /></div>
              <div><Label>LOT داخلي</Label><Input value={form.lot_number} onChange={(e) => setForm({ ...form, lot_number: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>تاريخ التصنيع</Label><Input type="date" value={form.manufacture_date} onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })} /></div>
              <div><Label>تاريخ الانتهاء</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>الكمية</Label><Input type="number" value={form.quantity_in} onChange={(e) => setForm({ ...form, quantity_in: Number(e.target.value) })} /></div>
              <div><Label>تكلفة الوحدة (₪)</Label><Input type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={create}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}