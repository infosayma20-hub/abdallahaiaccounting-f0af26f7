import { RefreshCw, Settings2, Clock, Eye, EyeOff, Building2 } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import BackButton from "@/components/BackButton";
import type { PeriodType } from "@/hooks/useDashboardData";

interface Props {
  companyName: string;
  companyLogo?: string;
  period: PeriodType;
  onPeriodChange: (p: PeriodType) => void;
  lastUpdated: Date;
  onRefresh: () => void;
  onCustomize: () => void;
  loading: boolean;
  privacyMode?: boolean;
  onTogglePrivacy?: () => void;
}

const PERIODS: { key: PeriodType; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "week", label: "هذا الأسبوع" },
  { key: "month", label: "هذا الشهر" },
  { key: "year", label: "هذه السنة" },
];

export default function DashboardHeader({ companyName, companyLogo, period, onPeriodChange, lastUpdated, onRefresh, onCustomize, loading, privacyMode, onTogglePrivacy }: Props) {
  const minutesAgo = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
  const timeLabel = minutesAgo < 1 ? "الآن" : `منذ ${minutesAgo} دقيقة`;

  return (
    <div
      className="col-span-12 rounded-2xl px-5 py-3 md:px-6 md:py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-card border border-border shadow-soft relative overflow-hidden"
    >
      {/* Subtle animated gradient shimmer */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          background: "linear-gradient(120deg, transparent 30%, #E8A020 45%, #F45E0C 50%, #E8A020 55%, transparent 70%)",
          backgroundSize: "300% 100%",
          animation: "header-shimmer 8s ease-in-out infinite",
        }}
      />
      {/* Subtle gold glow accent at the top-right */}
      <div
        className="absolute -top-12 -right-12 w-48 h-48 pointer-events-none opacity-[0.06] rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, #E8A020 0%, transparent 70%)",
          animation: "header-glow-pulse 6s ease-in-out infinite",
        }}
      />

      <style>{`
        @keyframes header-shimmer {
          0%, 100% { background-position: 200% center; }
          50% { background-position: -200% center; }
        }
        @keyframes header-glow-pulse {
          0%, 100% { opacity: 0.04; transform: scale(1); }
          50% { opacity: 0.1; transform: scale(1.15); }
        }
      `}</style>

      {/* Left */}
      <div className="space-y-1.5 relative z-10">
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg md:text-xl font-medium text-foreground" style={{ fontFamily: "Tajawal, sans-serif" }}>
                {companyName || "شركتي"}
              </h1>
              {companyLogo ? (
                <img src={companyLogo} alt="شعار الشركة" className="h-8 w-8 rounded-lg object-contain" />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">نظام AMWALI — لوحة المعلومات</p>
          </div>
        </div>

        {/* Period tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => onPeriodChange(p.key)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                period === p.key
                  ? "text-foreground border-b-2 border-gold bg-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 flex-wrap relative z-10">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>آخر تحديث: {timeLabel}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-accent text-[11px] font-medium transition-all disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              تحديث
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>تحديث البيانات</p></TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onCustomize}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-accent text-[11px] font-medium transition-all"
            >
              <Settings2 className="h-3 w-3" />
              تخصيص
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>تخصيص لوحة المعلومات</p></TooltipContent>
        </Tooltip>

        {onTogglePrivacy && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onTogglePrivacy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-accent text-[11px] font-medium transition-all"
              >
                {privacyMode ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {privacyMode ? "إظهار" : "خصوصية"}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{privacyMode ? "إظهار البيانات المالية" : "إخفاء البيانات المالية"}</p></TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
