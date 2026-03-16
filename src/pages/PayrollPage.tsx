import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Download, DollarSign, TrendingDown, Wallet, Users, Loader2, Eye, CheckCircle2, ClipboardEdit, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import MalakiPayslipDialog from "@/components/hr/MalakiPayslipDialog";
import { calculateMalakiPayslip, fmtCurrency, type MalakiEmployee, type MalakiMonthInput, type MalakiPayslip } from "@/lib/malaki-payroll";
import * as XLSX from "xlsx";

const months = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

const PayrollPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [slipOpen, setSlipOpen] = useState(false);
  const [selectedSlipData, setSelectedSlipData] = useState<{ slip: MalakiPayslip; emp: any } | null>(null);
  const [runningPayroll, setRunningPayroll] = useState(false);

  const { data: employees, isLoading: loadingEmp } = useQuery({
    queryKey: ["payroll-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").eq("is_active", true).order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: payrollRecords, isLoading: loadingPayroll } = useQuery({
    queryKey: ["payroll-records", selectedMonth, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_payroll")
        .select("*, employees(full_name, department, job_title)")
        .eq("period_month", selectedMonth)
        .eq("period_year", selectedYear)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: monthInputs } = useQuery({
    queryKey: ["payroll-inputs", selectedMonth, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_payroll_inputs")
        .select("*")
        .eq("year", selectedYear)
        .eq("month", selectedMonth);
      if (error) throw error;
      return data || [];
    },
  });

  const summary = useMemo(() => {
    if (!payrollRecords?.length) return { totalBase: 0, totalAllowances: 0, totalDeductions: 0, totalNet: 0, count: 0, paidCount: 0 };
    return payrollRecords.reduce((acc: any, p: any) => ({
      totalBase: acc.totalBase + Number(p.attendance_salary || p.base_salary || 0),
      totalAllowances: acc.totalAllowances + Number(p.total_allowances),
      totalDeductions: acc.totalDeductions + Number(p.total_deductions),
      totalNet: acc.totalNet + Number(p.net_salary),
      count: acc.count + 1,
      paidCount: acc.paidCount + (p.is_paid ? 1 : 0),
    }), { totalBase: 0, totalAllowances: 0, totalDeductions: 0, totalNet: 0, count: 0, paidCount: 0 });
  }, [payrollRecords]);

  const pendingEmployees = useMemo(() => {
    if (!employees || !monthInputs) return [];
    const processedIds = new Set((payrollRecords || []).map((p: any) => p.employee_id));
    const inputIds = new Set(monthInputs.map((i: any) => i.employee_id));
    return employees.filter((e: any) => !processedIds.has(e.id) && inputIds.has(e.id));
  }, [employees, payrollRecords, monthInputs]);

  const toMalakiEmp = (emp: any): MalakiEmployee => ({
    id: emp.id,
    full_name: emp.full_name,
    start_date: emp.start_date,
    hourly_rate: Number(emp.hourly_rate) || 9.6,
    base_salary: Number(emp.base_salary) || 0,
    admin_allowance: Number(emp.admin_allowance) || 0,
    transfer_allowance: Number(emp.transfer_allowance) || 0,
    food_transport_override: emp.food_transport_override != null ? Number(emp.food_transport_override) : null,
    wives_count: Number(emp.wives_count) || 0,
    children_count: Number(emp.children_count) || 0,
    other_allowances: Number(emp.other_allowances) || 0,
    special_work_allowance: Number(emp.special_work_allowance) || 0,
    annual_leave_balance: Number(emp.annual_leave_balance) || 0,
    annual_leave_days: Number(emp.annual_leave_days) || 14,
    is_terminated: emp.is_terminated || false,
    terminated_at: emp.terminated_at,
  });

  const toMalakiInput = (inp: any): MalakiMonthInput => ({
    working_days: inp.working_days || 0,
    working_hours: inp.working_hours || 0,
    overtime_hours: inp.overtime_hours || 0,
    holiday_overtime_hours: inp.holiday_overtime_hours || 0,
    vacation_hours: inp.vacation_hours || 0,
    annual_leave_days: inp.annual_leave_days || 0,
    sick_leave_days: inp.sick_leave_days || 0,
    opening_advance_balance: inp.opening_advance_balance || 0,
    loan_installment: inp.loan_installment || 0,
    new_advance: inp.new_advance || 0,
    cash_advances: inp.cash_advances || 0,
    food_total: inp.food_total || 0,
    food_individual: inp.food_individual || 0,
    cash_shortage: inp.cash_shortage || 0,
    cash_surplus: inp.cash_surplus || 0,
    delivery: inp.delivery || 0,
    purchases: inp.purchases || 0,
    other_deduction: inp.other_deduction || 0,
    violations: inp.violations || 0,
    deduction_notes: inp.deduction_notes || "",
    special_allowance: inp.special_allowance || 0,
    extra_work_allowance: inp.extra_work_allowance || 0,
    has_termination_pay: inp.has_termination_pay || false,
  });

  const handleRunPayroll = async () => {
    if (!user || !pendingEmployees.length || !monthInputs?.length) return;
    setRunningPayroll(true);
    try {
      const records = pendingEmployees.map((emp: any) => {
        const monthInput = monthInputs.find((i: any) => i.employee_id === emp.id);
        if (!monthInput) return null;
        const malakiEmp = toMalakiEmp(emp);
        const malakiInput = toMalakiInput(monthInput);
        const slip = calculateMalakiPayslip(malakiEmp, malakiInput, selectedYear, selectedMonth);

        return {
          user_id: user.id,
          employee_id: emp.id,
          company_id: emp.company_id || null,
          period_month: selectedMonth,
          period_year: selectedYear,
          base_salary: slip.attendance_salary,
          total_allowances: slip.net_fixed + slip.attendance_bonus + slip.special_allowance + slip.extra_work_allowance + slip.entitlements,
          total_deductions: slip.total_deductions,
          total_overtime: slip.overtime_hours * (malakiEmp.hourly_rate || 9.6) * 0.5,
          net_salary: slip.net_salary,
          is_paid: false,
          // Detailed fields
          attendance_salary: slip.attendance_salary,
          regular_hours: slip.regular_hours,
          overtime_hours_val: slip.overtime_hours,
          vacation_hours_paid: slip.vacation_hours,
          annual_allowance: slip.annual_allowance,
          admin_allowance: slip.admin_allowance,
          food_transport_net: slip.food_transport_net,
          family_allowance: slip.family_allowance,
          other_allowances_val: slip.other_allowances,
          attendance_bonus: slip.attendance_bonus,
          special_allowance: slip.special_allowance,
          extra_work_allowance: slip.extra_work_allowance,
          entitlements: slip.entitlements,
          deduction_opening_balance: slip.deduction_opening_balance,
          deduction_loan: slip.deduction_loan,
          deduction_new_advance: slip.deduction_new_advance,
          deduction_cash_advance: slip.deduction_cash_advance,
          deduction_food_group: slip.deduction_food_group,
          deduction_food_individual: slip.deduction_food_individual,
          deduction_cash_shortage: slip.deduction_cash_shortage,
          deduction_delivery: slip.deduction_delivery,
          deduction_purchases: slip.deduction_purchases,
          deduction_other: slip.deduction_other,
          deduction_violations: slip.deduction_violations,
          deduction_fixed_component: slip.fixed_deduction,
          carry_over_balance: slip.carry_over_balance,
          working_days: slip.working_days,
          absent_days: 28 - slip.working_days,
        };
      }).filter(Boolean);

      const { error } = await supabase.from("employee_payroll").insert(records as any);
      if (error) throw error;
      toast.success(`تم إنشاء مسير الرواتب لـ ${records.length} موظف`);
      queryClient.invalidateQueries({ queryKey: ["payroll-records"] });
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء تشغيل المسير");
    } finally {
      setRunningPayroll(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    const { error } = await supabase.from("employee_payroll").update({ is_paid: true, paid_date: new Date().toISOString().split("T")[0] }).eq("id", id);
    if (error) { toast.error("خطأ في التحديث"); return; }
    toast.success("تم تحديث حالة الدفع");
    queryClient.invalidateQueries({ queryKey: ["payroll-records"] });
  };

  const handleViewSlip = (record: any) => {
    const emp = employees?.find((e: any) => e.id === record.employee_id);
    if (!emp) return;

    // Reconstruct payslip from stored detailed data
    const slip: MalakiPayslip = {
      working_days: record.working_days || 0,
      regular_hours: Number(record.regular_hours) || 0,
      overtime_hours: Number(record.overtime_hours_val) || 0,
      vacation_hours: Number(record.vacation_hours_paid) || 0,
      annual_leave_days: 0,
      sick_leave_days: 0,
      attendance_salary: Number(record.attendance_salary) || 0,
      annual_allowance: Number(record.annual_allowance) || 0,
      admin_allowance: Number(record.admin_allowance) || 0,
      food_transport_base: 0,
      food_transport_net: Number(record.food_transport_net) || 0,
      family_allowance: Number(record.family_allowance) || 0,
      other_allowances: Number(record.other_allowances_val) || 0,
      gross_fixed: 0,
      fixed_deduction: Number(record.deduction_fixed_component) || 0,
      net_fixed: Number(record.food_transport_net || 0) + Number(record.annual_allowance || 0) + Number(record.admin_allowance || 0) + Number(record.family_allowance || 0) + Number(record.other_allowances_val || 0) - Number(record.deduction_fixed_component || 0),
      attendance_bonus: Number(record.attendance_bonus) || 0,
      special_allowance: Number(record.special_allowance) || 0,
      extra_work_allowance: Number(record.extra_work_allowance) || 0,
      entitlements: Number(record.entitlements) || 0,
      total_earnings: Number(record.attendance_salary || 0) + Number(record.total_allowances || 0),
      deduction_opening_balance: Number(record.deduction_opening_balance) || 0,
      deduction_loan: Number(record.deduction_loan) || 0,
      deduction_new_advance: Number(record.deduction_new_advance) || 0,
      deduction_cash_advance: Number(record.deduction_cash_advance) || 0,
      deduction_food_group: Number(record.deduction_food_group) || 0,
      deduction_food_individual: Number(record.deduction_food_individual) || 0,
      deduction_cash_shortage: Number(record.deduction_cash_shortage) || 0,
      deduction_cash_surplus: 0,
      deduction_delivery: Number(record.deduction_delivery) || 0,
      deduction_purchases: Number(record.deduction_purchases) || 0,
      deduction_other: Number(record.deduction_other) || 0,
      deduction_violations: Number(record.deduction_violations) || 0,
      total_deductions: Number(record.total_deductions) || 0,
      net_salary: Number(record.net_salary) || 0,
      carry_over_balance: Number(record.carry_over_balance) || 0,
    };

    setSelectedSlipData({ slip, emp });
    setSlipOpen(true);
  };

  const filtered = useMemo(() => {
    if (!payrollRecords) return [];
    if (!search) return payrollRecords;
    return payrollRecords.filter((p: any) =>
      p.employees?.full_name?.includes(search) || p.employees?.department?.includes(search)
    );
  }, [payrollRecords, search]);

  const exportExcel = () => {
    if (!payrollRecords?.length) return;
    const rows = payrollRecords.map((p: any) => ({
      "الموظف": p.employees?.full_name || "-",
      "القسم": p.employees?.department || "-",
      "راتب البصمة": Number(p.attendance_salary || p.base_salary || 0),
      "البدلات": Number(p.total_allowances),
      "الخصومات": Number(p.total_deductions),
      "الصافي": Number(p.net_salary),
      "الحالة": p.is_paid ? "مدفوع" : "غير مدفوع",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الرواتب");
    XLSX.writeFile(wb, `رواتب_${months[selectedMonth - 1]}_${selectedYear}.xlsx`);
  };

  const isLoading = loadingEmp || loadingPayroll;
  const hasInputs = (monthInputs?.length || 0) > 0;

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto pb-10" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-foreground">إدارة الرواتب — نظام الملكي</h1>
            <p className="text-xs text-muted-foreground">{months[selectedMonth - 1]} {selectedYear}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate("/payroll/inputs")}>
            <ClipboardEdit className="h-4 w-4 ml-1" /> إدخال البيانات
          </Button>
          {pendingEmployees.length > 0 && hasInputs && (
            <Button onClick={handleRunPayroll} disabled={runningPayroll} size="sm">
              {runningPayroll ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Play className="h-4 w-4 ml-1" />}
              تشغيل المسير ({pendingEmployees.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!payrollRecords?.length}>
            <Download className="h-4 w-4 ml-1" /> Excel
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="بحث بالاسم أو القسم..." value={search} onChange={e => setSearch(e.target.value)} className="w-[200px]" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "عدد الموظفين", value: String(summary.count), icon: Users, color: "text-blue-500" },
          { label: "راتب البصمة", value: fmtCurrency(summary.totalBase), icon: DollarSign, color: "text-blue-500" },
          { label: "إجمالي البدلات", value: fmtCurrency(summary.totalAllowances), icon: TrendingDown, color: "text-emerald-500" },
          { label: "إجمالي الخصومات", value: fmtCurrency(summary.totalDeductions), icon: TrendingDown, color: "text-red-500" },
          { label: "صافي الرواتب", value: fmtCurrency(summary.totalNet), icon: Wallet, color: "text-primary" },
        ].map((s, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-[10px] text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-sm font-bold text-foreground">{s.value}</p>
          </Card>
        ))}
      </div>

      {!hasInputs && !isLoading && (
        <Card className="p-4 border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
              <ClipboardEdit className="h-4 w-4" />
              <span>يجب إدخال بيانات الدوام والخصومات أولاً قبل تشغيل المسير</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/payroll/inputs")}>
              إدخال البيانات
            </Button>
          </div>
        </Card>
      )}

      {pendingEmployees.length > 0 && hasInputs && !isLoading && (
        <Card className="p-3 border-blue-300 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm">
            <Users className="h-4 w-4" />
            <span>{pendingEmployees.length} موظف جاهز لتشغيل المسير</span>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-right font-semibold text-muted-foreground">الموظف</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">القسم</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">راتب البصمة</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">البدلات</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الخصومات</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الصافي</th>
                <th className="p-3 text-center font-semibold text-muted-foreground">الحالة</th>
                <th className="p-3 text-center font-semibold text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />جاري التحميل...
                </td></tr>
              ) : !filtered?.length ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                  لا توجد بيانات رواتب لهذه الفترة
                </td></tr>
              ) : (
                <>
                  {filtered.map((p: any) => (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 font-medium text-foreground">{p.employees?.full_name || "-"}</td>
                      <td className="p-3 text-muted-foreground">{p.employees?.department || "-"}</td>
                      <td className="p-3">{fmtCurrency(Number(p.attendance_salary || p.base_salary || 0))}</td>
                      <td className="p-3 text-emerald-600">{fmtCurrency(Number(p.total_allowances))}</td>
                      <td className="p-3 text-red-500">{fmtCurrency(Number(p.total_deductions))}</td>
                      <td className={`p-3 font-bold ${Number(p.net_salary) < 0 ? "text-red-500" : ""}`}>{fmtCurrency(Number(p.net_salary))}</td>
                      <td className="p-3 text-center">
                        <Badge variant={p.is_paid ? "default" : "secondary"} className={`text-[10px] ${p.is_paid ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                          {p.is_paid ? "مدفوع" : "غير مدفوع"}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleViewSlip(p)} title="قسيمة الراتب">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!p.is_paid && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => handleMarkPaid(p.id)} title="تحديد كمدفوع">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-muted/30 font-bold">
                    <td className="p-3" colSpan={2}>الإجمالي ({summary.count} موظف — {summary.paidCount} مدفوع)</td>
                    <td className="p-3">{fmtCurrency(summary.totalBase)}</td>
                    <td className="p-3 text-emerald-600">{fmtCurrency(summary.totalAllowances)}</td>
                    <td className="p-3 text-red-500">{fmtCurrency(summary.totalDeductions)}</td>
                    <td className="p-3">{fmtCurrency(summary.totalNet)}</td>
                    <td className="p-3" colSpan={2}></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedSlipData && (
        <MalakiPayslipDialog
          open={slipOpen}
          onClose={() => { setSlipOpen(false); setSelectedSlipData(null); }}
          slip={selectedSlipData.slip}
          employee={selectedSlipData.emp}
          month={selectedMonth}
          year={selectedYear}
        />
      )}
    </div>
  );
};

export default PayrollPage;
