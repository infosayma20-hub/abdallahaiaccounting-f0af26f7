import { useMemo } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Props {
  dailySales: { date: string; orders: number; sales: number; returns: number; net: number }[];
}

const CHART_GREEN = "#10B981";
const CHART_AMBER = "#F59E0B";
const CHART_RED = "#F43F5E";

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
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">حركة المبيعات</h3>
        </div>
        <div className="p-4">
          <div className="h-[280px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `₪${v.toLocaleString()}`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--primary))", border: "none", borderRadius: 6, color: "white", fontSize: 12 }}
                  formatter={(val: number, name: string) => [`₪${val.toLocaleString()}`, name === "sales" ? "المبيعات" : name === "returns" ? "المرتجعات" : "الصافي"]}
                  labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                />
                <Legend formatter={(val) => val === "sales" ? "المبيعات" : val === "returns" ? "المرتجعات" : "الصافي"} />
                <Line type="monotone" dataKey="sales" stroke={CHART_GREEN} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="returns" stroke={CHART_RED} strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="net" stroke={CHART_AMBER} strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">التفاصيل اليومية</h3>
          <span className="text-xs text-muted-foreground">{dailySales.length} يوم</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-secondary border-b border-border">
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">التاريخ</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">الطلبات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">المبيعات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">المرتجعات</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">الصافي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {dailySales.length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted-foreground py-12 text-sm">لا توجد بيانات للفترة المحددة</td></tr>
            )}
            {dailySales.map(d => (
              <tr key={d.date} className="hover:bg-secondary transition-colors">
                <td className="px-4 py-3 text-right text-sm text-foreground">{format(new Date(d.date), "dd/MM/yyyy")}</td>
                <td className="px-4 py-3 text-center text-sm text-muted-foreground font-mono">{d.orders}</td>
                <td className="px-4 py-3 text-left text-sm font-mono font-semibold text-foreground">₪{d.sales.toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm font-mono text-destructive">{d.returns > 0 ? `₪${d.returns.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 text-left text-sm font-mono font-bold text-foreground">₪{d.net.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          {dailySales.length > 0 && (
            <tfoot>
              <tr className="bg-secondary border-t-2 border-border">
                <td className="px-4 py-3 text-right text-sm font-bold text-foreground">الإجمالي</td>
                <td className="px-4 py-3 text-center text-sm font-bold text-foreground font-mono">{totals.orders}</td>
                <td className="px-4 py-3 text-left text-sm font-bold text-foreground font-mono">₪{totals.sales.toLocaleString()}</td>
                <td className="px-4 py-3 text-left text-sm font-bold text-destructive font-mono">{totals.returns > 0 ? `₪${totals.returns.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 text-left text-sm font-bold text-foreground font-mono">₪{totals.net.toLocaleString()}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default POSSalesReport;
