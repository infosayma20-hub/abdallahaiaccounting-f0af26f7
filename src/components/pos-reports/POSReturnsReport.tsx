import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import type { POSOrder, POSOrderLine } from "@/hooks/usePOSReportsData";

interface Props {
  returnOrders: POSOrder[];
  orderLines: POSOrderLine[];
  sessions: { id: string; cashier_name: string | null }[];
  paidOrders: POSOrder[];
  totalSales: number;
}

const POSReturnsReport = ({ returnOrders, orderLines, sessions, paidOrders, totalSales }: Props) => {
  const totalReturns = useMemo(() => returnOrders.reduce((s, o) => s + o.total, 0), [returnOrders]);
  const returnRate = totalSales > 0 ? ((totalReturns / totalSales) * 100).toFixed(1) : "0";

  // Get cashier name for each return
  const sessionMap = useMemo(() => {
    const m: Record<string, string> = {};
    sessions.forEach(s => { m[s.id] = s.cashier_name || "غير محدد"; });
    return m;
  }, [sessions]);

  // Most returned product
  const returnOrderIds = useMemo(() => new Set(returnOrders.map(o => o.id)), [returnOrders]);
  const returnLines = useMemo(() => orderLines.filter(l => returnOrderIds.has(l.order_id)), [orderLines, returnOrderIds]);
  const topReturnProduct = useMemo(() => {
    const map: Record<string, number> = {};
    returnLines.forEach(l => {
      map[l.product_name] = (map[l.product_name] || 0) + l.qty;
    });
    const sorted = Object.entries(map).sort(([, a], [, b]) => b - a);
    return sorted[0] ? { name: sorted[0][0], count: sorted[0][1] } : null;
  }, [returnLines]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">إجمالي المرتجعات</p>
            <p className="text-2xl font-bold text-destructive mt-1">₪{totalReturns.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">({returnRate}% من المبيعات)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">عدد المرتجعات</p>
            <p className="text-2xl font-bold text-destructive mt-1">{returnOrders.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">أكثر منتج مُرتجع</p>
            <p className="text-2xl font-bold mt-1">{topReturnProduct?.name || "-"}</p>
            {topReturnProduct && <p className="text-xs text-muted-foreground mt-1">{topReturnProduct.count} مرات</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🔄 تفاصيل المرتجعات</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">رقم الطلب</TableHead>
                <TableHead className="text-left">المبلغ</TableHead>
                <TableHead className="text-right">السبب</TableHead>
                <TableHead className="text-right">الكاشير</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returnOrders.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">لا توجد مرتجعات 🎉</TableCell></TableRow>
              )}
              {returnOrders.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="text-right">{format(new Date(o.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{o.order_number || "-"}</TableCell>
                  <TableCell className="text-left text-destructive font-bold">₪{o.total.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{o.return_reason || "-"}</TableCell>
                  <TableCell className="text-right">{sessionMap[o.session_id] || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default POSReturnsReport;
