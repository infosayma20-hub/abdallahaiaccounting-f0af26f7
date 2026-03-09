import { useState } from "react";
import { ArrowRight, Bell, MoreVertical } from "lucide-react";

interface Props {
  healthScore: number;
  hasAnomalies: boolean;
  cfoMode: boolean;
  onToggleCfo: () => void;
  onBack: () => void;
  onShowFinancial: () => void;
  onShowNotifications: () => void;
}

const CleanTopBar = ({ healthScore, hasAnomalies, cfoMode, onToggleCfo, onBack, onShowFinancial, onShowNotifications }: Props) => {
  const [showMenu, setShowMenu] = useState(false);

  const scoreLabel = healthScore >= 70 ? "صحي" : healthScore >= 45 ? "متوسط" : "خطر";
  const scoreBg = healthScore >= 70 ? "#DCFCE7" : healthScore >= 45 ? "#FEF3C7" : "#FEE2E2";
  const scoreColor = healthScore >= 70 ? "#16A34A" : healthScore >= 45 ? "#D97706" : "#DC2626";

  return (
    <div
      className="h-[52px] flex items-center justify-between px-4 flex-shrink-0 relative z-[100]"
      style={{
        background: "white",
        borderBottom: "1px solid #F1F5F9",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Left: logo + title */}
      <div className="flex items-center gap-2.5">
        <button onClick={onBack} className="w-11 h-11 flex items-center justify-center -mr-2" aria-label="رجوع">
          <ArrowRight className="h-5 w-5" style={{ color: "#8B9BB4" }} />
        </button>
        <span className="text-[15px] font-bold" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>
          المحاسب الذكي
        </span>
      </div>

      {/* Right: bell + health pill + more */}
      <div className="flex items-center gap-1.5">
        {/* Notifications bell */}
        <button
          onClick={onShowNotifications}
          className="w-11 h-11 flex items-center justify-center relative"
          aria-label="تنبيهات"
        >
          <Bell className="h-5 w-5" style={{ color: "#8B9BB4" }} />
          {hasAnomalies && (
            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full" style={{ background: "#DC2626" }} />
          )}
        </button>

        {/* Health score pill */}
        <button
          onClick={onShowFinancial}
          className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold"
          style={{ background: scoreBg, color: scoreColor }}
        >
          {scoreLabel} {healthScore}
        </button>

        {/* More menu */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-11 h-11 flex items-center justify-center"
            aria-label="المزيد"
          >
            <MoreVertical className="h-5 w-5" style={{ color: "#8B9BB4" }} />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-[150]" onClick={() => setShowMenu(false)} />
              <div
                className="absolute left-0 top-12 w-[220px] z-[151] rounded-[14px] p-1.5 shadow-[0_8px_24px_rgba(10,35,66,0.12)]"
                style={{ background: "white" }}
              >
                {[
                  { icon: "👔", label: "وضع المدير المالي", action: () => { onToggleCfo(); setShowMenu(false); }, active: cfoMode },
                  { icon: "🔮", label: "التنبؤ المالي", action: () => setShowMenu(false) },
                  { icon: "📜", label: "سجل المحادثات", action: () => setShowMenu(false) },
                  { icon: "⚙️", label: "الإعدادات", action: () => setShowMenu(false) },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={item.action}
                    className="w-full flex items-center gap-3 h-12 px-3.5 rounded-lg text-sm transition-colors hover:bg-[#F8FAFC]"
                    style={{ fontFamily: "Tajawal, sans-serif", color: "#0A2342" }}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {item.active && <span className="mr-auto text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#C9A84C20", color: "#C9A84C" }}>مفعّل</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CleanTopBar;
