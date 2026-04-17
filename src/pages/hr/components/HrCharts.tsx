import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { HrCommandCenterData } from "@/hooks/hr/useHrCommandCenter";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(152, 72%, 40%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 70%, 55%)",
  "hsl(217, 91%, 60%)",
  "hsl(280, 70%, 60%)",
];

interface Props {
  charts: HrCommandCenterData["charts"];
}

const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return String(v);
};

export function HrCharts({ charts }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">اتجاه تكلفة الرواتب (6 أشهر)</CardTitle>
        </CardHeader>
        <CardContent>
          {charts.payrollTrend.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={charts.payrollTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtShort} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => `₪${fmtShort(v)}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="الإجمالي"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="الصافي"
                  stroke="hsl(152, 72%, 40%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">أداء الحضور (آخر 14 يوم)</CardTitle>
        </CardHeader>
        <CardContent>
          {charts.attendancePerformance.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={charts.attendancePerformance}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="present" name="حاضر" stackId="a" fill="hsl(152, 72%, 40%)" />
                <Bar dataKey="late" name="متأخر" stackId="a" fill="hsl(38, 92%, 50%)" />
                <Bar dataKey="absent" name="غائب" stackId="a" fill="hsl(0, 70%, 55%)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">استهلاك الإجازات حسب النوع</CardTitle>
        </CardHeader>
        <CardContent>
          {charts.leaveUsage.length === 0 ? (
            <Empty />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={charts.leaveUsage}
                    dataKey="count"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ type, count }) => `${type}: ${count}`}
                    labelLine={false}
                  >
                    {charts.leaveUsage.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 text-right">
                {charts.leaveUsage.map((u, i) => (
                  <div
                    key={u.type}
                    className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40 last:border-0"
                  >
                    <span className="text-sm font-bold tabular-nums">{u.count} يوم</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{u.type}</span>
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Empty() {
  return <p className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات كافية بعد.</p>;
}
