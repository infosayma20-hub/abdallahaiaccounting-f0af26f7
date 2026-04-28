import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  label: string;
  value: string;
  hint?: string;
  Icon: LucideIcon;
  tone?: "neutral" | "positive" | "warning" | "danger" | "primary";
  onClick?: () => void;
  tooltip?: string;
}

const TONES: Record<NonNullable<Props["tone"]>, { wrap: string; ring: string; icon: string; value: string }> = {
  neutral: {
    wrap: "bg-card",
    ring: "ring-border",
    icon: "bg-muted text-foreground",
    value: "text-foreground",
  },
  positive: {
    wrap: "bg-emerald-500/5",
    ring: "ring-emerald-500/20",
    icon: "bg-emerald-500/10 text-emerald-600",
    value: "text-emerald-700 dark:text-emerald-400",
  },
  warning: {
    wrap: "bg-amber-500/5",
    ring: "ring-amber-500/20",
    icon: "bg-amber-500/10 text-amber-600",
    value: "text-amber-700 dark:text-amber-400",
  },
  danger: {
    wrap: "bg-rose-500/5",
    ring: "ring-rose-500/20",
    icon: "bg-rose-500/10 text-rose-600",
    value: "text-rose-700 dark:text-rose-400",
  },
  primary: {
    wrap: "bg-primary/5",
    ring: "ring-primary/20",
    icon: "bg-primary/10 text-primary",
    value: "text-primary",
  },
};

export function EmployeeCostCard({ label, value, hint, Icon, tone = "neutral", onClick, tooltip }: Props) {
  const t = TONES[tone];
  const interactive = !!onClick;
  const card = (
    <Card
      className={cn(
        "ring-1 shadow-sm transition-all",
        t.wrap,
        t.ring,
        interactive && "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.99] focus-within:ring-2 focus-within:ring-primary/40",
      )}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 text-right flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
            <p className={cn("text-lg md:text-xl font-bold tabular-nums truncate", t.value)}>{value}</p>
            {hint && <p className="text-[11px] text-muted-foreground truncate">{hint}</p>}
          </div>
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", t.icon)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (!tooltip) return card;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
