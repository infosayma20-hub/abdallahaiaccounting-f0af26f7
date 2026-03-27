import { ArrowRight, Settings } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface Props {
  healthScore: number;
  onBack: () => void;
  onShowRadar: () => void;
}

const MobileTopBar = ({ healthScore, onBack, onShowRadar }: Props) => {
  return (
    <div className="finix-mobile-topbar">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onBack}
              className="w-11 h-11 flex items-center justify-center rounded-xl"
              aria-label="رجوع"
            >
              <ArrowRight className="h-5 w-5 text-white/70" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>رجوع</p></TooltipContent>
        </Tooltip>
        <span className="text-[15px] font-bold text-white" style={{ fontFamily: "Tajawal, sans-serif" }}>
          المحاسب الذكي
        </span>
        <span className="finix-breathe-dot" />
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onShowRadar}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full"
              style={{
                background: "rgba(74,158,232,0.2)",
                border: "1px solid hsl(var(--finix-gold))",
              }}
            >
              <span className="text-xs font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: "hsl(var(--finix-gold))" }}>
                {healthScore}
              </span>
              <span>💎</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>مؤشر الصحة المالية</p></TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="w-11 h-11 flex items-center justify-center" aria-label="إعدادات">
              <Settings className="h-5 w-5 text-white/50" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>الإعدادات</p></TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};

export default MobileTopBar;
