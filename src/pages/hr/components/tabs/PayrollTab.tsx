import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";
import type { CostEngineResult } from "@/hooks/hr/useEmployeeCostEngine";

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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr className="text-right">
                    <th className="px-4 py-2 font-medium">الفترة</th>
                    <th className="px-4 py-2 font-medium">الأساسي</th>
                    <th className="px-4 py-2 font-medium">البدلات</th>
                    <th className="px-4 py-2 font-medium">الخصومات</th>
                    <th className="px-4 py-2 font-medium">القروض</th>
                    <th className="px-4 py-2 font-medium">الصافي</th>
                    <th className="px-4 py-2 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r: any) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30 text-right">
                      <td className="px-4 py-2 tabular-nums">
                        {r.period_month}/{r.period_year}
                      </td>
                      <td className="px-4 py-2 tabular-nums">₪{fmt(r.base_salary)}</td>
                      <td className="px-4 py-2 tabular-nums text-emerald-600">
                        ₪{fmt(
                          Number(r.total_allowances || 0) +
                            Number(r.attendance_bonus || 0) +
                            Number(r.special_allowance || 0),
                        )}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-rose-600">
                        ₪{fmt(r.total_deductions)}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-amber-600">
                        ₪{fmt(r.loan_deduction)}
                      </td>
                      <td className="px-4 py-2 tabular-nums font-bold">₪{fmt(r.net_salary)}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant="outline"
                          className={
                            r.is_paid
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                          }
                        >
                          {r.is_paid ? "مدفوع" : "غير مدفوع"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
