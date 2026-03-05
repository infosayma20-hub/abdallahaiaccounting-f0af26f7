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
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs font-medium text-[#637381] uppercase tracking-wider">إجمالي المرتجعات</p>
          <p className="text-2xl font-bold text-[#C53030] mt-2 font-mono">₪{totalReturns.toLocaleString()}</p>
          <p className="text-xs text-[#637381] mt-1 font-mono">{returnRate}% من المبيعات</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs font-medium text-[#637381] uppercase tracking-wider">عدد المرتجعات</p>
          <p className="text-2xl font-bold text-[#1A2332] mt-2 font-mono">{returnOrders.length}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-lg p-4">
          <p className="text-xs font-medium text-[#637381] uppercase tracking-wider">أكثر منتج مُرتجع</p>
          <p className="text-lg font-bold text-[#1A2332] mt-2">{topReturnProduct?.name || "—"}</p>
          {topReturnProduct && <p className="text-xs text-[#637381] mt-1 font-mono">{topReturnProduct.count} مرات</p>}
        </div>
      </div>

      {/* Details Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h3 className="text-sm font-semibold text-[#1A2332]">تفاصيل المرتجعات</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-[#F8F9FA] border-b border-[#E2E8F0]">
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">التاريخ</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">رقم الطلب</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المبلغ</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">السبب</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الكاشير</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {returnOrders.length === 0 && (
              <tr><td colSpan={5} className="text-center text-[#637381] py-12 text-sm">لا توجد مرتجعات</td></tr>
            )}
            {returnOrders.map(o => (
              <tr key={o.id} className="hover:bg-[#F8F9FA] transition-colors">
                <td className="px-4 py-3 text-right text-sm text-[#637381] font-mono">{format(new Date(o.created_at), "dd/MM/yyyy HH:mm")}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-[#637381]">{o.order_number || "—"}</td>
                <td className="px-4 py-3 text-left text-sm font-mono font-bold text-[#C53030]">₪{o.total.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-sm text-[#637381]">{o.return_reason || "—"}</td>
                <td className="px-4 py-3 text-right text-sm text-[#637381]">{sessionMap[o.session_id] || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default POSReturnsReport;
