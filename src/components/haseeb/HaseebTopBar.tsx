import { useState, useEffect } from "react";
import type { FinixFinancialData } from "@/pages/SmartAccountantPage";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface Props {
  data: FinixFinancialData;
  cfoMode: boolean;
  onToggleCfo: () => void;
  sessionStart: number;
  compact?: boolean;
}

const fmt = (n: number) => {
  if (Math.abs(n) >= 1000) return `₪${(n / 1000).toFixed(1)}K`;
  return `₪${n.toLocaleString()}`;
};

const FinixTopBar = ({ data, cfoMode, onToggleCfo, sessionStart, compact }: Props) => {
  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    const tick = () => {
      const diff = Math.floor((Date.now() - sessionStart) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
      const s = String(diff % 60).padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionStart]);

  const scoreColor = data.healthScore >= 70 ? "#16A34A" : data.healthScore >= 45 ? "#D97706" : "#DC2626";

  const tickerItems = [
    `💰 الصندوق: ${fmt(data.cash)}`,
    `📈 مبيعات اليوم: ${fmt(data.salesToday)}`,
    `⚠️ ذمم مستحقة: ${fmt(data.receivables)}`,
    `🏦 البنك: ${fmt(data.bank)}`,
    `📦 المخزون: ${fmt(data.inventoryValue)}`,
  ];
  const tickerText = tickerItems.join("  •  ");

  return (
    <div
      className="h-14 flex items-center justify-between px-4 flex-shrink-0 relative z-10"
      style={{
        background: "linear-gradient(135deg, #08111A, #0D1B2A)",
        borderBottom: "1px solid rgba(232,160,32,0.2)",
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-xl font-bold" style={{ color: "#E8A020", fontFamily: "Montserrat, sans-serif" }}>F</span>
        <div className="w-px h-5" style={{ background: "#E8A020" }} />
        <span className="text-sm font-bold text-white" style={{ fontFamily: "Tajawal, sans-serif" }}>
          المحاسب الذكي
        </span>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#E8A020" }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#E8A020" }} />
        </span>
      </div>

      {/* Center Ticker */}
      {!compact && (
        <div className="flex-1 mx-6 overflow-hidden relative">
          <div className="finix-ticker whitespace-nowrap" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            <span>{tickerText}&nbsp;&nbsp;•&nbsp;&nbsp;{tickerText}</span>
          </div>
        </div>
      )}

      {/* Right */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div
          className="px-3 py-1 rounded-full text-xs font-bold"
          style={{ background: `${scoreColor}20`, color: scoreColor, border: `1px solid ${scoreColor}40` }}
        >
          الصحة المالية: {data.healthScore}/100
        </div>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#E8A020" }}>
          ⏱ {elapsed}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleCfo}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={cfoMode ? {
              background: "linear-gradient(135deg, #E8A020, #F45E0C)",
                color: "#0D1B2A",
              } : {
                border: "1px solid #8A96A3",
                color: "#8A96A3",
                background: "transparent",
              }}
            >
              👔 وضع CFO
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>{cfoMode ? "إيقاف وضع المدير المالي" : "تفعيل وضع المدير المالي"}</p></TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};

export default FinixTopBar;
