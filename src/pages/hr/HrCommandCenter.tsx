import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHrCommandCenter } from "@/hooks/hr/useHrCommandCenter";
import { Card } from "@/components/ui/card";
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
  Wallet,
  Clock,
  FileText,
  BarChart3,
  AlertCircle,
  Briefcase,
  CalendarClock,
  Banknote,
  ClipboardList,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { HrKpiCard } from "./components/HrKpiCard";
import { HrAttendanceToday } from "./components/HrAttendanceToday";
import { HrRequestsPanel } from "./components/HrRequestsPanel";
import { HrCharts } from "./components/HrCharts";
import { HrSectionCard } from "./components/HrSectionCard";

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
  const [showSummary, setShowSummary] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("hr:summary:hidden") !== "1";
  });
  const toggleSummary = () => {
    setShowSummary((v) => {
      const next = !v;
      try {
        localStorage.setItem("hr:summary:hidden", next ? "0" : "1");
      } catch {}
      return next;
    });
  };

  const {
    data,
    error,
    refetch,
    isInitialLoading,
    isRefreshing,
    isRefreshError,
    showFatalError,
  } = useHrCommandCenter({
    branchId: branchFilter === ALL ? null : branchFilter,
    department: deptFilter === ALL ? null : deptFilter,
  });

  if (isInitialLoading) {
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

  if (showFatalError || !data) {
    return (
      <div className="container max-w-3xl mx-auto p-6" dir="rtl">
        <Card className="p-8 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
          <h2 className="text-lg font-bold mb-2">تعذر تحميل لوحة الموارد البشرية</h2>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "حدث خطأ في جلب البيانات."}
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
            إعادة المحاولة
          </Button>
        </Card>
      </div>
    );
  }

  const { totals, employees, filters, pendingRequests, charts, attendanceToday } = data;
  const pendingCount = pendingRequests.leaves.length + pendingRequests.forms.length;

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="text-right">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">
            لوحة الموارد البشرية
          </h1>
          <p className="text-sm text-muted-foreground">
            ملخّص اليوم: حضور، طلبات، رواتب، تنبيهات
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isRefreshing && (
            <div className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              جاري التحديث...
            </div>
          )}
          {isRefreshError && !isRefreshing && (
            <div className="inline-flex h-8 items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              تعذر التحديث، يتم عرض آخر بيانات محفوظة
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => refetch()}>
                إعادة المحاولة
              </Button>
            </div>
          )}
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
      </div>

      {/* ─── الأقسام الأربعة الرئيسية (الواجهة الأساسية) ─── */}
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <HrSectionCard
            to="/employees"
            title="التعريفات الأساسية"
            subtitle="الموظفون والأقسام والفروع"
            Icon={Briefcase}
            tone="indigo"
            badge={totals.active}
            actions={[
              { label: "قائمة الموظفين", to: "/employees", count: totals.total },
              { label: "الأقسام والمسميات الوظيفية", to: "/hr/definitions" },
              { label: "أنواع الأيام والعطل الرسمية", to: "/hr/day-types" },
              { label: "إدارة الفروع", to: "/settings?section=branches" },
            ]}
          />
          <HrSectionCard
            to="/hr-attendance"
            title="الوقت والحضور"
            subtitle="ورديات، بصمات، إجازات رسمية"
            Icon={CalendarClock}
            tone="amber"
            badge={`${Math.round(totals.avgAttendanceRate * 100)}%`}
            actions={[
              { label: "لوحة الحضور اليومية", to: "/hr-attendance" },
              { label: "طلبات تصحيح البصمة", to: "/employee-forms-management?type=correction_request" },
              { label: "إعدادات الورديات", to: "/hr/settings?tab=shifts" },
            ]}
          />
          <HrSectionCard
            to="/employee-forms-management"
            title="الطلبات والحركات"
            subtitle="إجازات، سلف، خصومات، علاوات"
            Icon={ClipboardList}
            tone="emerald"
            badge={pendingCount > 0 ? pendingCount : null}
            actions={[
              { label: "الإجازات", to: "/leaves", count: pendingRequests.leaves.length },
              { label: "السلف والقروض", to: "/advances" },
              { label: "الخصومات والعلاوات", to: "/hr-deductions" },
              { label: "نماذج الموظفين", to: "/employee-forms-management", count: pendingRequests.forms.length },
            ]}
          />
          <HrSectionCard
            to="/payroll"
            title="الرواتب والمالية"
            subtitle="مدخلات، احتساب، صرف، تقارير"
            Icon={Banknote}
            tone="rose"
            badge={totals.totalPayrollThisMonth > 0 ? `₪${fmtShort(totals.totalPayrollThisMonth)}` : null}
            actions={[
              { label: "تشغيل الرواتب الشهرية", to: "/payroll" },
              { label: "مدخلات الراتب الشهري", to: "/payroll/inputs" },
              { label: "إعدادات الرواتب", to: "/payroll-settings" },
              { label: "تقرير تكلفة الموظفين", to: "/reports/hr-staff-cost" },
            ]}
          />
        </div>
      </div>

      {/* ─── KPIs مختصرة ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <HrKpiCard
          label="إجمالي الموظفين"
          value={fmtShort(totals.total)}
          hint={`${totals.active} نشط`}
          Icon={Users}
          tone="primary"
          onClick={() => navigate("/employees")}
        />
        <HrKpiCard
          label="نسبة الحضور"
          value={`${Math.round(totals.avgAttendanceRate * 100)}%`}
          hint={`متوسط تأخير ${totals.avgDelayMinutes} د`}
          Icon={Clock}
          tone={totals.avgAttendanceRate < 0.8 ? "warning" : "positive"}
          onClick={() => navigate("/hr-attendance")}
        />
        <HrKpiCard
          label="بصمات غير مكتملة"
          value={fmtShort(totals.incompletePunchesToday)}
          hint={totals.incompletePunchesToday > 0 ? "دخول بدون خروج اليوم" : "كل البصمات مكتملة"}
          Icon={AlertTriangle}
          tone={totals.incompletePunchesToday > 0 ? "warning" : "positive"}
          onClick={() => navigate("/hr-attendance?filter=incomplete")}
        />
        <HrKpiCard
          label="طلبات معلقة"
          value={fmtShort(pendingCount)}
          hint={`${pendingRequests.leaves.length} إجازات · ${pendingRequests.forms.length} نماذج`}
          Icon={FileText}
          tone={pendingCount > 0 ? "warning" : "neutral"}
          onClick={() => navigate("/employee-forms-management")}
        />
        <HrKpiCard
          label="رواتب هذا الشهر"
          value={`₪${fmtShort(totals.totalPayrollThisMonth)}`}
          hint={`متوسط ₪${fmtShort(totals.avgCostPerEmployee)} / موظف`}
          Icon={Wallet}
          tone="primary"
          onClick={() => navigate("/payroll")}
        />
      </div>

      {/* ─── ملخص اليوم — قسم ثابت ─── */}
      <div className="border-t pt-4 space-y-5">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSummary}
            className="h-8 gap-1 text-xs"
          >
            {showSummary ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                إخفاء
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                عرض
              </>
            )}
          </Button>
          <h2 className="text-sm font-semibold text-foreground text-right">
            ملخص اليوم
          </h2>
        </div>

        {showSummary && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <HrAttendanceToday employees={employees} attendanceToday={attendanceToday} />
              <HrRequestsPanel
                pendingRequests={pendingRequests}
                employees={employees.map((e) => ({ id: e.id, name: e.name, branch: e.branch }))}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 text-right flex items-center justify-end gap-2">
                <BarChart3 className="h-4 w-4" />
                التحليلات
              </h3>
              <HrCharts charts={charts} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
