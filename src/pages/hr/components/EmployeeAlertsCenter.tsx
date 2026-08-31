import { useState } from "react";
import { AlertTriangle, ChevronDown, ShieldAlert, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskScoreResult } from "@/hooks/hr/useEmployeeRiskScore";
import type { ForecastResult } from "@/hooks/hr/useEmployeeForecast";

interface Props {
  risk: RiskScoreResult;
  forecast: ForecastResult;
}

type Item = { level: "info" | "warning" | "danger"; message: string; source: string };

/**
 * Single collapsed alerts hub (D365 message bar style).
 * Replaces the multiple stacked warning banners that cluttered the page.
 */
export function EmployeeAlertsCenter({ risk, forecast }: Props) {
  const [open, setOpen] = useState(false);

  const items: Item[] = [
    ...forecast.warnings.map((w) => ({ level: w.level, message: w.message, source: "الراتب المتوقع" })),
    ...(risk.level !== "low"
      ? risk.reasons.map((r) => ({
          level: (risk.level === "high" ? "danger" : "warning") as Item["level"],
          message: r,
          source: "مؤشر المخاطر",
        }))
      : []),
  ];

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 flex items-center gap-2 text-[12px] text-emerald-700 dark:text-emerald-400" dir="rtl">
        <CheckCircle2 className="h-3.5 w-3.5" />
        لا توجد تنبيهات على هذا الموظف
      </div>
    );
  }

  const hasDanger = items.some((i) => i.level === "danger");

  return (
    <div
      dir="rtl"
      className={cn(
        "rounded-lg border overflow-hidden",
        hasDanger ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-muted/30 transition-colors"
      >
        <AlertTriangle
          className={cn("h-3.5 w-3.5 shrink-0", hasDanger ? "text-destructive" : "text-amber-600")}
        />
        <span className={cn("font-medium", hasDanger ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
          {items.length} تنبيه
        </span>
        <span className="text-muted-foreground truncate">{items[0].message}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 ms-auto shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul className="px-3 pb-2 space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px]">
              <ShieldAlert
                className={cn(
                  "h-3.5 w-3.5 mt-0.5 shrink-0",
                  it.level === "danger" ? "text-destructive" : "text-amber-600",
                )}
              />
              <span className="flex-1">{it.message}</span>
              <span className="text-[10.5px] text-muted-foreground shrink-0">{it.source}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
