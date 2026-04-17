import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHrCommandCenter } from "@/hooks/hr/useHrCommandCenter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Users,
  UserCheck,
  Wallet,
  Clock,
  ShieldAlert,
  FileText,
  Receipt,
  HandCoins,
  TrendingUp,
  Building2,
  CalendarDays,
  CalculatorIcon,
  BarChart3,
  AlertCircle,
} from "lucide-react";
import { HrKpiCard } from "./components/HrKpiCard";
import { HrRiskPanel } from "./components/HrRiskPanel";
import { HrAttendanceToday } from "./components/HrAttendanceToday";
import { HrRequestsPanel } from "./components/HrRequestsPanel";
import { HrCharts } from "./components/HrCharts";

const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(v);
};

const ALL = "__all__";

export default function HrCommandCenter() {
  const navigate = useNavigate();
  const [branchFilter, setBranchFilter] = useState<string>(ALL);
  const [deptFilter, setDeptFilter] = useState<string>(ALL);

  const { data, isLoading, isError, error } = useHrCommandCenter({
    branchId: branchFilter === ALL ? null : branchFilter,
    department: deptFilter === ALL ? null : deptFilter,
  });

  if (isLoading) {
    return (
      <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-4" dir="rtl">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container max-w-3xl mx-auto p-6" dir="rtl">
        <Card className="p-8 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-rose-500" />
          <h2 className="text-lg font-bold mb-2">تعذر تحميل لوحة الموارد البشرية</h2>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "حدث خطأ في جلب البيانات."}
          </p>
        </Card>
      </div>
    );
  }

  const { totals, employees, filters, pendingRequests, charts } = data;

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="القسم" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>كل الأقسام</SelectItem>
              {filters.departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="الفرع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>كل الفروع</SelectItem>
              {filters.branches.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-right">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            مركز قيادة الموارد البشرية
          </h1>
          <p className="text-sm text-muted-foreground">
            رؤية تنفيذية شاملة للموظفين والتكاليف والمخاطر
          </p>
        </div>
      </div>

      {/* TOP KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <HrKpiCard
          label="إجمالي الموظفين"
          value={fmtShort(totals.total)}
          hint={`${totals.active} نشط · ${totals.inactive} موقوف`}
          Icon={Users}
          tone="primary"
          onClick={() => navigate("/employees")}
        />
        <HrKpiCard
          label="موظفون نشطون"
          value={fmtShort(totals.active)}
          hint={`من أصل ${totals.total}`}
          Icon={UserCheck}
          tone="positive"
        />
        <HrKpiCard
          label="التكلفة الشهرية"
          value={`₪${fmtShort(totals.totalMonthlyCost)}`}
          hint={`متوسط ₪${fmtShort(totals.avgCostPerEmployee)} / موظف`}
          Icon={Wallet}
          tone="primary"
        />
        <HrKpiCard
          label="متوسط التأخير"
          value={`${totals.avgDelayMinutes} د`}
          hint={`نسبة حضور ${Math.round(totals.avgAttendanceRate * 100)}%`}
          Icon={Clock}
          tone={totals.avgDelayMinutes > 30 ? "warning" : "neutral"}
        />
        <HrKpiCard
          label="موظفون عاليو الخطر"
          value={fmtShort(totals.highRiskCount)}
          hint={`${totals.mediumRiskCount} متوسط الخطر`}
          Icon={ShieldAlert}
          tone={totals.highRiskCount > 0 ? "danger" : "positive"}
        />
        <HrKpiCard
          label="طلبات معلقة"
          value={fmtShort(pendingRequests.leaves.length + pendingRequests.forms.length)}
          hint={`${pendingRequests.leaves.length} إجازات · ${pendingRequests.forms.length} نماذج`}
          Icon={FileText}
          tone={pendingRequests.leaves.length + pendingRequests.forms.length > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* FINANCIAL OVERVIEW */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 text-right">
          النظرة المالية
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <HrKpiCard
            label="إجمالي الرواتب — هذا الشهر"
            value={`₪${fmtShort(totals.totalPayrollThisMonth)}`}
            Icon={Wallet}
            tone="primary"
          />
          <HrKpiCard
            label="إجمالي الخصومات"
            value={`₪${fmtShort(totals.totalDeductionsThisMonth)}`}
            Icon={Receipt}
            tone={totals.totalDeductionsThisMonth > 0 ? "danger" : "neutral"}
          />
          <HrKpiCard
            label="القروض المستحقة"
            value={`₪${fmtShort(totals.totalLoansOutstanding)}`}
            Icon={HandCoins}
            tone={totals.totalLoansOutstanding > 0 ? "warning" : "neutral"}
          />
          <HrKpiCard
            label="متوسط التكلفة / موظف"
            value={`₪${fmtShort(totals.avgCostPerEmployee)}`}
            Icon={TrendingUp}
            tone="neutral"
          />
        </div>
      </div>

      {/* MAIN GRID: Risk + Attendance Today */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HrRiskPanel employees={employees} />
        <HrAttendanceToday employees={employees} />
      </div>

      {/* Requests + Quick Access */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <HrRequestsPanel
            pendingRequests={pendingRequests}
            employees={employees.map((e) => ({ id: e.id, name: e.name }))}
          />
        </div>
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-right mb-3">الوصول السريع</h3>
            <QuickButton Icon={Users} label="قائمة الموظفين" onClick={() => navigate("/employees")} />
            <QuickButton
              Icon={CalculatorIcon}
              label="تشغيل الرواتب"
              onClick={() => navigate("/payroll")}
              variant="default"
            />
            <QuickButton
              Icon={Clock}
              label="لوحة الحضور"
              onClick={() => navigate("/hr-attendance")}
            />
            <QuickButton Icon={CalendarDays} label="إدارة الإجازات" onClick={() => navigate("/leaves")} />
            <QuickButton Icon={HandCoins} label="القروض" onClick={() => navigate("/loans")} />
            <QuickButton Icon={Receipt} label="الخصومات" onClick={() => navigate("/hr-deductions")} />
            <QuickButton Icon={FileText} label="نماذج الموظفين" onClick={() => navigate("/employee-forms-management")} />
            <QuickButton
              Icon={Building2}
              label="مدخلات الراتب الشهرية"
              onClick={() => navigate("/payroll/inputs")}
            />
          </CardContent>
        </Card>
      </div>

      {/* CHARTS */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 text-right flex items-center justify-end gap-2">
          <BarChart3 className="h-4 w-4" />
          التحليلات
        </h2>
        <HrCharts charts={charts} />
      </div>
    </div>
  );
}

function QuickButton({
  Icon,
  label,
  onClick,
  variant = "outline",
}: {
  Icon: typeof Users;
  label: string;
  onClick: () => void;
  variant?: "outline" | "default";
}) {
  return (
    <Button
      variant={variant}
      size="sm"
      className="w-full justify-between gap-2 h-9"
      onClick={onClick}
    >
      <span className="text-xs">{label}</span>
      <Icon className="h-4 w-4" />
    </Button>
  );
}
