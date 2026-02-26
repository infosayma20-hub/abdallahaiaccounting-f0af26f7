import { TrendingUp, FileText, Package, Users, Zap } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";

interface SmartDailySummaryProps {
  netProfit: number;
  chequesToday: number;
  lowStockCount: number;
  followUpCount: number;
  loading: boolean;
}

const SummaryItem = ({ icon: Icon, label, value, color, loading }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  loading: boolean;
}) => (
  <div className="flex items-center gap-3 min-w-0">
    <div className={`w-10 h-10 rounded-2xl ${color} flex items-center justify-center flex-shrink-0`}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground truncate">{label}</p>
      <p className="text-base font-bold tabular-nums text-foreground" style={{ fontFeatureSettings: '"tnum" 1' }}>
        {loading ? "—" : value}
      </p>
    </div>
  </div>
);

const SmartDailySummary = ({ netProfit, chequesToday, lowStockCount, followUpCount, loading }: SmartDailySummaryProps) => {
  const animProfit = useCountUp(netProfit, 1000, !loading);

  return (
    <div className="relative bg-gradient-to-l from-primary/5 via-card to-card rounded-2xl p-5 shadow-card border border-primary/10 overflow-hidden">
      {/* Glow accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      
      <div className="relative flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Zap className="h-[18px] w-[18px] text-primary" strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">📊 ملخص اليوم الذكي</h2>
          <p className="text-[11px] text-muted-foreground">نظرة سريعة على أهم مستجدات يومك</p>
        </div>
      </div>

      <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryItem
          icon={TrendingUp}
          label="صافي الربح اليوم"
          value={`₪${animProfit.toLocaleString()}`}
          color="bg-success/10 text-success"
          loading={loading}
        />
        <SummaryItem
          icon={FileText}
          label="شيكات مستحقة اليوم"
          value={chequesToday}
          color="bg-warning/10 text-warning"
          loading={loading}
        />
        <SummaryItem
          icon={Package}
          label="مخزون منخفض"
          value={`${lowStockCount} أصناف`}
          color="bg-destructive/10 text-destructive"
          loading={loading}
        />
        <SummaryItem
          icon={Users}
          label="عميل بحاجة متابعة"
          value={followUpCount}
          color="bg-info/10 text-info"
          loading={loading}
        />
      </div>
    </div>
  );
};

export default SmartDailySummary;
