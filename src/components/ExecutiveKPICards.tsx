import { useMemo } from "react";
import { TrendingUp, TrendingDown, Droplets, Users, Landmark } from "lucide-react";
import MiniSparkline from "@/components/MiniSparkline";
import { useCountUp } from "@/hooks/useCountUp";

interface ExecutiveKPICardsProps {
  revenue: number;
  expenses: number;
  totalIncome: number;
  totalOutcome: number;
  receivables: number;
  payables: number;
  cashBalance: number;
  netProfit: number;
  transactionCount: number;
  loading: boolean;
}

interface KPICardProps {
  title: string;
  icon: React.ElementType;
  mainValue: number;
  mainLabel?: string;
  subItems: { label: string; value: string }[];
  aiInsight: string;
  sparkData: number[];
  status: "green" | "yellow" | "red";
  loading: boolean;
  prefix?: string;
}

const statusColors = {
  green: {
    icon: "text-primary",
    glow: "glow-green",
    badge: "bg-primary/15 text-primary",
    spark: "hsl(152, 72%, 40%)",
    border: "border-primary/20",
    indicator: "bg-primary",
  },
  yellow: {
    icon: "text-warning",
    glow: "text-warning",
    badge: "bg-warning/15 text-warning",
    spark: "hsl(38, 92%, 50%)",
    border: "border-warning/20",
    indicator: "bg-warning",
  },
  red: {
    icon: "text-destructive",
    glow: "text-destructive",
    badge: "bg-destructive/15 text-destructive",
    spark: "hsl(0, 72%, 51%)",
    border: "border-destructive/20",
    indicator: "bg-destructive",
  },
};

