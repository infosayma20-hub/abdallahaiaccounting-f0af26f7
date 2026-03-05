import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { POSOrder } from "@/hooks/usePOSReportsData";

interface Props {
  paymentBreakdown: { method: string; amount: number }[];
  totalSales: number;
  paidOrders: POSOrder[];
}

const COLORS = ["#0070F2", "#4299E1", "#90CDF4", "#BEE3F8"];

const POSPaymentsReport = ({ paymentBreakdown, totalSales, paidOrders }: Props) => {
  const chartData = useMemo(() =>
    paymentBreakdown.map(p => ({
      name: p.method,
      value: p.amount,
      pct: totalSales > 0 ? ((p.amount / totalSales) * 100).toFixed(1) : "0",
    })), [paymentBreakdown, totalSales]);

  const creditOrders = useMemo(() => paidOrders.filter(o => o.customer_name), [paidOrders]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h3 className="text-sm font-semibold text-[#1A2332]">توزيع طرق الدفع</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-[260px]" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value" nameKey="name"
                    label={({ pct }) => `${pct}%`} labelLine={false}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1A2332", border: "none", borderRadius: 6, color: "white", fontSize: 12 }}
                    formatter={(val: number) => [`₪${val.toLocaleString()}`, ""]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3 flex flex-col justify-center">
              {paymentBreakdown.map((p, i) => (
                <div key={p.method} className="flex items-center justify-between p-3 rounded-md bg-[#F8F9FA] border border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-sm text-[#1A2332]">{p.method}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-bold font-mono text-[#1A2332]">₪{p.amount.toLocaleString()}</span>
                    <span className="text-xs text-[#637381] mr-2 font-mono">
                      ({totalSales > 0 ? ((p.amount / totalSales) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {creditOrders.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0]">
            <h3 className="text-sm font-semibold text-[#1A2332]">مبيعات العملاء</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8F9FA] border-b border-[#E2E8F0]">
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">رقم الطلب</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">العميل</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المبلغ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {creditOrders.slice(0, 20).map(o => (
                <tr key={o.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-4 py-3 text-right font-mono text-xs text-[#637381]">{o.order_number || "—"}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#1A2332]">{o.customer_name}</td>
                  <td className="px-4 py-3 text-left font-mono font-bold text-sm text-[#1A2332]">₪{o.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default POSPaymentsReport;
