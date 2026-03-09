import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ZidniFinancialData } from "@/pages/SmartAccountantPage";

interface Props {
  open: boolean;
  onClose: () => void;
  data: ZidniFinancialData;
}

const fmt = (n: number) => `₪${Math.abs(n).toLocaleString()}`;

const FinancialSummarySheet = ({ open, onClose, data }: Props) => {
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
  const scoreLabel = score >= 70 ? "صحي ✓" : score >= 45 ? "متوسط" : "خطر";
  const scoreColor = score >= 70 ? "#16A34A" : score >= 45 ? "#D97706" : "#DC2626";
  const scoreBg = score >= 70 ? "#DCFCE7" : score >= 45 ? "#FEF3C7" : "#FEE2E2";

  const kpis = [
    { icon: "💰", label: "الصندوق", value: data.cash, trend: "+12% عن أمس" },
    { icon: "🏦", label: "البنك", value: data.bank, trend: "مستقر" },
    { icon: "📈", label: "مبيعات اليوم", value: data.salesToday, trend: data.salesToday > 0 ? "نشط" : "—" },
    { icon: "💳", label: "الذمم", value: data.receivables, trend: data.receivables > 0 ? "متابعة" : "—" },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[200]" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[201] bg-white rounded-t-[20px] overflow-y-auto"
        style={{ maxHeight: "70vh", paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full" style={{ background: "#E2E8F0" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>وضعك المالي</h2>
            <p className="text-[11px]" style={{ color: "#8B9BB4" }}>آخر تحديث: منذ دقيقتين</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full" style={{ background: "#F1F5F9" }}>
            <X className="h-4 w-4" style={{ color: "#8B9BB4" }} />
          </button>
        </div>

        {/* Health bar — simple horizontal */}
        <div className="px-5 pb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-bold" style={{ color: "#0A2342" }}>الصحة المالية</span>
            <span className="text-sm font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: scoreColor }}>
              {animatedScore}/100 — {scoreLabel}
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: "#F1F5F9" }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${animatedScore}%`, background: scoreColor }}
            />
          </div>
        </div>

        {/* 4 KPI cards */}
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          {kpis.map(k => (
            <div key={k.label} className="rounded-xl p-3.5" style={{ background: "#F8FAFC" }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-lg">{k.icon}</span>
                <span className="text-[11px]" style={{ color: "#8B9BB4" }}>{k.label}</span>
              </div>
              <p className="text-[22px] font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: "#0A2342" }}>
                {fmt(k.value)}
              </p>
              <p className="text-[11px] mt-1" style={{ color: k.value > 0 ? "#16A34A" : "#8B9BB4" }}>
                {k.trend}
              </p>
            </div>
          ))}
        </div>

        {/* AI comment */}
        <div className="mx-5 mb-5 rounded-xl p-3.5" style={{ background: "#F0F9FF" }}>
          <p className="text-[13px] leading-[1.8]" style={{ color: "#0369A1", fontFamily: "Tajawal, sans-serif" }}>
            🤖 {score >= 70
              ? "وضعك المالي جيد — الذمم بحاجة متابعة"
              : score >= 45
                ? `الذمم المستحقة ${fmt(data.receivables)} تحتاج تحصيل عاجل`
                : `السيولة ${fmt(data.cash + data.bank)} منخفضة — راجع المصروفات`
            }
          </p>
        </div>

        {/* Close button */}
        <div className="px-5 pb-4">
          <button
            onClick={onClose}
            className="w-full h-12 rounded-xl text-sm font-bold transition-colors"
            style={{ background: "transparent", border: "1px solid #E2E8F0", color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </>
  );
};

export default FinancialSummarySheet;