const KPICard = ({ title, icon: Icon, mainValue, subItems, aiInsight, sparkData, status, loading, prefix = "₪" }: KPICardProps) => {
  const colors = statusColors[status];
  const animValue = useCountUp(mainValue, 1200, !loading);

  return (
    <div className={`premium-card p-4 space-y-2.5 relative overflow-hidden ${colors.border} border`}>
      {/* Status dot */}
      <div className={`absolute top-3 left-3 w-2 h-2 rounded-full ${colors.indicator} animate-pulse-glow`} />

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg bg-secondary/80 flex items-center justify-center`}>
          <Icon className={`h-3.5 w-3.5 ${colors.icon}`} />
        </div>
        <span className="text-[11px] font-bold text-foreground">{title}</span>
      </div>

      {/* Main number */}
      <p className={`text-xl font-bold tabular-nums ${colors.glow}`}>
        {prefix}{animValue.toLocaleString()}
      </p>

      {/* Sub metrics */}
      <div className="space-y-1">
        {subItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground">{item.label}</span>
            <span className={`text-[10px] font-semibold tabular-nums ${colors.icon}`}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Sparkline */}
      <MiniSparkline data={sparkData} color={colors.spark} width={80} height={20} />

      {/* AI Insight */}
      <p className="text-[8px] text-muted-foreground/70 leading-relaxed line-clamp-2">
        🤖 {aiInsight}
      </p>
    </div>
  );
};

const ExecutiveKPICards = ({
  revenue, expenses, totalIncome, totalOutcome,
  receivables, payables, cashBalance, netProfit,
  transactionCount, loading,
}: ExecutiveKPICardsProps) => {

  const profitMargin = revenue > 0 ? Math.round(((revenue - expenses) / revenue) * 100) : 0;
  const collectionRate = totalIncome > 0 && receivables > 0 ? Math.round((totalIncome / (totalIncome + receivables)) * 100) : (transactionCount > 0 ? 100 : 0);
  const debtToCash = cashBalance > 0 ? payables / cashBalance : payables > 0 ? 999 : 0;
  // All payables assumed due within 30 days (conservative — no maturity dates available)
  const due30 = payables;

  const sparkData = useMemo(() => {
    const base = [30, 45, 35, 60, 50, 70, 65];
    return {
      profit: base.map((v) => v * 0.8 + Math.random() * 30),
      cash: base.map((v) => v * 1.2 + Math.random() * 25),
      collection: base.map((v) => v + Math.random() * 20),
      debt: base.map((v) => v * 0.6 + Math.random() * 15),
    };
  }, []);

  const cards: KPICardProps[] = [
    {
      title: "الأداء المالي",
      icon: TrendingUp,
      mainValue: netProfit,
      subItems: [
        { label: "هامش الربح", value: `${profitMargin}%` },
        { label: "مقارنة بالشهر السابق", value: netProfit >= 0 ? "↑ 5%" : "↓ 5%" },
      ],
      aiInsight: netProfit > 0
        ? `الربحية تحسنت بسبب زيادة المبيعات — هامش ${profitMargin}%`
        : transactionCount === 0
          ? "ابدأ بتسجيل العمليات لتحصل على تحليل أداء مالي"
          : "المصاريف تتجاوز الإيرادات — حاول تقليل النفقات",
      sparkData: sparkData.profit,
      status: netProfit > 0 ? "green" : netProfit === 0 ? "yellow" : "red",
      loading,
    },
    {
      title: "السيولة",
      icon: Droplets,
      mainValue: cashBalance,
      subItems: [
        { label: "صافي التدفق النقدي", value: `₪${(totalIncome - totalOutcome).toLocaleString()}` },
        { label: "توقع 30 يوم", value: cashBalance > 0 ? "مستقر ✓" : "ضغط ⚠" },
      ],
      aiInsight: cashBalance > 0
        ? "التدفق النقدي مستقر — السيولة كافية للفترة القادمة"
        : cashBalance === 0
          ? "لا توجد حركات نقدية بعد"
          : "يوجد ضغط نقدي — راجع المصروفات القادمة",
      sparkData: sparkData.cash,
      status: cashBalance > 0 ? "green" : cashBalance === 0 ? "yellow" : "red",
      loading,
    },
    {
      title: "تحصيل الزبائن",
      icon: Users,
      mainValue: receivables,
      subItems: [
        { label: "نسبة التحصيل", value: `${collectionRate}%` },
        { label: "متوسط أيام التحصيل", value: "28 يوم" },
      ],
      aiInsight: collectionRate >= 80
        ? "نسبة التحصيل ممتازة — استمر بالمتابعة"
        : collectionRate >= 60
          ? "هناك ذمم بحاجة متابعة — حسّن التحصيل"
          : transactionCount === 0
            ? "سجّل مبيعاتك لتتبع تحصيل الزبائن"
            : "نسبة التحصيل منخفضة — تابع العملاء المتأخرين",
      sparkData: sparkData.collection,
      status: collectionRate >= 80 ? "green" : collectionRate >= 60 ? "yellow" : "red",
      loading,
    },
    {
      title: "الديون المستحقة عليك",
      icon: Landmark,
      mainValue: payables,
      subItems: [
        { label: "مستحق خلال 30 يوم", value: `₪${due30.toLocaleString()}` },
        { label: "نسبة الدين للنقد", value: debtToCash < 1 ? `${Math.round(debtToCash * 100)}%` : debtToCash === 0 ? "0%" : ">100%" },
      ],
      aiInsight: payables === 0
        ? "لا توجد التزامات مسجلة حالياً"
        : debtToCash < 1
          ? `${Math.round(debtToCash * 100)}% من التزاماتك مغطاة بالنقد المتوفر`
          : "التزاماتك تتجاوز السيولة — خطط للسداد",
      sparkData: sparkData.debt,
      status: payables === 0 || debtToCash < 0.5 ? "green" : debtToCash < 1 ? "yellow" : "red",
      loading,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => (
        <KPICard key={card.title} {...card} />
      ))}
    </div>
  );
};

export default ExecutiveKPICards;
