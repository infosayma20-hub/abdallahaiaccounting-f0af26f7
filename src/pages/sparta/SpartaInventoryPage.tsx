import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Boxes, Plus, Warehouse, Search } from "lucide-react";

interface Wh { id: string; name: string; code: string; warehouse_type: string; is_default: boolean }

export default function SpartaInventoryPage() {
  const { user } = useAuth();
  const { companyId, ownerUserId, isAdmin } = useSpartaContext();
  const [warehouses, setWarehouses] = useState<Wh[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; quantity: number; requires_batch_tracking: boolean }[]>([]);
  const [openWh, setOpenWh] = useState(false);
  const [openIssue, setOpenIssue] = useState(false);
  const [wForm, setWForm] = useState({ code: "", name: "", warehouse_type: "main" });
  const [iForm, setIForm] = useState({ product_id: "", warehouse_id: "", quantity: 0, notes: "" });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const load = async () => {
    if (!ownerUserId) return;
    setLoading(true);
    const [w, p] = await Promise.all([
      supabase.from("warehouses").select("id, name, code, warehouse_type, is_default").eq("user_id", ownerUserId).eq("is_active", true).order("name"),
      supabase.from("products").select("id, name, quantity, requires_batch_tracking").eq("user_id", ownerUserId).order("name").limit(2000),
    ]);
    setWarehouses((w.data as any) || []);
    setProducts((p.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [ownerUserId]);

  const createWarehouse = async () => {
    if (!wForm.code.trim() || !wForm.name.trim()) return toast.error("الرمز والاسم مطلوبان");
    if (!isAdmin || !ownerUserId) return toast.error("صلاحية مدير القابضة مطلوبة");
    const { error } = await supabase.from("warehouses").insert({
      user_id: ownerUserId, code: wForm.code, name: wForm.name, warehouse_type: wForm.warehouse_type as any,
    });
    if (error) return toast.error(error.message);
    toast.success("تمت إضافة المستودع");
    setOpenWh(false);
    setWForm({ code: "", name: "", warehouse_type: "main" });
    load();
  };

  const issueStock = async () => {
    if (!iForm.product_id || !iForm.warehouse_id || iForm.quantity <= 0) return toast.error("اختر المنتج، المستودع، والكمية");
    if (!isAdmin || !companyId) return toast.error("صلاحية مدير القابضة مطلوبة");
    const product = products.find((p) => p.id === iForm.product_id);
    if (!product) return;
    try {
      if (product.requires_batch_tracking) {
        const { error } = await supabase.rpc("consume_batches_fifo", {
          _company_id: companyId,
          _product_id: iForm.product_id,
          _warehouse_id: iForm.warehouse_id,
          _quantity: iForm.quantity,
          _reference_type: "manual_issue",
          _reference_id: null,
        });
        if (error) throw error;
        // products.quantity is auto-synced by trg_batch_movements_sync_qty.
      } else {
        // Non-batch product: write stock_movements (legacy path) and adjust quantity manually
        await supabase.from("stock_movements").insert({
          user_id: ownerUserId!,
          product_id: iForm.product_id,
          warehouse_id: iForm.warehouse_id,
          quantity: iForm.quantity,
          movement_type: "out",
          notes: iForm.notes || "Sparta manual issue",
        } as any);
        await supabase
          .from("products")
          .update({ quantity: Math.max(0, Number(product.quantity || 0) - iForm.quantity) })
          .eq("id", iForm.product_id);
      }
      toast.success("تم خصم المخزون");
      setOpenIssue(false);
      setIForm({ product_id: "", warehouse_id: "", quantity: 0, notes: "" });
      load();
    } catch (e: any) {
      toast.error(e.message || "فشل خصم المخزون");
    }
  };

  const totalUnits = useMemo(() => products.reduce((s, p) => s + Number(p.quantity || 0), 0), [products]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? products.filter((p) => p.name?.toLowerCase().includes(t)) : products;
  }, [products, q]);
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  return (
    <div className="space-y-4 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Boxes className="h-6 w-6" /> المخزون والمستودعات</h1>
          <p className="text-sm text-muted-foreground">إجمالي وحدات المخزون: {totalUnits.toLocaleString("en-US")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOpenWh(true)}><Plus className="h-4 w-4 ml-1" /> مستودع</Button>
          <Button onClick={() => setOpenIssue(true)}><Plus className="h-4 w-4 ml-1" /> خصم مخزون (FIFO)</Button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Warehouse className="h-5 w-5" /> المستودعات ({warehouses.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {loading && <div className="text-muted-foreground">جاري التحميل...</div>}
          {warehouses.map((w) => (
            <div key={w.id} className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{w.name}</div>
                  <div className="text-xs text-muted-foreground">{w.code} · {w.warehouse_type}</div>
                </div>
                {w.is_default && <span className="text-[10px] bg-primary/15 text-primary px-2 py-1 rounded">افتراضي</span>}
              </div>
            </div>
          ))}
          {!loading && warehouses.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground bg-card border rounded-xl">لا توجد مستودعات. أضف مستودعك الأول.</div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">أرصدة المنتجات</h2>
        <div className="relative max-w-md mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="بحث بالاسم..." className="pr-9" />
        </div>
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-right">
              <tr><th className="p-3">المنتج</th><th className="p-3">الرصيد</th><th className="p-3">تتبع LOT</th></tr>
            </thead>
            <tbody>
              {pageRows.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3">{p.quantity}</td>
                  <td className="p-3">{p.requires_batch_tracking ? "✓" : "—"}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">لا توجد منتجات</td></tr>
              )}
            </tbody>
          </table>
          {filtered.length > pageSize && (
            <div className="flex items-center justify-between p-3 border-t text-xs">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>السابق</Button>
              <span className="text-muted-foreground">صفحة {page + 1} من {totalPages} — {filtered.length} منتج</span>
              <Button variant="ghost" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={openWh} onOpenChange={setOpenWh}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>مستودع جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الرمز</Label><Input value={wForm.code} onChange={(e) => setWForm({ ...wForm, code: e.target.value })} placeholder="WH-01" /></div>
            <div><Label>الاسم</Label><Input value={wForm.name} onChange={(e) => setWForm({ ...wForm, name: e.target.value })} placeholder="المستودع الرئيسي" /></div>
            <div>
              <Label>النوع</Label>
              <Select value={wForm.warehouse_type} onValueChange={(v) => setWForm({ ...wForm, warehouse_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">رئيسي</SelectItem>
                  <SelectItem value="branch">فرع</SelectItem>
                  <SelectItem value="van">مندوب (Van)</SelectItem>
                  <SelectItem value="virtual">افتراضي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpenWh(false)}>إلغاء</Button><Button onClick={createWarehouse}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openIssue} onOpenChange={setOpenIssue}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>خصم مخزون (يستخدم FIFO تلقائياً)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>المنتج</Label>
              <Select value={iForm.product_id} onValueChange={(v) => setIForm({ ...iForm, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر منتج..." /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المستودع</Label>
              <Select value={iForm.warehouse_id} onValueChange={(v) => setIForm({ ...iForm, warehouse_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر مستودع..." /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>الكمية</Label><Input type="number" value={iForm.quantity} onChange={(e) => setIForm({ ...iForm, quantity: Number(e.target.value) })} /></div>
            <div><Label>ملاحظات</Label><Input value={iForm.notes} onChange={(e) => setIForm({ ...iForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpenIssue(false)}>إلغاء</Button><Button onClick={issueStock}>خصم</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}