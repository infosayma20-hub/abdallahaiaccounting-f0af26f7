import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { POSOrder, POSPayment } from "@/hooks/usePOSReportsData";

interface Props {
  paymentBreakdown: { method: string; amount: number }[];
  totalSales: number;
  paidOrders: POSOrder[];
}

const COLORS = ["hsl(142,71%,45%)", "hsl(217,91%,60%)", "hsl(38,92%,50%)", "hsl(0,60%,50%)", "hsl(280,70%,50%)"];
const METHOD_ICONS: Record<string, string> = { "نقدي": "💵", "cash": "💵", "card": "💳", "شبكة": "💳", "تحويل": "📱", "transfer": "📱", "آجل": "👤", "credit": "👤" };

const POSPaymentsReport = ({ paymentBreakdown, totalSales, paidOrders }: Props) => {
  const chartData = useMemo(() =>
    paymentBreakdown.map(p => ({
      name: p.method,
      value: p.amount,
      pct: totalSales > 0 ? ((p.amount / totalSales) * 100).toFixed(1) : "0",
    })), [paymentBreakdown, totalSales]);

  // Credit/deferred orders
  const creditOrders = useMemo(() =>
    paidOrders.filter(o => o.customer_name), [paidOrders]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">💳 توزيع طرق الدفع</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-[280px]" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" nameKey="name" label={({ name, pct }) => `${name} (${pct}%)`} labelLine={false}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} formatter={(val: number) => [`₪${val.toLocaleString()}`, ""]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {paymentBreakdown.map((p, i) => (
                <div key={p.method} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span>{METHOD_ICONS[p.method] || "💰"} {p.method}</span>
                  </div>
                  <div className="text-left">
                    <span className="font-bold">₪{p.amount.toLocaleString()}</span>
                    <span className="text-muted-foreground text-sm mr-2">({totalSales > 0 ? ((p.amount / totalSales) * 100).toFixed(0) : 0}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {creditOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">👤 مبيعات العملاء</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الطلب</TableHead>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-left">المبلغ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditOrders.slice(0, 20).map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="text-right font-mono text-xs">{o.order_number || "-"}</TableCell>
                    <TableCell className="text-right">{o.customer_name}</TableCell>
                    <TableCell className="text-left font-bold">₪{o.total.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default POSPaymentsReport;
