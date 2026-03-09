import type { ZidniFinancialData } from "@/pages/SmartAccountantPage";

interface Props {
  data: HaseebFinancialData;
}

const fmt = (n: number) => {
  if (Math.abs(n) >= 1000) return `₪${(n / 1000).toFixed(1)}K`;
  return `₪${n.toLocaleString()}`;
};

const MobileKPIStrip = ({ data }: Props) => {
  const pills = [
    { icon: "💰", label: "الصندوق", value: data.cash, trend: data.cash > 0 ? "↑" : "↓", trendPositive: data.cash > 0 },
    { icon: "🏦", label: "البنك", value: data.bank, trend: "→", trendPositive: true },
    { icon: "📈", label: "اليوم", value: data.salesToday, trend: data.salesToday > 0 ? "↑" : "→", trendPositive: data.salesToday > 0 },
    { icon: "💳", label: "ذمم", value: data.receivables, trend: data.receivables > 0 ? "⚠️" : "✓", trendPositive: data.receivables === 0 },
    { icon: "📦", label: "مخزون", value: data.inventoryValue, trend: "", trendPositive: true },
  ];

  return (
    <div className="haseeb-kpi-strip">
      {pills.map((p, i) => (
        <div
          key={p.label}
          className="haseeb-kpi-pill"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <span className="text-base">{p.icon}</span>
          <div className="flex flex-col">
            <span className="text-[10px] text-white/50" style={{ fontFamily: "Tajawal, sans-serif" }}>{p.label}</span>
            <span className="text-sm font-semibold text-white" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {fmt(p.value)}
            </span>
          </div>
          {p.trend && (
            <span className={`text-[10px] ${p.trendPositive ? 'text-green-400' : 'text-red-400'}`}>
              {p.trend}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default MobileKPIStrip;
