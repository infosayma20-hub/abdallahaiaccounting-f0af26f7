import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { AlertTriangle } from "lucide-react";

interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  productId: string | null;
}

interface Props {
  topProducts: TopProduct[];
  totalRevenue: number;
}

const POSProductsReport = ({ topProducts, totalRevenue }: Props) => {
  const top10 = useMemo(() => topProducts.slice(0, 10), [topProducts]);
  const chartDataQty = useMemo(() =>
    top10.map(p => ({
      name: p.name.length > 15 ? p.name.substring(0, 15) + "…" : p.name,
      qty: p.qty,
    })).reverse(), [top10]);
  const slowProducts = useMemo(() => topProducts.filter(p => p.qty <= 2), [topProducts]);
  const totalQty = topProducts.reduce((s, p) => s + p.qty, 0);
  const totalProfit = topProducts.reduce((s, p) => s + (p.revenue - p.cost), 0);

  return (
    <div className="space-y-4">
      {/* Bar Chart */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <h3 className="text-sm font-semibold text-[#1A2332]">أفضل المنتجات حسب الكمية</h3>
        </div>
        <div className="p-4">
          <div className="h-[280px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartDataQty} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#637381" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#637381" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  contentStyle={{ background: "#1A2332", border: "none", borderRadius: 6, color: "white", fontSize: 12 }}
                  formatter={(val: number) => [val, "الكمية"]}
                />
                <Bar dataKey="qty" fill="#0070F2" radius={[0, 3, 3, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Revenue Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1A2332]">أداء المنتجات</h3>
          <span className="text-xs text-[#637381]">{topProducts.length} منتج</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-[#F8F9FA] border-b border-[#E2E8F0]">
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المنتج</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الكمية</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الإيراد</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الربح</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">النسبة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {topProducts.length === 0 && (
              <tr><td colSpan={5} className="text-center text-[#637381] py-12 text-sm">لا توجد بيانات</td></tr>
            )}
            {topProducts.map((p, i) => {
              const profit = p.revenue - p.cost;
              const pct = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
              return (
                <tr key={p.name} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#94A3B8] w-4 font-mono">{i + 1}</span>
                      <span className="text-sm text-[#1A2332]">{p.name}</span>
                      {i === 0 && topProducts.length > 1 && (
                        <span className="text-[10px] bg-[#EBF5FF] text-[#0070F2] px-1.5 py-0.5 rounded font-medium">الأعلى</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-[#637381] font-mono">{p.qty}</td>
                  <td className="px-4 py-3 text-left text-sm font-mono font-semibold text-[#1A2332]">₪{p.revenue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-left text-sm font-mono font-semibold" style={{ color: profit >= 0 ? "#188038" : "#C53030" }}>
                    ₪{profit.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[#F1F5F9] rounded-full">
                        <div className="h-1.5 bg-[#0070F2] rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="text-xs text-[#637381] w-10 text-left font-mono">{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {topProducts.length > 0 && (
            <tfoot>
              <tr className="bg-[#F8F9FA] border-t-2 border-[#CBD5E1]">
                <td className="px-4 py-3 text-sm font-bold text-[#1A2332]">الإجمالي</td>
                <td className="px-4 py-3 text-center text-sm font-bold text-[#1A2332] font-mono">{totalQty}</td>
                <td className="px-4 py-3 text-left text-sm font-bold text-[#1A2332] font-mono">₪{totalRevenue.toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm font-bold font-mono" style={{ color: "#188038" }}>₪{totalProfit.toLocaleString()}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Slow Products Warning */}
      {slowProducts.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#D97706]" />
            <h3 className="text-sm font-semibold text-[#92400E]">منتجات تحتاج مراجعة (أقل مبيعاً)</h3>
          </div>
          <div className="p-4 space-y-2">
            {slowProducts.map(p => (
              <div key={p.name} className="flex items-center justify-between p-3 bg-[#FFFBEB] rounded-md border border-[#FDE68A]">
                <span className="text-sm text-[#1A2332]">{p.name}</span>
                <span className="text-xs font-medium text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded">
                  {p.qty === 0 ? "0 مبيعات" : `${p.qty} مبيعات فقط`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default POSProductsReport;
