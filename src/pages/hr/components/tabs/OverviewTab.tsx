import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";
import type { CostEngineResult } from "@/hooks/hr/useEmployeeCostEngine";

interface Props {
  data: Employee360Data;
  cost: CostEngineResult;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);

const Field = ({ label, value }: { label: string; value: any }) => (
  <div className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-right truncate max-w-[60%]">{value || "—"}</span>
  </div>
);

export function OverviewTab({ data, cost }: Props) {
  const e = data.employee;
  const stats = data.attendance.stats;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">المعلومات الأساسية</CardTitle>
        </CardHeader>
        <CardContent className="text-right">
          <Field label="الاسم" value={e?.name} />
          <Field label="رقم الهوية" value={e?.national_id} />
          <Field label="الهاتف" value={e?.phone} />
          <Field label="البريد الإلكتروني" value={e?.email} />
          <Field label="تاريخ الميلاد" value={e?.birth_date ? new Date(e.birth_date).toLocaleDateString("ar") : null} />
          <Field label="الحالة الاجتماعية" value={e?.marital_status} />
          <Field label="عدد الأبناء" value={e?.children_count} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">معلومات العقد</CardTitle>
        </CardHeader>
        <CardContent className="text-right">
          <Field label="الوظيفة" value={e?.job_title} />
          <Field label="القسم" value={e?.department} />
          <Field label="نوع العقد" value={e?.contract_type} />
          <Field label="تاريخ التعيين" value={e?.hire_date ? new Date(e.hire_date).toLocaleDateString("ar") : null} />
          <Field label="الراتب الأساسي" value={`₪${fmt(cost.breakdown.baseSalary)}`} />
          <Field label="إجمالي البدلات" value={`₪${fmt(cost.breakdown.totalAdditions - cost.breakdown.bonuses - cost.breakdown.overtime)}`} />
          <Field
            label="الحالة"
            value={
              <Badge
                variant="outline"
                className={
                  e?.is_active !== false
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                    : "bg-muted text-muted-foreground"
                }
              >
                {e?.is_active !== false ? "نشط" : "موقوف"}
              </Badge>
            }
          />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">إحصائيات سريعة (آخر 30 يوم)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-right">
            <StatCell label="أيام الحضور" value={stats.presentDays} tone="positive" />
            <StatCell label="أيام التأخير" value={stats.lateDays} tone="warning" />
            <StatCell label="أيام الغياب" value={stats.absentDays} tone="danger" />
            <StatCell label="ساعات إضافية" value={`${stats.totalOvertime.toFixed(1)} س`} tone="primary" />
            <StatCell label="نسبة الحضور" value={`${Math.round(stats.attendanceRate * 100)}%`} tone="positive" />
            <StatCell label="إجازات معتمدة" value={data.leaves.approvedCount} tone="primary" />
            <StatCell label="إجازات معلقة" value={data.leaves.pendingCount} tone="warning" />
            <StatCell label="قروض نشطة" value={data.loans.list.filter((l: any) => l.status === "active" || l.status === "نشط").length} tone="warning" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: any;
  tone: "positive" | "warning" | "danger" | "primary";
}) {
  const cls = {
    positive: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    danger: "text-rose-700 dark:text-rose-400",
    primary: "text-primary",
  }[tone];
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
