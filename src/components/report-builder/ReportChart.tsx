import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { ColumnDef } from "@/components/reports/SortableReportTable";

export type ChartType = "bar" | "line" | "pie" | "donut" | "area" | "stacked";

interface Props {
  data: any[];
  columns: ColumnDef[];
  type: ChartType;
  isGrouped: boolean;
}

// Executive palette (HSL)
const COLORS = [
  "hsl(217, 91%, 50%)",   // primary blue
  "hsl(142, 71%, 45%)",   // emerald
  "hsl(38, 92%, 50%)",    // amber
  "hsl(0, 72%, 51%)",     // red
  "hsl(262, 83%, 58%)",   // violet
  "hsl(199, 89%, 48%)",   // sky
  "hsl(173, 80%, 40%)",   // teal
  "hsl(330, 81%, 60%)",   // pink
];

const fmtMoney = (n: number) =>
  `₪${Number(n || 0).toLocaleString("en", { maximumFractionDigits: 0 })}`;

// Custom Arabic-friendly tooltip
function ArabicTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      dir="rtl"
      className="rounded-lg border border-border bg-popover/95 backdrop-blur px-3 py-2 shadow-lg text-xs"
      style={{ fontFamily: "Cairo, sans-serif" }}
    >
      <p className="font-semibold text-foreground mb-1.5 text-[11px]">{label}</p>
      <div className="space-y-1">
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: p.color || p.fill }}
              />
              <span className="text-muted-foreground">{p.name}:</span>
            </div>
            <span className="font-bold tabular-nums text-foreground">{fmtMoney(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportChart({ data, columns, type, isGrouped }: Props) {
  const { labelKey, valueKeys, chartData } = useMemo(() => {
    if (!data.length) return { labelKey: "", valueKeys: [] as string[], chartData: [] as any[] };

    let lk = "";
    let vks: string[] = [];

    if (isGrouped) {
      lk = "_group";
      vks = columns
        .filter(c => (c.type === "currency" || c.type === "number") && c.key !== "_count")
        .map(c => c.key);
      if (vks.length === 0) vks = ["_count"];
    } else {
      const labelCol = columns.find(c => c.type === "text" || c.type === "date");
      lk = labelCol?.key || columns[0]?.key || "";
      vks = columns.filter(c => c.type === "currency" || c.type === "number").map(c => c.key);
    }

    let cd = data.slice();
    if (!isGrouped && vks[0]) {
      cd = [...data]
        .sort((a, b) => Number(b[vks[0]] || 0) - Number(a[vks[0]] || 0))
        .slice(0, 15);
    }

    return { labelKey: lk, valueKeys: vks, chartData: cd };
  }, [data, columns, isGrouped]);

  const labelMap = useMemo(() => {
    const m: Record<string, string> = {};
    columns.forEach(c => { m[c.key] = c.label; });
    return m;
  }, [columns]);

  if (!chartData.length || !valueKeys.length) {
    return (
      <Card className="p-12 text-center">
        <p className="text-sm text-muted-foreground">لا توجد بيانات رقمية لعرضها كرسم بياني</p>
      </Card>
    );
  }

  // ===== Pie / Donut =====
  if (type === "pie" || type === "donut") {
    const valKey = valueKeys[0];
    const pieData = chartData
      .map(r => ({ name: String(r[labelKey] ?? "—"), value: Number(r[valKey] || 0) }))
      .filter(d => d.value > 0)
      .slice(0, 8);

    const totalSum = pieData.reduce((s, d) => s + d.value, 0);

    return (
      <div className="w-full h-[440px] relative" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="48%"
              outerRadius={140}
              innerRadius={type === "donut" ? 85 : 60}
              paddingAngle={2}
              label={(entry: any) => {
                const pct = totalSum > 0 ? Math.round((entry.value / totalSum) * 100) : 0;
                return `${entry.name} (${pct}%)`;
              }}
              labelLine={false}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ArabicTooltip />} />
            <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11, fontFamily: "Cairo, sans-serif" }} />
          </PieChart>
        </ResponsiveContainer>
        {type === "donut" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            style={{ marginTop: "-32px" }}
          >
            <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "Cairo, sans-serif" }}>
              الإجمالي
            </p>
            <p className="text-base font-bold text-foreground tabular-nums">{fmtMoney(totalSum)}</p>
          </div>
        )}
      </div>
    );
  }

  // ===== Line =====
  if (type === "line") {
    return (
      <div className="w-full h-[420px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 32 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtMoney} />
            <Tooltip content={<ArabicTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: "Cairo, sans-serif" }} />
            {valueKeys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                name={labelMap[k] || k}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ===== Area =====
  if (type === "area") {
    return (
      <div className="w-full h-[420px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 32 }}>
            <defs>
              {valueKeys.map((k, i) => (
                <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtMoney} />
            <Tooltip content={<ArabicTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: "Cairo, sans-serif" }} />
            {valueKeys.map((k, i) => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                name={labelMap[k] || k}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                fill={`url(#grad-${k})`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ===== Stacked Bar =====
  if (type === "stacked") {
    return (
      <div className="w-full h-[420px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 32 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtMoney} />
            <Tooltip content={<ArabicTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: "Cairo, sans-serif" }} />
            {valueKeys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                name={labelMap[k] || k}
                fill={COLORS[i % COLORS.length]}
                stackId="stack"
                radius={i === valueKeys.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // ===== Bar (default) =====
  return (
    <div className="w-full h-[420px]" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtMoney} />
          <Tooltip content={<ArabicTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: "Cairo, sans-serif" }} />
          {valueKeys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              name={labelMap[k] || k}
              fill={COLORS[i % COLORS.length]}
              radius={[6, 6, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Smart chart suggestion based on data shape.
 */
export function getAvailableCharts(columns: ColumnDef[], isGrouped: boolean): ChartType[] {
  const hasNumeric = columns.some(c => c.type === "currency" || c.type === "number");
  if (!hasNumeric) return [];

  const charts: ChartType[] = ["bar"];
  const numericCount = columns.filter(c => c.type === "currency" || c.type === "number").length;

  if (isGrouped) {
    charts.push("line", "area");
    charts.push("pie", "donut");
    // Stacked needs 2+ numeric series
    if (numericCount >= 2) charts.push("stacked");
  } else {
    const hasDate = columns.some(c => c.type === "date");
    if (hasDate) charts.push("line", "area");
    if (numericCount >= 2) charts.push("stacked");
  }

  return charts;
}
