import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";
import type { CostEngineResult } from "@/hooks/hr/useEmployeeCostEngine";
import { HRTable, HRTHead, HRTH, HRTR, HRTD, HRMoney } from "../HRTable";
import { tPayrollStatus, payrollStatusTone } from "@/lib/hrLabels";

interface Props {
  data: Employee360Data;
  cost: CostEngineResult;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(v || 0));

export function PayrollTab({ data, cost }: Props) {
  const runs = data.payroll.runs || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">تفصيل التكلفة الشهرية الحالية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 text-right">
            <Row label="الراتب الأساسي" value={cost.breakdown.baseSalary} />
            <Row label="بدل طعام" value={cost.breakdown.foodAllowance} />
            <Row label="بدل مواصلات" value={cost.breakdown.transportAllowance} />
            <Row label="بدل زوجة" value={cost.breakdown.spouseAllowance} />
            <Row label="بدل أبناء" value={cost.breakdown.childrenAllowance} />
            <Row label="بدل إداري" value={cost.breakdown.adminAllowance} />
            <Row label="بدلات أخرى" value={cost.breakdown.otherAllowances} />
            <Row label="بدلات مخصصة" value={cost.breakdown.customAllowances} />
            <Row label="مكافآت" value={cost.breakdown.bonuses} />
            <Row label="ساعات إضافية" value={cost.breakdown.overtime} />
          </div>
          <div className="mt-4 pt-3 border-t grid grid-cols-1 md:grid-cols-3 gap-3 text-right">
            <Summary label="إجمالي الإضافات" value={cost.breakdown.totalAdditions} tone="positive" />
            <Summary label="إجمالي الاستقطاعات" value={cost.breakdown.totalDeductions} tone="danger" />
            <Summary label="التكلفة الإجمالية" value={cost.totalCost} tone="primary" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">آخر الرواتب (6 أشهر)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">لا توجد قسائم راتب.</p>
          ) : (
            <HRTable>
              <HRTHead>
                <HRTH>الفترة</HRTH>
                <HRTH>الأساسي</HRTH>
                <HRTH>البدلات</HRTH>
                <HRTH>الخصومات</HRTH>
                <HRTH>القروض</HRTH>
                <HRTH>الصافي</HRTH>
                <HRTH>الحالة</HRTH>
              </HRTHead>
              <tbody>
                {runs.map((r: any) => {
                  const allowances =
                    Number(r.total_allowances || 0) +
                    Number(r.attendance_bonus || 0) +
                    Number(r.special_allowance || 0);
                  return (
                    <HRTR key={r.id}>
                      <HRTD numeric>
                        {r.period_month}/{r.period_year}
                      </HRTD>
                      <HRTD numeric>
                        <HRMoney value={r.base_salary} />
                      </HRTD>
                      <HRTD numeric className="text-emerald-600">
                        <HRMoney value={allowances} />
                      </HRTD>
                      <HRTD numeric className="text-rose-600">
                        <HRMoney value={r.total_deductions} />
                      </HRTD>
                      <HRTD numeric className="text-amber-600">
                        <HRMoney value={r.loan_deduction} />
                      </HRTD>
                      <HRTD numeric className="font-bold">
                        <HRMoney value={r.net_salary} />
                      </HRTD>
                      <HRTD>
                        <Badge variant="outline" className={payrollStatusTone(!!r.is_paid)}>
                          {tPayrollStatus(!!r.is_paid)}
                        </Badge>
                      </HRTD>
                    </HRTR>
                  );
                })}
              </tbody>
            </HRTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">₪{fmt(value)}</span>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "danger" | "primary";
}) {
  const cls = {
    positive: "text-emerald-700 dark:text-emerald-400",
    danger: "text-rose-700 dark:text-rose-400",
    primary: "text-primary",
  }[tone];
  return (
    <div className="rounded-lg border bg-card p-3 text-right">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${cls}`}>₪{fmt(value)}</p>
    </div>
  );
}
