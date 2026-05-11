import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

/**
 * useHrCommandCenter
 * ---------------------------------------------------
 * Aggregated data layer for the HR Command Center page.
 * Fetches lightweight cross-employee data: employees,
 * today's attendance, recent payroll, active loans,
 * deductions this month, pending leave/loan/form requests,
 * and 6-month payroll trend.
 *
 * Read-only — pure aggregation, no mutations.
 */

export type HrEmployeeRow = {
  id: string;
  name: string;
  job_title: string | null;
  department: string | null;
  branch: string | null;
  base_salary: number;
  is_active: boolean;
  // computed
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  monthlyCost: number;
  attendanceRate: number;
  lateDays: number;
  absentDays: number;
  presentToday: "present" | "absent" | "late" | "off" | "unknown";
  loanInstallment: number;
  deductionsThisMonth: number;
  topIssue?: string;
};

export type HrAttendanceTodayRow = {
  id: string;
  employee_id: string;
  employeeName: string;
  branch: string | null;
  department: string | null;
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  status: "present" | "late" | "absent" | "leave" | "off" | "incomplete";
  issue: string;
  lateMinutes: number;
  isSynthetic: boolean;
};

export type HrCommandCenterData = {
  employees: HrEmployeeRow[];
  filters: {
    branches: string[];
    departments: string[];
  };
  totals: {
    total: number;
    active: number;
    inactive: number;
    totalMonthlyCost: number;
    avgCostPerEmployee: number;
    avgAttendanceRate: number;
    avgDelayMinutes: number;
    highRiskCount: number;
    mediumRiskCount: number;
    presentToday: number;
    absentToday: number;
    lateToday: number;
    totalDeductionsThisMonth: number;
    totalLoansOutstanding: number;
    totalPayrollThisMonth: number;
    incompletePunchesToday: number;
  };
  pendingRequests: {
    leaves: any[];
    loans: any[];
    forms: any[];
    corrections: any[];
  };
  attendanceToday: HrAttendanceTodayRow[];
  charts: {
    payrollTrend: { month: string; total: number; net: number }[];
    attendancePerformance: { day: string; present: number; late: number; absent: number }[];
    leaveUsage: { type: string; count: number }[];
  };
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
};

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
};

const fmtTime = (v?: string | null) => v ? new Date(v).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }) : "—";
const isPending = (s?: string | null) => ["pending", "قيد المراجعة", "معلقة"].includes(String(s || ""));
const presentStatuses = ["present", "حاضر", "complete", "مكتمل"];
const lateStatuses = ["late", "متأخر"];
const absentStatuses = ["absent", "غائب"];

function getLateMinutes(record: any) {
  const checkIn = record.first_check_in ? new Date(record.first_check_in) : null;
  const shift = record.employees?.shift;
  const shiftStart = shift?.start_time?.slice(0, 5) || record.employees?.shift_start;
  if (!checkIn || !shiftStart) return 0;
  const [h, m] = shiftStart.split(":").map(Number);
  const expected = new Date(checkIn);
  expected.setHours(h || 0, m || 0, 0, 0);
  const grace = Number(shift?.late_tolerance_minutes || 0);
  const late = Math.max(0, Math.round((checkIn.getTime() - expected.getTime()) / 60000));
  return late > grace ? late : 0;
}

