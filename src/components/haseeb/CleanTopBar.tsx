import { useState } from "react";
import { ArrowRight, Bell, MoreVertical, Clock, RefreshCw, HelpCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface Props {
  healthScore: number;
  hasAnomalies: boolean;
  cfoMode: boolean;
  onToggleCfo: () => void;
  onBack: () => void;
  onShowFinancial: () => void;
  onShowNotifications: () => void;
  onToggleHistory?: () => void;
  onRefreshData?: () => void;
  onShowHelp?: () => void;
  onReplayOnboarding?: () => void;
  todayConversationCount?: number;
  refreshing?: boolean;
}

const CleanTopBar = ({
  healthScore, hasAnomalies, cfoMode, onToggleCfo, onBack,
  onShowFinancial, onShowNotifications, onToggleHistory, onRefreshData,
  onShowHelp, onReplayOnboarding,
  todayConversationCount = 0, refreshing = false,
}: Props) => {
  const [showMenu, setShowMenu] = useState(false);

  const scoreLabel = healthScore >= 70 ? "صحي" : healthScore >= 45 ? "متوسط" : "خطر";
  const scoreBg = healthScore >= 70 ? "#DCFCE7" : healthScore >= 45 ? "#FEF3C7" : "#FEE2E2";
  const scoreColor = healthScore >= 70 ? "#16A34A" : healthScore >= 45 ? "#D97706" : "#DC2626";

  return (
    <div
      className="h-[48px] flex items-center justify-between px-3 flex-shrink-0 relative z-[100]"
      style={{
        background: "white",
        borderBottom: "1px solid #F1F5F9",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Left: back + title */}
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted/60 transition-colors" aria-label="رجوع">
              <ArrowRight className="h-4 w-4" style={{ color: "#8B9BB4" }} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>رجوع</p></TooltipContent>
        </Tooltip>
        <span className="text-[13px] font-bold" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>
          المحاسب الذكي
        </span>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-0.5">
        {/* Help */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onShowHelp} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted/60 transition-colors" aria-label="مساعدة">
              <HelpCircle className="h-4 w-4" style={{ color: "#4A9EE8" }} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>دليل الأوامر</p></TooltipContent>
        </Tooltip>

        {/* History */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onToggleHistory} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted/60 transition-colors relative" aria-label="سجل المحادثات">
              <Clock className="h-4 w-4" style={{ color: "#8B9BB4" }} />
              {todayConversationCount > 0 && (
                <span
                  className="absolute -top-0.5 -left-0.5 min-w-[14px] h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center px-0.5"
                  style={{ background: "#0A2342", color: "white" }}
                >
                  {todayConversationCount}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>سجل المحادثات</p></TooltipContent>
        </Tooltip>

        {/* Refresh */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onRefreshData} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted/60 transition-colors" aria-label="تحديث البيانات">
              <RefreshCw className={`h-3.5 w-3.5 transition-transform ${refreshing ? "animate-spin" : ""}`} style={{ color: "#8B9BB4" }} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>تحديث البيانات</p></TooltipContent>
        </Tooltip>

        {/* Notifications bell */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onShowNotifications} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted/60 transition-colors relative" aria-label="تنبيهات">
              <Bell className="h-4 w-4" style={{ color: "#8B9BB4" }} />
              {hasAnomalies && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: "#DC2626" }} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>الإشعارات</p></TooltipContent>
        </Tooltip>

        {/* Health score pill */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onShowFinancial}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold mx-0.5"
              style={{ background: scoreBg, color: scoreColor }}
            >
              {scoreLabel} {healthScore}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>مؤشر الصحة المالية</p></TooltipContent>
        </Tooltip>

        {/* More menu */}
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => setShowMenu(!showMenu)} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted/60 transition-colors" aria-label="المزيد">
                <MoreVertical className="h-4 w-4" style={{ color: "#8B9BB4" }} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>المزيد</p></TooltipContent>
          </Tooltip>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-[150]" onClick={() => setShowMenu(false)} />
              <div
                className="absolute left-0 top-10 w-[200px] z-[151] rounded-xl p-1 shadow-[0_8px_24px_rgba(10,35,66,0.12)]"
                style={{ background: "white" }}
              >
                {[
                  { icon: "👔", label: "وضع المدير المالي", action: () => { onToggleCfo(); setShowMenu(false); }, active: cfoMode },
                  { icon: "🔮", label: "التنبؤ المالي", action: () => setShowMenu(false) },
                  { icon: "📖", label: "إعادة عرض الدليل", action: () => { onReplayOnboarding?.(); setShowMenu(false); } },
                  { icon: "⚙️", label: "الإعدادات", action: () => setShowMenu(false) },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={item.action}
                    className="w-full flex items-center gap-2.5 h-10 px-3 rounded-lg text-[12px] transition-colors hover:bg-[#F8FAFC]"
                    style={{ fontFamily: "Tajawal, sans-serif", color: "#0A2342" }}
                  >
                    <span className="text-sm">{item.icon}</span>
                    <span>{item.label}</span>
                    {item.active && <span className="mr-auto text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "#4A9EE820", color: "#4A9EE8" }}>مفعّل</span>}
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
