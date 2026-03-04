import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface Props {
  totalSales: number;
  totalCOGS: number;
  grossProfit: number;
  grossMargin: number;
  totalReturns: number;
  totalDiscounts: number;
}

const POSProfitReport = ({ totalSales, totalCOGS, grossProfit, grossMargin, totalReturns, totalDiscounts }: Props) => {
  const netRevenue = totalSales - totalReturns - totalDiscounts;
  const netProfit = netRevenue - totalCOGS;
  const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle className="text-lg text-center">📊 تقرير الربحية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Row label="إجمالي المبيعات" value={totalSales} />
            <Row label="المرتجعات" value={-totalReturns} negative />
            <Row label="الحسومات" value={-totalDiscounts} negative />
            <Separator />
            <Row label="صافي الإيرادات" value={netRevenue} bold />
            <Row label="تكلفة البضاعة المباعة" value={-totalCOGS} negative />
            <Separator />
            <Row label="إجمالي الربح" value={grossProfit} bold primary />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">هامش الربح الإجمالي</span>
              <span className="font-bold text-primary">{grossMargin.toFixed(1)}%</span>
            </div>
            <Separator className="border-2" />
            <Row label="صافي الربح" value={netProfit} bold primary large />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">هامش الربح الصافي</span>
              <span className="font-bold" style={{ color: netMargin >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))" }}>{netMargin.toFixed(1)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const Row = ({ label, value, negative, bold, primary, large }: {
  label: string; value: number; negative?: boolean; bold?: boolean; primary?: boolean; large?: boolean;
}) => (
  <div className="flex justify-between items-center">
    <span className={`${bold ? "font-bold" : ""} ${large ? "text-lg" : "text-sm"} ${primary ? "" : "text-muted-foreground"}`}>{label}</span>
    <span className={`font-mono ${bold ? "font-bold" : "font-medium"} ${large ? "text-xl" : ""}`}
      style={{ color: negative ? "hsl(var(--destructive))" : primary ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
      {negative && value < 0 ? "-" : ""}₪{Math.abs(value).toLocaleString()}
    </span>
  </div>
);

export default POSProfitReport;