export function useHrCommandCenter(filters?: {
  branchId?: string | null;
  department?: string | null;
}) {
  const { dataOwnerId } = useDataOwnerId();
  const query = useQuery<HrCommandCenterData>({
    queryKey: ["hr-command-center", dataOwnerId],
    staleTime: 60_000,
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const since30 = daysAgo(30);
      const since6Months = (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 6);
        d.setDate(1);
        return d.toISOString().split("T")[0];
      })();
      const today = todayISO();
      const monthStartIso = monthStart();

      // ---- Parallel fetches: split into batches to keep TS inference shallow ----
      const [employeesRes, attendanceDaysRes, payrollRes] = await Promise.all([
        supabase
          .from("employees")
          .select(
            "id, name, job_title, department, branch, base_salary, is_active, hire_date, meal_allowance_per_day, transportation_allowance_per_day, spouse_allowance_amount, child_allowance_per_child, children_count, marital_status, wives_count, admin_allowance, other_allowances",
          ),
        supabase
          .from("attendance_days")
          .select("employee_id, attendance_date, status, total_hours, overtime_hours, first_check_in, last_check_out")
          .gte("attendance_date", since30)
          .order("attendance_date", { ascending: false }),
        supabase
          .from("employee_payroll")
          .select("employee_id, period_year, period_month, base_salary, net_salary, total_deductions, loan_deduction, total_allowances, attendance_bonus, special_allowance, is_paid, paid_date, created_at")
          .gte("created_at", since6Months)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false }),
      ]);

      const [loansRes, deductionsRes, leaveReqRes, formsRes] = await Promise.all([
        supabase
          .from("employee_loans")
          .select("employee_id, total_amount, monthly_installment, remaining_amount, status"),
        supabase
          .from("employee_deductions")
          .select("employee_id, amount, deduction_date, deduction_type")
          .gte("deduction_date", monthStartIso),
        // ✅ Canonical source for leaves — see src/hooks/hr/hrCanonicalSources.ts
        supabase
          .from("employee_leaves")
          .select("id, employee_id, leave_type, start_date, end_date, days_count, status, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("employee_forms")
          .select("id, employee_id, form_type, status, created_at, review_notes, form_data, attachment_url")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const employees = employeesRes.data || [];
      const attendanceDays = attendanceDaysRes.data || [];
      const payrollRuns = payrollRes.data || [];
      const loans = loansRes.data || [];
      const deductions = deductionsRes.data || [];
      const leaveReqs = leaveReqRes.data || [];
      const forms = formsRes.data || [];

      // ---- Group attendance by employee ----
      const attByEmp = new Map<string, any[]>();
      attendanceDays.forEach((d: any) => {
        if (!d.employee_id) return;
        const arr = attByEmp.get(d.employee_id) || [];
        arr.push(d);
        attByEmp.set(d.employee_id, arr);
      });

      // ---- Group loans by employee (active only) ----
      const loansByEmp = new Map<string, { installment: number; remaining: number }>();
      loans.forEach((l: any) => {
        if (l.status !== "active" && l.status !== "نشط") return;
        const cur = loansByEmp.get(l.employee_id) || { installment: 0, remaining: 0 };
        cur.installment += Number(l.monthly_installment || 0);
        cur.remaining += Number(l.remaining_amount || 0);
        loansByEmp.set(l.employee_id, cur);
      });

      // ---- Group deductions by employee (this month) ----
      const deductionsByEmp = new Map<string, number>();
      deductions.forEach((d: any) => {
        const cur = deductionsByEmp.get(d.employee_id) || 0;
        deductionsByEmp.set(d.employee_id, cur + Number(d.amount || 0));
      });

      // ---- Latest payroll by employee (this month or last) ----
      const payrollByEmp = new Map<string, any>();
      payrollRuns.forEach((p: any) => {
        if (!payrollByEmp.has(p.employee_id)) payrollByEmp.set(p.employee_id, p);
      });

      // ---- Build employee rows ----
      const rows: HrEmployeeRow[] = employees.map((e: any): HrEmployeeRow => {
        const empAtt = attByEmp.get(e.id) || [];
        const totalDays = empAtt.length;
        const presentDays = empAtt.filter((d) =>
          ["present", "حاضر", "complete", "مكتمل"].includes(d.status),
        ).length;
        const lateDays = empAtt.filter((d) => ["late", "متأخر"].includes(d.status)).length;
        const absentDays = empAtt.filter((d) => ["absent", "غائب"].includes(d.status)).length;
        const attendanceRate =
          totalDays > 0 ? (presentDays + lateDays) / totalDays : 1;
        const lateRate = totalDays > 0 ? lateDays / totalDays : 0;

        // Today's attendance
        const todayRecord = empAtt.find((d) => d.attendance_date === today);
        let presentToday: HrEmployeeRow["presentToday"] = "unknown";
        if (todayRecord) {
          if (["present", "حاضر", "complete", "مكتمل"].includes(todayRecord.status))
            presentToday = "present";
          else if (["late", "متأخر"].includes(todayRecord.status)) presentToday = "late";
          else if (["absent", "غائب"].includes(todayRecord.status)) presentToday = "absent";
          else presentToday = "off";
        } else if (e.is_active === false) {
          presentToday = "off";
        } else {
          presentToday = "absent";
        }

        const baseSalary = Number(e.base_salary || 0);
        const monthDays = 28;
        const allowances =
          Number(e.meal_allowance_per_day || 0) * monthDays +
          Number(e.transportation_allowance_per_day || 0) * monthDays +
          Number(e.spouse_allowance_amount || 0) *
            Number(e.wives_count || (e.marital_status === "married" ? 1 : 0)) +
          Number(e.child_allowance_per_child || 0) * Number(e.children_count || 0) +
          Number(e.admin_allowance || 0) +
          Number(e.other_allowances || 0);
        const loanInfo = loansByEmp.get(e.id) || { installment: 0, remaining: 0 };
        const deductionsThisMonth = deductionsByEmp.get(e.id) || 0;
        const monthlyCost = baseSalary + allowances;

        // Risk scoring (simplified version of useEmployeeRiskScore)
        const attendanceSignal = Math.max(0, Math.min(100, (1 - attendanceRate) * 100));
        const lateSignal = Math.max(0, Math.min(100, (lateRate / 0.3) * 100));
        const deductionRatio = baseSalary > 0 ? deductionsThisMonth / baseSalary : 0;
        const loanBurden = baseSalary > 0 ? loanInfo.installment / baseSalary : 0;
        const costSignal = Math.max(0, Math.min(100, deductionRatio * 250));
        const loanSignal = Math.max(0, Math.min(100, (loanBurden / 0.5) * 100));
        const score = Math.round(
          attendanceSignal * 0.4 +
            lateSignal * 0.2 +
            costSignal * 0.2 +
            loanSignal * 0.1,
        );
        const riskLevel: HrEmployeeRow["riskLevel"] =
          score <= 40 ? "low" : score <= 70 ? "medium" : "high";

        // Determine top issue
        const issues: { label: string; weight: number }[] = [];
        if (attendanceRate < 0.85)
          issues.push({ label: `حضور ${Math.round(attendanceRate * 100)}%`, weight: attendanceSignal * 0.4 });
        if (lateRate > 0.15)
          issues.push({ label: `تأخير ${Math.round(lateRate * 100)}%`, weight: lateSignal * 0.2 });
        if (deductionRatio > 0.2)
          issues.push({ label: `خصومات ${Math.round(deductionRatio * 100)}%`, weight: costSignal * 0.2 });
        if (loanBurden > 0.3)
          issues.push({ label: `قروض ${Math.round(loanBurden * 100)}%`, weight: loanSignal * 0.1 });
        issues.sort((a, b) => b.weight - a.weight);

        return {
          id: e.id,
          name: e.name || "—",
          job_title: e.job_title || null,
          department: e.department || null,
          branch: e.branch || null,
          base_salary: baseSalary,
          is_active: e.is_active !== false,
          riskScore: score,
          riskLevel,
          monthlyCost,
          attendanceRate,
          lateDays,
          absentDays,
          presentToday,
          loanInstallment: loanInfo.installment,
          deductionsThisMonth,
          topIssue: issues[0]?.label,
        };
      });

      // ---- Filter dropdown values ----
      const branches = Array.from(
        new Set(employees.map((e: any) => e.branch).filter(Boolean)),
      ) as string[];
      const departments = Array.from(
        new Set(employees.map((e: any) => e.department).filter(Boolean)),
      ) as string[];

      // ---- Totals ----
      const active = rows.filter((r) => r.is_active);
      const totalMonthlyCost = active.reduce((s, r) => s + r.monthlyCost, 0);
      const avgAttendanceRate =
        active.length > 0
          ? active.reduce((s, r) => s + r.attendanceRate, 0) / active.length
          : 0;
      const totalLateDays = active.reduce((s, r) => s + r.lateDays, 0);
      const avgDelayMinutes = totalLateDays > 0 ? Math.round((totalLateDays / active.length) * 15) : 0;
      const totalPayrollThisMonth = payrollRuns
        .filter((p: any) => {
          const d = new Date(p.created_at);
          const now = new Date();
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        })
        .reduce((s, p: any) => s + Number(p.net_salary || 0), 0);

      // ---- Incomplete punches today ----
      // موظف لديه سجل اليوم لكن بصمة دخول بدون خروج (أو العكس)
      const incompletePunchesToday = attendanceDays.filter((d: any) => {
        if (d.attendance_date !== today) return false;
        const hasIn = !!d.first_check_in;
        const hasOut = !!d.last_check_out;
        return (hasIn && !hasOut) || (!hasIn && hasOut);
      }).length;

      // ---- Pending requests ----
      // employee_leaves uses Arabic statuses: "معلقة" / "موافقة" / "مرفوضة"
      const pendingLeaves = leaveReqs.filter(
        (r: any) =>
          r.status === "pending" ||
          r.status === "قيد المراجعة" ||
          r.status === "معلقة",
      );
      const pendingForms = forms.filter(
        (f: any) => f.status === "pending" || f.status === "قيد المراجعة" || f.status === "معلقة",
      );
      const pendingLoans: any[] = []; // loans table has no pending status in current schema

      // ---- Charts ----
      // Payroll trend (last 6 months)
      const trendMap = new Map<string, { total: number; net: number }>();
      payrollRuns.forEach((p: any) => {
        const key = `${p.period_year}-${String(p.period_month).padStart(2, "0")}`;
        const cur = trendMap.get(key) || { total: 0, net: 0 };
        cur.total +=
          Number(p.base_salary || 0) +
          Number(p.total_allowances || 0) +
          Number(p.attendance_bonus || 0);
        cur.net += Number(p.net_salary || 0);
        trendMap.set(key, cur);
      });
      const payrollTrend = Array.from(trendMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6)
        .map(([month, v]) => ({ month, total: v.total, net: v.net }));

      // Attendance performance — aggregate last 14 days
      const attDayMap = new Map<string, { present: number; late: number; absent: number }>();
      attendanceDays.forEach((d: any) => {
        const key = d.attendance_date;
        const cur = attDayMap.get(key) || { present: 0, late: 0, absent: 0 };
        if (["present", "حاضر", "complete", "مكتمل"].includes(d.status)) cur.present++;
        else if (["late", "متأخر"].includes(d.status)) cur.late++;
        else if (["absent", "غائب"].includes(d.status)) cur.absent++;
        attDayMap.set(key, cur);
      });
      const attendancePerformance = Array.from(attDayMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-14)
        .map(([day, v]) => ({ day, ...v }));

      // Leave usage by type
      const leaveTypeMap = new Map<string, number>();
      leaveReqs.forEach((r: any) => {
        const k = r.leave_type || "غير محدد";
        leaveTypeMap.set(k, (leaveTypeMap.get(k) || 0) + Number(r.days_count || 0));
      });
      const leaveUsage = Array.from(leaveTypeMap.entries()).map(([type, count]) => ({
        type,
        count,
      }));

      return {
        employees: rows,
        filters: { branches, departments },
        totals: {
          total: rows.length,
          active: active.length,
          inactive: rows.length - active.length,
          totalMonthlyCost,
          avgCostPerEmployee: active.length > 0 ? totalMonthlyCost / active.length : 0,
          avgAttendanceRate,
          avgDelayMinutes,
          highRiskCount: rows.filter((r) => r.riskLevel === "high").length,
          mediumRiskCount: rows.filter((r) => r.riskLevel === "medium").length,
          presentToday: rows.filter((r) => r.presentToday === "present").length,
          absentToday: rows.filter((r) => r.presentToday === "absent").length,
          lateToday: rows.filter((r) => r.presentToday === "late").length,
          totalDeductionsThisMonth: rows.reduce((s, r) => s + r.deductionsThisMonth, 0),
          totalLoansOutstanding: Array.from(loansByEmp.values()).reduce(
            (s, l) => s + l.remaining,
            0,
          ),
          totalPayrollThisMonth,
          incompletePunchesToday,
        },
        pendingRequests: {
          leaves: pendingLeaves,
          loans: pendingLoans,
          forms: pendingForms,
        },
        charts: {
          payrollTrend,
          attendancePerformance,
          leaveUsage,
        },
      };
    },
  });

  // Apply filters client-side (cheap, avoids re-fetching)
  const filtered = useMemo(() => {
    if (!query.data) return query.data;
    if (!filters?.branchId && !filters?.department) return query.data;
    const filteredEmployees = query.data.employees.filter((e) => {
      if (filters.branchId && e.branch !== filters.branchId) return false;
      if (filters.department && e.department !== filters.department) return false;
      return true;
    });
    return { ...query.data, employees: filteredEmployees };
  }, [query.data, filters?.branchId, filters?.department]);

  return { ...query, data: filtered };
}
