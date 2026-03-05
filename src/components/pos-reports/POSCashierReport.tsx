import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface CashierData {
  name: string;
  shifts: number;
  orders: number;
  sales: number;
  avgOrder: number;
  variance: number;
  discounts: number;
  returns: number;
}

interface Props {
  cashierPerformance: CashierData[];
}

const POSCashierReport = ({ cashierPerformance }: Props) => {
  const chartData = cashierPerformance.map(c => ({
    name: c.name.length > 12 ? c.name.substring(0, 12) + "…" : c.name,
    sales: c.sales,
  }));

  return (
    <div className="space-y-4">
      {cashierPerformance.length > 1 && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0]">
            <h3 className="text-sm font-semibold text-[#1A2332]">مقارنة مبيعات الكاشير</h3>
          </div>
          <div className="p-4">
            <div className="h-[240px]" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#637381" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#637381" }} axisLine={false} tickLine={false} tickFormatter={v => `₪${v.toLocaleString()}`} />
                  <Tooltip
                    contentStyle={{ background: "#1A2332", border: "none", borderRadius: 6, color: "white", fontSize: 12 }}
                    formatter={(val: number) => [`₪${val.toLocaleString()}`, "المبيعات"]}
                  />
                  <Bar dataKey="sales" fill="#0070F2" radius={[3, 3, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h3 className="text-sm font-semibold text-[#1A2332]">أداء الكاشير التفصيلي</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-[#F8F9FA] border-b border-[#E2E8F0]">
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الكاشير</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الورديات</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الطلبات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المبيعات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المتوسط</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الحسومات</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المرتجعات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">العجز</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {cashierPerformance.length === 0 && (
              <tr><td colSpan={8} className="text-center text-[#637381] py-12 text-sm">لا توجد بيانات</td></tr>
            )}
            {cashierPerformance.map((c, i) => (
              <tr key={c.name} className="hover:bg-[#F8F9FA] transition-colors">
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#1A2332] font-medium">{c.name}</span>
                    {i === 0 && cashierPerformance.length > 1 && (
                      <span className="text-[10px] bg-[#EBF5FF] text-[#0070F2] px-1.5 py-0.5 rounded font-medium">الأعلى</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-sm text-[#637381] font-mono">{c.shifts}</td>
                <td className="px-4 py-3 text-center text-sm text-[#637381] font-mono">{c.orders}</td>
                <td className="px-4 py-3 text-left text-sm font-mono font-semibold text-[#0070F2]">₪{c.sales.toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm font-mono text-[#637381]">₪{Math.round(c.avgOrder).toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm font-mono text-[#D97706]">₪{c.discounts.toLocaleString()}</td>
                <td className="px-4 py-3 text-center text-sm font-mono text-[#637381]">{c.returns}</td>
                <td className="px-4 py-3 text-left text-sm font-mono font-semibold"
                  style={{ color: c.variance < 0 ? "#C53030" : c.variance > 0 ? "#188038" : "#637381" }}>
                  {c.variance < 0 ? `(₪${Math.abs(c.variance).toLocaleString()})` : `₪${c.variance.toLocaleString()}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default POSCashierReport;
