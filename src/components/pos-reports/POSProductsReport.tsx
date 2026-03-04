import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Badge } from "@/components/ui/badge";

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

const COLORS = ["hsl(142,71%,45%)", "hsl(217,91%,60%)", "hsl(38,92%,50%)", "hsl(0,60%,50%)", "hsl(280,70%,50%)", "hsl(180,60%,45%)", "hsl(330,70%,50%)", "hsl(60,80%,50%)"];

const POSProductsReport = ({ topProducts, totalRevenue }: Props) => {
  const top10 = useMemo(() => topProducts.slice(0, 10), [topProducts]);
  const chartDataQty = useMemo(() => top10.map(p => ({ name: p.name.length > 15 ? p.name.substring(0, 15) + "…" : p.name, qty: p.qty })).reverse(), [top10]);
  const slowProducts = useMemo(() => topProducts.filter(p => p.qty <= 2), [topProducts]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🥇 أفضل المنتجات حسب الكمية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartDataQty} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={80} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                <Bar dataKey="qty" name="الكمية" radius={[0, 4, 4, 0]}>
                  {chartDataQty.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">💰 المنتجات حسب الإيراد</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">#</TableHead>
                <TableHead className="text-right">المنتج</TableHead>
                <TableHead className="text-center">الكمية</TableHead>
                <TableHead className="text-left">الإيراد</TableHead>
                <TableHead className="text-left">الربح</TableHead>
                <TableHead className="text-center">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topProducts.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا توجد بيانات</TableCell></TableRow>
              )}
              {topProducts.map((p, i) => (
                <TableRow key={p.name}>
                  <TableCell className="text-right font-bold">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</TableCell>
                  <TableCell className="text-right font-medium">{p.name}</TableCell>
                  <TableCell className="text-center">{p.qty}</TableCell>
                  <TableCell className="text-left text-primary font-semibold">₪{p.revenue.toLocaleString()}</TableCell>
                  <TableCell className="text-left font-semibold" style={{ color: p.revenue - p.cost > 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))" }}>
                    ₪{(p.revenue - p.cost).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-center">{totalRevenue > 0 ? ((p.revenue / totalRevenue) * 100).toFixed(1) : 0}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {slowProducts.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader>
            <CardTitle className="text-lg text-warning">⚠️ منتجات تحتاج مراجعة (أقل مبيعاً)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {slowProducts.map(p => (
                <div key={p.name} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <span className="font-medium">{p.name}</span>
                  <Badge variant="outline" className="text-warning border-warning/30">{p.qty === 0 ? "0 مبيعات" : `${p.qty} مبيعات فقط`}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default POSProductsReport;
