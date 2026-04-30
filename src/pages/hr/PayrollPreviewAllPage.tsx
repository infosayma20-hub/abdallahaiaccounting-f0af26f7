/**
 * Payroll Preview All — single screen, all employees, no DB writes.
 *
 * Goal: An accountant should land here and see, in one table:
 *   - Every active employee
 *   - Their attendance, allowances, deductions, and net for the chosen month
 *   - A clear warning row for any employee whose salary is not defined
 *
 * No "click employee → preview → back" loop.
 * No `employee_payroll` writes — pure in-memory calculation using the same
 * routing as PayrollPage (Standard preset for linked policies, Malaki otherwise).
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompanyContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, ArrowLeft, Download, ExternalLink, Eye, Loader2, Wallet } from "lucide-react";
import {
  calculateMalakiPayslip,
  fmtCurrency,
  type MalakiEmployee,
  type MalakiMonthInput,
  type MalakiPayslip,
} from "@/lib/malaki-payroll";
import {
  calculateStandardPreset,
  type StandardComponent,
} from "@/lib/payroll-engine/presets/standard";
import type {
  PayrollEmployeeData,
  PayrollMonthInputs,
  PayrollPolicy as EnginePayrollPolicy,
} from "@/lib/payroll-engine/types";
import * as XLSX from "xlsx";

const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function toMalakiEmp(e: any): MalakiEmployee {
  return {
    id: e.id,
    full_name: e.full_name,
    start_date: e.start_date,
    hourly_rate: Number(e.hourly_rate) || 0,
    base_salary: Number(e.base_salary) || 0,
    admin_allowance: Number(e.admin_allowance) || 0,
    transfer_allowance: Number(e.transfer_allowance) || 0,
    food_transport_override: e.food_transport_override != null ? Number(e.food_transport_override) : null,
    wives_count: Number(e.wives_count) || 0,
    children_count: Number(e.children_count) || 0,
    other_allowances: Number(e.other_allowances) || 0,
    special_work_allowance: Number(e.special_work_allowance) || 0,
    annual_leave_balance: Number(e.annual_leave_balance) || 0,
    annual_leave_days: Number(e.annual_leave_days) || 0,
    is_terminated: !!e.is_terminated,
    terminated_at: e.terminated_at,
  };
}

interface PreviewRow {
  id: string;
  name: string;
  department: string | null;
  base_salary: number;
  working_days: number;
  working_hours: number;
  overtime: number;
  attendance_salary: number;
  total_allowances: number;
  total_deductions: number;
  net_salary: number;
  engine: "Standard" | "Malaki";
  status: "ok" | "no_salary" | "no_attendance" | "warning";
  warnings: string[];
}

export default function PayrollPreviewAllPage() {
  const navigate = useNavigate();
  const { company } = useCompany();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ok" | "no_salary" | "no_attendance">("all");

  // ─── Data ─────────────────────────────────────────────
  const { data: employees = [], isLoading: loadingEmp } = useQuery({
    queryKey: ["preview-all-employees", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("company_id", company.id)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!company.id,
  });

  const { data: policies = [] } = useQuery({
    queryKey: ["preview-all-policies", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_payroll_policies")
        .select("*")
        .eq("company_id", company.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!company.id,
  });

  const { data: components = [] } = useQuery({
    queryKey: ["preview-all-components", company.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_payroll_components")
        .select("*")
        .eq("company_id", company.id)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!company.id,
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["preview-all-attendance", company.id, year, month],
    queryFn: async () => {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const { data, error } = await supabase
        .from("attendance_days")
        .select("employee_id,total_hours,overtime_hours,status")
        .gte("attendance_date", start)
        .lte("attendance_date", end);
      if (error) throw error;
      return (data as Array<{ employee_id: string; total_hours: number | null; overtime_hours: number | null; status: string }>) || [];
    },
    enabled: !!company.id,
  });

  const { data: monthInputs = [] } = useQuery({
    queryKey: ["preview-all-inputs", company.id, year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_payroll_inputs")
        .select("*")
        .eq("year", year)
        .eq("month", month);
      if (error) throw error;
      return data || [];
    },
  });

  // ─── Calculation (in-memory, no writes) ───────────────
  const rows: PreviewRow[] = useMemo(() => {
    const policiesById: Record<string, any> = {};
    for (const p of policies) policiesById[p.id] = p;

    const componentsByPolicy: Record<string, StandardComponent[]> = {};
    for (const c of components) {
      if (!componentsByPolicy[c.policy_id]) componentsByPolicy[c.policy_id] = [];
      componentsByPolicy[c.policy_id].push({
        id: c.id,
        code: c.code,
        name_ar: c.name_ar,
        kind: c.kind as "allowance" | "deduction",
        calculation_type: c.calculation_type,
        value: Number(c.value || 0),
        formula_expression: c.formula_expression,
        is_attendance_linked: !!c.is_attendance_linked,
        is_active: !!c.is_active,
      });
    }

    const attByEmp: Record<string, { days: number; hours: number; overtime: number }> = {};
    for (const a of attendance) {
      if (!attByEmp[a.employee_id]) attByEmp[a.employee_id] = { days: 0, hours: 0, overtime: 0 };
      const isPresent = a.status === "present" || a.status === "late" || a.status === "incomplete";
      if (isPresent) attByEmp[a.employee_id].days += 1;
      attByEmp[a.employee_id].hours += Number(a.total_hours || 0);
      attByEmp[a.employee_id].overtime += Number(a.overtime_hours || 0);
    }

    const inputsByEmp: Record<string, any> = {};
    for (const i of monthInputs) inputsByEmp[i.employee_id] = i;

    return employees.map((emp: any): PreviewRow => {
      const att = attByEmp[emp.id] || { days: 0, hours: 0, overtime: 0 };
      const manual = inputsByEmp[emp.id];

      const malakiInput: MalakiMonthInput = {
        working_days: att.days || (manual?.working_days || 0),
        working_hours: att.hours || (manual?.working_hours || 0),
        overtime_hours: att.overtime || (manual?.overtime_hours || 0),
        holiday_overtime_hours: manual?.holiday_overtime_hours || 0,
        vacation_hours: manual?.vacation_hours || 0,
        annual_leave_days: manual?.annual_leave_days || 0,
        sick_leave_days: manual?.sick_leave_days || 0,
        opening_advance_balance: manual?.opening_advance_balance || 0,
        loan_installment: manual?.loan_installment || 0,
        new_advance: manual?.new_advance || 0,
        cash_advances: manual?.cash_advances || 0,
        food_total: manual?.food_total || 0,
        food_individual: manual?.food_individual || 0,
        cash_shortage: manual?.cash_shortage || 0,
        cash_surplus: manual?.cash_surplus || 0,
        delivery: manual?.delivery || 0,
        purchases: manual?.purchases || 0,
        other_deduction: manual?.other_deduction || 0,
        violations: manual?.violations || 0,
        deduction_notes: manual?.deduction_notes || "",
        special_allowance: manual?.special_allowance || 0,
        extra_work_allowance: manual?.extra_work_allowance || 0,
        has_termination_pay: manual?.has_termination_pay || false,
      };

      const linkedPolicy = emp.payroll_policy_id ? policiesById[emp.payroll_policy_id] : null;
      const useStandard = !!linkedPolicy && linkedPolicy.engine_preset === "standard";

      let slip: MalakiPayslip;
      const warnings: string[] = [];

      if (useStandard) {
        const stdEmp: PayrollEmployeeData = {
          id: emp.id,
          full_name: emp.full_name,
          start_date: emp.start_date,
          hourly_rate: Number(emp.hourly_rate) || 0,
          base_salary: Number(emp.base_salary) || 0,
          admin_allowance: 0,
          transfer_allowance: 0,
          food_transport_override: null,
          wives_count: 0,
          children_count: 0,
          other_allowances: 0,
          special_work_allowance: 0,
          annual_leave_balance: 0,
          annual_leave_days: 0,
          is_terminated: false,
          terminated_at: null,
        };
        const overrides = (emp.payroll_overrides ?? {}) as Record<string, number>;
        const baseComps = componentsByPolicy[linkedPolicy.id] || [];
        const comps: StandardComponent[] = baseComps.map((c) => ({
          ...c,
          value: overrides[c.code] != null ? Number(overrides[c.code]) : c.value,
        }));
        const stdPolicy: EnginePayrollPolicy = {
          id: linkedPolicy.id,
          company_id: linkedPolicy.company_id,
          name: linkedPolicy.name,
          preset: "standard",
          salary_basis: linkedPolicy.salary_basis,
          month_days_mode: linkedPolicy.month_days_mode,
          month_days_custom: linkedPolicy.month_days_custom ?? 0,
          daily_work_hours: Number(linkedPolicy.daily_work_hours) || 8,
          overtime_multiplier: Number(linkedPolicy.overtime_multiplier) || 1.5,
          overtime_after_hours: Number(linkedPolicy.overtime_after_hours) || 0,
          absence_calculation: linkedPolicy.absence_calculation || "",
          late_calculation: linkedPolicy.late_calculation || "",
          late_grace_minutes: Number(linkedPolicy.late_grace_minutes) || 0,
          late_per_minute_rate: Number(linkedPolicy.late_per_minute_rate) || 0,
          allowances_attendance_linked: !!linkedPolicy.allowances_attendance_linked,
          deductions_mode: linkedPolicy.deductions_mode || "",
          is_default: !!linkedPolicy.is_default,
        };
        const stdResult = calculateStandardPreset(
          stdEmp,
          malakiInput as unknown as PayrollMonthInputs,
          { year, month },
          stdPolicy,
          { components: comps },
        );
        slip = stdResult as unknown as MalakiPayslip;
        if ((stdResult as any)._engine?.warnings) {
          warnings.push(...(stdResult as any)._engine.warnings);
        }
      } else {
        slip = calculateMalakiPayslip(toMalakiEmp(emp), malakiInput, year, month);
      }

      const baseSalary = Number(emp.base_salary || 0);
      const hourlyRate = Number(emp.hourly_rate || 0);
      const noSalary = baseSalary <= 0 && hourlyRate <= 0;
      const noAttendance = att.days <= 0 && att.hours <= 0;

      const status: PreviewRow["status"] = noSalary
        ? "no_salary"
        : noAttendance
        ? "no_attendance"
        : warnings.length > 0
        ? "warning"
        : "ok";

      const totalAllowances =
        slip.net_fixed +
        slip.attendance_bonus +
        slip.special_allowance +
        slip.extra_work_allowance +
        slip.entitlements;

      return {
        id: emp.id,
        name: emp.full_name,
        department: emp.department,
        base_salary: baseSalary,
        working_days: malakiInput.working_days,
        working_hours: malakiInput.working_hours,
        overtime: malakiInput.overtime_hours,
        attendance_salary: slip.attendance_salary,
        total_allowances: totalAllowances,
        total_deductions: slip.total_deductions,
        net_salary: slip.net_salary,
        engine: useStandard ? "Standard" : "Malaki",
        status,
        warnings,
      };
    });
  }, [employees, policies, components, attendance, monthInputs, year, month]);

  // ─── Filters ─────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = rows;
    if (filter !== "all") r = r.filter((x) => x.status === filter);
    if (search) {
      const q = search.trim();
      r = r.filter((x) => x.name.includes(q) || (x.department || "").includes(q));
    }
    return r;
  }, [rows, filter, search]);

  const summary = useMemo(() => {
    const noSalary = rows.filter((r) => r.status === "no_salary").length;
    const noAttendance = rows.filter((r) => r.status === "no_attendance").length;
    const ok = rows.filter((r) => r.status === "ok" || r.status === "warning").length;
    return {
      count: rows.length,
      noSalary,
      noAttendance,
      ok,
      totalAllowances: rows.reduce((a, r) => a + r.total_allowances, 0),
      totalDeductions: rows.reduce((a, r) => a + r.total_deductions, 0),
      totalNet: rows.reduce((a, r) => a + r.net_salary, 0),
    };
  }, [rows]);

  const exportExcel = () => {
    if (!filtered.length) return;
    const data = filtered.map((r) => ({
      "الموظف": r.name,
      "القسم": r.department || "—",
      "الراتب الأساسي": r.base_salary,
      "أيام العمل": r.working_days,
      "ساعات العمل": r.working_hours,
      "ساعات إضافية": r.overtime,
      "راتب الحضور": r.attendance_salary,
      "البدلات": r.total_allowances,
      "الخصومات": r.total_deductions,
      "الصافي": r.net_salary,
      "الحالة":
        r.status === "no_salary"
          ? "بدون راتب أساسي"
          : r.status === "no_attendance"
          ? "لا يوجد حضور"
          : r.status === "warning"
          ? "بتحذيرات"
          : "سليم",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "معاينة الرواتب");
    XLSX.writeFile(wb, `معاينة_رواتب_${MONTHS_AR[month - 1]}_${year}.xlsx`);
  };

  const isLoading = loadingEmp;

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto pb-10 p-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 rotate-180" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">معاينة رواتب الموظفين</h1>
            <p className="text-xs text-muted-foreground">
              {MONTHS_AR[month - 1]} {year} — كل الموظفين في شاشة واحدة، بدون اعتماد
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filtered.length}>
            <Download className="h-4 w-4 ms-1" /> تصدير Excel
          </Button>
          <Button size="sm" onClick={() => navigate("/payroll")}>
            <Wallet className="h-4 w-4 ms-1" /> الذهاب لاحتساب الرواتب
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS_AR.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="بحث بالاسم أو القسم..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[220px]"
        />
        <div className="flex gap-1">
          {(["all", "ok", "no_salary", "no_attendance"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "الكل" : f === "ok" ? "سليم" : f === "no_salary" ? "بدون راتب" : "بدون حضور"}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-3">
          <div className="text-[10px] text-muted-foreground">عدد الموظفين</div>
          <div className="text-sm font-bold">{summary.count}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] text-muted-foreground">صافي الرواتب</div>
          <div className="text-sm font-bold text-primary">{fmtCurrency(summary.totalNet)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] text-muted-foreground">إجمالي البدلات</div>
          <div className="text-sm font-bold text-emerald-600">{fmtCurrency(summary.totalAllowances)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] text-muted-foreground">إجمالي الخصومات</div>
          <div className="text-sm font-bold text-red-500">{fmtCurrency(summary.totalDeductions)}</div>
        </Card>
        <Card className="p-3 border-amber-300 bg-amber-50/40 dark:bg-amber-900/10">
          <div className="text-[10px] text-amber-700">يحتاج مراجعة</div>
          <div className="text-sm font-bold text-amber-700">
            {summary.noSalary + summary.noAttendance}
          </div>
        </Card>
      </div>

      {/* Critical warning bar */}
      {summary.noSalary > 0 && (
        <Card className="p-3 border-red-300 bg-red-50 dark:bg-red-900/10">
          <div className="flex items-center gap-2 text-red-700 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>
              يوجد <strong>{summary.noSalary}</strong> موظفين بدون راتب أساسي معرّف — لن يتم احتساب أي راتب أو بدل أو خصم لهم. عرّف رواتبهم من ملف الموظف أولاً.
            </span>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الموظف</TableHead>
              <TableHead>القسم</TableHead>
              <TableHead>الراتب الأساسي</TableHead>
              <TableHead>أيام العمل</TableHead>
              <TableHead>ساعات العمل</TableHead>
              <TableHead>إضافي</TableHead>
              <TableHead>راتب الحضور</TableHead>
              <TableHead>البدلات</TableHead>
              <TableHead>الخصومات</TableHead>
              <TableHead>الصافي</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-end">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={12}>
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin ms-2" /> جاري حساب المعاينة...
                  </div>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12}>
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    لا يوجد موظفون مطابقون.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.department || "—"}</TableCell>
                  <TableCell className={r.status === "no_salary" ? "text-red-600 font-semibold" : ""}>
                    {fmtCurrency(r.base_salary)}
                  </TableCell>
                  <TableCell>{r.working_days}</TableCell>
                  <TableCell>{Number(r.working_hours).toFixed(1)}</TableCell>
                  <TableCell>{Number(r.overtime).toFixed(1)}</TableCell>
                  <TableCell>{fmtCurrency(r.attendance_salary)}</TableCell>
                  <TableCell className="text-emerald-600">{fmtCurrency(r.total_allowances)}</TableCell>
                  <TableCell className="text-red-500">{fmtCurrency(r.total_deductions)}</TableCell>
                  <TableCell className="font-bold">{fmtCurrency(r.net_salary)}</TableCell>
                  <TableCell>
                    {r.status === "no_salary" ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> بدون راتب
                      </Badge>
                    ) : r.status === "no_attendance" ? (
                      <Badge variant="secondary">لا حضور</Badge>
                    ) : r.status === "warning" ? (
                      <Badge variant="outline" className="border-amber-400 text-amber-700">تحذيرات</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">سليم</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/hr/employee/${r.id}?tab=payroll`)}
                        title="معاينة تفاصيل الراتب"
                      >
                        <Eye className="h-4 w-4 ms-1" /> معاينة التفاصيل
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/hr/employee/${r.id}`)}
                        title="ملف الموظف 360"
                      >
                        <ExternalLink className="h-4 w-4 ms-1" /> ملف 360
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
            {filtered.length > 0 && (
              <TableRow className="bg-muted/30 font-bold">
                <TableCell colSpan={6}>
                  الإجمالي ({filtered.length} موظف)
                </TableCell>
                <TableCell>{fmtCurrency(filtered.reduce((a, r) => a + r.attendance_salary, 0))}</TableCell>
                <TableCell className="text-emerald-600">
                  {fmtCurrency(filtered.reduce((a, r) => a + r.total_allowances, 0))}
                </TableCell>
                <TableCell className="text-red-500">
                  {fmtCurrency(filtered.reduce((a, r) => a + r.total_deductions, 0))}
                </TableCell>
                <TableCell>{fmtCurrency(filtered.reduce((a, r) => a + r.net_salary, 0))}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        هذه شاشة معاينة فقط — الأرقام محسوبة لحظياً ولا تُحفظ في قاعدة البيانات. للاعتماد الرسمي اذهب إلى «إدارة الرواتب».
      </p>
    </div>
  );
}