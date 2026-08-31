import { Wallet, HandCoins, Receipt, TrendingUp, ShieldAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CostEngineResult } from "@/hooks/hr/useEmployeeCostEngine";
import type { RiskScoreResult } from "@/hooks/hr/useEmployeeRiskScore";
import type { ForecastResult } from "@/hooks/hr/useEmployeeForecast";

interface Props {
  cost: CostEngineResult;
  risk: RiskScoreResult;
  forecast: ForecastResult;
  onNavigateTab?: (tab: string) => void;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);

type Tone = "neutral" | "primary" | "warning" | "danger" | "positive";

const toneClass: Record<Tone, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  positive: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
  danger: "text-rose-700 dark:text-rose-400",
};

function KpiCell({
  label,
  value,
  hint,
  Icon,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  Icon: LucideIcon;
  tone?: Tone;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className="flex-1 min-w-[150px] text-right px-3 py-2 hover:bg-muted/40 transition-colors flex items-center gap-2"
    >
      <Icon className={cn("h-4 w-4 shrink-0", toneClass[tone])} />
      <span className="min-w-0">
        <span className="block text-[10.5px] text-muted-foreground leading-tight truncate">{label}</span>
        <span className={cn("block text-[14px] font-bold tabular-nums leading-tight", toneClass[tone])}>
          {value}
        </span>
      </span>
      {hint && (
        <span className="ms-auto text-[10.5px] text-muted-foreground truncate hidden lg:block">{hint}</span>
      )}
    </button>
  );
}

/** Compact single-row KPI strip (D365 header metrics). */
export function EmployeeFinancialPanel({ cost, risk, forecast, onNavigateTab }: Props) {
  const riskTone: Tone = risk.level === "low" ? "positive" : risk.level === "medium" ? "warning" : "danger";
  const netTone: Tone =
    forecast.expectedNetSalary <= 0 || forecast.deductionRatio >= 0.4
      ? "danger"
      : forecast.deductionRatio >= 0.2
      ? "warning"
      : "positive";

  return (
    <div
      dir="rtl"
      className="rounded-lg border border-border bg-card flex flex-wrap divide-x divide-x-reverse divide-border"
    >
      <KpiCell
        label="التكلفة الشهرية"
        value={`₪${fmt(cost.totalCost)}`}
        hint={`الأساسي ₪${fmt(cost.breakdown.baseSalary)}`}
        Icon={Wallet}
        tone="primary"
        onClick={() => onNavigateTab?.("payroll")}
      />
      <KpiCell
        label="القروض النشطة"
        value={`₪${fmt(cost.breakdown.loanInstallment)}`}
        hint={
          cost.ratios.loanBurden > 0
            ? `${Math.round(cost.ratios.loanBurden * 100)}% من الراتب`
            : "لا يوجد قسط"
        }
        Icon={HandCoins}
        tone={cost.ratios.loanBurden >= 0.3 ? "warning" : "neutral"}
        onClick={() => onNavigateTab?.("loans")}
      />
      <KpiCell
        label="خصومات الشهر"
        value={`₪${fmt(cost.breakdown.deductionsThisMonth)}`}
        hint={
          cost.ratios.deductionRatio > 0
            ? `${Math.round(cost.ratios.deductionRatio * 100)}% من الراتب`
            : "لا خصومات"
        }
        Icon={Receipt}
        tone={cost.ratios.deductionRatio >= 0.2 ? "warning" : "neutral"}
        onClick={() => onNavigateTab?.("deductions")}
      />
      <KpiCell
        label="صافي متوقع"
        value={`₪${fmt(forecast.expectedNetSalary)}`}
        hint={`متبقي ${forecast.daysRemaining} يوم`}
        Icon={TrendingUp}
        tone={netTone}
        onClick={() => onNavigateTab?.("payroll")}
      />
      <KpiCell
        label="مؤشر المخاطر"
        value={`${risk.score}%`}
        hint={risk.label}
        Icon={ShieldAlert}
        tone={riskTone}
        onClick={() => onNavigateTab?.("overview")}
      />
    </div>
  );
}
