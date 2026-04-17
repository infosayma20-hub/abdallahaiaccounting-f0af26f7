import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import type { RiskScoreResult } from "@/hooks/hr/useEmployeeRiskScore";

interface Props {
  risk: RiskScoreResult;
  size?: "sm" | "md" | "lg";
}

const TONES = {
  low: {
    cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15",
    Icon: ShieldCheck,
  },
  medium: {
    cls: "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/15",
    Icon: ShieldAlert,
  },
  high: {
    cls: "bg-rose-500/10 text-rose-600 border-rose-500/30 hover:bg-rose-500/15",
    Icon: ShieldX,
  },
} as const;

export function EmployeeRiskBadge({ risk, size = "md" }: Props) {
  const { Icon, cls } = TONES[risk.level];
  const sizing =
    size === "lg" ? "text-sm px-3 py-1.5" : size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1.5 font-medium border ${cls} ${sizing}`}>
            <Icon className={size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} />
            <span>المخاطر: {risk.label}</span>
            <span className="opacity-70">({risk.score})</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-right">
          <div className="space-y-1">
            <div className="font-semibold">عوامل المخاطر</div>
            {risk.reasons.length > 0 ? (
              <ul className="text-xs space-y-0.5 list-disc pr-4">
                {risk.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : (
              <div className="text-xs opacity-80">لا توجد مؤشرات مخاطر حالياً.</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
