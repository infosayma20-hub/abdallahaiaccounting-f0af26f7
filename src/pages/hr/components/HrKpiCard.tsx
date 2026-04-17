import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  Icon: LucideIcon;
  tone?: "neutral" | "positive" | "warning" | "danger" | "primary";
  onClick?: () => void;
}

const TONES = {
  neutral: { wrap: "bg-card", ring: "ring-border", icon: "bg-muted text-foreground", value: "text-foreground" },
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
  primary: { wrap: "bg-primary/5", ring: "ring-primary/20", icon: "bg-primary/10 text-primary", value: "text-primary" },
} as const;

export function HrKpiCard({ label, value, hint, Icon, tone = "neutral", onClick }: Props) {
  const t = TONES[tone];
  return (
    <Card
      onClick={onClick}
      className={cn(
        "ring-1 shadow-sm transition-all",
        t.wrap,
        t.ring,
        onClick && "cursor-pointer hover:shadow-md hover:scale-[1.01]",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 text-right flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
            <p className={cn("text-xl md:text-2xl font-bold tabular-nums truncate", t.value)}>
              {value}
            </p>
            {hint && <p className="text-[11px] text-muted-foreground truncate">{hint}</p>}
          </div>
          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", t.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
