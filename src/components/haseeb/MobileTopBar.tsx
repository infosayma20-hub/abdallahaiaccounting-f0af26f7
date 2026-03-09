import { ArrowRight, Settings } from "lucide-react";

interface Props {
  healthScore: number;
  onBack: () => void;
  onShowRadar: () => void;
}

const MobileTopBar = ({ healthScore, onBack, onShowRadar }: Props) => {
  return (
    <div className="zidni-mobile-topbar">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="w-11 h-11 flex items-center justify-center rounded-xl"
          aria-label="رجوع"
        >
          <ArrowRight className="h-5 w-5 text-white/70" />
        </button>
        <span className="text-[15px] font-bold text-white" style={{ fontFamily: "Tajawal, sans-serif" }}>
          المحاسب الذكي
        </span>
        <span className="haseeb-breathe-dot" />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onShowRadar}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full"
          style={{
            background: "rgba(201,168,76,0.2)",
            border: "1px solid hsl(var(--zidni-gold))",
          }}
        >
          <span className="text-xs font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: "hsl(var(--zidni-gold))" }}>
            {healthScore}
          </span>
          <span>💎</span>
        </button>
        <button className="w-11 h-11 flex items-center justify-center" aria-label="إعدادات">
          <Settings className="h-5 w-5 text-white/50" />
        </button>
      </div>
    </div>
  );
};

export default MobileTopBar;
