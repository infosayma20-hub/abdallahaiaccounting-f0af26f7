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
import { HRTable, HRTHead, HRTH, HRTR, HRTD, HRMoney } from "./components/HRTable";
import {
  PunchesModal,
  WorkdaysModal,
  ComponentsModal,
  SalaryDetailsModal,
  type BreakdownEntry,
  type SalaryBreakdown,
} from "./components/PreviewRowModals";
import { AlertTriangle, ArrowLeft, Calculator, ClipboardList, Download, ExternalLink, Fingerprint, Info, Loader2, Wallet } from "lucide-react";
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
  engine: "Standard" | "Malaki" | "None";
  status: "ok" | "no_salary" | "no_attendance" | "no_policy" | "bad_policy" | "warning";
  warnings: string[];
  policy_name: string | null;
  has_policy: boolean;
  breakdown: BreakdownEntry[];
  overtime_value: number;
}

export default function PayrollPreviewAllPage() {
  const navigate = useNavigate();
  const { company } = useCompany();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ok" | "no_salary" | "no_attendance" | "no_policy" | "bad_policy">("all");

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
      // ─── Engine routing (HARD RULE) ────────────────────────────
      // Standard ONLY when the employee is explicitly linked to a Standard
      // policy belonging to THIS company. Otherwise → no calculation at all,
      // never fall back to Malaki silently. The accountant must see
      // "بدون سياسة رواتب" so they can fix the link before payroll runs.
      const policyBelongsToCompany =
        !!linkedPolicy && linkedPolicy.company_id === company.id;
      const useStandard =
        policyBelongsToCompany && linkedPolicy.engine_preset === "standard";
      const noPolicy = !policyBelongsToCompany;

      // ─── HARD GUARD (S2-A.3) ──────────────────────────────────
      // Detect mismatch: policy basis is daily/hourly, but base_salary is
      // unrealistically large (>= 1000 ₪) — meaning the user entered a
      // monthly salary while the policy treats it as daily/hourly. Without
      // this guard, the engine would multiply 3000 × 25 days = 75,000+ ₪.
      // We block the calculation, force net=0, and flag the row.
      const basis = linkedPolicy?.salary_basis;
      const baseSalaryGuard = Number(emp.base_salary || 0);
      const policyMismatch =
        useStandard &&
        (basis === "daily" || basis === "hourly") &&
        baseSalaryGuard >= 1000;

      let slip: MalakiPayslip;
      const warnings: string[] = [];

      if (policyMismatch) {
        // Zeroed payslip — accountant must fix policy linkage first.
        warnings.push(
          `policy_mismatch:basis=${basis},base_salary=${baseSalaryGuard}`
        );
        slip = {
          working_days: malakiInput.working_days,
          regular_hours: malakiInput.working_hours,
          overtime_hours: malakiInput.overtime_hours,
          vacation_hours: 0,
          annual_leave_days: 0,
          sick_leave_days: 0,
          attendance_salary: 0,
          annual_allowance: 0,
          admin_allowance: 0,
          food_transport_base: 0,
          food_transport_net: 0,
          family_allowance: 0,
          other_allowances: 0,
          gross_fixed: 0,
          fixed_deduction: 0,
          net_fixed: 0,
          attendance_bonus: 0,
          special_allowance: 0,
          extra_work_allowance: 0,
          entitlements: 0,
          total_earnings: 0,
          deduction_opening_balance: 0,
          deduction_loan: 0,
          deduction_new_advance: 0,
          deduction_cash_advance: 0,
          deduction_food_group: 0,
          deduction_food_individual: 0,
          deduction_cash_shortage: 0,
          deduction_cash_surplus: 0,
          deduction_delivery: 0,
          deduction_purchases: 0,
          deduction_other: 0,
          deduction_violations: 0,
          total_deductions: 0,
          net_salary: 0,
          carry_over_balance: 0,
        } as MalakiPayslip;
      } else if (noPolicy) {
        // No engine runs. Zeroed payslip. The row will be flagged "بدون سياسة رواتب".
        warnings.push("no_payroll_policy_assigned");
        slip = {
          working_days: malakiInput.working_days,
          regular_hours: malakiInput.working_hours,
          overtime_hours: malakiInput.overtime_hours,
          vacation_hours: 0,
          annual_leave_days: 0,
          sick_leave_days: 0,
          attendance_salary: 0,
          annual_allowance: 0,
          admin_allowance: 0,
          food_transport_base: 0,
          food_transport_net: 0,
          family_allowance: 0,
          other_allowances: 0,
          gross_fixed: 0,
          fixed_deduction: 0,
          net_fixed: 0,
          attendance_bonus: 0,
          special_allowance: 0,
          extra_work_allowance: 0,
          entitlements: 0,
          total_earnings: 0,
          deduction_opening_balance: 0,
          deduction_loan: 0,
          deduction_new_advance: 0,
          deduction_cash_advance: 0,
          deduction_food_group: 0,
          deduction_food_individual: 0,
          deduction_cash_shortage: 0,
          deduction_cash_surplus: 0,
          deduction_delivery: 0,
          deduction_purchases: 0,
          deduction_other: 0,
          deduction_violations: 0,
          total_deductions: 0,
          net_salary: 0,
          carry_over_balance: 0,
        } as MalakiPayslip;
      } else if (useStandard) {
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
        // Linked policy exists but is NOT standard preset — Malaki is
        // intentionally disabled in this preview. We treat as no policy.
        warnings.push(`unsupported_engine_preset:${linkedPolicy.engine_preset}`);
        slip = {
          working_days: malakiInput.working_days,
          regular_hours: malakiInput.working_hours,
          overtime_hours: malakiInput.overtime_hours,
          vacation_hours: 0,
          annual_leave_days: 0,
          sick_leave_days: 0,
          attendance_salary: 0,
          annual_allowance: 0,
          admin_allowance: 0,
          food_transport_base: 0,
          food_transport_net: 0,
          family_allowance: 0,
          other_allowances: 0,
          gross_fixed: 0,
          fixed_deduction: 0,
          net_fixed: 0,
          attendance_bonus: 0,
          special_allowance: 0,
          extra_work_allowance: 0,
          entitlements: 0,
          total_earnings: 0,
          deduction_opening_balance: 0,
          deduction_loan: 0,
          deduction_new_advance: 0,
          deduction_cash_advance: 0,
          deduction_food_group: 0,
          deduction_food_individual: 0,
          deduction_cash_shortage: 0,
          deduction_cash_surplus: 0,
          deduction_delivery: 0,
          deduction_purchases: 0,
          deduction_other: 0,
          deduction_violations: 0,
          total_deductions: 0,
          net_salary: 0,
          carry_over_balance: 0,
        } as MalakiPayslip;
      }

      const baseSalary = Number(emp.base_salary || 0);
      const hourlyRate = Number(emp.hourly_rate || 0);
      const noSalary = baseSalary <= 0 && hourlyRate <= 0;
      const noAttendance = att.days <= 0 && att.hours <= 0;

      const status: PreviewRow["status"] = noPolicy
        ? "no_policy"
        : policyMismatch
        ? "bad_policy"
        : noSalary
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

      // ─── Transparency: per-component breakdown ────────────────
      // ONLY components from the employee's own Standard policy are shown.
      // No Malaki fallback ever runs in this preview (see engine routing above).
      const breakdown: BreakdownEntry[] = [];
      if (useStandard) {
        const eng = (slip as any)._engine || {};
        for (const b of (eng.component_breakdown || []) as Array<{ code: string; kind: string; amount: number; source: string }>) {
          const meta = (componentsByPolicy[linkedPolicy.id] || []).find((c) => c.code === b.code);
          breakdown.push({
            code: b.code,
            name: meta?.name_ar || b.code,
            kind: b.kind as "allowance" | "deduction",
            amount: b.amount,
            source: b.source,
            attendance_linked: !!meta?.is_attendance_linked,
            applied: b.amount !== 0 && !b.source.startsWith("skipped"),
          });
        }
      }
      // noPolicy or unsupported preset → empty breakdown (zero everything).

      // Approx overtime value (hours × hourly_rate × multiplier 1.5).
      // Display-only, no impact on math.
      const overtimeValue =
        Number(malakiInput.overtime_hours || 0) * (hourlyRate || 9.6) * 1.5;

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
        engine: useStandard ? "Standard" : "None",
        status,
        warnings,
        policy_name: linkedPolicy?.name || null,
        has_policy: !!linkedPolicy,
        breakdown,
        overtime_value: overtimeValue,
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
    const noPolicy = rows.filter((r) => r.status === "no_policy").length;
    const badPolicy = rows.filter((r) => r.status === "bad_policy").length;
    const ok = rows.filter((r) => r.status === "ok" || r.status === "warning").length;
    return {
      count: rows.length,
      noSalary,
      noAttendance,
      noPolicy,
      badPolicy,
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
        r.status === "no_policy"
          ? "بدون سياسة رواتب"
          : r.status === "bad_policy"
          ? "سياسة خاطئة (يومية/ساعة + راتب شهري)"
          : r.status === "no_salary"
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

  // ─── Modal state ─────────────────────────────────────
  const [punchesFor, setPunchesFor] = useState<{ id: string; name: string } | null>(null);
  const [workdaysFor, setWorkdaysFor] = useState<{ id: string; name: string } | null>(null);
  const [componentsFor, setComponentsFor] = useState<PreviewRow | null>(null);
  const [salaryFor, setSalaryFor] = useState<PreviewRow | null>(null);

  // ─── Aggregated totals (single source of truth, used in footer too) ─
  const totals = useMemo(
    () => ({
      base: filtered.reduce((a, r) => a + r.base_salary, 0),
      attendance: filtered.reduce((a, r) => a + r.attendance_salary, 0),
      overtime: filtered.reduce((a, r) => a + r.overtime_value, 0),
      allowances: filtered.reduce((a, r) => a + r.total_allowances, 0),
      deductions: filtered.reduce((a, r) => a + r.total_deductions, 0),
      net: filtered.reduce((a, r) => a + r.net_salary, 0),
    }),
    [filtered],
  );

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
          {(["all", "ok", "no_salary", "no_attendance", "no_policy", "bad_policy"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "الكل"
                : f === "ok"
                ? "سليم"
                : f === "no_salary"
                ? "بدون راتب"
                : f === "no_attendance"
                ? "بدون حضور"
                : f === "bad_policy"
                ? "سياسة خاطئة"
                : "بدون سياسة"}
            </Button>
          ))}
        </div>
      </div>

      {/* Bad-policy alert banner */}
      {summary.badPolicy > 0 && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="text-right">
            <div className="font-bold">
              {summary.badPolicy} موظف بسياسة راتب لا تطابق الراتب الأساسي
            </div>
            <div className="text-xs mt-1">
              هؤلاء الموظفون مربوطون بسياسة <b>يومية</b> أو <b>بالساعة</b> لكن راتبهم الأساسي يبدو شهرياً (≥ 1,000 ₪).
              تم إيقاف احتساب رواتبهم لمنع أرقام مضخّمة. يرجى تعديل سياسة الراتب من ملف الموظف قبل المتابعة.
            </div>
          </div>
        </div>
      )}

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
            {summary.noSalary + summary.noAttendance + summary.noPolicy}
          </div>
        </Card>
      </div>

      {/* Critical warning bar */}
      {(summary.noSalary > 0 || summary.noAttendance > 0 || summary.noPolicy > 0) && (
        <Card className="p-3 border-amber-300 bg-amber-50/40 dark:bg-amber-900/10">
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            {summary.noPolicy > 0 && (
              <span className="text-rose-700">
                <strong>{summary.noPolicy}</strong> موظف بدون سياسة رواتب — لن يُحتسب لهم أي راتب
              </span>
            )}
            {summary.noSalary > 0 && (
              <span>
                <strong>{summary.noSalary}</strong> موظف بدون راتب أساسي
              </span>
            )}
            {summary.noAttendance > 0 && (
              <span>
                <strong>{summary.noAttendance}</strong> موظف بدون حضور
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              — صحّح بيانات الموظف من ملفه قبل احتساب الرواتب رسمياً.
            </span>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <HRTable>
          <HRTHead>
            <HRTH>الموظف</HRTH>
            <HRTH>القسم</HRTH>
            <HRTH>الراتب الأساسي</HRTH>
            <HRTH>أيام العمل</HRTH>
            <HRTH>ساعات العمل</HRTH>
            <HRTH>إضافي</HRTH>
            <HRTH>راتب الحضور</HRTH>
            <HRTH>البدلات</HRTH>
            <HRTH>الخصومات</HRTH>
            <HRTH>الصافي</HRTH>
            <HRTH>الحالة</HRTH>
            <HRTH align="center">إجراءات</HRTH>
          </HRTHead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={12}>
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin ms-2" /> جاري حساب المعاينة...
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={12}>
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    لا يوجد موظفون مطابقون.
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <HRTR key={r.id}>
                  <HRTD className="font-medium">{r.name}</HRTD>
                  <HRTD className="text-xs text-muted-foreground">{r.department || "—"}</HRTD>
                  <HRTD numeric className={r.status === "no_salary" ? "text-rose-600 font-semibold" : ""}>
                    <HRMoney value={r.base_salary} />
                  </HRTD>
                  <HRTD numeric>{r.working_days}</HRTD>
                  <HRTD numeric>{Number(r.working_hours).toFixed(1)}</HRTD>
                  <HRTD numeric>{Number(r.overtime).toFixed(1)}</HRTD>
                  <HRTD numeric>
                    <HRMoney value={r.attendance_salary} />
                  </HRTD>
                  <HRTD numeric className="text-emerald-700">
                    <HRMoney value={r.total_allowances} />
                  </HRTD>
                  <HRTD numeric className="text-rose-700">
                    <HRMoney value={r.total_deductions} />
                  </HRTD>
                  <HRTD numeric className="font-bold">
                    <HRMoney value={r.net_salary} />
                  </HRTD>
                  <HRTD>
                    {r.status === "no_policy" ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> بدون سياسة رواتب
                      </Badge>
                    ) : r.status === "bad_policy" ? (
                      <Badge variant="destructive" className="gap-1" title="سياسة الراتب لا تطابق الراتب الأساسي — الموظف مربوط بسياسة يومية/ساعة لكن الراتب المدخل يبدو شهرياً">
                        <AlertTriangle className="h-3 w-3" /> سياسة خاطئة
                      </Badge>
                    ) : r.status === "no_salary" ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> بدون راتب
                      </Badge>
                    ) : r.status === "no_attendance" ? (
                      <Badge variant="secondary">لا حضور</Badge>
                    ) : r.working_days < 3 ? (
                      <Badge variant="outline" className="border-amber-400 text-amber-700">حضور منخفض</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">سليم</Badge>
                    )}
                  </HRTD>
                  <HRTD align="center">
                    <div className="flex gap-1 justify-center flex-wrap">
                      <IconBtn title="كشف البصمات" onClick={() => setPunchesFor({ id: r.id, name: r.name })}>
                        <Fingerprint className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="أيام العمل" onClick={() => setWorkdaysFor({ id: r.id, name: r.name })}>
                        <ClipboardList className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="البدلات والخصومات" onClick={() => setComponentsFor(r)}>
                        <Info className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="تفاصيل الراتب" onClick={() => setSalaryFor(r)}>
                        <Calculator className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="ملف 360" onClick={() => navigate(`/hr/employee/${r.id}`)}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </HRTD>
                </HRTR>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-primary/5 border-t-2 border-primary/30 font-bold text-right">
                <td className="px-3 py-3" colSpan={2}>
                  الإجمالي ({filtered.length} موظف)
                </td>
                <td className="px-3 py-3 tabular-nums text-right">
                  <HRMoney value={totals.base} />
                </td>
                <td className="px-3 py-3" colSpan={2} />
                <td className="px-3 py-3 tabular-nums text-right">
                  <HRMoney value={totals.overtime} />
                </td>
                <td className="px-3 py-3 tabular-nums text-right">
                  <HRMoney value={totals.attendance} />
                </td>
                <td className="px-3 py-3 tabular-nums text-right text-emerald-700">
                  <HRMoney value={totals.allowances} />
                </td>
                <td className="px-3 py-3 tabular-nums text-right text-rose-700">
                  <HRMoney value={totals.deductions} />
                </td>
                <td className="px-3 py-3 tabular-nums text-right text-primary">
                  <HRMoney value={totals.net} />
                </td>
                <td className="px-3 py-3" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </HRTable>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        هذه شاشة معاينة فقط — الأرقام محسوبة لحظياً ولا تُحفظ في قاعدة البيانات. للاعتماد الرسمي اذهب إلى «إدارة الرواتب».
      </p>

      {/* ─── Investigation Modals ─── */}
      {punchesFor && (
        <PunchesModal
          open
          onClose={() => setPunchesFor(null)}
          employeeId={punchesFor.id}
          employeeName={punchesFor.name}
          year={year}
          month={month}
        />
      )}
      {workdaysFor && (
        <WorkdaysModal
          open
          onClose={() => setWorkdaysFor(null)}
          employeeId={workdaysFor.id}
          employeeName={workdaysFor.name}
          year={year}
          month={month}
        />
      )}
      {componentsFor && (
        <ComponentsModal
          open
          onClose={() => setComponentsFor(null)}
          employeeName={componentsFor.name}
          policyName={componentsFor.policy_name}
          entries={componentsFor.breakdown}
        />
      )}
      {salaryFor && (
        <SalaryDetailsModal
          open
          onClose={() => setSalaryFor(null)}
          employeeName={salaryFor.name}
          data={{
            base_salary: salaryFor.base_salary,
            working_days: salaryFor.working_days,
            working_hours: salaryFor.working_hours,
            attendance_salary: salaryFor.attendance_salary,
            overtime_hours: salaryFor.overtime,
            overtime_value: salaryFor.overtime_value,
            total_allowances: salaryFor.total_allowances,
            total_deductions: salaryFor.total_deductions,
            net_salary: salaryFor.net_salary,
            warnings: salaryFor.warnings,
          }}
        />
      )}
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="icon" variant="ghost" className="h-7 w-7" title={title} onClick={onClick}>
      {children}
    </Button>
  );
}