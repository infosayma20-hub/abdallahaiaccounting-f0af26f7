import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface InventoryItem {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  productId: string | null;
  currentStock: number;
  minQuantity: number;
  buyPrice: number;
  profit: number;
  lowStock: boolean;
}

interface Props {
  inventoryReport: InventoryItem[];
}

const POSInventoryReport = ({ inventoryReport }: Props) => {
  const alerts = inventoryReport.filter(p => p.lowStock);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📦 المخزون والمبيعات</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">المنتج</TableHead>
                <TableHead className="text-center">مبيعات</TableHead>
                <TableHead className="text-center">المخزون</TableHead>
                <TableHead className="text-left">التكلفة</TableHead>
                <TableHead className="text-left">الربح</TableHead>
                <TableHead className="text-left">الهامش</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventoryReport.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا توجد بيانات</TableCell></TableRow>
              )}
              {inventoryReport.map(p => (
                <TableRow key={p.name}>
                  <TableCell className="text-right font-medium">{p.name}</TableCell>
                  <TableCell className="text-center">{p.qty}</TableCell>
                  <TableCell className="text-center">
                    <span className={p.lowStock ? "text-destructive font-bold" : ""}>
                      {p.currentStock}
                    </span>
                    {p.lowStock && <span className="text-destructive mr-1">🔴</span>}
                  </TableCell>
                  <TableCell className="text-left">₪{p.cost.toLocaleString()}</TableCell>
                  <TableCell className="text-left font-semibold" style={{ color: p.profit > 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))" }}>
                    ₪{p.profit.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-left">{p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : 0}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {alerts.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">🔴 تنبيهات المخزون</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map(p => (
                <div key={p.name} className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg border border-destructive/20">
                  <span className="font-medium">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">باقي {p.currentStock} {p.currentStock <= 5 ? "قطع فقط" : "قطعة"}</Badge>
                    <span className="text-xs text-muted-foreground">الحد الأدنى: {p.minQuantity}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default POSInventoryReport;
