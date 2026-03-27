import { useMemo } from "react";
import type { FinixFinancialData } from "@/pages/SmartAccountantPage";

interface Props {
  data: FinixFinancialData;
  cfoMode: boolean;
}

const fmt = (n: number) => `₪${Math.abs(n).toLocaleString()}`;

const FinixLeftPanel = ({ data, cfoMode }: Props) => {
  const score = data.healthScore;
  const scoreLabel = score >= 70 ? "صحي" : score >= 45 ? "متوسط" : "خطر";
  const scoreColor = score >= 70 ? "#16A34A" : score >= 45 ? "#D97706" : "#DC2626";

  // SVG gauge angles
  const needleAngle = -90 + (score / 100) * 180;

  const spokes = [
    { label: "نسبة التداول", value: Math.min(100, Math.round(((data.cash + data.bank) / Math.max(data.payables, 1)) * 50)), color: "#00B4D8" },
    { label: "هامش الربح", value: data.totalSales > 0 ? Math.round((data.netProfit / data.totalSales) * 100) : 0, color: "#16A34A" },
    { label: "كفاءة التحصيل", value: data.totalSales > 0 ? Math.max(0, 100 - Math.round((data.receivables / data.totalSales) * 100)) : 100, color: "#4A9EE8" },
    { label: "تغطية النقدية", value: data.totalExpenses > 0 ? Math.min(100, Math.round(((data.cash + data.bank) / (data.totalExpenses / 12)) * 100)) : 100, color: "#D97706" },
  ];

  const quickStats = [
    { icon: "📊", label: "صافي الربح", value: data.netProfit, trend: data.netProfit > 0 },
    { icon: "💧", label: "السيولة", value: data.cash + data.bank, trend: (data.cash + data.bank) > 0 },
    { icon: "📋", label: "الذمم", value: data.receivables, trend: false },
    { icon: "🛒", label: "المشتريات", value: data.totalExpenses, trend: false },
  ];

  return (
    <div className="p-4 space-y-5" style={{ minHeight: '100%' }}>
      {/* Section A: Financial Radar */}
      <div>
        <h3 className="text-xs font-bold mb-3" style={{ color: "#4A9EE8", letterSpacing: 1 }}>البوصلة المالية</h3>
        <div className="flex justify-center">
          <svg width="180" height="120" viewBox="0 0 180 120">
            {/* Gauge arcs */}
            <path d="M 20 100 A 70 70 0 0 1 56 36" fill="none" stroke="#DC2626" strokeWidth="6" strokeLinecap="round" opacity="0.8" />
            <path d="M 56 36 A 70 70 0 0 1 124 36" fill="none" stroke="#D97706" strokeWidth="6" strokeLinecap="round" opacity="0.8" />
            <path d="M 124 36 A 70 70 0 0 1 160 100" fill="none" stroke="#16A34A" strokeWidth="6" strokeLinecap="round" opacity="0.8" />
            {/* Needle */}
            <line
              x1="90" y1="100"
              x2={90 + 55 * Math.cos((needleAngle * Math.PI) / 180)}
              y2={100 + 55 * Math.sin((needleAngle * Math.PI) / 180)}
              stroke="#4A9EE8" strokeWidth="2.5" strokeLinecap="round"
              style={{ transition: 'all 1.5s ease-out' }}
            />
            <circle cx="90" cy="100" r="4" fill="#4A9EE8" />
          </svg>
        </div>
        <div className="text-center -mt-2">
          <span className="text-3xl font-bold text-white" style={{ fontFamily: "JetBrains Mono, monospace" }}>{score}</span>
          <span className="text-sm text-gray-400">/100</span>
          <p className="text-xs font-bold mt-0.5" style={{ color: scoreColor }}>{scoreLabel}</p>
        </div>
        {/* Spokes */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          {spokes.map(s => (
            <div key={s.label} className="text-center">
              <p className="text-[10px] text-gray-500 mb-1">{s.label}</p>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.max(5, s.value)}%`, background: s.color }} />
              </div>
              <p className="text-[10px] font-bold mt-0.5" style={{ color: s.color, fontFamily: "JetBrains Mono, monospace" }}>{s.value}%</p>
            </div>
          ))}
        </div>
      </div>

      {/* Section B: Anomaly Alerts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold" style={{ color: "#4A9EE8" }}>تنبيهات حارس الحسابات 🚨</h3>
        </div>
        {data.receivables > data.totalSales * 0.5 ? (
          <div className="rounded-lg p-2.5 mb-1.5" style={{ background: "rgba(220,38,38,0.08)", borderRight: "3px solid #DC2626" }}>
            <p className="text-[11px] font-bold text-white">⚠️ ذمم مرتفعة</p>
            <p className="text-[10px] text-gray-400 mt-0.5">الذمم المدينة تتجاوز 50% من المبيعات</p>
          </div>
        ) : data.cash + data.bank < 0 ? (
          <div className="rounded-lg p-2.5 mb-1.5" style={{ background: "rgba(220,38,38,0.08)", borderRight: "3px solid #DC2626" }}>
            <p className="text-[11px] font-bold text-white">🔴 سيولة سالبة</p>
            <p className="text-[10px] text-gray-400 mt-0.5">رصيدك النقدي والبنكي سالب</p>
          </div>
        ) : (
          <p className="text-[11px]" style={{ color: "#16A34A" }}>✅ لا توجد تنبيهات — كل شيء سليم</p>
        )}
      </div>

      {/* Section C: Quick Stats */}
      <div>
        <h3 className="text-xs font-bold mb-2" style={{ color: "#4A9EE8" }}>إحصائيات سريعة</h3>
        <div className="grid grid-cols-2 gap-2">
          {quickStats.map(s => (
            <div key={s.label} className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
              <span className="text-lg">{s.icon}</span>
              <p className="text-base font-bold text-white mt-1" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {fmt(s.value)}
              </p>
              <p className="text-[10px] text-gray-500">{s.label}</p>
              <span className="text-[10px]" style={{ color: s.trend ? "#16A34A" : "#DC2626" }}>
                {s.trend ? "↑" : "↓"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CFO Section */}
      {cfoMode && (
        <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #0A2342, #071829)" }}>
          <p className="text-xs font-bold mb-3" style={{ color: "#4A9EE8" }}>👔 ملخص المدير المالي</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "الإيرادات", value: data.totalSales, color: "#16A34A" },
              { label: "المصروفات", value: data.totalExpenses, color: "#DC2626" },
              { label: "صافي الربح", value: data.netProfit, color: data.netProfit >= 0 ? "#16A34A" : "#DC2626" },
              { label: "التدفق النقدي", value: data.cash + data.bank, color: "#00B4D8" },
            ].map(m => (
              <div key={m.label}>
                <p className="text-[10px] text-gray-400">{m.label}</p>
                <p className="text-sm font-bold" style={{ color: m.color, fontFamily: "JetBrains Mono, monospace" }}>{fmt(m.value)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg p-2.5" style={{ border: "1px solid #4A9EE830" }}>
            <p className="text-[10px]" style={{ color: "#4A9EE8" }}>
              💡 {data.receivables > 0 ? `لديك ذمم مستحقة بقيمة ${fmt(data.receivables)} — تابع التحصيل` : "أداء مالي ممتاز — استمر!"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinixLeftPanel;
