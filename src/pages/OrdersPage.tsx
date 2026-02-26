import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ShoppingCart, Package, Truck, CheckCircle, Edit, Trash2, Eye } from "lucide-react";

const statusColors: Record<string, string> = {
  "جديد": "bg-info/10 text-info",
  "قيد التجهيز": "bg-warning/10 text-warning",
  "جاهز للشحن": "bg-accent/10 text-accent",
  "تم الشحن": "bg-primary/10 text-primary",
  "تم التسليم": "bg-primary/10 text-primary",
  "مرتجع": "bg-destructive/10 text-destructive",
  "ملغي": "bg-muted text-muted-foreground",
};

const OrdersPage = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", customer_address: "", order_date: new Date().toISOString().split("T")[0],
    delivery_date: "", status: "جديد", subtotal: 0, discount: 0, shipping_cost: 0, total: 0,
    payment_status: "غير مدفوع", payment_method: "كاش", shipping_method: "", tracking_number: "", source: "يدوي", notes: "",
  });
  const [items, setItems] = useState<{ product_name: string; quantity: number; unit_price: number; discount: number; total: number }[]>([]);

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);
    const [ordRes, prodRes] = await Promise.all([
      supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("products").select("*").eq("user_id", user.id),
    ]);
    setOrders((ordRes.data as any[]) || []);
    setProducts((prodRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, [user]);

  const fetchOrderItems = async (orderId: string) => {
    const { data } = await supabase.from("order_items").select("*").eq("order_id", orderId);
    setOrderItems((data as any[]) || []);
  };

  const recalcTotal = (updatedItems: typeof items) => {
    const subtotal = updatedItems.reduce((s, i) => s + i.total, 0);
    setForm(prev => ({ ...prev, subtotal, total: subtotal - prev.discount + prev.shipping_cost }));
  };

  const addItem = () => {
    const newItems = [...items, { product_name: "", quantity: 1, unit_price: 0, discount: 0, total: 0 }];
    setItems(newItems);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems[idx] as any)[field] = value;
    if (field === "product_name") {
      const prod = products.find(p => p.name === value);
      if (prod) { newItems[idx].unit_price = Number(prod.sell_price); }
    }
    newItems[idx].total = newItems[idx].quantity * newItems[idx].unit_price - newItems[idx].discount;
    setItems(newItems);
    recalcTotal(newItems);
  };

  const removeItem = (idx: number) => {
    const newItems = items.filter((_, i) => i !== idx);
    setItems(newItems);
    recalcTotal(newItems);
  };

  const handleSave = async () => {
    if (!user || !form.customer_name) { toast.error("اسم العميل مطلوب"); return; }
    const orderNum = `ORD-${Date.now().toString(36).toUpperCase()}`;
    const payload = { ...form, user_id: user.id, order_number: orderNum };
    
    if (editingId) {
      const { error } = await supabase.from("orders").update(payload as any).eq("id", editingId);
      if (error) toast.error("خطأ"); else { toast.success("تم التحديث"); setShowForm(false); setEditingId(null); fetchOrders(); }
    } else {
      const { data, error } = await supabase.from("orders").insert(payload as any).select();
      if (error || !data?.[0]) { toast.error("خطأ في إنشاء الطلبية"); return; }
      if (items.length > 0) {
        const orderItemsPayload = items.map(i => ({ ...i, order_id: data[0].id, user_id: user.id }));
        await supabase.from("order_items").insert(orderItemsPayload as any);
      }
      toast.success("تم إنشاء الطلبية"); setShowForm(false); setItems([]); fetchOrders();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد؟")) return;
    await supabase.from("orders").delete().eq("id", id);
    toast.success("تم الحذف"); fetchOrders();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("orders").update({ status } as any).eq("id", id);
    toast.success(`تم تحديث الحالة: ${status}`); fetchOrders();
  };

  const filtered = orders.filter(o => {
    const matchSearch = o.customer_name.includes(search) || o.order_number?.includes(search);
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = { new: orders.filter(o => o.status === "جديد").length, processing: orders.filter(o => o.status === "قيد التجهيز").length, shipped: orders.filter(o => o.status === "تم الشحن").length, delivered: orders.filter(o => o.status === "تم التسليم").length };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-foreground">الطلبيات</h1><p className="text-sm text-muted-foreground">إدارة الطلبيات والمتاجر الإلكترونية</p></div>
        <Button onClick={() => { setForm({ customer_name: "", customer_phone: "", customer_address: "", order_date: new Date().toISOString().split("T")[0], delivery_date: "", status: "جديد", subtotal: 0, discount: 0, shipping_cost: 0, total: 0, payment_status: "غير مدفوع", payment_method: "كاش", shipping_method: "", tracking_number: "", source: "يدوي", notes: "" }); setItems([]); setEditingId(null); setShowForm(true); }} className="gap-2"><Plus className="h-4 w-4" /> طلبية جديدة</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center"><ShoppingCart className="h-5 w-5 mx-auto text-info mb-1" /><p className="text-2xl font-bold text-foreground">{counts.new}</p><p className="text-xs text-muted-foreground">جديدة</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Package className="h-5 w-5 mx-auto text-warning mb-1" /><p className="text-2xl font-bold text-foreground">{counts.processing}</p><p className="text-xs text-muted-foreground">قيد التجهيز</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Truck className="h-5 w-5 mx-auto text-accent mb-1" /><p className="text-2xl font-bold text-foreground">{counts.shipped}</p><p className="text-xs text-muted-foreground">تم الشحن</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><CheckCircle className="h-5 w-5 mx-auto text-primary mb-1" /><p className="text-2xl font-bold text-foreground">{counts.delivered}</p><p className="text-xs text-muted-foreground">تم التسليم</p></CardContent></Card>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو رقم الطلبية..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            {["جديد", "قيد التجهيز", "جاهز للشحن", "تم الشحن", "تم التسليم", "مرتجع", "ملغي"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-right">رقم الطلبية</TableHead>
            <TableHead className="text-right">العميل</TableHead>
            <TableHead className="text-right">التاريخ</TableHead>
            <TableHead className="text-right">الإجمالي</TableHead>
            <TableHead className="text-right">الحالة</TableHead>
            <TableHead className="text-right">الدفع</TableHead>
            <TableHead className="text-right">المصدر</TableHead>
            <TableHead className="text-right">إجراءات</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell></TableRow> :
              filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد طلبيات</TableCell></TableRow> :
              filtered.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.order_number || "—"}</TableCell>
                  <TableCell className="font-medium">{o.customer_name}</TableCell>
                  <TableCell className="text-xs">{o.order_date}</TableCell>
                  <TableCell className="font-medium">{Number(o.total).toLocaleString()}</TableCell>
                  <TableCell>
                    <Select value={o.status} onValueChange={v => updateStatus(o.id, v)}>
                      <SelectTrigger className={`h-7 text-xs w-[120px] border-0 ${statusColors[o.status] || ""}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{["جديد", "قيد التجهيز", "جاهز للشحن", "تم الشحن", "تم التسليم", "مرتجع", "ملغي"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Badge variant={o.payment_status === "مدفوع" ? "default" : "secondary"} className="text-[10px]">{o.payment_status}</Badge></TableCell>
                  <TableCell className="text-xs">{o.source}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setShowDetail(o); fetchOrderItems(o.id); }}><Eye className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(o.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </Card>

      {/* Order Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>تفاصيل الطلبية {showDetail?.order_number}</DialogTitle></DialogHeader>
          {showDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[["العميل", showDetail.customer_name], ["الهاتف", showDetail.customer_phone], ["العنوان", showDetail.customer_address], ["طريقة الشحن", showDetail.shipping_method], ["رقم التتبع", showDetail.tracking_number]].map(([l, v]) => (
                  <div key={l as string} className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">{l}</span><span className="font-medium">{v || "—"}</span></div>
                ))}
              </div>
              <h4 className="font-medium text-foreground text-sm">البنود</h4>
              <Table>
                <TableHeader><TableRow><TableHead className="text-right">المنتج</TableHead><TableHead className="text-right">الكمية</TableHead><TableHead className="text-right">السعر</TableHead><TableHead className="text-right">الإجمالي</TableHead></TableRow></TableHeader>
                <TableBody>
                  {orderItems.map(i => <TableRow key={i.id}><TableCell>{i.product_name}</TableCell><TableCell>{i.quantity}</TableCell><TableCell>{Number(i.unit_price).toLocaleString()}</TableCell><TableCell>{Number(i.total).toLocaleString()}</TableCell></TableRow>)}
                  {orderItems.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-xs">لا توجد بنود</TableCell></TableRow>}
                </TableBody>
              </Table>
              <div className="text-sm space-y-1 border-t border-border pt-2">
                <div className="flex justify-between"><span className="text-muted-foreground">المجموع</span><span>{Number(showDetail.subtotal).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الخصم</span><span>{Number(showDetail.discount).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الشحن</span><span>{Number(showDetail.shipping_cost).toLocaleString()}</span></div>
                <div className="flex justify-between font-bold text-foreground"><span>الإجمالي</span><span>{Number(showDetail.total).toLocaleString()}</span></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Order Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>طلبية جديدة</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">اسم العميل *</label><Input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">الهاتف</label><Input value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} /></div>
            <div className="col-span-2"><label className="text-xs text-muted-foreground">العنوان</label><Input value={form.customer_address} onChange={e => setForm({ ...form, customer_address: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">تاريخ الطلبية</label><Input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">تاريخ التسليم</label><Input type="date" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">طريقة الدفع</label>
              <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["كاش", "تحويل بنكي", "شيك", "دفع إلكتروني", "آجل"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><label className="text-xs text-muted-foreground">المصدر</label>
              <Select value={form.source} onValueChange={v => setForm({ ...form, source: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["يدوي", "متجر إلكتروني", "واتساب", "هاتف", "أخرى"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><label className="text-xs text-muted-foreground">طريقة الشحن</label><Input value={form.shipping_method} onChange={e => setForm({ ...form, shipping_method: e.target.value })} /></div>
          </div>

          <div className="mt-4">
            <div className="flex justify-between items-center mb-2"><h4 className="font-medium text-foreground text-sm">بنود الطلبية</h4><Button size="sm" variant="outline" onClick={addItem} className="gap-1"><Plus className="h-3 w-3" /> إضافة بند</Button></div>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-5 gap-2 mb-2 items-end">
                <div>
                  <Select value={item.product_name} onValueChange={v => updateItem(idx, "product_name", v)}>
                    <SelectTrigger className="text-xs"><SelectValue placeholder="المنتج" /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Input type="number" placeholder="الكمية" value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} className="text-xs" />
                <Input type="number" placeholder="السعر" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} className="text-xs" />
                <p className="text-sm font-medium text-foreground text-center">{item.total.toLocaleString()}</p>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-3">
            <div><label className="text-xs text-muted-foreground">الخصم</label><Input type="number" value={form.discount} onChange={e => { const d = Number(e.target.value); setForm(f => ({ ...f, discount: d, total: f.subtotal - d + f.shipping_cost })); }} /></div>
            <div><label className="text-xs text-muted-foreground">تكلفة الشحن</label><Input type="number" value={form.shipping_cost} onChange={e => { const s = Number(e.target.value); setForm(f => ({ ...f, shipping_cost: s, total: f.subtotal - f.discount + s })); }} /></div>
            <div><label className="text-xs text-muted-foreground">الإجمالي</label><Input type="number" value={form.total} readOnly className="bg-muted font-bold" /></div>
          </div>

          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button><Button onClick={handleSave}>إنشاء الطلبية</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;
