import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Props {
  dailySales: { date: string; orders: number; sales: number; returns: number; net: number }[];
}

const POSSalesReport = ({ dailySales }: Props) => {
  const totals = useMemo(() => ({
    orders: dailySales.reduce((s, d) => s + d.orders, 0),
    sales: dailySales.reduce((s, d) => s + d.sales, 0),
    returns: dailySales.reduce((s, d) => s + d.returns, 0),
    net: dailySales.reduce((s, d) => s + d.net, 0),
  }), [dailySales]);

  const chartData = useMemo(() =>
    dailySales.map(d => ({
      ...d,
      label: format(new Date(d.date), "dd/MM", { locale: ar }),
    })), [dailySales]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📈 حركة المبيعات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }}
                  formatter={(val: number) => [`₪${val.toLocaleString()}`, ""]}
                />
                <Legend />
                <Line type="monotone" dataKey="sales" name="المبيعات" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="returns" name="المرتجعات" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net" name="الصافي" stroke="hsl(var(--info))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">جدول المبيعات التفصيلي</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-center">الطلبات</TableHead>
                <TableHead className="text-left">المبيعات</TableHead>
                <TableHead className="text-left">المرتجعات</TableHead>
                <TableHead className="text-left">الصافي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailySales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">لا توجد بيانات للفترة المحددة</TableCell>
                </TableRow>
              )}
              {dailySales.map(d => (
                <TableRow key={d.date}>
                  <TableCell className="text-right font-medium">{format(new Date(d.date), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="text-center">{d.orders}</TableCell>
                  <TableCell className="text-left text-primary font-semibold">₪{d.sales.toLocaleString()}</TableCell>
                  <TableCell className="text-left text-destructive">₪{d.returns.toLocaleString()}</TableCell>
                  <TableCell className="text-left font-bold">₪{d.net.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {dailySales.length > 0 && (
              <TableFooter>
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell className="text-right">الإجمالي</TableCell>
                  <TableCell className="text-center">{totals.orders}</TableCell>
                  <TableCell className="text-left text-primary">₪{totals.sales.toLocaleString()}</TableCell>
                  <TableCell className="text-left text-destructive">₪{totals.returns.toLocaleString()}</TableCell>
                  <TableCell className="text-left">₪{totals.net.toLocaleString()}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default POSSalesReport;
