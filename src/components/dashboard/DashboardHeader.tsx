import { RefreshCw, Settings2, Clock } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { PeriodType } from "@/hooks/useDashboardData";

interface Props {
  companyName: string;
  period: PeriodType;
  onPeriodChange: (p: PeriodType) => void;
  lastUpdated: Date;
  onRefresh: () => void;
  onCustomize: () => void;
  loading: boolean;
}

const PERIODS: { key: PeriodType; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "week", label: "هذا الأسبوع" },
  { key: "month", label: "هذا الشهر" },
  { key: "year", label: "هذه السنة" },
];

export default function DashboardHeader({ companyName, period, onPeriodChange, lastUpdated, onRefresh, onCustomize, loading }: Props) {
  const minutesAgo = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
  const timeLabel = minutesAgo < 1 ? "الآن" : `منذ ${minutesAgo} دقيقة`;

  return (
    <div
      className="col-span-12 rounded-[20px] px-5 py-4 md:px-6 md:py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      style={{ background: "linear-gradient(135deg, hsl(var(--navy)) 0%, hsl(var(--navy-deep)) 50%, hsl(var(--navy)) 100%)" }}
    >
      {/* Left */}
      <div className="space-y-2">
        <h1 className="text-lg md:text-xl font-extrabold text-white" style={{ fontFamily: "Tajawal, sans-serif" }}>
          {companyName || "شركتي"}
        </h1>
        <p className="text-[11px] text-white/40">نظام FINIX — لوحة المعلومات</p>

        {/* Period tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => onPeriodChange(p.key)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                period === p.key
                  ? "text-white border-b-2 border-[hsl(var(--gold))] bg-white/8"
                  : "text-white/50 hover:text-white/70"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-[10px] text-white/40">
          <Clock className="h-3 w-3" />
          <span>آخر تحديث: {timeLabel}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 text-white/70 hover:bg-white/15 text-[11px] font-medium transition-all disabled:opacity-40"
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 text-white/70 hover:bg-white/15 text-[11px] font-medium transition-all"
            >
              <Settings2 className="h-3 w-3" />
              تخصيص
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>تخصيص لوحة المعلومات</p></TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
