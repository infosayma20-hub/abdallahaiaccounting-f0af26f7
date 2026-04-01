import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Droplets, Users, Landmark,
  Settings2, ChevronLeft, GripVertical, Eye, EyeOff, LayoutGrid, BarChart3,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCountUp } from "@/hooks/useCountUp";
import MiniSparkline from "@/components/MiniSparkline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ─── Types ───
interface KPIConfig {
  id: string;
  visible: boolean;
}

interface KPIData {
  id: string;
  title: string;
  icon: React.ElementType;
  value: number;
  prefix: string;
  status: "green" | "yellow" | "red";
  trendLabel: string;
  trend: "up" | "down" | "neutral";
  linkTo: string;
  // detailed view extras
  subItems: { label: string; value: string }[];
  aiInsight: string;
  sparkData: number[];
}

interface CustomizableKPICardsProps {
  revenue: number;
  expenses: number;
  totalIncome: number;
  totalOutcome: number;
  receivables: number;
  payables: number;
  cashBalance: number;
  netProfit: number;
  loading: boolean;
}

const STORAGE_KEY = "kpi_preferences";
const VIEW_KEY = "kpi_view_mode";

const statusColors = {
  green: {
    text: "text-primary", bg: "bg-primary/8", tag: "bg-primary/10 text-primary",
    spark: "hsl(152, 72%, 40%)", border: "border-primary/20", indicator: "bg-primary",
  },
  yellow: {
    text: "text-warning", bg: "bg-warning/8", tag: "bg-warning/10 text-warning",
    spark: "hsl(38, 92%, 50%)", border: "border-warning/20", indicator: "bg-warning",
  },
  red: {
    text: "text-destructive", bg: "bg-destructive/8", tag: "bg-destructive/10 text-destructive",
    spark: "hsl(0, 72%, 51%)", border: "border-destructive/20", indicator: "bg-destructive",
  },
};

// ─── Simple Card ───
const SimpleKPICard = ({ card, loading }: { card: KPIData; loading: boolean }) => {
  const navigate = useNavigate();
  const animValue = useCountUp(card.value, 1000, !loading);
  const colors = statusColors[card.status];
  const Icon = card.icon;

  return (
    <div
      className="bg-card rounded-2xl p-5 hover:shadow-medium transition-all cursor-pointer group shadow-card"
      onClick={() => navigate(card.linkTo)}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl ${colors.bg} flex items-center justify-center`}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{card.title}</span>
        </div>
        <ChevronLeft className="h-4 w-4 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-[32px] font-bold tabular-nums text-foreground leading-none mb-3" style={{ letterSpacing: '0.02em', fontFeatureSettings: '"tnum" 1' }}>
        <span className="text-base font-medium text-muted-foreground ml-1">{card.prefix}</span>
        {animValue.toLocaleString()}
      </p>
      {card.trendLabel && (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium ${colors.tag}`}>
          {card.trend === "up" && <TrendingUp className="h-3 w-3" />}
          {card.trend === "down" && <TrendingDown className="h-3 w-3" />}
          {card.trendLabel}
        </span>
      )}
    </div>
  );
};

// ─── Detailed Card ───
const DetailedKPICard = ({ card, loading }: { card: KPIData; loading: boolean }) => {
  const navigate = useNavigate();
  const animValue = useCountUp(card.value, 1200, !loading);
  const colors = statusColors[card.status];
  const Icon = card.icon;

  return (
    <div
      className={`premium-card p-4 space-y-2.5 relative overflow-hidden ${colors.border} border cursor-pointer hover:shadow-medium transition-all`}
      onClick={() => navigate(card.linkTo)}
    >
      <div className={`absolute top-3 left-3 w-2 h-2 rounded-full ${colors.indicator} animate-pulse-glow`} />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-secondary/80 flex items-center justify-center">
          <Icon className={`h-3.5 w-3.5 ${colors.text}`} />
        </div>
        <span className="text-[11px] font-bold text-foreground">{card.title}</span>
      </div>
      <p className={`text-xl font-bold tabular-nums ${colors.text}`}>
        {card.prefix}{animValue.toLocaleString()}
      </p>
      <div className="space-y-1">
        {card.subItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground">{item.label}</span>
            <span className={`text-[10px] font-semibold tabular-nums ${colors.text}`}>{item.value}</span>
          </div>
        ))}
      </div>
      <MiniSparkline data={card.sparkData} color={colors.spark} width={80} height={20} />
      <p className="text-[8px] text-muted-foreground/70 leading-relaxed line-clamp-2">
        🤖 {card.aiInsight}
      </p>
    </div>
  );
};

