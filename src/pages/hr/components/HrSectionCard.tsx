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
  /** الوجهة الرئيسية عند الضغط على البطاقة كاملةً */
  to: string;
};

const TONE: Record<
  Props["tone"],
  { ring: string; iconBg: string; iconText: string; chip: string; hoverText: string; dot: string }
> = {
  indigo: {
    ring: "before:bg-indigo-500",
    iconBg: "bg-indigo-500/10",
    iconText: "text-indigo-600 dark:text-indigo-400",
    chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
    hoverText: "group-hover/link:text-indigo-600 dark:group-hover/link:text-indigo-400",
    dot: "bg-indigo-300/70",
  },
  amber: {
    ring: "before:bg-amber-500",
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    hoverText: "group-hover/link:text-amber-600 dark:group-hover/link:text-amber-400",
    dot: "bg-amber-300/70",
  },
  emerald: {
    ring: "before:bg-emerald-500",
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    hoverText: "group-hover/link:text-emerald-600 dark:group-hover/link:text-emerald-400",
    dot: "bg-emerald-300/70",
  },
  rose: {
    ring: "before:bg-rose-500",
    iconBg: "bg-rose-500/10",
    iconText: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    hoverText: "group-hover/link:text-rose-600 dark:group-hover/link:text-rose-400",
    dot: "bg-rose-300/70",
  },
};

export function HrSectionCard({ title, subtitle, Icon, tone, badge, actions, to }: Props) {
  const navigate = useNavigate();
  const t = TONE[tone];

  return (
    <Card
      dir="rtl"
      role="button"
      tabIndex={0}
      onClick={() => navigate(to)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(to);
        }
      }}
      className={cn(
        "group relative overflow-hidden rounded-3xl p-6 md:p-8 transition-all duration-300 cursor-pointer text-right",
        "shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-foreground/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        "before:absolute before:right-0 before:top-0 before:h-full before:w-2 md:before:w-[10px]",
        t.ring,
      )}
    >
      {/* Header: icon on left, badge on right (RTL flips visually) */}
      <div className="flex items-start justify-between gap-4 mb-6 md:mb-8">
        <div className={cn("p-3.5 md:p-4 rounded-2xl shrink-0 transition-transform group-hover:scale-105", t.iconBg)}>
          <Icon className={cn("h-7 w-7 md:h-8 md:w-8", t.iconText)} strokeWidth={1.75} />
        </div>
        {badge != null && badge !== "" && (
          <Badge
            variant="outline"
            className={cn("h-7 px-3 text-xs font-bold rounded-full border shrink-0", t.chip)}
          >
            {badge}
          </Badge>
        )}
      </div>

      {/* Title + subtitle */}
      <div className="mb-6 md:mb-8">
        <h3 className="text-xl md:text-2xl font-bold text-foreground mb-1.5">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {/* Sub-links as a table of contents */}
      <ul className="space-y-3 md:space-y-4">
        {actions.map((a) => (
          <li key={a.to}>
            <button
              type="button"
              dir="rtl"
              onClick={(e) => {
                e.stopPropagation();
                navigate(a.to);
              }}
              className={cn(
                "group/link w-full flex items-center justify-between gap-3 py-1.5 text-right",
                "text-sm md:text-[15px] text-muted-foreground transition-colors",
                t.hoverText,
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0 transition-transform group-hover/link:scale-125", t.dot)} />
                <span className="truncate font-medium">{a.label}</span>
                {a.count != null && a.count > 0 && (
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md border-0", t.chip)}>
                    {a.count}
                  </span>
                )}
              </div>
              <ChevronLeft
                className="h-4 w-4 opacity-0 -translate-x-2 group-hover/link:opacity-100 group-hover/link:translate-x-0 transition-all shrink-0"
              />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}