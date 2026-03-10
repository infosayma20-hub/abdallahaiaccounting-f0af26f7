import { useEffect, useState } from "react";
import type { ZidniFinancialData } from "@/pages/SmartAccountantPage";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  data: ZidniFinancialData;
}

const fmt = (n: number) => `₪${Math.abs(n).toLocaleString()}`;

const MobileRadarSheet = ({ open, onClose, data }: Props) => {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    if (!open) { setAnimatedScore(0); return; }
    const target = data.healthScore;
    let current = 0;
    const step = target / 40;
    const id = setInterval(() => {
      current += step;
      if (current >= target) { current = target; clearInterval(id); }
      setAnimatedScore(Math.round(current));
    }, 30);
    return () => clearInterval(id);
  }, [open, data.healthScore]);

  if (!open) return null;

  const score = data.healthScore;
  const scoreLabel = score >= 70 ? "صحي" : score >= 45 ? "متوسط" : "خطر";
  const scoreColor = score >= 70 ? "hsl(var(--success))" : score >= 45 ? "hsl(var(--warning))" : "hsl(var(--destructive))";

  // SVG arc for score
  const radius = 120;
  const circumference = Math.PI * radius; // half circle
  const scoreArc = (animatedScore / 100) * circumference;

  const spokes = [
    { label: "نسبة التداول", value: Math.min(100, Math.round(((data.cash + data.bank) / Math.max(data.payables, 1)) * 50)), color: "hsl(var(--accent))" },
    { label: "هامش الربح", value: data.totalSales > 0 ? Math.round((data.netProfit / data.totalSales) * 100) : 0, color: "hsl(var(--success))" },
    { label: "كفاءة التحصيل", value: data.totalSales > 0 ? Math.max(0, 100 - Math.round((data.receivables / data.totalSales) * 100)) : 100, color: "hsl(var(--finix-gold))" },
    { label: "تغطية النقدية", value: data.totalExpenses > 0 ? Math.min(100, Math.round(((data.cash + data.bank) / (data.totalExpenses / 12)) * 100)) : 100, color: "hsl(var(--warning))" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-[200]" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[201] bg-white rounded-t-[20px] max-h-[90vh] overflow-y-auto"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-lg font-bold" style={{ color: "hsl(var(--foreground))", fontFamily: "Tajawal, sans-serif" }}>
            البوصلة المالية 🎯
          </h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-muted">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Score Gauge */}
        <div className="flex flex-col items-center py-4">
          <svg width="280" height="160" viewBox="0 0 280 160">
            {/* Background arc */}
            <path
              d="M 20 140 A 120 120 0 0 1 260 140"
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="16"
              strokeLinecap="round"
            />
            {/* Score arc */}
            <path
              d="M 20 140 A 120 120 0 0 1 260 140"
              fill="none"
              stroke={scoreColor}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={`${scoreArc} ${circumference}`}
              style={{ transition: "stroke-dasharray 1.2s ease-out" }}
            />
          </svg>
          <div className="text-center -mt-24">
            <span className="text-[52px] font-extrabold" style={{ fontFamily: "JetBrains Mono, monospace", color: "hsl(var(--foreground))" }}>
              {animatedScore}
            </span>
            <span className="text-base text-muted-foreground">/100</span>
            <p className="text-base font-bold mt-1" style={{ color: scoreColor }}>{scoreLabel}</p>
          </div>
        </div>

        {/* Breakdown cards */}
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          {spokes.map(s => (
            <div key={s.label} className="rounded-xl p-3.5 bg-muted/50">
              <p className="text-[11px] text-muted-foreground mb-2">{s.label}</p>
              <p className="text-xl font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: s.color }}>
                {s.value}%
              </p>
              <div className="h-1.5 rounded-full bg-border mt-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${Math.max(5, s.value)}%`, background: s.color }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* AI explanation */}
        <div className="mx-5 mb-4 rounded-xl p-4" style={{ background: "hsl(var(--info) / 0.06)" }}>
          <p className="text-[13px] font-bold mb-2" style={{ color: "hsl(var(--foreground))" }}>🤖 تحليل المحاسب الذكي:</p>
          <p className="text-xs text-muted-foreground leading-[1.8]">
            {score >= 70
              ? `وضعك المالي صحي. صافي الربح ${fmt(data.netProfit)} والسيولة ${fmt(data.cash + data.bank)}. استمر في المتابعة.`
              : score >= 45
                ? `وضعك المالي متوسط. الذمم المستحقة ${fmt(data.receivables)} تحتاج متابعة. ركز على التحصيل.`
                : `وضعك المالي يحتاج اهتمام عاجل. السيولة ${fmt(data.cash + data.bank)} والذمم ${fmt(data.receivables)}.`}
          </p>
        </div>

        {/* Improvement tips */}
        <div className="px-5 pb-8">
          <p className="text-sm font-bold mb-3" style={{ color: "hsl(var(--foreground))" }}>كيف تحسن درجتك؟</p>
          <div className="space-y-2">
            {[
              data.receivables > 0 ? `تابع تحصيل الذمم (${fmt(data.receivables)})` : "حافظ على مستوى الذمم",
              data.cash + data.bank < data.totalExpenses / 4 ? "زد السيولة النقدية لتغطية 3 أشهر مصاريف" : "سيولتك جيدة — استثمر الفائض",
              data.totalExpenses > data.totalSales * 0.8 ? "قلل المصروفات لزيادة هامش الربح" : "هامش الربح جيد — وسّع المبيعات",
            ].map((tip, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground leading-[1.7]">
                <span className="text-accent mt-0.5">•</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default MobileRadarSheet;
