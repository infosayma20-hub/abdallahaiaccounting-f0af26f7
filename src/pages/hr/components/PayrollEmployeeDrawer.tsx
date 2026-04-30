import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  Clock,
  CalendarDays,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Wallet,
  Loader2,
  ExternalLink,
  FileText,
  ChevronLeft,
  Lock,
  Plus,
  Minus,
  Equal,
  Calculator,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { useEmployee360 } from "@/hooks/hr/useEmployee360";
import { useEmployeeCostEngine } from "@/hooks/hr/useEmployeeCostEngine";
import { fmtCurrency } from "@/lib/malaki-payroll";
import { cn } from "@/lib/utils";

interface PayrollEmployeeDrawerProps {
  open: boolean;
  onClose: () => void;
  employeeId: string | null;
  employeeName?: string;
  payrollRecord?: any;
  month: number;
  year: number;
  onApprovePayment?: (recordId: string) => void;
  onViewPayslip?: (record: any) => void;
}

const months = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const dayStatusColor = (status: string) => {
  if (["present", "حاضر", "complete", "مكتمل"].includes(status))
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200";
  if (["late", "متأخر"].includes(status))
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200";
  if (["absent", "غائب"].includes(status))
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200";
  if (["incomplete", "ناقص"].includes(status))
    return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200";
  if (["annual_leave", "إجازة سنوية", "vacation", "إجازة", "sick_leave", "إجازة مرضية"].includes(status))
    return "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border-sky-200";
  return "bg-muted text-muted-foreground border-border";
};

const dayStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    present: "حاضر",
    complete: "مكتمل",
    late: "متأخر",
    absent: "غائب",
    incomplete: "ناقص",
    annual_leave: "إجازة سنوية",
    sick_leave: "إجازة مرضية",
    vacation: "إجازة",
  };
  return map[status] || status;
};

const formatTime = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return "—";
  }
};

const formatDate = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ar", { day: "2-digit", month: "2-digit", weekday: "short" });
  } catch {
    return iso;
  }
};

function KpiTile({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
}: {
  label: string;
  value: string | number;
  icon: any;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  hint?: string;
}) {
  const toneCls = {
    default: "text-foreground bg-muted/40",
    success: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
    warning: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
    danger: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
    info: "text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20",
  }[tone];
  return (
    <div className={cn("rounded-lg border border-border p-3", toneCls)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium opacity-80">{label}</span>
        <Icon className="h-3.5 w-3.5 opacity-70" />
      </div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] opacity-60 mt-0.5">{hint}</p>}
    </div>
  );
}

function MoneyRow({
  label,
  value,
  positive,
  bold,
  muted,
}: {
  label: string;
  value: number;
  positive?: boolean;
  bold?: boolean;
  muted?: boolean;
}) {
  if (!value && muted) return null;
  return (
    <div className={cn("flex items-center justify-between py-1.5 text-sm", bold && "font-bold pt-2 border-t border-border mt-1")}>
      <span className={cn("text-muted-foreground", bold && "text-foreground")}>{label}</span>
      <span
        className={cn(
          "tabular-nums font-medium",
          positive ? "text-emerald-600 dark:text-emerald-400" : value < 0 || (!positive && value > 0 && !bold) ? "" : "",
          positive === false && "text-red-600 dark:text-red-400",
          bold && "text-base"
        )}
      >
        {fmtCurrency(value)}
      </span>
    </div>
  );
}

