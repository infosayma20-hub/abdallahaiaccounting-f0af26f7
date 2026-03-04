import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

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

const COLORS = ["hsl(142,71%,45%)", "hsl(217,91%,60%)", "hsl(38,92%,50%)", "hsl(0,60%,50%)", "hsl(280,70%,50%)"];

const POSCashierReport = ({ cashierPerformance }: Props) => {
  const chartData = cashierPerformance.map(c => ({
    name: c.name.length > 12 ? c.name.substring(0, 12) + "…" : c.name,
    sales: c.sales,
  }));

  return (
    <div className="space-y-6">
      {cashierPerformance.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">📊 مقارنة مبيعات الكاشير</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} formatter={(val: number) => [`₪${val.toLocaleString()}`, "المبيعات"]} />
                  <Bar dataKey="sales" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">👤 أداء الكاشير التفصيلي</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الكاشير</TableHead>
                <TableHead className="text-center">الورديات</TableHead>
                <TableHead className="text-center">الطلبات</TableHead>
                <TableHead className="text-left">المبيعات</TableHead>
                <TableHead className="text-left">المتوسط</TableHead>
                <TableHead className="text-left">الحسومات</TableHead>
                <TableHead className="text-center">المرتجعات</TableHead>
                <TableHead className="text-left">العجز</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashierPerformance.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">لا توجد بيانات</TableCell></TableRow>
              )}
              {cashierPerformance.map((c, i) => (
                <TableRow key={c.name}>
                  <TableCell className="text-right font-medium">
                    {i === 0 && cashierPerformance.length > 1 ? "🏆 " : ""}{c.name}
                  </TableCell>
                  <TableCell className="text-center">{c.shifts}</TableCell>
                  <TableCell className="text-center">{c.orders}</TableCell>
                  <TableCell className="text-left text-primary font-semibold">₪{c.sales.toLocaleString()}</TableCell>
                  <TableCell className="text-left">₪{Math.round(c.avgOrder).toLocaleString()}</TableCell>
                  <TableCell className="text-left text-warning">₪{c.discounts.toLocaleString()}</TableCell>
                  <TableCell className="text-center">{c.returns}</TableCell>
                  <TableCell className="text-left" style={{ color: c.variance < 0 ? "hsl(var(--destructive))" : "hsl(var(--primary))" }}>
                    ₪{c.variance.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default POSCashierReport;
