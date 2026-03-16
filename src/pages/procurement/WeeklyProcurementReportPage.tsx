import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, FileText, CreditCard, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSuppliers } from "@/hooks/useProcurement";
import BackButton from "@/components/BackButton";
import { Skeleton } from "@/components/ui/skeleton";

const WeeklyProcurementReportPage = () => {
  const { suppliers } = useSuppliers();
  const [loading, setLoading] = useState(true);
  const [weekOrders, setWeekOrders] = useState<any[]>([]);
  const [weekInvoices, setWeekInvoices] = useState<any[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);

  useEffect(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString().split("T")[0];

    Promise.all([
      supabase.from("procurement_orders" as any).select("*, branches(name)").gte("order_date", weekStr),
      supabase.from("procurement_invoices" as any).select("*, procurement_suppliers(name)").gte("invoice_date", weekStr),
      supabase.from("procurement_orders" as any).select("*, procurement_suppliers(name), branches(name)").in("status", ["sent", "partially_received"]).order("order_date"),
    ]).then(([ordersRes, invoicesRes, pendingRes]) => {
      setWeekOrders((ordersRes.data as any) || []);
      setWeekInvoices((invoicesRes.data as any) || []);
      setPendingOrders((pendingRes.data as any) || []);
      setLoading(false);
    });
  }, []);

  const totalOrdersValue = weekOrders.reduce((s, o) => s + Number(o.total_amount), 0);
  const totalInvoicesValue = weekInvoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const unpaidInvoices = weekInvoices.filter(i => i.payment_status !== "paid");
  const unpaidAmount = unpaidInvoices.reduce((s, i) => s + Number(i.total_amount), 0);

  // Group orders by branch
  const branchStats: Record<string, { name: string; count: number; total: number; received: number; pending: number }> = {};
  weekOrders.forEach((o: any) => {
    const bName = o.branches?.name || "غير محدد";
    if (!branchStats[bName]) branchStats[bName] = { name: bName, count: 0, total: 0, received: 0, pending: 0 };
    branchStats[bName].count++;
    branchStats[bName].total += Number(o.total_amount);
    if (o.status === "received") branchStats[bName].received++;
    else if (o.status !== "cancelled") branchStats[bName].pending++;
  });

  if (loading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-xl font-bold text-foreground">التقرير الأسبوعي للمشتريات</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4 text-center"><ShoppingBag className="h-5 w-5 mx-auto mb-1 text-accent" /><p className="text-2xl font-bold">{weekOrders.length}</p><p className="text-xs text-muted-foreground">طلبيات الأسبوع</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{totalOrdersValue.toLocaleString("en", { minimumFractionDigits: 2 })}</p><p className="text-xs text-muted-foreground">قيمة الطلبيات ₪</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><FileText className="h-5 w-5 mx-auto mb-1 text-blue-500" /><p className="text-2xl font-bold">{weekInvoices.length}</p><p className="text-xs text-muted-foreground">فواتير مستلمة</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{totalInvoicesValue.toLocaleString("en", { minimumFractionDigits: 2 })}</p><p className="text-xs text-muted-foreground">قيمة الفواتير ₪</p></CardContent></Card>
        <Card className="border-destructive/30"><CardContent className="p-4 text-center"><AlertTriangle className="h-5 w-5 mx-auto mb-1 text-destructive" /><p className="text-2xl font-bold text-destructive">{unpaidAmount.toLocaleString("en", { minimumFractionDigits: 2 })}</p><p className="text-xs text-muted-foreground">غير مدفوعة ₪</p></CardContent></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">أداء الطلبيات حسب الفرع</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>الفرع</TableHead><TableHead>عدد</TableHead><TableHead>القيمة</TableHead><TableHead>مستلم</TableHead><TableHead>معلق</TableHead></TableRow></TableHeader>
              <TableBody>
                {Object.values(branchStats).map(b => (
                  <TableRow key={b.name}>
                    <TableCell>{b.name}</TableCell>
                    <TableCell>{b.count}</TableCell>
                    <TableCell className="font-mono">{b.total.toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{b.received}</TableCell>
                    <TableCell>{b.pending}</TableCell>
                  </TableRow>
                ))}
                {Object.keys(branchStats).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">لا توجد بيانات</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ملخص الموردين</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>المورد</TableHead><TableHead>الرصيد الافتتاحي</TableHead><TableHead>المشتريات</TableHead><TableHead>الرصيد</TableHead></TableRow></TableHeader>
              <TableBody>
                {suppliers.slice(0, 10).map(s => {
                  const sInvoices = weekInvoices.filter((i: any) => i.supplier_id === s.id);
                  const sTotal = sInvoices.reduce((sum: number, i: any) => sum + Number(i.total_amount), 0);
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell className="font-mono">{Number(s.opening_balance).toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="font-mono">{sTotal.toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="font-mono font-bold">{(Number(s.opening_balance) + sTotal).toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">الطلبيات المعلقة</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>رقم الطلبية</TableHead><TableHead>المورد</TableHead><TableHead>الفرع</TableHead><TableHead>التاريخ</TableHead><TableHead>الحالة</TableHead><TableHead>القيمة</TableHead></TableRow></TableHeader>
            <TableBody>
              {pendingOrders.map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                  <TableCell>{o.procurement_suppliers?.name || "—"}</TableCell>
                  <TableCell>{o.branches?.name || "—"}</TableCell>
                  <TableCell>{new Date(o.order_date).toLocaleDateString("en-GB")}</TableCell>
                  <TableCell>
                    <Badge variant={o.status === "sent" ? "outline" : "secondary"}>
                      {o.status === "sent" ? "مُرسلة" : "مستلمة جزئياً"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">{Number(o.total_amount).toLocaleString("en", { minimumFractionDigits: 2 })} ₪</TableCell>
                </TableRow>
              ))}
              {pendingOrders.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا توجد طلبيات معلقة 🎉</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default WeeklyProcurementReportPage;
