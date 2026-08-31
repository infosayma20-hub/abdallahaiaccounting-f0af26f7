import { Badge } from "@/components/ui/badge";
import { FastTabs } from "@/components/finance/shell";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";
import type { CostEngineResult } from "@/hooks/hr/useEmployeeCostEngine";
import { tContractType, tMaritalStatus } from "@/lib/hrLabels";

interface Props {
  data: Employee360Data;
  cost: CostEngineResult;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);

const Field = ({ label, value }: { label: string; value: any }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
    <span className="text-[11.5px] text-muted-foreground">{label}</span>
    <span className="text-[12.5px] font-medium text-right truncate max-w-[60%]">{value || "—"}</span>
  </div>
);

const arDate = (v: any) => (v ? new Date(v).toLocaleDateString("ar") : null);

export function OverviewTab({ data, cost }: Props) {
  const e: any = data.employee || {};
  const stats = data.attendance.stats;

  // ── canonical column names (employees table) with safe fallbacks ──
  const fullName = e.full_name ?? e.name;
  const idNumber = e.id_number ?? e.national_id;
  const birthDate = e.date_of_birth ?? e.birth_date;
  const hireDate = e.start_date ?? e.hire_date;
  const jobTitle = e.job_title ?? e.position;
  const department = e.department;

  const activeLoans = data.loans.list.filter(
    (l: any) => l.status === "active" || l.status === "نشط",
  ).length;

  return (
    <FastTabs
      items={[
        {
          key: "basic",
          title: "المعلومات الأساسية",
          summary: [fullName, idNumber].filter(Boolean).join(" • ") || "غير مكتملة",
          children: (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <div>
                <Field label="الاسم" value={fullName} />
                <Field label="رقم الهوية" value={idNumber} />
                <Field label="الهاتف" value={e.phone} />
                <Field label="البريد الإلكتروني" value={e.email} />
              </div>
              <div>
                <Field label="تاريخ الميلاد" value={arDate(birthDate)} />
                <Field label="الحالة الاجتماعية" value={tMaritalStatus(e.marital_status)} />
                <Field label="عدد الأبناء" value={e.children_count} />
                <Field label="العنوان" value={e.address} />
              </div>
            </div>
          ),
        },
        {
          key: "contract",
          title: "معلومات العقد",
          summary: [jobTitle, department, tContractType(e.contract_type)].filter(Boolean).join(" • "),
          children: (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <div>
                <Field label="الوظيفة" value={jobTitle} />
                <Field label="القسم" value={department} />
                <Field label="نوع العقد" value={tContractType(e.contract_type)} />
                <Field label="تاريخ التعيين" value={arDate(hireDate)} />
              </div>
              <div>
                <Field label="الراتب الأساسي" value={`₪${fmt(cost.breakdown.baseSalary)}`} />
                <Field
                  label="إجمالي البدلات"
                  value={`₪${fmt(
                    cost.breakdown.totalAdditions - cost.breakdown.bonuses - cost.breakdown.overtime,
                  )}`}
                />
                <Field
                  label="الحالة"
                  value={
                    <Badge
                      variant="outline"
                      className={
                        e.is_active !== false
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 h-5 text-[10px]"
                          : "bg-muted text-muted-foreground h-5 text-[10px]"
                      }
                    >
                      {e.is_active !== false ? "نشط" : "موقوف"}
                    </Badge>
                  }
                />
              </div>
            </div>
          ),
        },
        {
          key: "stats",
          title: "إحصائيات سريعة (آخر 30 يوم)",
          summary: `حضور ${Math.round(stats.attendanceRate * 100)}% • غياب ${stats.absentDays}`,
          children: (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-right">
              <StatCell label="أيام الحضور" value={stats.presentDays} tone="positive" />
              <StatCell label="أيام التأخير" value={stats.lateDays} tone="warning" />
              <StatCell label="أيام الغياب" value={stats.absentDays} tone="danger" />
              <StatCell label="ساعات إضافية" value={`${stats.totalOvertime.toFixed(1)} س`} tone="primary" />
              <StatCell label="نسبة الحضور" value={`${Math.round(stats.attendanceRate * 100)}%`} tone="positive" />
              <StatCell label="إجازات معتمدة" value={data.leaves.approvedCount} tone="primary" />
              <StatCell label="إجازات معلقة" value={data.leaves.pendingCount} tone="warning" />
              <StatCell label="قروض نشطة" value={activeLoans} tone="warning" />
            </div>
          ),
        },
      ]}
    />
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
    <div className="rounded-lg border bg-card p-2.5">
      <p className="text-[10.5px] text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-[15px] font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
