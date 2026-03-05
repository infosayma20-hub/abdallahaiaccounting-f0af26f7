import { useMemo } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Props {
  dailySales: { date: string; orders: number; sales: number; returns: number; net: number }[];
}

const CHART_BLUE = "#0070F2";
const CHART_BLUE_LIGHT = "#4299E1";
const CHART_RED = "#C53030";

const POSSalesReport = ({ dailySales }: Props) => {
  const totals = useMemo(() => ({
    orders: dailySales.reduce((s, d) => s + d.orders, 0),
    sales: dailySales.reduce((s, d) => s + d.sales, 0),
    returns: dailySales.reduce((s, d) => s + d.returns, 0),
    net: dailySales.reduce((s, d) => s + d.net, 0),
  }), [dailySales]);

  const chartData = useMemo(() =>
    dailySales.map(d => ({ ...d, label: format(new Date(d.date), "dd/MM", { locale: ar }) })), [dailySales]);

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h3 className="text-sm font-semibold text-[#1A2332]">حركة المبيعات</h3>
        </div>
        <div className="p-4">
          <div className="h-[280px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#637381" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#637381" }} axisLine={false} tickLine={false} tickFormatter={v => `₪${v.toLocaleString()}`} />
                <Tooltip
                  contentStyle={{ background: "#1A2332", border: "none", borderRadius: 6, color: "white", fontSize: 12 }}
                  formatter={(val: number, name: string) => [`₪${val.toLocaleString()}`, name === "sales" ? "المبيعات" : name === "returns" ? "المرتجعات" : "الصافي"]}
                  labelStyle={{ color: "#94A3B8" }}
                />
                <Legend formatter={(val) => val === "sales" ? "المبيعات" : val === "returns" ? "المرتجعات" : "الصافي"} />
                <Line type="monotone" dataKey="sales" stroke={CHART_BLUE} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="returns" stroke={CHART_RED} strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="net" stroke={CHART_BLUE_LIGHT} strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1A2332]">التفاصيل اليومية</h3>
          <span className="text-xs text-[#637381]">{dailySales.length} يوم</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-[#F8F9FA] border-b border-[#E2E8F0]">
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">التاريخ</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الطلبات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المبيعات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المرتجعات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الصافي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {dailySales.length === 0 && (
              <tr><td colSpan={5} className="text-center text-[#637381] py-12 text-sm">لا توجد بيانات للفترة المحددة</td></tr>
            )}
            {dailySales.map(d => (
              <tr key={d.date} className="hover:bg-[#F8F9FA] transition-colors">
                <td className="px-4 py-3 text-right text-sm text-[#1A2332]">{format(new Date(d.date), "dd/MM/yyyy")}</td>
                <td className="px-4 py-3 text-center text-sm text-[#637381] font-mono">{d.orders}</td>
                <td className="px-4 py-3 text-left text-sm font-mono font-semibold text-[#1A2332]">₪{d.sales.toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm font-mono text-[#C53030]">{d.returns > 0 ? `₪${d.returns.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 text-left text-sm font-mono font-bold text-[#1A2332]">₪{d.net.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          {dailySales.length > 0 && (
            <tfoot>
              <tr className="bg-[#F8F9FA] border-t-2 border-[#CBD5E1]">
                <td className="px-4 py-3 text-right text-sm font-bold text-[#1A2332]">الإجمالي</td>
                <td className="px-4 py-3 text-center text-sm font-bold text-[#1A2332] font-mono">{totals.orders}</td>
                <td className="px-4 py-3 text-left text-sm font-bold text-[#1A2332] font-mono">₪{totals.sales.toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm font-bold text-[#C53030] font-mono">{totals.returns > 0 ? `₪${totals.returns.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 text-left text-sm font-bold text-[#1A2332] font-mono">₪{totals.net.toLocaleString()}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default POSSalesReport;
