import { Wallet, HandCoins, Receipt, TrendingUp, ShieldAlert, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmployeeCostCard } from "./EmployeeCostCard";
import type { CostEngineResult } from "@/hooks/hr/useEmployeeCostEngine";
import type { RiskScoreResult } from "@/hooks/hr/useEmployeeRiskScore";
import type { ForecastResult } from "@/hooks/hr/useEmployeeForecast";

interface Props {
  cost: CostEngineResult;
  risk: RiskScoreResult;
  forecast: ForecastResult;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);

export function EmployeeFinancialPanel({ cost, risk, forecast }: Props) {
  const riskTone =
    risk.level === "low" ? "positive" : risk.level === "medium" ? "warning" : "danger";

  const netTone =
    forecast.expectedNetSalary <= 0
      ? "danger"
      : forecast.deductionRatio >= 0.4
      ? "danger"
      : forecast.deductionRatio >= 0.2
      ? "warning"
      : "positive";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <EmployeeCostCard
          label="التكلفة الشهرية"
          value={`₪${fmt(cost.totalCost)}`}
          hint={`الأساسي: ₪${fmt(cost.breakdown.baseSalary)}`}
          Icon={Wallet}
          tone="primary"
        />
        <EmployeeCostCard
          label="القروض النشطة"
          value={`₪${fmt(cost.breakdown.loanInstallment)}`}
          hint={
            cost.ratios.loanBurden > 0
              ? `${Math.round(cost.ratios.loanBurden * 100)}% من الراتب`
              : "لا يوجد قسط حالي"
          }
          Icon={HandCoins}
          tone={cost.ratios.loanBurden >= 0.3 ? "warning" : "neutral"}
        />
        <EmployeeCostCard
          label="خصومات هذا الشهر"
          value={`₪${fmt(cost.breakdown.deductionsThisMonth)}`}
          hint={
            cost.ratios.deductionRatio > 0
              ? `${Math.round(cost.ratios.deductionRatio * 100)}% من الراتب`
              : "لا توجد خصومات"
          }
          Icon={Receipt}
          tone={cost.ratios.deductionRatio >= 0.2 ? "warning" : "neutral"}
        />
        <EmployeeCostCard
          label="صافي الراتب المتوقع"
          value={`₪${fmt(forecast.expectedNetSalary)}`}
          hint={`متبقي ${forecast.daysRemaining} يوم`}
          Icon={TrendingUp}
          tone={netTone as any}
        />
        <EmployeeCostCard
          label="مؤشر المخاطر"
          value={`${risk.score}%`}
          hint={`المستوى: ${risk.label}`}
          Icon={ShieldAlert}
          tone={riskTone as any}
        />
      </div>

      {forecast.warnings.length > 0 && (
        <div className="space-y-2">
          {forecast.warnings.map((w, i) => (
            <Alert
              key={i}
              variant={w.level === "danger" ? "destructive" : "default"}
              className={
                w.level === "warning"
                  ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600"
                  : undefined
              }
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-right">{w.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}
    </div>
  );
}
