import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { ColumnDef } from "@/components/reports/SortableReportTable";

export type ChartType = "bar" | "line" | "pie";

interface Props {
  data: any[];
  columns: ColumnDef[];
  type: ChartType;
  isGrouped: boolean;
}

// Executive palette (HSL semantic-friendly)
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

export default function ReportChart({ data, columns, type, isGrouped }: Props) {
  // Determine label (X axis / pie name) and value (Y / pie value) keys
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
      // Use first text/date column as label, numeric/currency columns as values
      const labelCol = columns.find(c => c.type === "text" || c.type === "date");
      lk = labelCol?.key || columns[0]?.key || "";
      vks = columns.filter(c => c.type === "currency" || c.type === "number").map(c => c.key);
    }

    // For non-grouped: limit to top 15 by first value to avoid clutter
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

  // Pie chart: only first value key, label = labelKey
  if (type === "pie") {
    const valKey = valueKeys[0];
    const pieData = chartData
      .map(r => ({ name: String(r[labelKey] ?? "—"), value: Number(r[valKey] || 0) }))
      .filter(d => d.value > 0)
      .slice(0, 8);

    return (
      <div className="w-full h-[420px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={140}
              innerRadius={60}
              paddingAngle={2}
              label={(entry: any) => `${entry.name}: ${fmtMoney(entry.value)}`}
              labelLine={false}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
            <Legend verticalAlign="bottom" iconType="circle" />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "line") {
    return (
      <div className="w-full h-[420px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 32 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtMoney} />
            <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
            <Legend />
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

  // Bar (default)
  return (
    <div className="w-full h-[420px]" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey={labelKey} tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtMoney} />
          <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
          <Legend />
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
 * Determine which chart types are suitable for the current data shape.
 */
export function getAvailableCharts(columns: ColumnDef[], isGrouped: boolean): ChartType[] {
  const hasNumeric = columns.some(c => c.type === "currency" || c.type === "number");
  if (!hasNumeric) return [];

  const charts: ChartType[] = ["bar"];

  // Line: best for time-series (grouped by date) or has date column
  if (isGrouped) {
    charts.push("line");
  } else {
    const hasDate = columns.some(c => c.type === "date");
    if (hasDate) charts.push("line");
  }

  // Pie: best for categorical breakdown (grouped) — single dimension
  if (isGrouped) {
    charts.push("pie");
  }

  return charts;
}
