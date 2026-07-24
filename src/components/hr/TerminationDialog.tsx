import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Calculator, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateTermination, formatCurrency } from "@/lib/hr-utils";

type TerminationEmployee = {
  id: string;
  full_name: string;
  start_date: string;
  base_salary: number;
  salary_type?: string | null;
  hourly_rate?: number | null;
  work_days_per_week?: number | null;
  work_hours_per_day?: number | null;
  annual_leave_balance?: number | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  employee: TerminationEmployee | null;
  userId: string;
  onSuccess: () => void;
}

type SettlementContext = {
  attendanceDays: number;
  attendanceHours: number;
  currentMonthSalary: number;
  estimatedMonthlySalary: number;
  salarySource: string;
  currentSalarySource: string;
};

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const monthStartFor = (date: string) => `${date.slice(0, 7)}-01`;

const monthDaysFor = (date: string) => {
  const parsed = new Date(date);
  return new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0).getDate();
};

const isHourlySalary = (employee: TerminationEmployee) => String(employee.salary_type || "").includes("ساعة");

const pickPositive = (...values: Array<number | null | undefined>) => {
  for (const value of values) {
    const numericValue = Number(value) || 0;
    if (numericValue > 0) return numericValue;
  }
  return 0;
};

export default function TerminationDialog({ open, onClose, employee, userId, onSuccess }: Props) {
  const [termDate, setTermDate] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("");
  const [unpaidAdvances, setUnpaidAdvances] = useState(0);
  const [monthlySalary, setMonthlySalary] = useState<number>(Number(employee?.base_salary) || 0);
  const [salaryEdited, setSalaryEdited] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [context, setContext] = useState<SettlementContext>({
    attendanceDays: 0,
    attendanceHours: 0,
    currentMonthSalary: 0,
    estimatedMonthlySalary: 0,
    salarySource: "غير محدد",
    currentSalarySource: "تقويم الشهر",
  });
  const [saving, setSaving] = useState(false);
  const [calculated, setCalculated] = useState<ReturnType<typeof calculateTermination> | null>(null);

  useEffect(() => {
    if (!open || !employee) return;

    setReason("");
    setCalculated(null);
    setSalaryEdited(false);
    setMonthlySalary(Number(employee.base_salary) || 0);
    setUnpaidAdvances(0);
  }, [employee?.id, open]);

  useEffect(() => {
    if (!open || !employee) return;

    let ignore = false;
    const loadSettlementContext = async () => {
      setLoadingContext(true);
      const start = monthStartFor(termDate);
      const sb: any = supabase;

      const [profileRes, attendanceRes, payrollRes, advancesRes, loansRes, installmentsRes] = await Promise.all([
        sb
          .from("employee_payroll_profile")
          .select("basic_salary, effective_from")
          .eq("employee_id", employee.id)
          .lte("effective_from", termDate)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb
          .from("attendance_days")
          .select("attendance_date, total_hours, status")
          .eq("employee_id", employee.id)
          .gte("attendance_date", start)
          .lte("attendance_date", termDate),
        sb
          .from("employee_payroll")
          .select("base_salary, net_salary, working_days, working_hours, status")
          .eq("employee_id", employee.id)
          .eq("period_year", Number(termDate.slice(0, 4)))
          .eq("period_month", Number(termDate.slice(5, 7)))
          .maybeSingle(),
        sb
          .from("employee_advances")
          .select("id, amount, status")
          .eq("employee_id", employee.id),
        sb
          .from("employee_loans")
          .select("remaining_amount, status")
          .eq("employee_id", employee.id),
        sb
          .from("employee_advance_installments")
          .select("advance_id, amount, status")
          .eq("employee_id", employee.id),
      ]);

      if (ignore) return;

      if (profileRes.error) console.warn("employee_payroll_profile", profileRes.error.message);
      if (attendanceRes.error) console.warn("attendance_days", attendanceRes.error.message);
      if (payrollRes.error) console.warn("employee_payroll", payrollRes.error.message);
      if (advancesRes.error) console.warn("employee_advances", advancesRes.error.message);
      if (loansRes.error) console.warn("employee_loans", loansRes.error.message);

      const hourlyRate = Number(employee.hourly_rate) || 0;
      const workDaysPerWeek = Number(employee.work_days_per_week) || 6;
      const workHoursPerDay = Number(employee.work_hours_per_day) || 8;
      const estimatedFromHourly = hourlyRate > 0 ? round2(hourlyRate * workHoursPerDay * (workDaysPerWeek * 52 / 12)) : 0;
      const profileSalary = Number(profileRes.data?.basic_salary) || 0;
      const payrollSalary = Number(payrollRes.data?.base_salary) || 0;
      const employeeSalary = Number(employee.base_salary) || 0;
      const resolvedMonthlySalary = pickPositive(employeeSalary, profileSalary, payrollSalary, estimatedFromHourly);
      const salarySource = employeeSalary > 0
        ? "ملف الموظف"
        : profileSalary > 0
          ? "ملف الرواتب"
          : payrollSalary > 0
            ? "كشف الشهر"
            : estimatedFromHourly > 0
              ? "تقدير من سعر الساعة"
              : "غير محدد";

      const attendanceRows = (attendanceRes.data || []) as Array<{ total_hours?: number | null; status?: string | null }>;
      const attendanceHours = round2(attendanceRows.reduce((sum, row) => sum + (Number(row.total_hours) || 0), 0));
      const attendanceDays = attendanceRows.filter((row) => {
        const status = String(row.status || "");
        return (Number(row.total_hours) || 0) > 0 || ["present", "late", "incomplete", "حاضر"].includes(status);
      }).length;
      const shouldUseHourlyAttendance = hourlyRate > 0 && (isHourlySalary(employee) || employeeSalary <= 0);
      const attendanceBasedSalary = shouldUseHourlyAttendance
        ? round2(attendanceHours * hourlyRate)
        : resolvedMonthlySalary > 0 && attendanceDays > 0
          ? round2((resolvedMonthlySalary / monthDaysFor(termDate)) * attendanceDays)
          : 0;
      const currentSalarySource = attendanceBasedSalary > 0
        ? shouldUseHourlyAttendance
          ? "الحضور × سعر الساعة"
          : "أيام الحضور في شهر الإنهاء"
        : "تقويم الشهر حتى تاريخ الإنهاء";

      const activeAdvanceStatuses = new Set(["approved", "paid", "صرف", "معتمد", "معتمدة"]);
      const closedLoanStatuses = new Set(["paid", "closed", "cancelled", "rejected", "ملغي", "مغلق", "مسدد"]);
      const paidInstallmentStatuses = new Set(["paid", "deducted", "مسدد", "مدفوع", "مخصوم"]);
      const paidPerAdvance = new Map<string, number>();
      ((installmentsRes.data || []) as Array<{ advance_id?: string | null; amount?: number | null; status?: string | null }>).forEach((inst) => {
        const id = String(inst.advance_id || "");
        if (!id) return;
        if (inst.status && !paidInstallmentStatuses.has(String(inst.status))) return;
        paidPerAdvance.set(id, (paidPerAdvance.get(id) || 0) + (Number(inst.amount) || 0));
      });
      const advancesTotal = ((advancesRes.data || []) as Array<{ id?: string | null; amount?: number | null; status?: string | null }>).reduce((sum, advance) => {
        const status = String(advance.status || "");
        if (status && !activeAdvanceStatuses.has(status)) return sum;
        const gross = Number(advance.amount) || 0;
        const paid = paidPerAdvance.get(String(advance.id || "")) || 0;
        const remaining = Math.max(0, gross - paid);
        return sum + remaining;
      }, 0);
      const loansTotal = ((loansRes.data || []) as Array<{ remaining_amount?: number | null; status?: string | null }>).reduce((sum, loan) => {
        const status = String(loan.status || "");
        if (status && closedLoanStatuses.has(status)) return sum;
        return sum + (Number(loan.remaining_amount) || 0);
      }, 0);

      setContext({
        attendanceDays,
        attendanceHours,
        currentMonthSalary: attendanceBasedSalary,
        estimatedMonthlySalary: resolvedMonthlySalary,
        salarySource,
        currentSalarySource,
      });

      if (!salaryEdited) setMonthlySalary(round2(resolvedMonthlySalary));
      setUnpaidAdvances(round2(advancesTotal + loansTotal));
      setCalculated(null);
      setLoadingContext(false);
    };

    loadSettlementContext().catch((error) => {
      if (!ignore) {
        console.error(error);
        setLoadingContext(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, [employee, open, salaryEdited, termDate]);

  if (!employee) return null;

  const handleCalculate = () => {
    const salaryForSettlement = Number(monthlySalary) || 0;
    if (salaryForSettlement <= 0 && context.currentMonthSalary <= 0) {
      toast.error("لا يوجد راتب أو حضور محسوب لهذا الموظف");
      return;
    }
    // Recompute the current-month salary against the (possibly edited) monthly salary
    // so severance base and current-month base stay consistent.
    let currentMonthOverride: number | undefined;
    const hourlyRate = Number(employee.hourly_rate) || 0;
    const useHourly = hourlyRate > 0 && (isHourlySalary(employee) || salaryForSettlement <= 0);
    if (useHourly && context.attendanceHours > 0) {
      currentMonthOverride = round2(context.attendanceHours * hourlyRate);
    } else if (salaryForSettlement > 0 && context.attendanceDays > 0) {
      currentMonthOverride = round2((salaryForSettlement / monthDaysFor(termDate)) * context.attendanceDays);
    } else if (context.currentMonthSalary > 0) {
      currentMonthOverride = context.currentMonthSalary;
    }
    const result = calculateTermination(
      employee.start_date,
      termDate,
      salaryForSettlement,
      Number(employee.annual_leave_balance) || 0,
      unpaidAdvances,
      currentMonthOverride !== undefined ? { currentMonthSalary: currentMonthOverride } : undefined
    );
    setCalculated(result);
  };

  const handleSave = async () => {
    if (!calculated) return;
    setSaving(true);

    // Create termination record
    const { error: termError } = await supabase.from("termination_records").insert({
      user_id: userId,
      employee_id: employee.id,
      termination_date: termDate,
      termination_reason: reason,
      years_worked: calculated.yearsWorked,
      severance_pay: calculated.severancePay,
      unused_leave_pay: calculated.unusedLeavePay,
      current_month_salary: calculated.currentMonthSalary,
      advance_balance: calculated.advanceBalance,
      total_dues: calculated.totalDues,
    } as any);

    if (termError) {
      toast.error(termError.message);
      setSaving(false);
      return;
    }

    // Mark employee as terminated
    await supabase.from("employees").update({
      is_active: false,
      is_terminated: true,
      terminated_at: termDate,
      termination_reason: reason,
    } as any).eq("id", employee.id);

    toast.success("تم إنهاء خدمة الموظف وحساب المستحقات");
    setSaving(false);
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            إنهاء خدمة: {employee.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">الراتب الشهري (₪)</label>
            <Input type="number" step="0.01" value={monthlySalary}
              onChange={e => { setMonthlySalary(Number(e.target.value)); setSalaryEdited(true); setCalculated(null); }} />
            <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              {loadingContext && <Loader2 className="h-3 w-3 animate-spin" />}
              مصدر الراتب: {context.salarySource}
            </div>
            {(!Number(monthlySalary) || Number(monthlySalary) <= 0) && context.currentMonthSalary <= 0 && (
              <div className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                الموظف لا يملك راتباً أو حضوراً محسوباً — أدخل قيمة الراتب للاحتساب
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">تاريخ الإنهاء</label>
            <Input type="date" value={termDate} onChange={e => { setTermDate(e.target.value); setCalculated(null); }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">السبب</label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="سبب إنهاء الخدمة..." rows={2} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">سلف غير مسددة (₪)</label>
            <Input type="number" value={unpaidAdvances} onChange={e => { setUnpaidAdvances(Number(e.target.value)); setCalculated(null); }} />
          </div>

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <div className="flex justify-between gap-3"><span>حضور شهر الإنهاء</span><span className="font-medium text-foreground">{context.attendanceDays} يوم / {context.attendanceHours.toFixed(2)} ساعة</span></div>
            <div className="flex justify-between gap-3"><span>راتب الشهر الحالي</span><span className="font-medium text-foreground">{formatCurrency(context.currentMonthSalary)}</span></div>
            <div className="flex justify-between gap-3"><span>طريقة الاحتساب</span><span className="font-medium text-foreground">{context.currentSalarySource}</span></div>
          </div>

          <Button variant="outline" onClick={handleCalculate} disabled={loadingContext} className="w-full gap-2">
            {loadingContext ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            حساب المستحقات
          </Button>

          {calculated && (
            <div className="bg-muted/50 rounded-md p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">سنوات الخدمة</span><span className="font-bold">{calculated.yearsWorked.toFixed(1)} سنة</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">مكافأة نهاية الخدمة</span><span className="font-bold text-primary">{formatCurrency(calculated.severancePay)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">إجازات مستحقة</span><span className="font-bold">{formatCurrency(calculated.unusedLeavePay)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">راتب الشهر الحالي</span><span className="font-bold">{formatCurrency(calculated.currentMonthSalary)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">سلف مستحقة</span><span className="font-bold text-destructive">- {formatCurrency(calculated.advanceBalance)}</span></div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-bold">إجمالي المستحقات</span>
                <span className="font-bold text-primary text-lg">{formatCurrency(calculated.totalDues)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="destructive" onClick={handleSave} disabled={!calculated || saving}>
            {saving ? "جاري الحفظ..." : "تأكيد إنهاء الخدمة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