export default function PayrollEmployeeDrawer({
  open,
  onClose,
  employeeId,
  employeeName,
  payrollRecord,
  month,
  year,
  onApprovePayment,
  onViewPayslip,
}: PayrollEmployeeDrawerProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useEmployee360(employeeId || undefined);
  const cost = useEmployeeCostEngine(data);

  // Filter attendance for the selected month/year only
  const monthAttendance = useMemo(() => {
    if (!data?.attendance.days) return [];
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    return data.attendance.days
      .filter((d: any) => (d.attendance_date || "").startsWith(ym))
      .sort((a: any, b: any) => (a.attendance_date < b.attendance_date ? -1 : 1));
  }, [data, month, year]);

  const monthEvents = useMemo(() => {
    if (!data?.attendance.events) return [];
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    return data.attendance.events.filter((e: any) =>
      (e.event_time || "").startsWith(ym)
    );
  }, [data, month, year]);

  // Build per-day check-in/check-out from events
  const dayEvents = useMemo(() => {
    const map: Record<string, { in?: string; out?: string }> = {};
    monthEvents.forEach((e: any) => {
      const date = (e.event_time || "").split("T")[0];
      if (!date) return;
      if (!map[date]) map[date] = {};
      if (e.event_type === "check_in" || e.event_type === "in") {
        if (!map[date].in || e.event_time < map[date].in!) map[date].in = e.event_time;
      } else if (e.event_type === "check_out" || e.event_type === "out") {
        if (!map[date].out || e.event_time > map[date].out!) map[date].out = e.event_time;
      }
    });
    return map;
  }, [monthEvents]);

  // Aggregate stats for the SELECTED month (more accurate than 30-day window)
  const monthStats = useMemo(() => {
    const stats = {
      workDays: 0,
      presentDays: 0,
      lateDays: 0,
      absentDays: 0,
      incompleteDays: 0,
      leaveDays: 0,
      totalHours: 0,
      overtimeHours: 0,
    };
    monthAttendance.forEach((d: any) => {
      stats.workDays++;
      const s = d.status;
      if (["present", "حاضر", "complete", "مكتمل"].includes(s)) stats.presentDays++;
      else if (["late", "متأخر"].includes(s)) {
        stats.presentDays++;
        stats.lateDays++;
      } else if (["absent", "غائب"].includes(s)) stats.absentDays++;
      else if (["incomplete", "ناقص"].includes(s)) stats.incompleteDays++;
      else if (["annual_leave", "إجازة سنوية", "sick_leave", "إجازة مرضية", "vacation", "إجازة"].includes(s))
        stats.leaveDays++;
      stats.totalHours += Number(d.total_hours || 0);
      stats.overtimeHours += Number(d.overtime_hours || 0);
    });
    return stats;
  }, [monthAttendance]);

  // Pending requests (forms) for this employee
  const pendingRequests = useMemo(() => {
    if (!data?.forms) return [];
    return data.forms.filter((f: any) =>
      ["pending", "قيد المراجعة", "معلقة"].includes(f.status)
    );
  }, [data]);

  const isPaid = payrollRecord?.is_paid;
  const isLocked = isPaid; // Phase 2 will add full Audit Log + unlock workflow

  // ===== Health Status (Smart Employee State) =====
  const healthStatus = useMemo(() => {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check incomplete days (missing check-out)
    if (monthStats.incompleteDays > 0) {
      issues.push(`${monthStats.incompleteDays} يوم بدون تسجيل خروج`);
    }
    // Check absent days
    if (monthStats.absentDays > 0) {
      warnings.push(`${monthStats.absentDays} يوم غياب`);
    }
    // Check pending requests
    if (pendingRequests.length > 0) {
      warnings.push(`${pendingRequests.length} طلب معلق بانتظار المراجعة`);
    }
    // Check missing payroll record
    if (!payrollRecord) {
      warnings.push("لم يتم احتساب راتب لهذا الشهر");
    }

    let level: "ready" | "review" | "issues" = "ready";
    if (issues.length > 0) level = "issues";
    else if (warnings.length > 0) level = "review";

    return { level, issues, warnings };
  }, [monthStats, pendingRequests, payrollRecord]);

  const healthMeta = {
    ready: {
      label: "جاهز للدفع",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400",
      Icon: ShieldCheck,
    },
    review: {
      label: "يحتاج مراجعة",
      cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
      Icon: AlertTriangle,
    },
    issues: {
      label: "فيه مشاكل بصمة",
      cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400",
      Icon: ShieldAlert,
    },
  }[healthStatus.level];

  // ===== Approval confirmation =====
  const [confirmOpen, setConfirmOpen] = useState(false);
  const handleApproveClick = () => {
    if (!payrollRecord || !onApprovePayment) return;
    // Always show confirmation (with check summary) before approving
    setConfirmOpen(true);
  };
  const handleConfirmApprove = () => {
    if (payrollRecord && onApprovePayment) onApprovePayment(payrollRecord.id);
    setConfirmOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-[640px] p-0 overflow-hidden flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <SheetHeader className="p-5 pb-3 border-b border-border bg-gradient-to-l from-primary/5 to-transparent">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg text-right truncate">
                {employeeName || data?.employee?.full_name || "موظف"}
              </SheetTitle>
              <SheetDescription className="text-right text-xs flex items-center gap-2 mt-1 flex-wrap">
                <span>{months[month - 1]} {year}</span>
                <span className="text-muted-foreground/50">•</span>
                <span>{data?.employee?.department || data?.employee?.job_title || "—"}</span>
                {payrollRecord && (
                  <>
                    <span className="text-muted-foreground/50">•</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] h-5",
                        isPaid
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400"
                          : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400"
                      )}
                    >
                      {isPaid ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 ml-1" /> مدفوع
                        </>
                      ) : (
                        "غير مدفوع"
                      )}
                    </Badge>
                    {isLocked && (
                      <Badge variant="outline" className="text-[10px] h-5 bg-slate-50 text-slate-600 border-slate-200">
                        <Lock className="h-3 w-3 ml-1" /> مقفل
                      </Badge>
                    )}
                  </>
                )}
                {!isPaid && (
                  <>
                    <span className="text-muted-foreground/50">•</span>
                    <Badge variant="outline" className={cn("text-[10px] h-5 gap-1", healthMeta.cls)}>
                      <healthMeta.Icon className="h-3 w-3" />
                      {healthMeta.label}
                    </Badge>
                  </>
                )}
              </SheetDescription>
            </div>
          </div>
          {!isPaid && (healthStatus.issues.length > 0 || healthStatus.warnings.length > 0) && (
            <div className="mt-3 rounded-md border border-border bg-background/50 p-2.5 space-y-1">
              {healthStatus.issues.map((m, i) => (
                <div key={`i-${i}`} className="flex items-center gap-2 text-[11px] text-red-700 dark:text-red-400">
                  <XCircle className="h-3 w-3 shrink-0" />
                  <span>{m}</span>
                </div>
              ))}
              {healthStatus.warnings.map((m, i) => (
                <div key={`w-${i}`} className="flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>{m}</span>
                </div>
              ))}
            </div>
          )}
        </SheetHeader>

        {/* Body */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <Tabs defaultValue="attendance" className="w-full" dir="rtl">
              <TabsList className="w-full rounded-none border-b border-border bg-muted/30 h-11 px-3 sticky top-0 z-10">
                <TabsTrigger value="attendance" className="text-xs gap-1.5 flex-1">
                  <Clock className="h-3.5 w-3.5" />
                  البصمات والساعات
                </TabsTrigger>
                <TabsTrigger value="payroll" className="text-xs gap-1.5 flex-1">
                  <Wallet className="h-3.5 w-3.5" />
                  تفصيل الراتب
                </TabsTrigger>
                <TabsTrigger value="requests" className="text-xs gap-1.5 flex-1">
                  <FileText className="h-3.5 w-3.5" />
                  الطلبات
                  {pendingRequests.length > 0 && (
                    <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px]">
                      {pendingRequests.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* ===== TAB 1: ATTENDANCE ===== */}
              <TabsContent value="attendance" className="p-4 space-y-4 mt-0">
                {/* KPI Grid */}
                <div className="grid grid-cols-3 gap-2">
                  <KpiTile
                    label="أيام العمل"
                    value={`${monthStats.presentDays}/${monthStats.workDays}`}
                    icon={CalendarDays}
                    tone="success"
                  />
                  <KpiTile
                    label="ساعات عادية"
                    value={monthStats.totalHours.toFixed(1)}
                    icon={Clock}
                    tone="info"
                    hint="ساعة"
                  />
                  <KpiTile
                    label="ساعات إضافية"
                    value={monthStats.overtimeHours.toFixed(1)}
                    icon={TrendingUp}
                    tone="success"
                    hint="ساعة"
                  />
                  <KpiTile
                    label="تأخير"
                    value={monthStats.lateDays}
                    icon={AlertTriangle}
                    tone={monthStats.lateDays > 0 ? "warning" : "default"}
                    hint="يوم"
                  />
                  <KpiTile
                    label="غياب"
                    value={monthStats.absentDays}
                    icon={XCircle}
                    tone={monthStats.absentDays > 0 ? "danger" : "default"}
                    hint="يوم"
                  />
                  <KpiTile
                    label="إجازات"
                    value={monthStats.leaveDays}
                    icon={CalendarDays}
                    tone="info"
                    hint="يوم"
                  />
                </div>

                {/* Daily attendance table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-foreground">
                      البصمات اليومية ({monthAttendance.length} يوم)
                    </h4>
                  </div>
                  <Card className="overflow-hidden p-0">
                    {monthAttendance.length === 0 ? (
                      <div className="p-6 text-center text-xs text-muted-foreground">
                        لا توجد بصمات لهذا الشهر
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40">
                            <tr>
                              <th className="text-right p-2 font-semibold text-muted-foreground">التاريخ</th>
                              <th className="text-center p-2 font-semibold text-muted-foreground">دخول</th>
                              <th className="text-center p-2 font-semibold text-muted-foreground">خروج</th>
                              <th className="text-center p-2 font-semibold text-muted-foreground">ساعات</th>
                              <th className="text-center p-2 font-semibold text-muted-foreground">إضافي</th>
                              <th className="text-center p-2 font-semibold text-muted-foreground">الحالة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {monthAttendance.map((d: any) => {
                              const ev = dayEvents[d.attendance_date] || {};
                              return (
                                <tr key={d.id} className="border-t border-border/50 hover:bg-muted/20">
                                  <td className="p-2 text-right">{formatDate(d.attendance_date)}</td>
                                  <td className="p-2 text-center tabular-nums text-muted-foreground">
                                    {formatTime(d.first_check_in || ev.in)}
                                  </td>
                                  <td className="p-2 text-center tabular-nums text-muted-foreground">
                                    {formatTime(d.last_check_out || ev.out)}
                                  </td>
                                  <td className="p-2 text-center tabular-nums font-medium">
                                    {Number(d.total_hours || 0).toFixed(1)}
                                  </td>
                                  <td className="p-2 text-center tabular-nums">
                                    {Number(d.overtime_hours || 0) > 0 ? (
                                      <span className="text-emerald-600 font-medium">
                                        {Number(d.overtime_hours).toFixed(1)}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground/50">—</span>
                                    )}
                                  </td>
                                  <td className="p-2 text-center">
                                    <Badge
                                      variant="outline"
                                      className={cn("text-[9px] h-4 px-1.5", dayStatusColor(d.status))}
                                    >
                                      {dayStatusLabel(d.status)}
                                    </Badge>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                </div>
              </TabsContent>

              {/* ===== TAB 2: PAYROLL DETAILS ===== */}
              <TabsContent value="payroll" className="p-4 space-y-3 mt-0">
                {payrollRecord ? (
                  <>
                    {/* ===== Salary Formula (How the number was calculated) ===== */}
                    <Card className="p-3 border-primary/20 bg-primary/[0.03]">
                      <div className="flex items-center gap-2 mb-2">
                        <Calculator className="h-3.5 w-3.5 text-primary" />
                        <h4 className="text-xs font-semibold text-foreground">معادلة احتساب الراتب</h4>
                      </div>
                      <div className="space-y-1 font-mono text-[11px] tabular-nums" dir="ltr">
                        <FormulaLine
                          op="="
                          label="راتب البصمة"
                          value={Number(payrollRecord.attendance_salary || payrollRecord.base_salary || 0)}
                        />
                        {Number(payrollRecord.total_allowances || 0) > 0 && (
                          <FormulaLine
                            op="+"
                            label={`البدلات (طعام/مواصلات/إداري/...)`}
                            value={Number(payrollRecord.total_allowances || 0)}
                            tone="positive"
                          />
                        )}
                        {Number(payrollRecord.total_deductions || 0) > 0 && (
                          <FormulaLine
                            op="-"
                            label="الخصومات (سُلف/قروض/مخالفات/...)"
                            value={Number(payrollRecord.total_deductions || 0)}
                            tone="negative"
                          />
                        )}
                        <Separator className="my-1" />
                        <FormulaLine
                          op="="
                          label="صافي الراتب"
                          value={Number(payrollRecord.net_salary || 0)}
                          bold
                        />
                      </div>
                    </Card>

                    <Card className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Plus className="h-3.5 w-3.5 text-emerald-600" />
                        <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          الإيرادات والبدلات
                        </h4>
                      </div>
                      <MoneyRow label="راتب البصمة" value={Number(payrollRecord.attendance_salary || payrollRecord.base_salary || 0)} />
                      <MoneyRow label="بدل طعام ومواصلات (صافي)" value={Number(payrollRecord.food_transport_net || 0)} muted />
                      <MoneyRow label="بدل إداري" value={Number(payrollRecord.admin_allowance || 0)} muted />
                      <MoneyRow label="بدل سنوي" value={Number(payrollRecord.annual_allowance || 0)} muted />
                      <MoneyRow label="بدل عائلة" value={Number(payrollRecord.family_allowance || 0)} muted />
                      <MoneyRow label="بدلات أخرى" value={Number(payrollRecord.other_allowances_val || 0)} muted />
                      <MoneyRow label="مكافأة حضور" value={Number(payrollRecord.attendance_bonus || 0)} muted />
                      <MoneyRow label="بدل خاص" value={Number(payrollRecord.special_allowance || 0)} muted />
                      <MoneyRow label="بدل عمل إضافي" value={Number(payrollRecord.extra_work_allowance || 0)} muted />
                      <MoneyRow label="استحقاقات" value={Number(payrollRecord.entitlements || 0)} muted />
                      <MoneyRow
                        label="إجمالي الإيرادات"
                        value={Number(payrollRecord.attendance_salary || 0) + Number(payrollRecord.total_allowances || 0)}
                        bold
                        positive
                      />
                    </Card>

                    <Card className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Minus className="h-3.5 w-3.5 text-red-600" />
                        <h4 className="text-xs font-semibold text-red-700 dark:text-red-400">
                          الخصومات والسُلف
                        </h4>
                      </div>
                      <MoneyRow label="رصيد سُلفة سابق" value={Number(payrollRecord.deduction_opening_balance || 0)} muted />
                      <MoneyRow label="قسط قرض" value={Number(payrollRecord.deduction_loan || 0)} muted />
                      <MoneyRow label="سُلفة جديدة" value={Number(payrollRecord.deduction_new_advance || 0)} muted />
                      <MoneyRow label="سُلف نقدية" value={Number(payrollRecord.deduction_cash_advance || 0)} muted />
                      <MoneyRow label="طعام جماعي" value={Number(payrollRecord.deduction_food_group || 0)} muted />
                      <MoneyRow label="طعام فردي" value={Number(payrollRecord.deduction_food_individual || 0)} muted />
                      <MoneyRow label="عجز نقدي" value={Number(payrollRecord.deduction_cash_shortage || 0)} muted />
                      <MoneyRow label="توصيل" value={Number(payrollRecord.deduction_delivery || 0)} muted />
                      <MoneyRow label="مشتريات" value={Number(payrollRecord.deduction_purchases || 0)} muted />
                      <MoneyRow label="مخالفات" value={Number(payrollRecord.deduction_violations || 0)} muted />
                      <MoneyRow label="خصومات أخرى" value={Number(payrollRecord.deduction_other || 0)} muted />
                      <MoneyRow
                        label="إجمالي الخصومات"
                        value={Number(payrollRecord.total_deductions || 0)}
                        bold
                        positive={false}
                      />
                    </Card>

                    <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">صافي الراتب</p>
                          <p className="text-2xl font-bold text-primary tabular-nums">
                            {fmtCurrency(Number(payrollRecord.net_salary || 0))}
                          </p>
                        </div>
                        <Wallet className="h-10 w-10 text-primary/30" />
                      </div>
                      {Number(payrollRecord.carry_over_balance || 0) > 0 && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-2 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          رصيد مرحّل للشهر القادم: {fmtCurrency(Number(payrollRecord.carry_over_balance))}
                        </p>
                      )}
                    </Card>
                  </>
                ) : (
                  <Card className="p-6 text-center">
                    <p className="text-sm text-muted-foreground mb-2">لم يتم احتساب راتب لهذا الشهر بعد</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      التكلفة المتوقعة بناءً على البصمات والبدلات الحالية:
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-right">
                      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3">
                        <p className="text-[10px] text-muted-foreground">إجمالي متوقع</p>
                        <p className="text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {fmtCurrency(cost.totalCost)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-primary/10 p-3">
                        <p className="text-[10px] text-muted-foreground">صافي متوقع</p>
                        <p className="text-base font-bold text-primary tabular-nums">
                          {fmtCurrency(cost.netExpectedSalary)}
                        </p>
                      </div>
                    </div>
                  </Card>
                )}
              </TabsContent>

              {/* ===== TAB 3: PENDING REQUESTS ===== */}
              <TabsContent value="requests" className="p-4 space-y-3 mt-0">
                {pendingRequests.length === 0 ? (
                  <Card className="p-6 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">لا توجد طلبات معلقة</p>
                  </Card>
                ) : (
                  pendingRequests.map((f: any) => (
                    <Card key={f.id} className="p-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{f.form_type || "طلب"}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(f.created_at).toLocaleDateString("ar")}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                          قيد المراجعة
                        </Badge>
                      </div>
                      {f.amount && (
                        <p className="text-xs text-muted-foreground">
                          المبلغ: <span className="font-medium tabular-nums">{fmtCurrency(Number(f.amount))}</span>
                        </p>
                      )}
                      {f.review_notes && (
                        <p className="text-[11px] text-muted-foreground mt-1">{f.review_notes}</p>
                      )}
                    </Card>
                  ))
                )}
                <p className="text-[10px] text-muted-foreground text-center pt-2">
                  للموافقة أو الرفض، انتقل إلى تاب "نماذج الموظفين"
                </p>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Footer Actions */}
        <Separator />
        <div className="p-3 bg-muted/20 flex items-center gap-2 flex-wrap">
          {payrollRecord && !isPaid && onApprovePayment && (
            <Button
              size="sm"
              className="flex-1 min-w-[140px] gap-1.5"
              onClick={() => onApprovePayment(payrollRecord.id)}
            >
              <CheckCircle2 className="h-4 w-4" />
              اعتماد ودفع الراتب
            </Button>
          )}
          {payrollRecord && onViewPayslip && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => onViewPayslip(payrollRecord)}
            >
              <FileText className="h-4 w-4" />
              قسيمة الراتب
            </Button>
          )}
          {employeeId && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => {
                onClose();
                navigate(`/hr/employee/${employeeId}`);
              }}
            >
              <ExternalLink className="h-4 w-4" />
              ملف الموظف الكامل
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
