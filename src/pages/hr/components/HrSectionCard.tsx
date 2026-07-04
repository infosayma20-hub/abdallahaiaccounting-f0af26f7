import { LucideIcon, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
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
    bar: string;
    surface: string;
    ringDots: string;
    iconBg: string;
    iconText: string;
    chip: string;
    hoverText: string;
    linkIconBg: string;
    linkIconText: string;
    wave: string;
  }
> = {
  indigo: {
    bar: "before:bg-indigo-500",
    surface: "bg-gradient-to-br from-indigo-50/70 via-white to-white dark:from-indigo-500/[0.07] dark:via-background dark:to-background",
    ringDots: "border-indigo-400/40",
    iconBg: "bg-indigo-500/10",
    iconText: "text-indigo-600 dark:text-indigo-400",
    chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
    hoverText: "group-hover/link:text-indigo-600 dark:group-hover/link:text-indigo-400",
    linkIconBg: "bg-indigo-500/10 group-hover/link:bg-indigo-500/20",
    linkIconText: "text-indigo-600 dark:text-indigo-400",
    wave: "text-indigo-400/20 dark:text-indigo-400/10",
  },
  amber: {
    bar: "before:bg-amber-500",
    surface: "bg-gradient-to-br from-amber-50/70 via-white to-white dark:from-amber-500/[0.07] dark:via-background dark:to-background",
    ringDots: "border-amber-400/40",
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    hoverText: "group-hover/link:text-amber-600 dark:group-hover/link:text-amber-400",
    linkIconBg: "bg-amber-500/10 group-hover/link:bg-amber-500/20",
    linkIconText: "text-amber-600 dark:text-amber-400",
    wave: "text-amber-400/20 dark:text-amber-400/10",
  },
  emerald: {
    bar: "before:bg-emerald-500",
    surface: "bg-gradient-to-br from-emerald-50/70 via-white to-white dark:from-emerald-500/[0.07] dark:via-background dark:to-background",
    ringDots: "border-emerald-400/40",
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    hoverText: "group-hover/link:text-emerald-600 dark:group-hover/link:text-emerald-400",
    linkIconBg: "bg-emerald-500/10 group-hover/link:bg-emerald-500/20",
    linkIconText: "text-emerald-600 dark:text-emerald-400",
    wave: "text-emerald-400/20 dark:text-emerald-400/10",
  },
  rose: {
    bar: "before:bg-rose-500",
    surface: "bg-gradient-to-br from-rose-50/70 via-white to-white dark:from-rose-500/[0.07] dark:via-background dark:to-background",
    ringDots: "border-rose-400/40",
    iconBg: "bg-rose-500/10",
    iconText: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    hoverText: "group-hover/link:text-rose-600 dark:group-hover/link:text-rose-400",
    linkIconBg: "bg-rose-500/10 group-hover/link:bg-rose-500/20",
    linkIconText: "text-rose-600 dark:text-rose-400",
    wave: "text-rose-400/20 dark:text-rose-400/10",
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
        "group relative overflow-hidden rounded-[28px] p-6 md:p-8 lg:p-10 transition-all duration-300 cursor-pointer text-right",
        "shadow-sm hover:shadow-2xl hover:-translate-y-1 hover:border-foreground/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        "before:absolute before:right-0 before:top-0 before:h-full before:w-[6px]",
        t.surface,
        t.bar,
      )}
    >
      {/* Decorative wave at bottom */}
      <svg
        className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full", t.wave)}
        viewBox="0 0 400 160"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0,90 C80,140 160,40 240,80 C320,120 380,70 400,90 L400,160 L0,160 Z"
          fill="currentColor"
        />
        <path
          d="M0,120 C90,160 180,80 260,110 C340,140 380,110 400,120 L400,160 L0,160 Z"
          fill="currentColor"
          opacity="0.6"
        />
      </svg>

      <div className="relative grid grid-cols-[auto_1fr] gap-6 md:gap-8">
        {/* Big circular icon with dotted ring */}
        <div className="relative flex items-center justify-center">
          <div
            className={cn(
              "absolute inset-0 rounded-full border-2 border-dashed",
              t.ringDots,
            )}
            style={{ width: "9rem", height: "9rem" }}
          />
          <div
            className={cn(
              "relative rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-105",
              t.iconBg,
            )}
            style={{ width: "7rem", height: "7rem" }}
          >
            <Icon className={cn("h-14 w-14", t.iconText)} strokeWidth={1.5} />
          </div>
        </div>

        {/* Right column: title, subtitle, links */}
        <div className="min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <div className="flex-1 min-w-0">
              <h3 className="text-2xl md:text-[28px] font-extrabold text-foreground leading-tight">
                {title}
              </h3>
              <p className="text-sm md:text-[15px] text-muted-foreground mt-1.5">
                {subtitle}
              </p>
            </div>
            {badge != null && badge !== "" && (
              <Badge
                variant="outline"
                className={cn(
                  "h-7 px-3 text-xs font-bold rounded-full border shrink-0 mt-1",
                  t.chip,
                )}
              >
                {badge}
              </Badge>
            )}
          </div>

          <ul className="mt-5 md:mt-6 space-y-2">
            {actions.map((a) => {
              const LinkIcon = a.Icon ?? Icon;
              return (
                <li key={a.to}>
                  <button
                    type="button"
                    dir="rtl"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(a.to);
                    }}
                    className={cn(
                      "group/link w-full flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl text-right",
                      "text-sm md:text-[15px] text-foreground/80 font-medium transition-all",
                      "hover:bg-white/70 dark:hover:bg-white/[0.04] hover:shadow-sm hover:-translate-x-0.5",
                      t.hoverText,
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={cn(
                          "flex items-center justify-center h-8 w-8 rounded-lg shrink-0 transition-colors",
                          t.linkIconBg,
                        )}
                      >
                        <LinkIcon className={cn("h-4 w-4", t.linkIconText)} strokeWidth={2} />
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
      </div>
    </Card>
  );
}