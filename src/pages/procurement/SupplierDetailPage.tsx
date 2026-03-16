import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Package, FileText, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSupplierItems, useProcurementPayments, Supplier, ProcurementOrder, ProcurementInvoice } from "@/hooks/useProcurement";
import BackButton from "@/components/BackButton";
import { Skeleton } from "@/components/ui/skeleton";

const SupplierDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const { items, create: createItem, remove: removeItem } = useSupplierItems(id || null);
  const { payments } = useProcurementPayments(id);
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [invoices, setInvoices] = useState<ProcurementInvoice[]>([]);
  const [newItem, setNewItem] = useState({ item_name: "", unit: "قطعة", default_price: 0, item_code: "" });

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from("procurement_suppliers" as any).select("*").eq("id", id).single();
      setSupplier(data as any);
      const { data: ordersData } = await supabase.from("procurement_orders" as any).select("*").eq("supplier_id", id).order("created_at", { ascending: false });
      setOrders((ordersData as any) || []);
      const { data: invoicesData } = await supabase.from("procurement_invoices" as any).select("*").eq("supplier_id", id).order("created_at", { ascending: false });
      setInvoices((invoicesData as any) || []);
      setLoading(false);
    })();
  }, [id]);

  const handleAddItem = async () => {
    if (!newItem.item_name.trim()) return;
    await createItem(newItem);
    setNewItem({ item_name: "", unit: "قطعة", default_price: 0, item_code: "" });
  };

  if (loading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!supplier) return <div className="p-6 text-center text-muted-foreground">المورد غير موجود</div>;

  // Calculate current balance
  const totalInvoices = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const totalPayments = payments.reduce((s, p) => s + Number(p.amount), 0);
  const currentBalance = Number(supplier.opening_balance) + totalInvoices - totalPayments;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-foreground">{supplier.name}</h1>
          <p className="text-sm text-muted-foreground">{supplier.phone} • {supplier.address}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">الرصيد الافتتاحي</p>
            <p className="text-lg font-bold">{Number(supplier.opening_balance).toLocaleString("en", { minimumFractionDigits: 2 })} ₪</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المشتريات</p>
            <p className="text-lg font-bold text-destructive">{totalInvoices.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المدفوعات</p>
            <p className="text-lg font-bold text-green-600">{totalPayments.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</p>
          </CardContent>
        </Card>
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">الرصيد الحالي</p>
            <p className="text-xl font-bold">{currentBalance.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="items" dir="rtl">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="items"><Package className="h-3.5 w-3.5 ml-1" />أصناف المورد</TabsTrigger>
          <TabsTrigger value="orders"><FileText className="h-3.5 w-3.5 ml-1" />الطلبيات</TabsTrigger>
          <TabsTrigger value="invoices"><FileText className="h-3.5 w-3.5 ml-1" />الفواتير</TabsTrigger>
          <TabsTrigger value="payments"><CreditCard className="h-3.5 w-3.5 ml-1" />المدفوعات</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">أصناف المورد</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">اسم الصنف</Label>
                  <Input value={newItem.item_name} onChange={e => setNewItem({...newItem, item_name: e.target.value})} placeholder="اسم الصنف" />
                </div>
                <div className="w-24">
                  <Label className="text-xs">الوحدة</Label>
                  <Input value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})} />
                </div>
                <div className="w-28">
                  <Label className="text-xs">السعر</Label>
                  <Input type="number" value={newItem.default_price} onChange={e => setNewItem({...newItem, default_price: Number(e.target.value)})} />
                </div>
                <div className="w-24">
                  <Label className="text-xs">كود</Label>
                  <Input value={newItem.item_code} onChange={e => setNewItem({...newItem, item_code: e.target.value})} />
                </div>
                <Button size="sm" variant="accent" onClick={handleAddItem}><Plus className="h-4 w-4" /></Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الصنف</TableHead>
                    <TableHead>الوحدة</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>كود</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.item_name}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>{Number(item.default_price).toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>{item.item_code || "—"}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => removeItem(item.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">لا توجد أصناف</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم الطلبية</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>القيمة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map(o => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                      <TableCell>{new Date(o.order_date).toLocaleDateString("en-GB")}</TableCell>
                      <TableCell><StatusBadge status={o.status} /></TableCell>
                      <TableCell>{Number(o.total_amount).toLocaleString("en", { minimumFractionDigits: 2 })} ₪</TableCell>
                    </TableRow>
                  ))}
                  {orders.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا توجد طلبيات</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم الفاتورة</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>حالة الدفع</TableHead>
                    <TableHead>الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                      <TableCell>{new Date(inv.invoice_date).toLocaleDateString("en-GB")}</TableCell>
                      <TableCell>
                        <Badge variant={inv.payment_status === "paid" ? "default" : inv.payment_status === "partial" ? "secondary" : "destructive"}>
                          {inv.payment_status === "paid" ? "مدفوعة" : inv.payment_status === "partial" ? "جزئية" : "غير مدفوعة"}
                        </Badge>
                      </TableCell>
                      <TableCell>{Number(inv.total_amount).toLocaleString("en", { minimumFractionDigits: 2 })} ₪</TableCell>
                    </TableRow>
                  ))}
                  {invoices.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا توجد فواتير</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>طريقة الدفع</TableHead>
                    <TableHead>مرجع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{new Date(p.payment_date).toLocaleDateString("en-GB")}</TableCell>
                      <TableCell>{Number(p.amount).toLocaleString("en", { minimumFractionDigits: 2 })} ₪</TableCell>
                      <TableCell>{p.payment_method === "cash" ? "نقدي" : p.payment_method === "bank_transfer" ? "تحويل بنكي" : "شيك"}</TableCell>
                      <TableCell>{p.reference_number || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {payments.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا توجد مدفوعات</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft: { label: "مسودة", variant: "secondary" },
    sent: { label: "مُرسلة", variant: "outline" },
    partially_received: { label: "مستلمة جزئياً", variant: "secondary" },
    received: { label: "مستلمة", variant: "default" },
    cancelled: { label: "ملغاة", variant: "destructive" },
  };
  const m = map[status] || { label: status, variant: "secondary" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
};

export default SupplierDetailPage;
