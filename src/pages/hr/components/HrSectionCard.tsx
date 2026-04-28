import { LucideIcon, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export type HrSectionAction = {
  label: string;
  to: string;
  count?: number | null;
};

type Props = {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  tone: "indigo" | "amber" | "emerald" | "rose";
  badge?: string | number | null;
  actions: HrSectionAction[];
};

const TONE: Record<Props["tone"], { ring: string; iconBg: string; iconText: string; chip: string }> = {
  indigo: {
    ring: "before:bg-indigo-500/60",
    iconBg: "bg-indigo-500/10",
    iconText: "text-indigo-600 dark:text-indigo-400",
    chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
  },
  amber: {
    ring: "before:bg-amber-500/60",
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  },
  emerald: {
    ring: "before:bg-emerald-500/60",
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  },
  rose: {
    ring: "before:bg-rose-500/60",
    iconBg: "bg-rose-500/10",
    iconText: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  },
};

export function HrSectionCard({ title, subtitle, Icon, tone, badge, actions }: Props) {
  const navigate = useNavigate();
  const t = TONE[tone];

  return (
    <Card
      className={cn(
        "relative overflow-hidden p-4 transition-all hover:shadow-md",
        "before:absolute before:right-0 before:top-0 before:h-full before:w-1",
        t.ring,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center", t.iconBg)}>
            <Icon className={cn("h-5 w-5", t.iconText)} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {badge != null && badge !== "" && (
          <Badge variant="outline" className={cn("text-[10px] font-bold border", t.chip)}>
            {badge}
          </Badge>
        )}
      </div>

      <div className="space-y-1">
        {actions.map((a) => (
          <button
            key={a.to}
            type="button"
            onClick={() => navigate(a.to)}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-right
                       hover:bg-muted/60 transition-colors group"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            <div className="flex items-center gap-2 flex-1 justify-end">
              {a.count != null && a.count > 0 && (
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md", t.chip, "border-0")}>
                  {a.count}
                </span>
              )}
              <span className="text-xs font-medium text-foreground">{a.label}</span>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}