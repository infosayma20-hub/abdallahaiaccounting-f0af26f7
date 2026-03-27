import { useState } from "react";
import type { FinixFinancialData } from "@/pages/SmartAccountantPage";
import MiniSparkline from "@/components/MiniSparkline";

interface Props {
  data: FinixFinancialData;
  cfoMode: boolean;
}

const fmt = (n: number) => `₪${Math.abs(n).toLocaleString()}`;

const FinixRightPanel = ({ data, cfoMode }: Props) => {
  const [contactTab, setContactTab] = useState<'clients' | 'suppliers'>('clients');

  const metrics = [
    { icon: "💰", label: "الصندوق الحالي", value: data.cash, color: "#00B4D8", trend: "+12% عن أمس" },
    { icon: "🏦", label: "رصيد البنك", value: data.bank, color: "#0A2342", trend: "مستقر" },
    { icon: "📈", label: "مبيعات اليوم", value: data.salesToday, color: "#16A34A", trend: data.salesToday > 0 ? "نشط" : "لا مبيعات" },
    { icon: "💳", label: "ذمم مستحقة اليوم", value: data.receivables, color: "#DC2626", trend: data.receivables > 0 ? "متابعة" : "لا ذمم" },
    { icon: "📦", label: "قيمة المخزون", value: data.inventoryValue, color: "#4A9EE8", trend: "محدّث" },
  ];

  const predictions = [
    {
      icon: "🔴",
      text: data.cash + data.bank > 0
        ? `سيولتك الحالية ${fmt(data.cash + data.bank)} — آمنة حالياً`
        : "⚠️ سيولتك سالبة — راجع مصروفاتك",
      confidence: 87,
      timeline: "خلال 18 يوم",
    },
    {
      icon: "💰",
      text: `إيراداتك المتوقعة الشهر القادم: ${fmt(data.totalSales * 0.9)}-${fmt(data.totalSales * 1.1)}`,
      confidence: 74,
      timeline: "الشهر القادم",
    },
  ];

  // Mock sparkline data
  const sparkData = [40, 55, 45, 60, 75, 65, 80, 70];

  return (
    <div className="p-4 space-y-5">
      {/* Section A: Real-time metrics */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-bold" style={{ color: "#0A2342" }}>النبض المالي الحي</h3>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#16A34A" }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#16A34A" }} />
          </span>
        </div>
        <div className="space-y-2">
          {metrics.map(m => (
            <div
              key={m.label}
              className="rounded-xl p-3"
              style={{ background: "#F8FAFC", borderRight: `3px solid ${m.color}` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{m.icon}</span>
                  <span className="text-[11px] text-gray-500">{m.label}</span>
                </div>
                <span className="text-[10px]" style={{ color: m.value >= 0 ? "#16A34A" : "#DC2626" }}>
                  {m.trend}
                </span>
              </div>
              <p className="text-lg font-bold mt-1" style={{
                fontFamily: "JetBrains Mono, monospace",
                color: m.value >= 0 ? "#0A2342" : "#DC2626",
              }}>
                {m.value < 0 ? "-" : ""}{fmt(m.value)}
              </p>
              <div className="mt-1 h-8">
                <MiniSparkline data={sparkData} color={m.color} height={32} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section B: Predictions */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs font-bold" style={{ color: "#0A2342" }}>🔮 التنبؤ المالي</h3>
          <span className="text-[10px] text-gray-400">بناءً على أنماطك</span>
        </div>
        <div className="space-y-2">
          {predictions.map((p, i) => (
            <div
              key={i}
              className="rounded-xl p-3"
              style={{ background: "linear-gradient(135deg, #F0F9FF, #E0F2FE)", border: "1px solid #BAE6FD" }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">{p.icon}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#00B4D820", color: "#006D8F" }}>
                  دقة {p.confidence}%
                </span>
              </div>
              <p className="text-[12px]" style={{ color: "#0A2342" }}>{p.text}</p>
              <p className="text-[10px] text-gray-400 mt-1">{p.timeline}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Section C: Recent actions */}
      <div>
        <h3 className="text-xs font-bold mb-2" style={{ color: "#0A2342" }}>آخر إجراءات المحاسب الذكي</h3>
        <div className="space-y-1.5">
          {data.transactionCount > 0 ? (
            <>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-[10px] text-gray-400 flex-shrink-0">الآن</span>
                <span style={{ color: "#0A2342" }}>📊 {data.transactionCount} عملية مسجلة</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-[10px] text-gray-400 flex-shrink-0">اليوم</span>
                <span style={{ color: "#0A2342" }}>💰 مبيعات اليوم: {fmt(data.salesToday)}</span>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-gray-400">لا توجد عمليات بعد</p>
          )}
        </div>
      </div>

      {/* Section D: CFO Mode */}
      {cfoMode && (
        <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #0A2342, #071829)" }}>
          <p className="text-xs font-bold mb-3" style={{ color: "#4A9EE8" }}>👔 وضع المدير المالي</p>
          <p className="text-[11px] mb-3" style={{ color: "#4A9EE8" }}>📋 ملخص اليوم</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "الإيرادات", value: data.totalSales, color: "#16A34A" },
              { label: "المصروفات", value: data.totalExpenses, color: "#DC2626" },
              { label: "صافي الربح", value: data.netProfit, color: data.netProfit >= 0 ? "#16A34A" : "#DC2626" },
              { label: "التدفق النقدي", value: data.cash + data.bank, color: "#00B4D8" },
            ].map(m => (
              <div key={m.label}>
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>{m.label}</p>
                <p className="text-sm font-bold" style={{ color: m.color, fontFamily: "JetBrains Mono, monospace" }}>{fmt(m.value)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 p-2.5 rounded-lg" style={{ border: "1px solid #4A9EE830" }}>
            <p className="text-[10px]" style={{ color: "#4A9EE8" }}>
              💡 {data.netProfit > 0 ? "أداء إيجابي — ركّز على التحصيل" : "راجع المصروفات لتحسين الربحية"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinixRightPanel;
