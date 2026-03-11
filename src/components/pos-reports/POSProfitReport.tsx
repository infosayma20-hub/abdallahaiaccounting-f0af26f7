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
    <div className="max-w-2xl mx-auto">
      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">قائمة الدخل — نقطة البيع</h3>
        </div>
        <div className="px-6 py-4 space-y-0">
          {/* Revenue Section */}
          <PLSection title="الإيرادات" />
          <PLRow label="إجمالي المبيعات" value={totalSales} />
          <PLRow label="(-) المرتجعات" value={-totalReturns} indent />
          <PLRow label="(-) الحسومات" value={-totalDiscounts} indent />
          <PLTotal label="صافي الإيرادات" value={netRevenue} />

          <div className="border-t border-border my-3" />

          {/* COGS Section */}
          <PLSection title="تكلفة المبيعات" />
          <PLRow label="تكلفة البضاعة المباعة" value={-totalCOGS} indent />
          <PLTotal label="إجمالي الربح" value={grossProfit} sub={`هامش ${grossMargin.toFixed(1)}%`} />

          <div className="border-t border-border my-3" />

          {/* Net Profit */}
          <PLTotal label="صافي الربح التشغيلي" value={netProfit} highlight sub={`هامش ${netMargin.toFixed(1)}%`} />
        </div>
      </div>
    </div>
  );
};

const PLSection = ({ title }: { title: string }) => (
  <div className="pt-3 pb-1">
    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
  </div>
);

const PLRow = ({ label, value, indent }: { label: string; value: number; indent?: boolean }) => (
  <div className={`flex justify-between py-1.5 ${indent ? "pr-4" : ""}`}>
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className={`text-sm font-mono font-medium ${value < 0 ? "text-destructive" : "text-foreground"}`}>
      {value < 0 ? "-" : ""}₪{Math.abs(value).toLocaleString("en", { minimumFractionDigits: 2 })}
    </span>
  </div>
);

const PLTotal = ({ label, value, sub, highlight }: {
  label: string; value: number; sub?: string; highlight?: boolean;
}) => (
  <div className={`flex justify-between py-2 border-t border-border ${
    highlight ? "bg-accent/10 px-4 -mx-4 rounded-lg border-2 border-accent/20 mt-3" : ""
  }`}>
    <div>
      <span className="text-sm font-bold text-foreground">
        {label}
      </span>
      {sub && <span className="text-xs text-muted-foreground mr-2">({sub})</span>}
    </div>
    <span className={`font-mono font-bold ${highlight ? "text-accent text-base" : "text-sm text-foreground"}`}>
      ₪{value.toLocaleString("en", { minimumFractionDigits: 2 })}
    </span>
  </div>
);

export default POSProfitReport;
