import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import MiniSparkline from "@/components/MiniSparkline";
import type { DashboardKPI } from "@/hooks/useDashboardData";

interface Props {
  kpis: DashboardKPI;
  sparklines: { revenue: number[]; expenses: number[]; profit: number[] };
  loading: boolean;
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function pctChange(current: number, prev: number): number {
  if (prev === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prev) / Math.abs(prev)) * 100);
}

const KPI_DEFS = [
  { id: "net_profit", label: "صافي الربح", icon: "💰", key: "netProfit" as const, prevKey: "prevNetProfit" as const, sparkKey: "profit" as const, route: "/profit-loss", positiveGood: true },
  { id: "revenue", label: "إجمالي المبيعات", icon: "📈", key: "revenue" as const, prevKey: "prevRevenue" as const, sparkKey: "revenue" as const, route: "/profit-loss", positiveGood: true },
  { id: "expenses", label: "إجمالي المصروفات", icon: "💸", key: "expenses" as const, prevKey: "prevExpenses" as const, sparkKey: "expenses" as const, route: "/profit-loss", positiveGood: false },
  { id: "cash", label: "السيولة النقدية", icon: "💧", key: "cashBalance" as const, prevKey: "prevCashBalance" as const, sparkKey: "profit" as const, route: "/reports/cash-liquidity", positiveGood: true },
  { id: "receivables", label: "الذمم المدينة", icon: "👥", key: "receivables" as const, prevKey: "prevReceivables" as const, sparkKey: "revenue" as const, route: "/contacts", positiveGood: false },
  { id: "payables", label: "الذمم الدائنة", icon: "🏭", key: "payables" as const, prevKey: "prevPayables" as const, sparkKey: "expenses" as const, route: "/contacts", positiveGood: false },
];

export default function KPIMegaRow({ kpis, sparklines, loading }: Props) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="col-span-12 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex-1 min-w-[170px] h-[130px] rounded-2xl bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="col-span-12 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
      {KPI_DEFS.map((def) => {
        const value = kpis[def.key];
        const prevValue = kpis[def.prevKey];
        const change = pctChange(value, prevValue);
        const isPositive = change > 0;
        const trendGood = def.positiveGood ? isPositive : !isPositive;
        const sparkData = sparklines[def.sparkKey];
        const sparkColor = trendGood ? "hsl(152, 72%, 40%)" : change === 0 ? "hsl(220, 10%, 60%)" : "hsl(0, 70%, 55%)";

        return (
          <button
            key={def.id}
            onClick={() => navigate(def.route)}
            className="flex-1 min-w-[170px] bg-card rounded-2xl p-4 shadow-sm hover:shadow-md transition-all text-right group border border-border/30 hover:border-primary/20"
          >
            {/* Top */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-base">{def.icon}</span>
                <span className="text-[10px] text-muted-foreground font-medium">{def.label}</span>
              </div>
              {change !== 0 && (
                <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                  trendGood ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
                }`}>
                  {isPositive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                  {Math.abs(change)}%
                </span>
              )}
            </div>

            {/* Value */}
            <p className={`text-xl md:text-2xl font-bold tabular-nums mb-1 ${
              value < 0 ? "text-red-500" : "text-foreground"
            }`} style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {fmt(value)}
              <span className="text-xs text-muted-foreground mr-1">₪</span>
            </p>

            {/* Sparkline */}
            {sparkData.some((v) => v > 0) && (
              <div className="mt-1">
                <MiniSparkline data={sparkData} color={sparkColor} width={80} height={24} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
