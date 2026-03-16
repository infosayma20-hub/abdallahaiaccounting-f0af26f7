import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Download, DollarSign, TrendingDown, Wallet, Users, FileText, Loader2, Eye, Printer, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import SalarySlipDialog from "@/components/hr/SalarySlipDialog";
import { calculateSalarySlip, calculateLeaveBalance, getWorkDaysInMonth, getWeeklyDaysOffInMonth, formatCurrency, type SalarySlip } from "@/lib/hr-utils";
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
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [selectedSlip, setSelectedSlip] = useState<SalarySlip | null>(null);
  const [runningPayroll, setRunningPayroll] = useState(false);

  // Fetch employees
  const { data: employees, isLoading: loadingEmp } = useQuery({
    queryKey: ["payroll-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch payroll records for selected period
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

  // Fetch attendance data for the month
  const { data: attendanceData } = useQuery({
    queryKey: ["payroll-attendance", selectedMonth, selectedYear],
    queryFn: async () => {
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
      const endMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const endYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
      const { data, error } = await supabase
        .from("attendance_days")
        .select("employee_id, status, total_hours, overtime_hours")
        .gte("attendance_date", startDate)
        .lt("attendance_date", endDate);
      if (error) throw error;
      return data || [];
    },
  });

  const summary = useMemo(() => {
    if (!payrollRecords?.length) return { totalBase: 0, totalAllowances: 0, totalDeductions: 0, totalNet: 0, count: 0, paidCount: 0 };
    return payrollRecords.reduce((acc: any, p: any) => ({
      totalBase: acc.totalBase + Number(p.base_salary),
      totalAllowances: acc.totalAllowances + Number(p.total_allowances),
      totalDeductions: acc.totalDeductions + Number(p.total_deductions),
      totalNet: acc.totalNet + Number(p.net_salary),
      count: acc.count + 1,
      paidCount: acc.paidCount + (p.is_paid ? 1 : 0),
    }), { totalBase: 0, totalAllowances: 0, totalDeductions: 0, totalNet: 0, count: 0, paidCount: 0 });
  }, [payrollRecords]);

  const fmt = (n: number) => `₪ ${n.toLocaleString("en", { minimumFractionDigits: 0 })}`;

  // Build attendance map
  const attendanceMap = useMemo(() => {
    const map = new Map<string, { present: number; absent: number; late: number; overtime: number }>();
    (attendanceData || []).forEach((d: any) => {
      const curr = map.get(d.employee_id) || { present: 0, absent: 0, late: 0, overtime: 0 };
      if (d.status === "present" || d.status === "late") curr.present++;
      if (d.status === "absent") curr.absent++;
      if (d.status === "late") curr.late++;
      curr.overtime += Number(d.overtime_hours || 0);
      map.set(d.employee_id, curr);
    });
    return map;
  }, [attendanceData]);

  // Employees not yet in payroll this month
  const pendingEmployees = useMemo(() => {
    if (!employees) return [];
    const processedIds = new Set((payrollRecords || []).map((p: any) => p.employee_id));
    return employees.filter((e: any) => !processedIds.has(e.id));
  }, [employees, payrollRecords]);

  const handleRunPayroll = async () => {
    if (!user || !pendingEmployees.length) return;
    setRunningPayroll(true);
    try {
      const records = pendingEmployees.map((emp: any) => {
        const att = attendanceMap.get(emp.id) || { present: 0, absent: 0, late: 0, overtime: 0 };
        const slip = calculateSalarySlip(emp, att.present, att.absent, att.overtime, selectedMonth, selectedYear);
        return {
          user_id: user.id,
          employee_id: emp.id,
          period_month: selectedMonth,
          period_year: selectedYear,
          base_salary: slip.baseSalary,
          total_allowances: slip.totalAllowances,
          total_deductions: slip.totalDeductions,
          total_overtime: slip.overtimePay,
          net_salary: slip.netSalary,
          working_days: slip.workDays,
          absent_days: att.absent,
          overtime_hours: att.overtime,
          is_paid: false,
        };
      });
      const { error } = await supabase.from("employee_payroll").insert(records);
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
    const { error } = await supabase.from("employee_payroll").update({ is_paid: true, paid_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error("خطأ في التحديث"); return; }
    toast.success("تم تحديث حالة الدفع");
    queryClient.invalidateQueries({ queryKey: ["payroll-records"] });
  };

  const handleViewSlip = (record: any) => {
    const emp = employees?.find((e: any) => e.id === record.employee_id);
    if (!emp) return;
    const att = attendanceMap.get(emp.id) || { present: 0, absent: 0, late: 0, overtime: 0 };
    const slip = calculateSalarySlip(emp, att.present, att.absent, att.overtime, selectedMonth, selectedYear);
    setSelectedEmp(emp);
    setSelectedSlip(slip);
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
      "الراتب الأساسي": Number(p.base_salary),
      "البدلات": Number(p.total_allowances),
      "الإضافي": Number(p.total_overtime),
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

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-foreground">إدارة الرواتب</h1>
            <p className="text-xs text-muted-foreground">{months[selectedMonth - 1]} {selectedYear}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {pendingEmployees.length > 0 && (
            <Button onClick={handleRunPayroll} disabled={runningPayroll} size="sm">
              {runningPayroll ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <DollarSign className="h-4 w-4 ml-1" />}
              تشغيل المسير ({pendingEmployees.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!payrollRecords?.length}>
            <Download className="h-4 w-4 ml-1" /> Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "عدد الموظفين", value: String(summary.count), icon: Users, color: "text-blue-500" },
          { label: "إجمالي الأساسي", value: fmt(summary.totalBase), icon: DollarSign, color: "text-blue-500" },
          { label: "إجمالي البدلات", value: fmt(summary.totalAllowances), icon: TrendingDown, color: "text-emerald-500" },
          { label: "إجمالي الخصومات", value: fmt(summary.totalDeductions), icon: TrendingDown, color: "text-red-500" },
          { label: "صافي الرواتب", value: fmt(summary.totalNet), icon: Wallet, color: "text-primary" },
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

      {/* Pending employees banner */}
      {pendingEmployees.length > 0 && !isLoading && (
        <Card className="p-3 border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
            <Users className="h-4 w-4" />
            <span>{pendingEmployees.length} موظف لم يتم إعداد رواتبهم لهذا الشهر بعد</span>
          </div>
        </Card>
      )}

      {/* Payroll Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-right font-semibold text-muted-foreground">الموظف</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">القسم</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الأساسي</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">البدلات</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الإضافي</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الخصومات</th>
                <th className="p-3 text-right font-semibold text-muted-foreground">الصافي</th>
                <th className="p-3 text-center font-semibold text-muted-foreground">الحالة</th>
                <th className="p-3 text-center font-semibold text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />جاري التحميل...
                </td></tr>
              ) : !filtered?.length ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                  لا توجد بيانات رواتب لهذه الفترة
                </td></tr>
              ) : (
                <>
                  {filtered.map((p: any) => (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-3 font-medium text-foreground">{p.employees?.full_name || "-"}</td>
                      <td className="p-3 text-muted-foreground">{p.employees?.department || "-"}</td>
                      <td className="p-3">{fmt(Number(p.base_salary))}</td>
                      <td className="p-3 text-emerald-600">{fmt(Number(p.total_allowances))}</td>
                      <td className="p-3">{fmt(Number(p.total_overtime))}</td>
                      <td className="p-3 text-red-500">{fmt(Number(p.total_deductions))}</td>
                      <td className="p-3 font-bold">{fmt(Number(p.net_salary))}</td>
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
                  {/* Totals Row */}
                  <tr className="border-t-2 border-border bg-muted/30 font-bold">
                    <td className="p-3" colSpan={2}>الإجمالي ({summary.count} موظف — {summary.paidCount} مدفوع)</td>
                    <td className="p-3">{fmt(summary.totalBase)}</td>
                    <td className="p-3 text-emerald-600">{fmt(summary.totalAllowances)}</td>
                    <td className="p-3">-</td>
                    <td className="p-3 text-red-500">{fmt(summary.totalDeductions)}</td>
                    <td className="p-3">{fmt(summary.totalNet)}</td>
                    <td className="p-3" colSpan={2}></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Salary Slip Dialog */}
      {selectedEmp && (
        <SalarySlipDialog
          open={slipOpen}
          onClose={() => { setSlipOpen(false); setSelectedEmp(null); }}
          slip={selectedSlip}
          employeeName={selectedEmp.full_name}
          department={selectedEmp.department || ""}
          startDate={selectedEmp.start_date}
          month={selectedMonth}
          year={selectedYear}
          employee={selectedEmp}
          userId={user?.id}
        />
      )}
    </div>
  );
};

export default PayrollPage;
