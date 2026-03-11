import { useMemo } from "react";
import { format } from "date-fns";
import type { POSOrder, POSOrderLine } from "@/hooks/usePOSReportsData";

interface Props {
  returnOrders: POSOrder[];
  orderLines: POSOrderLine[];
  sessions: { id: string; cashier_name: string | null }[];
  paidOrders: POSOrder[];
  totalSales: number;
}

const POSReturnsReport = ({ returnOrders, orderLines, sessions, totalSales }: Props) => {
  const totalReturns = useMemo(() => returnOrders.reduce((s, o) => s + o.total, 0), [returnOrders]);
  const returnRate = totalSales > 0 ? ((totalReturns / totalSales) * 100).toFixed(1) : "0";

  const sessionMap = useMemo(() => {
    const m: Record<string, string> = {};
    sessions.forEach(s => { m[s.id] = s.cashier_name || "غير محدد"; });
    return m;
  }, [sessions]);

  const returnOrderIds = useMemo(() => new Set(returnOrders.map(o => o.id)), [returnOrders]);
  const returnLines = useMemo(() => orderLines.filter(l => returnOrderIds.has(l.order_id)), [orderLines, returnOrderIds]);
  const topReturnProduct = useMemo(() => {
    const map: Record<string, number> = {};
    returnLines.forEach(l => { map[l.product_name] = (map[l.product_name] || 0) + l.qty; });
    const sorted = Object.entries(map).sort(([, a], [, b]) => b - a);
    return sorted[0] ? { name: sorted[0][0], count: sorted[0][1] } : null;
  }, [returnLines]);

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">إجمالي المرتجعات</p>
          <p className="text-2xl font-bold text-destructive mt-2 font-mono">₪{totalReturns.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">{returnRate}% من المبيعات</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">عدد المرتجعات</p>
          <p className="text-2xl font-bold text-foreground mt-2 font-mono">{returnOrders.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">أكثر منتج مُرتجع</p>
          <p className="text-lg font-bold text-foreground mt-2">{topReturnProduct?.name || "—"}</p>
          {topReturnProduct && <p className="text-xs text-muted-foreground mt-1 font-mono">{topReturnProduct.count} مرات</p>}
        </div>
      </div>

      {/* Details Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">تفاصيل المرتجعات</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-secondary border-b border-border">
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">التاريخ</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">رقم الطلب</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">المبلغ</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">السبب</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">الكاشير</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {returnOrders.length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted-foreground py-12 text-sm">لا توجد مرتجعات</td></tr>
            )}
            {returnOrders.map(o => (
              <tr key={o.id} className="hover:bg-secondary transition-colors">
                <td className="px-4 py-3 text-right text-sm text-muted-foreground font-mono">{format(new Date(o.created_at), "dd/MM/yyyy HH:mm")}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{o.order_number || "—"}</td>
                <td className="px-4 py-3 text-left text-sm font-mono font-bold text-destructive">₪{o.total.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-sm text-muted-foreground">{o.return_reason || "—"}</td>
                <td className="px-4 py-3 text-right text-sm text-muted-foreground">{sessionMap[o.session_id] || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default POSReturnsReport;
