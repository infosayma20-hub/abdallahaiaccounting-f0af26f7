import { useState } from "react";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from "recharts";
import type { ChartDataPoint } from "@/hooks/useDashboardData";

interface Props {
  data: ChartDataPoint[];
  grouping: "daily" | "weekly" | "monthly";
  onGroupingChange: (g: "daily" | "weekly" | "monthly") => void;
  loading: boolean;
}

type ChartType = "bar" | "line" | "area";

const formatLabel = (value: string) => {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  if (parts.length === 2) return `${parts[1]}/${parts[0].slice(2)}`;
  return value;
};

const formatValue = (v: number) => {
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return v.toString();
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-lg text-right" dir="rtl">
      <p className="text-[10px] text-muted-foreground mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-bold tabular-nums" style={{ fontFamily: "JetBrains Mono" }}>
            ₪{(p.value || 0).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function RevenueExpenseChart({ data, grouping, onGroupingChange, loading }: Props) {
  const [chartType, setChartType] = useState<ChartType>("bar");

  if (loading) {
    return (
      <div className="col-span-12 lg:col-span-8 bg-card rounded-2xl p-5 shadow-sm border border-border/30 animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mb-4" />
        <div className="h-[280px] bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="col-span-12 lg:col-span-8 bg-card rounded-2xl p-5 shadow-sm border border-border/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-medium text-foreground">الإيرادات مقابل المصروفات</h3>
        <div className="flex items-center gap-2">
          {/* Chart type */}
          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            {([
              { key: "bar", label: "📊" },
              { key: "line", label: "📈" },
              { key: "area", label: "📉" },
            ] as { key: ChartType; label: string }[]).map((t) => (
              <button
                key={t.key}
                onClick={() => setChartType(t.key)}
                className={`px-2 py-1 rounded-md text-[10px] transition-all ${
                  chartType === t.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Grouping */}
          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            {([
              { key: "daily" as const, label: "يومي" },
              { key: "weekly" as const, label: "أسبوعي" },
              { key: "monthly" as const, label: "شهري" },
            ]).map((g) => (
              <button
                key={g.key}
                onClick={() => onGroupingChange(g.key)}
                className={`px-2 py-1 rounded-md text-[10px] transition-all ${
                  grouping === g.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ direction: "ltr" }}>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="period" tickFormatter={formatLabel} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickFormatter={formatValue} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={45} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, direction: "rtl" }}
              formatter={(value: string) => <span className="text-[11px]">{value}</span>}
            />
            {chartType === "bar" ? (
              <>
                <Bar dataKey="revenue" name="الإيرادات" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="المصروفات" fill="#F43F5E" radius={[4, 4, 0, 0]} />
              </>
            ) : chartType === "area" ? (
              <>
                <Area dataKey="revenue" name="الإيرادات" fill="#10B981" fillOpacity={0.15} stroke="#10B981" strokeWidth={2} />
                <Area dataKey="expenses" name="المصروفات" fill="#F43F5E" fillOpacity={0.15} stroke="#F43F5E" strokeWidth={2} />
              </>
            ) : (
              <>
                <Line dataKey="revenue" name="الإيرادات" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line dataKey="expenses" name="المصروفات" stroke="#F43F5E" strokeWidth={2.5} dot={{ r: 3 }} />
              </>
            )}
            <Line dataKey="profit" name="صافي الربح" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
