import { LucideIcon, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export type HrSectionAction = {
  label: string;
  to: string;
  count?: number | null;
  Icon?: LucideIcon;
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
  {
    iconBg: string;
    iconText: string;
    chip: string;
    hoverText: string;
    linkIconBg: string;
    linkIconText: string;
  }
> = {
  indigo: {
    iconBg: "bg-indigo-500/10",
    iconText: "text-indigo-600 dark:text-indigo-400",
    chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
    hoverText: "group-hover/link:text-indigo-600 dark:group-hover/link:text-indigo-400",
    linkIconBg: "bg-indigo-500/10 group-hover/link:bg-indigo-500/20",
    linkIconText: "text-indigo-600 dark:text-indigo-400",
  },
  amber: {
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    hoverText: "group-hover/link:text-amber-600 dark:group-hover/link:text-amber-400",
    linkIconBg: "bg-amber-500/10 group-hover/link:bg-amber-500/20",
    linkIconText: "text-amber-600 dark:text-amber-400",
  },
  emerald: {
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    hoverText: "group-hover/link:text-emerald-600 dark:group-hover/link:text-emerald-400",
    linkIconBg: "bg-emerald-500/10 group-hover/link:bg-emerald-500/20",
    linkIconText: "text-emerald-600 dark:text-emerald-400",
  },
  rose: {
    iconBg: "bg-rose-500/10",
    iconText: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    hoverText: "group-hover/link:text-rose-600 dark:group-hover/link:text-rose-400",
    linkIconBg: "bg-rose-500/10 group-hover/link:bg-rose-500/20",
    linkIconText: "text-rose-600 dark:text-rose-400",
  },
};

export function HrSectionCard({ title, subtitle, Icon, tone, badge, actions, to }: Props) {
  const navigate = useNavigate();
  const t = TONE[tone];

  return (
    <div dir="rtl" className="group text-right">
      {/* Header: icon + title stacked */}
      <button
        type="button"
        onClick={() => navigate(to)}
        className="flex items-center gap-4 mb-4 w-full text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-xl p-1"
      >
        <div
          className={cn(
            "shrink-0 rounded-2xl flex items-center justify-center h-14 w-14 transition-transform group-hover:scale-105",
            t.iconBg,
          )}
        >
          <Icon className={cn("h-7 w-7", t.iconText)} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base md:text-lg font-bold text-foreground leading-tight">
              {title}
            </h3>
            {badge != null && badge !== "" && (
              <Badge
                variant="outline"
                className={cn("h-6 px-2 text-[11px] font-bold rounded-full border shrink-0", t.chip)}
              >
                {badge}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {subtitle}
          </p>
        </div>
      </button>

      <ul className="space-y-1">
            {actions.map((a) => {
              const LinkIcon = a.Icon ?? Icon;
              return (
                <li key={a.to}>
                  <button
                    type="button"
                    dir="rtl"
                    onClick={() => navigate(a.to)}
                    className={cn(
                      "group/link w-full flex items-center justify-between gap-3 py-2 px-2 rounded-lg text-right",
                      "text-sm text-foreground/80 font-medium transition-all",
                      "hover:bg-muted/60 hover:-translate-x-0.5",
                      t.hoverText,
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={cn(
                          "flex items-center justify-center h-7 w-7 rounded-md shrink-0 transition-colors",
                          t.linkIconBg,
                        )}
                      >
                        <LinkIcon className={cn("h-3.5 w-3.5", t.linkIconText)} strokeWidth={2} />
                      </span>
                      <span className="truncate">{a.label}</span>
                      {a.count != null && a.count > 0 && (
                        <span
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded-md border-0 shrink-0",
                            t.chip,
                          )}
                        >
                          {a.count}
                        </span>
                      )}
                    </div>
                    <ChevronLeft className="h-4 w-4 opacity-40 group-hover/link:opacity-100 group-hover/link:-translate-x-0.5 transition-all shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
    </div>
  );
}