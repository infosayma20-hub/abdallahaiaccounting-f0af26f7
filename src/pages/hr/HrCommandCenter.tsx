import { useState } from "react";
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
  AlertCircle,
  Briefcase,
  CalendarClock,
  Banknote,
  ClipboardList,
  RefreshCw,
  Users,
  Building2,
  MapPin,
  Settings2,
  CalendarDays,
  Fingerprint,
  Clock,
  Plane,
  BarChart3,
  FileText,
  Wallet,
  Percent,
  ClipboardCheck,
  PlayCircle,
  FilePlus2,
  SlidersHorizontal,
} from "lucide-react";
import { HrSectionCard } from "./components/HrSectionCard";
import { HrActivitySummary } from "./components/HrActivitySummary";

const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
};

const ALL = "__all__";

export default function HrCommandCenter() {
  const [branchFilter, setBranchFilter] = useState<string>(ALL);
  const [deptFilter, setDeptFilter] = useState<string>(ALL);

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
      <div className="container max-w-7xl mx-auto p-4 md:p-8 space-y-8" dir="rtl">
        <Skeleton className="h-14 w-72" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[420px] rounded-3xl" />
          ))}
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

  const { totals, filters, pendingRequests } = data;
  const pendingCount = pendingRequests.leaves.length + pendingRequests.forms.length;

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-8 lg:p-10 space-y-8 md:space-y-10" dir="rtl">
      {/* Header + filters */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="text-right">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            لوحة الموارد البشرية
          </h1>
          <p className="text-base md:text-lg text-muted-foreground mt-1">
            ملخّص اليوم: حضور، طلبات، رواتب، تنبيهات
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isRefreshing && (
            <div className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              جاري التحديث...
            </div>
          )}
          {isRefreshError && !isRefreshing && (
            <div className="inline-flex h-9 items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              تعذر التحديث، يتم عرض آخر بيانات محفوظة
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => refetch()}>
                إعادة المحاولة
              </Button>
            </div>
          )}
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[170px] h-11 rounded-xl bg-card">
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
            <SelectTrigger className="w-[170px] h-11 rounded-xl bg-card">
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

      {/* ─── الأقسام الأربعة الرئيسية — الواجهة الوحيدة ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">
        <HrSectionCard
          to="/employees"
          title="التعريفات الأساسية"
          subtitle="إدارة البيانات الأساسية للموظفين والمنظمة"
          Icon={Briefcase}
          tone="indigo"
          badge={totals.active}
          actions={[
            { label: "قائمة الموظفين", to: "/employees", count: totals.total, Icon: Users },
            { label: "الأقسام والمسميات الوظيفية", to: "/hr/definitions", Icon: Building2 },
            { label: "أنواع الدوام والعطل الرسمية", to: "/hr/day-types", Icon: CalendarDays },
            { label: "إدارة الفروع", to: "/settings?section=branches", Icon: MapPin },
            { label: "الإعدادات العامة", to: "/hr/settings", Icon: Settings2 },
          ]}
        />
        <HrSectionCard
          to="/hr-attendance"
          title="الوقت والحضور"
          subtitle="تسجيل وإدارة الحضور والإجازات بسهولة"
          Icon={CalendarClock}
          tone="amber"
          badge={`${Math.round(totals.avgAttendanceRate * 100)}%`}
          actions={[
            { label: "لوحة الحضور اليومية", to: "/hr-attendance", Icon: CalendarDays },
            { label: "طلبات تعديل البصمة", to: "/employee-forms-management?type=correction_request", Icon: Fingerprint },
            { label: "إعدادات الورديات", to: "/hr/settings?tab=shifts", Icon: Clock },
            { label: "سجل الإجازات", to: "/leaves", Icon: Plane },
            { label: "تقارير الحضور", to: "/reports/hr-attendance", Icon: BarChart3 },
            { label: "ساعات دوام الفروع", to: "/reports/hr-branch-hours", Icon: BarChart3 },
          ]}
        />
        <HrSectionCard
          to="/employee-forms-management"
          title="الطلبات والحركات"
          subtitle="إدارة طلبات الموظفين وحركاتهم الوظيفية"
          Icon={ClipboardList}
          tone="emerald"
          badge={pendingCount > 0 ? pendingCount : null}
          actions={[
            { label: "الطلبات", to: "/employee-forms-management", Icon: ClipboardCheck, count: pendingRequests.forms.length },
            { label: "الإجازات", to: "/leaves", Icon: Plane, count: pendingRequests.leaves.length },
            { label: "السلف والقروض", to: "/advances", Icon: Wallet },
            { label: "التقييمات والملاحظات", to: "/hr-deductions", Icon: FileText },
            { label: "نماذج الموظفين", to: "/employee-forms-management", Icon: Users },
          ]}
        />
        <HrSectionCard
          to="/payroll"
          title="الرواتب والمالية"
          subtitle="إدارة الرواتب والمكافآت والمعاملات المالية"
          Icon={Banknote}
          tone="rose"
          badge={totals.totalPayrollThisMonth > 0 ? `₪${fmtShort(totals.totalPayrollThisMonth)}` : null}
          actions={[
            { label: "تشغيل الرواتب الشهرية", to: "/payroll", Icon: PlayCircle },
            { label: "مدخلات الراتب الشهري", to: "/payroll/inputs", Icon: FilePlus2 },
            { label: "إعدادات الرواتب", to: "/payroll-settings", Icon: SlidersHorizontal },
            { label: "تقرير تكلفة الموظفين", to: "/reports/hr-staff-cost", Icon: BarChart3 },
            { label: "البدلات والاستقطاعات", to: "/hr-deductions", Icon: Percent },
          ]}
        />
      </div>

      {/* ─── ملخص النشاطات اليومي ─── */}
      <HrActivitySummary />
    </div>
  );
}