import { TrendingUp } from "lucide-react";
import WidgetBanner from "./WidgetBanner";

interface TopItem {
  name: string;
  totalQty: number;
  totalAmount: number;
}

interface Props {
  items: TopItem[];
  loading: boolean;
}

function fmt(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function TopSellingWidget({ items, loading }: Props) {
  if (loading) {
    return (
      <div className="col-span-12 lg:col-span-6 bg-card rounded-2xl p-5 shadow-sm border border-border/30 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="h-[200px] bg-muted rounded-xl" />
      </div>
    );
  }

  const maxAmount = items.length > 0 ? items[0].totalAmount : 1;

  return (
    <div className="col-span-12 lg:col-span-6 bg-card rounded-2xl p-5 shadow-sm border border-border/30">
      <WidgetBanner title="أكثر الأصناف مبيعاً" icon="🏆" />

      {items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-xs">لا توجد مبيعات حالياً</div>
      ) : (
        <div className="space-y-2.5">
          {items.slice(0, 6).map((item, i) => (
            <div key={item.name} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-foreground font-medium truncate">{item.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-muted-foreground text-[10px]">{fmt(item.totalQty)} وحدة</span>
                  <span className="font-bold tabular-nums text-foreground" style={{ fontFamily: "JetBrains Mono" }}>
                    ₪{fmt(item.totalAmount)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-secondary/30">
                <div
                  className="h-full rounded-full bg-primary/60 transition-all"
                  style={{ width: `${Math.max(5, (item.totalAmount / maxAmount) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
