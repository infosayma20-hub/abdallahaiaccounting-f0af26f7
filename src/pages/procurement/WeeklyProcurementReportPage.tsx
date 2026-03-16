import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, FileText, AlertTriangle, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import BackButton from "@/components/BackButton";
import { Skeleton } from "@/components/ui/skeleton";

const WeeklyProcurementReportPage = () => {
  const [loading, setLoading] = useState(true);
  const [weekOrders, setWeekOrders] = useState<any[]>([]);
  const [weekInvoices, setWeekInvoices] = useState<any[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);

  useEffect(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const saturday = new Date(today);
    saturday.setDate(today.getDate() - ((dayOfWeek + 1) % 7));
    const weekStr = saturday.toISOString().split("T")[0];

    Promise.all([
      supabase.from("procurement_orders" as any).select("*, branches(name), pos_suppliers(name)").gte("order_date", weekStr),
      supabase.from("purchase_invoices").select("*, pos_suppliers(name)").gte("invoice_date", weekStr),
      supabase.from("procurement_orders" as any).select("*, pos_suppliers(name), branches(name)").in("status", ["sent", "partially_received"]).order("order_date"),
    ]).then(([ordersRes, invoicesRes, pendingRes]) => {
      setWeekOrders((ordersRes.data as any) || []);
      setWeekInvoices((invoicesRes.data as any) || []);
      setPendingOrders((pendingRes.data as any) || []);
      setLoading(false);
    });
  }, []);

  const totalInvoicesValue = weekInvoices.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
  const unpaidAmount = weekInvoices
    .filter((i: any) => Number(i.remaining_amount || 0) > 0)
    .reduce((s: number, i: any) => s + Number(i.remaining_amount || i.total_amount || 0), 0);

  if (loading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-xl font-bold text-foreground">التقرير الأسبوعي للمشتريات</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3"><ShoppingCart className="h-8 w-8 text-blue-400" /><div><p className="text-xs text-muted-foreground">طلبيات مُرسلة</p><p className="text-2xl font-bold">{weekOrders.filter((o: any) => o.status !== "draft" && o.status !== "cancelled").length}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><FileText className="h-8 w-8 text-green-400" /><div><p className="text-xs text-muted-foreground">فواتير مستلمة</p><p className="text-2xl font-bold">{weekInvoices.length}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><DollarSign className="h-8 w-8 text-accent" /><div><p className="text-xs text-muted-foreground">قيمة المشتريات</p><p className="text-xl font-bold">{totalInvoicesValue.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-orange-400" /><div><p className="text-xs text-muted-foreground">غير مدفوع</p><p className="text-xl font-bold text-destructive">{unpaidAmount.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</p></div></CardContent></Card>
      </div>

      {/* Suppliers summary */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">ملخص الموردين</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المورد</TableHead>
                <TableHead>عدد الطلبيات</TableHead>
                <TableHead>عدد الفواتير</TableHead>
                <TableHead>قيمة المشتريات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const supplierMap: Record<string, { name: string; orders: number; invoices: number; total: number }> = {};
                weekOrders.filter((o: any) => o.status !== "cancelled").forEach((o: any) => {
                  const sid = o.supplier_id;
                  if (!supplierMap[sid]) supplierMap[sid] = { name: o.pos_suppliers?.name || "—", orders: 0, invoices: 0, total: 0 };
                  supplierMap[sid].orders++;
                });
                weekInvoices.forEach((i: any) => {
                  const sid = i.supplier_id;
                  if (!supplierMap[sid]) supplierMap[sid] = { name: i.pos_suppliers?.name || i.supplier_name || "—", orders: 0, invoices: 0, total: 0 };
                  supplierMap[sid].invoices++;
                  supplierMap[sid].total += Number(i.total_amount || 0);
                });
                return Object.entries(supplierMap).map(([id, s]) => (
                  <TableRow key={id}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{s.orders}</TableCell>
                    <TableCell>{s.invoices}</TableCell>
                    <TableCell className="font-mono">{s.total.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</TableCell>
                  </TableRow>
                ));
              })()}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending orders */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">طلبيات معلقة ({pendingOrders.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {pendingOrders.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">لا توجد طلبيات معلقة ✅</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الطلبية</TableHead>
                  <TableHead>المورد</TableHead>
                  <TableHead>الفرع</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>القيمة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingOrders.map((o: any) => {
                  const isOverdue = o.expected_delivery_date && new Date(o.expected_delivery_date) < new Date();
                  return (
                    <TableRow key={o.id} className={isOverdue ? "bg-destructive/5" : ""}>
                      <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                      <TableCell>{o.pos_suppliers?.name || "—"}</TableCell>
                      <TableCell>{o.branches?.name || "—"}</TableCell>
                      <TableCell>{new Date(o.order_date).toLocaleDateString("en-GB")}</TableCell>
                      <TableCell>
                        <Badge variant={o.status === "sent" ? "secondary" : "outline"}>
                          {o.status === "sent" ? "مُرسلة" : "مستلمة جزئياً"}
                        </Badge>
                        {isOverdue && <Badge variant="destructive" className="mr-1 text-[10px]">متأخرة</Badge>}
                      </TableCell>
                      <TableCell className="font-mono">{Number(o.total_amount || 0).toLocaleString("en", { minimumFractionDigits: 2 })} ₪</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WeeklyProcurementReportPage;