// ─── Main Component ───
const CustomizableKPICards = ({
  revenue, expenses, totalIncome, totalOutcome,
  receivables, payables, cashBalance, netProfit, loading,
}: CustomizableKPICardsProps) => {
  const noActivity = revenue === 0 && expenses === 0;
  const profitMargin = revenue > 0 ? Math.round(((revenue - expenses) / revenue) * 100) : 0;
  const hasReceivables = receivables > 0;
  const hasIncome = totalIncome > 0;
  const collectionRate = hasIncome && hasReceivables ? Math.round((totalIncome / (totalIncome + receivables)) * 100) : hasIncome ? 100 : 0;
  const absPayables = Math.abs(payables); // payables is negative
  const debtToCash = cashBalance > 0 ? absPayables / cashBalance : absPayables > 0 ? 999 : 0;

  const sparkData = useMemo(() => {
    const base = [30, 45, 35, 60, 50, 70, 65];
    return {
      profit: base.map((v) => v * 0.8 + Math.random() * 30),
      cash: base.map((v) => v * 1.2 + Math.random() * 25),
      collection: base.map((v) => v + Math.random() * 20),
      debt: base.map((v) => v * 0.6 + Math.random() * 15),
    };
  }, []);

  // View mode: "simple" or "detailed"
  const [viewMode, setViewMode] = useState<"simple" | "detailed">(() => {
    try { return (localStorage.getItem(VIEW_KEY) as "simple" | "detailed") || "simple"; } catch { return "simple"; }
  });

  // Card visibility
  const defaultConfig: KPIConfig[] = [
    { id: "net_profit", visible: true },
    { id: "cash", visible: true },
    { id: "receivables", visible: true },
    { id: "payables", visible: true },
  ];

  const [cardConfig, setCardConfig] = useState<KPIConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : defaultConfig;
    } catch { return defaultConfig; }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cardConfig));
  }, [cardConfig]);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, viewMode);
  }, [viewMode]);

  const toggleCard = (id: string) => {
    setCardConfig(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  };

  // Build card data
  const allCards: KPIData[] = [
    {
      id: "net_profit",
      title: "صافي الربح",
      icon: TrendingUp,
      value: netProfit,
      prefix: "₪",
      status: noActivity ? "yellow" : netProfit >= 0 ? "green" : "red",
      trendLabel: noActivity ? "لا توجد عمليات بعد" : netProfit >= 0 ? "أداء إيجابي" : "خسارة",
      trend: noActivity ? "neutral" : netProfit >= 0 ? "up" : "down",
      linkTo: "/profit-loss",
      subItems: [
        { label: "هامش الربح", value: revenue > 0 ? `${profitMargin}%` : "—" },
        { label: "مقارنة بالشهر السابق", value: noActivity ? "—" : netProfit > 0 ? "↑ تحسن" : netProfit < 0 ? "↓ تراجع" : "مستقر" },
      ],
      aiInsight: noActivity ? "لم تُسجّل إيرادات أو مصاريف بعد — ابدأ بتسجيل عملياتك" : netProfit > 0 ? `الربحية تحسنت — هامش ${profitMargin}%` : netProfit === 0 ? "لا يوجد ربح أو خسارة حالياً" : "المصاريف تتجاوز الإيرادات — حاول تقليل النفقات",
      sparkData: sparkData.profit,
    },
    {
      id: "cash",
      title: "السيولة النقدية",
      icon: Droplets,
      value: cashBalance,
      prefix: "₪",
      status: cashBalance > 0 ? "green" : cashBalance === 0 ? "yellow" : "red",
      trendLabel: cashBalance > 0 ? "تدفق مستقر" : "لا توجد حركات",
      trend: cashBalance > 0 ? "up" : "neutral",
      linkTo: "/transactions",
      subItems: [
        { label: "صافي التدفق النقدي", value: `₪${(totalIncome - totalOutcome).toLocaleString()}` },
        { label: "توقع 30 يوم", value: cashBalance > 0 ? "مستقر ✓" : "ضغط ⚠" },
      ],
      aiInsight: cashBalance > 0 ? "التدفق النقدي مستقر — السيولة كافية للفترة القادمة" : cashBalance === 0 ? "لا توجد حركات نقدية بعد" : "يوجد ضغط نقدي — راجع المصروفات القادمة",
      sparkData: sparkData.cash,
    },
    {
      id: "receivables",
      title: "المدينون (لك)",
      icon: Users,
      value: receivables,
      prefix: "₪",
      status: receivables === 0 ? "green" : receivables > cashBalance ? "red" : "yellow",
      trendLabel: receivables > 0 ? "بحاجة متابعة" : "لا ذمم",
      trend: receivables > 0 ? "down" : "neutral",
      linkTo: "/contacts?type=customer",
      subItems: [
        { label: "نسبة التحصيل", value: hasIncome || hasReceivables ? `${collectionRate}%` : "—" },
        { label: "متوسط أيام التحصيل", value: hasReceivables ? "قيد المتابعة" : "—" },
      ],
      aiInsight: !hasIncome && !hasReceivables ? "لا توجد مبيعات أو ذمم مسجلة بعد" : collectionRate >= 80 ? "نسبة التحصيل ممتازة — استمر بالمتابعة" : "هناك ذمم بحاجة متابعة",
      sparkData: sparkData.collection,
    },
    {
      id: "payables",
      title: "الدائنون (عليك)",
      icon: Landmark,
      value: payables,
      prefix: "₪",
      status: payables === 0 ? "green" : payables > cashBalance ? "red" : "yellow",
      trendLabel: payables > 0 ? "مستحقات قائمة" : "لا التزامات",
      trend: payables > 0 ? "down" : "neutral",
      linkTo: "/contacts?type=supplier",
      subItems: [
        { label: "مستحق خلال 30 يوم", value: `₪${payables.toLocaleString()}` },
        { label: "نسبة الدين للنقد", value: debtToCash < 1 ? `${Math.round(debtToCash * 100)}%` : debtToCash === 0 ? "0%" : ">100%" },
      ],
      aiInsight: payables === 0 ? "لا توجد التزامات مسجلة حالياً" : debtToCash < 1 ? `${Math.round(debtToCash * 100)}% من التزاماتك مغطاة بالنقد` : "التزاماتك تتجاوز السيولة — خطط للسداد",
      sparkData: sparkData.debt,
    },
  ];

  const visibleCards = allCards.filter(c => cardConfig.find(cfg => cfg.id === c.id)?.visible !== false);

  const cardLabels: Record<string, string> = {
    net_profit: "صافي الربح",
    cash: "السيولة النقدية",
    receivables: "المدينون (لك)",
    payables: "الدائنون (عليك)",
  };

  return (
    <div className="space-y-3">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">المؤشرات المالية</h2>
        <div className="flex items-center gap-1.5">
          {/* View toggle */}
          <button
            onClick={() => setViewMode(viewMode === "simple" ? "detailed" : "simple")}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
            title={viewMode === "simple" ? "عرض تفصيلي" : "عرض مبسط"}
          >
            {viewMode === "simple" ? (
              <BarChart3 className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
            ) : (
              <LayoutGrid className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
            )}
          </button>

          {/* Customize dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
                <Settings2 className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 rounded-xl p-2 bg-popover border-border shadow-elevated z-50">
              <p className="text-[11px] font-semibold text-muted-foreground px-2 py-1.5 mb-1">اختر المؤشرات المعروضة</p>
              {cardConfig.map((cfg) => (
                <button
                  key={cfg.id}
                  onClick={() => toggleCard(cfg.id)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-secondary/60 transition-colors text-right"
                >
                  {cfg.visible ? (
                    <Eye className="h-4 w-4 text-primary flex-shrink-0" strokeWidth={1.8} />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" strokeWidth={1.8} />
                  )}
                  <span className={cn("text-[13px] font-medium flex-1", cfg.visible ? "text-foreground" : "text-muted-foreground/50")}>
                    {cardLabels[cfg.id]}
                  </span>
                </button>
              ))}
              <div className="border-t border-border/50 mt-2 pt-2 px-2">
                <button
                  onClick={() => setCardConfig(defaultConfig)}
                  className="text-[11px] text-primary font-medium hover:underline"
                >
                  إعادة ضبط الافتراضي
                </button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Cards grid */}
      {visibleCards.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          لم يتم اختيار أي مؤشر — اضغط ⚙ لتخصيص المؤشرات
        </div>
      ) : (
        <div className={cn(
          "grid gap-4",
          viewMode === "simple"
            ? "grid-cols-2 lg:grid-cols-4"
            : "grid-cols-2"
        )}>
          {visibleCards.map((card) =>
            viewMode === "simple" ? (
              <SimpleKPICard key={card.id} card={card} loading={loading} />
            ) : (
              <DetailedKPICard key={card.id} card={card} loading={loading} />
            )
          )}
        </div>
      )}
    </div>
  );
};

export default CustomizableKPICards;
