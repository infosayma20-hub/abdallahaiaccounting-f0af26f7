import { useNavigate } from "react-router-dom";
import type { InventoryAlert } from "@/hooks/useDashboardData";
import WidgetBanner from "./WidgetBanner";

interface Props {
  alerts: InventoryAlert[];
  summary: { totalItems: number; totalValue: number; lowStock: number; outOfStock: number };
  loading: boolean;
}

function fmt(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function InventoryPulseWidget({ alerts, summary, loading }: Props) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="col-span-12 lg:col-span-4 bg-card rounded-2xl p-5 shadow-sm border border-border/30 animate-pulse">
        <div className="h-6 w-32 bg-muted rounded mb-4" />
        <div className="h-[160px] bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="col-span-12 lg:col-span-4 bg-card rounded-2xl p-5 shadow-sm border border-border/30">
      <WidgetBanner title="المخزون" icon="📦">
        <button onClick={() => navigate("/inventory")} className="text-[10px] text-white/70 hover:text-white hover:underline">عرض الكل ←</button>
      </WidgetBanner>

      {/* Status cards */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-xl bg-secondary/40 p-3 text-center">
          <p className="text-[9px] text-muted-foreground">إجمالي الأصناف</p>
          <p className="text-base font-bold text-foreground tabular-nums">{summary.totalItems}</p>
        </div>
        <div className="rounded-xl bg-secondary/40 p-3 text-center">
          <p className="text-[9px] text-muted-foreground">القيمة الإجمالية</p>
          <p className="text-base font-bold text-foreground tabular-nums" style={{ fontFamily: "JetBrains Mono" }}>₪{fmt(summary.totalValue)}</p>
        </div>
        <div className="rounded-xl bg-amber-500/8 p-3 text-center">
          <p className="text-[9px] text-amber-600">منخفض المخزون</p>
          <p className="text-base font-bold text-amber-600">{summary.lowStock}</p>
        </div>
        <div className="rounded-xl bg-red-500/8 p-3 text-center">
          <p className="text-[9px] text-red-500">نفد المخزون</p>
          <p className="text-base font-bold text-red-500">{summary.outOfStock}</p>
        </div>
      </div>

      {/* Critical items */}
      {alerts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-medium">أصناف تحتاج انتباه:</p>
          {alerts.slice(0, 4).map((item) => (
            <div key={item.id} className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-secondary/30">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                  item.status === "out" ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-600"
                }`}>
                  {item.status === "out" ? "نفد" : "منخفض"}
                </span>
                <span className="text-[11px] text-foreground truncate">{item.name}</span>
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">{item.quantity} متبقي</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
