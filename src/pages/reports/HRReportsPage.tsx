import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Printer, RefreshCw, FileText, Clock, Wallet, AlertTriangle, CheckCircle2, ChevronLeft, Search, X, CalendarDays, Gift } from "lucide-react";
import HRLeavesTab from "./hr/HRLeavesTab";
import HROccasionsTab from "./hr/HROccasionsTab";
import {
  SummaryFilterBar, IncompleteFilterBar, ReadinessFilterBar,
  defaultSummaryFilters, defaultIncompleteFilters, defaultReadinessFilters,
  type SummaryFilters, type IncompleteFilters, type ReadinessFilters,
} from "./hr/HRFilters";
import * as XLSX from "xlsx";
import { setNextExportBranding } from "@/lib/excel-export";
import { fmtDateDisplay } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, subMonths, addDays, parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";

// ────────────── Types ──────────────
type Employee = {
  id: string;
  full_name: string;
  department: string | null;
  branch_id: string | null;
  shift_id: string | null;
  is_active: boolean;
  is_terminated: boolean | null;
  date_of_birth?: string | null;
  start_date?: string | null;
  phone?: string | null;
  annual_leave_balance?: number | null;
  annual_leave_days?: number | null;
  previous_year_balance?: number | null;
};
type Branch = { id: string; name: string };
type Department = { id: string; name: string; name_ar: string | null };
type Shift = { id: string; start_time: string; end_time: string; late_tolerance_minutes: number | null; days_of_week: number[] | null };
type AttDay = {
  id: string;
  employee_id: string;
  attendance_date: string;
  first_check_in: string | null;
  last_check_out: string | null;
  total_hours: number | null;
  overtime_hours: number | null;
  status: string;
  branch_id: string | null;
};
type Holiday = { holiday_date: string };
type WeekCfg = { working_days: number[] | null };
type Correction = {
  id: string;
  employee_id: string;
  attendance_date: string;
  request_type: string;
  status: string;
  reason: string | null;
};

// ────────────── Utils ──────────────
const toIsoDate = (d: Date) => format(d, "yyyy-MM-dd");
const enumerateDates = (from: string, to: string): string[] => {
  const out: string[] = [];
  let cur = parseISO(from);
  const end = parseISO(to);
  while (cur <= end) {
    out.push(toIsoDate(cur));
    cur = addDays(cur, 1);
  }
  return out;
};
const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

// Compute per-employee monthly summary
type EmpSummary = {
  employee: Employee;
  branchName: string;
  required_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  holiday_days: number;
  incomplete_days: number;
  work_hours: number;
  overtime_hours: number;
  late_minutes: number;
  early_leave_minutes: number;
  pending_corrections: number;
  ready: boolean;
  // drill-down
  incompleteDates: AttDay[];
  absentDates: string[];
  lateDates: { date: string; minutes: number }[];
  earlyDates: { date: string; minutes: number }[];
  overtimeDates: { date: string; hours: number }[];
};

function buildSummary(args: {
  employees: Employee[];
  days: AttDay[];
  shifts: Map<string, Shift>;
  workingDays: Set<number>;
  holidays: Set<string>;
  corrections: Correction[];
  branches: Map<string, string>;
  dateFrom: string;
  dateTo: string;
}): EmpSummary[] {
  const allDates = enumerateDates(args.dateFrom, args.dateTo);
  const requiredDates = allDates.filter((d) => {
    const dow = parseISO(d).getDay();
    return args.workingDays.has(dow) && !args.holidays.has(d);
  });
  const required_days = requiredDates.length;
  const holiday_days = allDates.filter((d) => args.holidays.has(d)).length;

  const daysByEmp = new Map<string, AttDay[]>();
  args.days.forEach((d) => {
    if (!daysByEmp.has(d.employee_id)) daysByEmp.set(d.employee_id, []);
    daysByEmp.get(d.employee_id)!.push(d);
  });
  const corrByEmp = new Map<string, Correction[]>();
  args.corrections.forEach((c) => {
    if (!corrByEmp.has(c.employee_id)) corrByEmp.set(c.employee_id, []);
    corrByEmp.get(c.employee_id)!.push(c);
  });

  return args.employees.map((emp) => {
    const empDays = daysByEmp.get(emp.id) || [];
    const dayMap = new Map(empDays.map((d) => [d.attendance_date, d]));
    const shift = emp.shift_id ? args.shifts.get(emp.shift_id) : undefined;

    let present_days = 0, leave_days = 0, incomplete_days = 0;
    let work_hours = 0, overtime_hours = 0;
    let late_minutes = 0, early_leave_minutes = 0;
    const incompleteDates: AttDay[] = [];
    const lateDates: { date: string; minutes: number }[] = [];
    const earlyDates: { date: string; minutes: number }[] = [];
    const overtimeDates: { date: string; hours: number }[] = [];

    empDays.forEach((d) => {
      work_hours += Number(d.total_hours || 0);
      overtime_hours += Number(d.overtime_hours || 0);
      if (Number(d.overtime_hours || 0) > 0) {
        overtimeDates.push({ date: d.attendance_date, hours: Number(d.overtime_hours) });
      }
      if (d.status === "present" || d.status === "late") present_days++;
      else if (d.status === "leave") leave_days++;
      else if (d.status === "incomplete") {
        incomplete_days++;
        incompleteDates.push(d);
      }
      // missing checkout while there's check-in => incomplete
      if (d.first_check_in && !d.last_check_out && d.status !== "incomplete") {
        incomplete_days++;
        incompleteDates.push(d);
      }

      if (shift && d.first_check_in) {
        const checkIn = new Date(d.first_check_in);
        const [sh, sm] = shift.start_time.split(":").map(Number);
        const expectedStart = new Date(checkIn);
        expectedStart.setHours(sh, sm, 0, 0);
        const tol = shift.late_tolerance_minutes ?? 0;
        const lateMin = minutesBetween(expectedStart, checkIn) - tol;
        if (lateMin > 0) {
          late_minutes += lateMin;
          lateDates.push({ date: d.attendance_date, minutes: lateMin });
        }
      }
      if (shift && d.last_check_out) {
        const checkOut = new Date(d.last_check_out);
        const [eh, em] = shift.end_time.split(":").map(Number);
        const expectedEnd = new Date(checkOut);
        expectedEnd.setHours(eh, em, 0, 0);
        const earlyMin = minutesBetween(checkOut, expectedEnd);
        if (earlyMin > 0) {
          early_leave_minutes += earlyMin;
          earlyDates.push({ date: d.attendance_date, minutes: earlyMin });
        }
      }
    });

    // Absent = required dates without a present/leave/incomplete record
    const absentDates: string[] = [];
    requiredDates.forEach((d) => {
      const rec = dayMap.get(d);
      if (!rec || rec.status === "absent") absentDates.push(d);
    });
    const absent_days = absentDates.length;

    const empCorrs = corrByEmp.get(emp.id) || [];
    const pending_corrections = empCorrs.filter((c) => c.status === "pending").length;
    const ready = incomplete_days === 0 && pending_corrections === 0;

    return {
      employee: emp,
      branchName: emp.branch_id ? args.branches.get(emp.branch_id) || "-" : "-",
      required_days,
      present_days,
      absent_days,
      leave_days,
      holiday_days,
      incomplete_days,
      work_hours: Math.round(work_hours * 100) / 100,
      overtime_hours: Math.round(overtime_hours * 100) / 100,
      late_minutes,
      early_leave_minutes,
      pending_corrections,
      ready,
      incompleteDates,
      absentDates,
      lateDates,
      earlyDates,
      overtimeDates,
    };
  });
}

// ────────────── Drill-down Dialog ──────────────
type DrillState = {
  title: string;
  rows: Array<Record<string, any>>;
  columns: { key: string; label: string }[];
} | null;

function DrillDialog({ state, onClose }: { state: DrillState; onClose: () => void }) {
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>{state?.title}</DialogTitle>
        </DialogHeader>
        {!state || state.rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">لا توجد سجلات</div>
        ) : (
          <div className="overflow-auto max-h-[60vh] border rounded-md">
            <table className="w-full text-sm" dir="rtl">
            <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {state.columns.map((c) => (
                    <th key={c.key} className="text-right px-3 py-2 font-semibold">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {state.columns.map((c) => (
                      <td key={c.key} className="px-3 py-2">{r[c.key] ?? "-"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ────────────── Main Page ──────────────
export default function HRReportsPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [month, setMonth] = useState(format(today, "yyyy-MM"));
  const [dateFrom, setDateFrom] = useState(toIsoDate(startOfMonth(today)));
  const [dateTo, setDateTo] = useState(toIsoDate(endOfMonth(today)));
  const [branchId, setBranchId] = useState<string>("all");
  const [departmentName, setDepartmentName] = useState<string>("all");
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [comparePrev, setComparePrev] = useState(false);
  const [drill, setDrill] = useState<DrillState>(null);
  // Per-table quick filters
  const [summaryQuery, setSummaryQuery] = useState("");
  const [summaryOnlyReview, setSummaryOnlyReview] = useState(false);
  const [incompleteQuery, setIncompleteQuery] = useState("");
  const [readinessQuery, setReadinessQuery] = useState("");
  const [readinessFilter, setReadinessFilter] = useState<"all" | "ready" | "review">("all");
  // Advanced per-tab filters
  const [summaryFilters, setSummaryFilters] = useState<SummaryFilters>(defaultSummaryFilters);
  const [incompleteFilters, setIncompleteFilters] = useState<IncompleteFilters>(defaultIncompleteFilters);
  const [readinessFilters, setReadinessFilters] = useState<ReadinessFilters>(defaultReadinessFilters);

  // Sync month -> from/to
  useEffect(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    setDateFrom(toIsoDate(startOfMonth(first)));
    setDateTo(toIsoDate(endOfMonth(first)));
  }, [month]);

  // Reference data (branches, departments, employees, shifts, work_week, holidays)
  const { data: refData } = useQuery({
    queryKey: ["hr-reports-ref"],
    queryFn: async () => {
      const [branchesQ, depsQ, empsQ, shiftsQ, weekQ, holsQ] = await Promise.all([
        supabase.from("branches").select("id,name").eq("is_active", true),
        supabase.from("departments").select("id,name,name_ar").eq("is_active", true).eq("is_deleted", false),
        supabase.from("employees").select("id,full_name,department,branch_id,shift_id,is_active,is_terminated,date_of_birth,start_date,phone,annual_leave_balance,annual_leave_days,previous_year_balance").eq("is_active", true),
        supabase.from("work_shifts").select("id,start_time,end_time,late_tolerance_minutes,days_of_week").eq("is_active", true),
        supabase.from("hr_work_week_config").select("working_days").maybeSingle(),
        supabase.from("official_holidays").select("holiday_date").eq("is_active", true),
      ]);
      return {
        branches: (branchesQ.data || []) as Branch[],
        departments: (depsQ.data || []) as Department[],
        employees: (empsQ.data || []) as Employee[],
        shifts: (shiftsQ.data || []) as Shift[],
        weekCfg: (weekQ.data || null) as WeekCfg | null,
        holidays: (holsQ.data || []) as Holiday[],
      };
    },
  });

  // Period data (attendance_days + correction_requests)
  const { data: periodData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["hr-reports-period", dateFrom, dateTo],
    queryFn: async () => {
      const [daysQ, corrsQ] = await Promise.all([
        supabase.from("attendance_days").select("id,employee_id,attendance_date,first_check_in,last_check_out,total_hours,overtime_hours,status,branch_id")
          .gte("attendance_date", dateFrom).lte("attendance_date", dateTo),
        supabase.from("correction_requests").select("id,employee_id,attendance_date,request_type,status,reason")
          .gte("attendance_date", dateFrom).lte("attendance_date", dateTo),
      ]);
      return {
        days: (daysQ.data || []) as AttDay[],
        corrections: (corrsQ.data || []) as Correction[],
      };
    },
    enabled: !!refData,
  });

  // Previous period (compare)
  const prevRange = useMemo(() => {
    const f = startOfMonth(subMonths(parseISO(dateFrom), 1));
    return { from: toIsoDate(f), to: toIsoDate(endOfMonth(f)) };
  }, [dateFrom]);

  const { data: prevPeriodData } = useQuery({
    queryKey: ["hr-reports-prev", prevRange.from, prevRange.to],
    queryFn: async () => {
      const [daysQ, corrsQ] = await Promise.all([
        supabase.from("attendance_days").select("id,employee_id,attendance_date,first_check_in,last_check_out,total_hours,overtime_hours,status,branch_id")
          .gte("attendance_date", prevRange.from).lte("attendance_date", prevRange.to),
        supabase.from("correction_requests").select("id,employee_id,attendance_date,request_type,status,reason")
          .gte("attendance_date", prevRange.from).lte("attendance_date", prevRange.to),
      ]);
      return {
        days: (daysQ.data || []) as AttDay[],
        corrections: (corrsQ.data || []) as Correction[],
      };
    },
    enabled: comparePrev && !!refData,
  });

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    if (!refData) return [];
    return refData.employees.filter((e) => {
      if (branchId !== "all" && e.branch_id !== branchId) return false;
      if (departmentName !== "all" && e.department !== departmentName) return false;
      if (employeeId !== "all" && e.id !== employeeId) return false;
      return true;
    });
  }, [refData, branchId, departmentName, employeeId]);

  // Build summaries
  const summaries = useMemo<EmpSummary[]>(() => {
    if (!refData || !periodData) return [];
    const shifts = new Map(refData.shifts.map((s) => [s.id, s]));
    const branches = new Map(refData.branches.map((b) => [b.id, b.name]));
    const workingDays = new Set<number>(refData.weekCfg?.working_days ?? [0, 1, 2, 3, 4, 5]);
    const holidays = new Set<string>(refData.holidays.map((h) => h.holiday_date));
    return buildSummary({
      employees: filteredEmployees,
      days: periodData.days,
      shifts, workingDays, holidays,
      corrections: periodData.corrections,
      branches, dateFrom, dateTo,
    });
  }, [refData, periodData, filteredEmployees, dateFrom, dateTo]);

  const prevSummaries = useMemo<EmpSummary[]>(() => {
    if (!comparePrev || !refData || !prevPeriodData) return [];
    const shifts = new Map(refData.shifts.map((s) => [s.id, s]));
    const branches = new Map(refData.branches.map((b) => [b.id, b.name]));
    const workingDays = new Set<number>(refData.weekCfg?.working_days ?? [0, 1, 2, 3, 4, 5]);
    const holidays = new Set<string>(refData.holidays.map((h) => h.holiday_date));
    return buildSummary({
      employees: filteredEmployees,
      days: prevPeriodData.days,
      shifts, workingDays, holidays,
      corrections: prevPeriodData.corrections,
      branches, dateFrom: prevRange.from, dateTo: prevRange.to,
    });
  }, [comparePrev, refData, prevPeriodData, filteredEmployees, prevRange]);

  const prevByEmp = useMemo(() => new Map(prevSummaries.map((s) => [s.employee.id, s])), [prevSummaries]);

  // Departments list (from employees actually present)
  const departmentsForSelect = useMemo(() => {
    const set = new Set<string>();
    refData?.employees.forEach((e) => { if (e.department) set.add(e.department); });
    return Array.from(set).sort();
  }, [refData]);

  // Build filter option lists from current summaries
  const summaryBranchOptions = useMemo(() => {
    const set = new Set<string>();
    summaries.forEach((s) => { if (s.branchName && s.branchName !== "-") set.add(s.branchName); });
    return Array.from(set).sort().map((v) => ({ value: v, label: v }));
  }, [summaries]);
  const summaryDeptOptions = useMemo(() => {
    const set = new Set<string>();
    summaries.forEach((s) => { if (s.employee.department) set.add(s.employee.department); });
    return Array.from(set).sort().map((v) => ({ value: v, label: v }));
  }, [summaries]);
  const employeeOptions = useMemo(
    () => filteredEmployees.map((e) => ({ value: e.id, label: e.full_name })),
    [filteredEmployees]
  );

  // ── Filtered datasets ──
  const filteredSummaries = useMemo(() => {
    const q = summaryQuery.trim().toLowerCase();
    const f = summaryFilters;
    return summaries.filter((s) => {
      if (summaryOnlyReview && s.ready) return false;
      if (q) {
        const hit =
          s.employee.full_name.toLowerCase().includes(q) ||
          (s.branchName || "").toLowerCase().includes(q) ||
          (s.employee.department || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (f.status === "ready" && !s.ready) return false;
      if (f.status === "review" && s.ready) return false;
      if (f.branch !== "all" && s.branchName !== f.branch) return false;
      if (f.department !== "all" && (s.employee.department || "") !== f.department) return false;
      const tri = (state: typeof f.absence, val: number) => state === "all" || (state === "has" ? val > 0 : val === 0);
      if (!tri(f.absence, s.absent_days)) return false;
      if (!tri(f.incomplete, s.incomplete_days)) return false;
      if (!tri(f.overtime, s.overtime_hours)) return false;
      if (!tri(f.late, s.late_minutes)) return false;
      if (f.absentMin !== undefined && s.absent_days < f.absentMin) return false;
      if (f.absentMax !== undefined && s.absent_days > f.absentMax) return false;
      if (f.hoursMin !== undefined && s.work_hours < f.hoursMin) return false;
      if (f.hoursMax !== undefined && s.work_hours > f.hoursMax) return false;
      if (f.otMin !== undefined && s.overtime_hours < f.otMin) return false;
      if (f.otMax !== undefined && s.overtime_hours > f.otMax) return false;
      return true;
    });
  }, [summaries, summaryQuery, summaryOnlyReview, summaryFilters]);

  const filteredIncomplete = useMemo(() => {
    const all = summaries.flatMap((s) =>
      s.incompleteDates.map((d) => {
        const issueKey = !d.first_check_in ? "no_in" : !d.last_check_out ? "no_out" : "missing";
        const issue = issueKey === "no_in" ? "بدون دخول" : issueKey === "no_out" ? "بدون خروج" : "بصمة ناقصة";
        const corr = (periodData?.corrections || []).find((c) => c.employee_id === s.employee.id && c.attendance_date === d.attendance_date);
        return { s, d, issue, issueKey, corr };
      })
    );
    const q = incompleteQuery.trim().toLowerCase();
    const f = incompleteFilters;
    return all.filter(({ s, d, issue, issueKey, corr }) => {
      if (q) {
        const hit =
          s.employee.full_name.toLowerCase().includes(q) ||
          (s.branchName || "").toLowerCase().includes(q) ||
          fmtDateDisplay(d.attendance_date).toLowerCase().includes(q) ||
          d.attendance_date.includes(q) ||
          issue.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (f.issue !== "all" && f.issue !== issueKey) return false;
      if (f.corrStatus !== "all") {
        if (f.corrStatus === "none" && corr) return false;
        if (f.corrStatus !== "none" && (!corr || corr.status !== f.corrStatus)) return false;
      }
      if (f.branch !== "all" && s.branchName !== f.branch) return false;
      if (f.department !== "all" && (s.employee.department || "") !== f.department) return false;
      if (f.employeeId !== "all" && s.employee.id !== f.employeeId) return false;
      if (f.dateFrom && d.attendance_date < f.dateFrom) return false;
      if (f.dateTo && d.attendance_date > f.dateTo) return false;
      return true;
    });
  }, [summaries, periodData, incompleteQuery, incompleteFilters]);

  const filteredReadiness = useMemo(() => {
    const q = readinessQuery.trim().toLowerCase();
    const f = readinessFilters;
    return summaries.filter((s) => {
      if (readinessFilter === "ready" && !s.ready) return false;
      if (readinessFilter === "review" && s.ready) return false;
      if (q) {
        const hit =
          s.employee.full_name.toLowerCase().includes(q) ||
          (s.branchName || "").toLowerCase().includes(q) ||
          (s.employee.department || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (f.status === "ready" && !s.ready) return false;
      if (f.status === "review" && s.ready) return false;
      if (f.branch !== "all" && s.branchName !== f.branch) return false;
      if (f.department !== "all" && (s.employee.department || "") !== f.department) return false;
      if (f.employeeId !== "all" && s.employee.id !== f.employeeId) return false;
      if (f.reason !== "all") {
        if (f.reason === "incomplete" && s.incomplete_days === 0) return false;
        if (f.reason === "pending" && s.pending_corrections === 0) return false;
        if (f.reason === "absence" && s.absent_days === 0) return false;
        if (f.reason === "no_shift" && s.employee.shift_id) return false;
        if (f.reason === "other") {
          // "other" = not ready but no specific known reason
          if (s.ready) return false;
          if (s.incomplete_days > 0 || s.pending_corrections > 0) return false;
        }
      }
      return true;
    });
  }, [summaries, readinessQuery, readinessFilter, readinessFilters]);

  // Excel export per active tab
  const exportExcel = (tab: "summary" | "incomplete" | "readiness") => {
    let rows: Record<string, any>[] = [];
    let title = "";
    if (tab === "summary") {
      title = "ملخص_الدوام_الشهري";
      rows = filteredSummaries.map((s) => ({
        "الموظف": s.employee.full_name,
        "الفرع": s.branchName,
        "القسم": s.employee.department || "-",
        "أيام الدوام المطلوبة": s.required_days,
        "أيام الحضور": s.present_days,
        "أيام الغياب": s.absent_days,
        "أيام الإجازة": s.leave_days,
        "أيام العطل": s.holiday_days,
        "بصمات غير مكتملة": s.incomplete_days,
        "ساعات العمل": s.work_hours,
        "ساعات إضافية": s.overtime_hours,
        "دقائق التأخير": s.late_minutes,
        "دقائق الخروج المبكر": s.early_leave_minutes,
        "الحالة": s.ready ? "مكتمل" : "يحتاج مراجعة",
      }));
    } else if (tab === "incomplete") {
      title = "البصمات_غير_المكتملة";
      rows = filteredIncomplete.map(({ s, d, issue, corr }) => ({
        "التاريخ": fmtDateDisplay(d.attendance_date),
        "الموظف": s.employee.full_name,
        "الفرع": s.branchName,
        "القسم": s.employee.department || "-",
        "دخول": d.first_check_in ? format(new Date(d.first_check_in), "HH:mm") : "-",
        "خروج": d.last_check_out ? format(new Date(d.last_check_out), "HH:mm") : "-",
        "نوع المشكلة": issue,
        "طلب تصحيح": corr ? (corr.status === "pending" ? "قيد المراجعة" : corr.status === "approved" ? "معتمد" : "مرفوض") : "—",
      }));
    } else {
      title = "جاهزية_الرواتب";
      rows = filteredReadiness.map((s) => ({
        "الموظف": s.employee.full_name,
        "الفرع": s.branchName,
        "القسم": s.employee.department || "-",
        "أيام الحضور": s.present_days,
        "أيام الغياب": s.absent_days,
        "بصمات ناقصة": s.incomplete_days,
        "طلبات معلقة": s.pending_corrections,
        "ساعات إضافية": s.overtime_hours,
        "دقائق تأخير": s.late_minutes,
        "جاهز للراتب؟": s.ready ? "نعم" : "لا",
        "سبب التعليق": s.ready ? "-" : [s.incomplete_days > 0 ? `${s.incomplete_days} بصمات ناقصة` : null, s.pending_corrections > 0 ? `${s.pending_corrections} طلبات معلقة` : null].filter(Boolean).join(" • "),
      }));
    }
    if (rows.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 30));
    setNextExportBranding({ title });
    XLSX.writeFile(wb, `${title}_${dateFrom}_${dateTo}.xlsx`);
  };

  const print = () => window.print();

  const openIncompleteDrill = (s: EmpSummary) => {
    setDrill({
      title: `البصمات الناقصة — ${s.employee.full_name}`,
      columns: [
        { key: "date", label: "التاريخ" },
        { key: "in", label: "دخول" },
        { key: "out", label: "خروج" },
        { key: "issue", label: "نوع المشكلة" },
      ],
      rows: s.incompleteDates.map((d) => ({
        date: fmtDateDisplay(d.attendance_date),
        in: d.first_check_in ? format(new Date(d.first_check_in), "HH:mm") : "-",
        out: d.last_check_out ? format(new Date(d.last_check_out), "HH:mm") : "-",
        issue: !d.first_check_in ? "بدون دخول" : !d.last_check_out ? "بدون خروج" : "بصمة ناقصة",
      })),
    });
  };
  const openAbsentDrill = (s: EmpSummary) => {
    setDrill({
      title: `أيام الغياب — ${s.employee.full_name}`,
      columns: [{ key: "date", label: "التاريخ" }],
      rows: s.absentDates.map((d) => ({ date: fmtDateDisplay(d) })),
    });
  };
  const openLateDrill = (s: EmpSummary) => {
    setDrill({
      title: `أيام التأخير — ${s.employee.full_name}`,
      columns: [{ key: "date", label: "التاريخ" }, { key: "minutes", label: "دقائق التأخير" }],
      rows: s.lateDates.map((d) => ({ date: fmtDateDisplay(d.date), minutes: d.minutes })),
    });
  };
  const openEarlyDrill = (s: EmpSummary) => {
    setDrill({
      title: `الخروج المبكر — ${s.employee.full_name}`,
      columns: [{ key: "date", label: "التاريخ" }, { key: "minutes", label: "دقائق الخروج المبكر" }],
      rows: s.earlyDates.map((d) => ({ date: fmtDateDisplay(d.date), minutes: d.minutes })),
    });
  };
  const openOvertimeDrill = (s: EmpSummary) => {
    setDrill({
      title: `الساعات الإضافية — ${s.employee.full_name}`,
      columns: [{ key: "date", label: "التاريخ" }, { key: "hours", label: "ساعات إضافية" }],
      rows: s.overtimeDates.map((d) => ({ date: fmtDateDisplay(d.date), hours: d.hours })),
    });
  };

  const loading = isLoading || isFetching || !refData;

  // Delta helper for compare
  const delta = (cur: number, prev: number | undefined) => {
    if (!comparePrev || prev === undefined) return null;
    const d = cur - prev;
    if (d === 0) return <span className="text-muted-foreground text-[10px]">=</span>;
    return (
      <span className={`text-[10px] ${d > 0 ? "text-emerald-600" : "text-red-600"}`}>
        {d > 0 ? "▲" : "▼"} {Math.abs(d)}
      </span>
    );
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/hr")}>
            <ChevronLeft className="h-4 w-4 ml-1" /> رجوع
          </Button>
          <div>
            <h1 className="text-xl font-bold">تقارير HR</h1>
            <p className="text-xs text-muted-foreground">ملخص الدوام، البصمات الناقصة، جاهزية الرواتب</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div>
            <Label className="text-xs">الشهر</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 mt-1" />
          </div>
          <div>
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 mt-1" />
            <p className="text-[10px] text-muted-foreground mt-1">{fmtDateDisplay(dateFrom)}</p>
          </div>
          <div>
            <Label className="text-xs">إلى تاريخ</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 mt-1" />
            <p className="text-[10px] text-muted-foreground mt-1">{fmtDateDisplay(dateTo)}</p>
          </div>
          <div>
            <Label className="text-xs">الفرع</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {refData?.branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">القسم</Label>
            <Select value={departmentName} onValueChange={setDepartmentName}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأقسام</SelectItem>
                {departmentsForSelect.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">الموظف</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">كل الموظفين</SelectItem>
                {filteredEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs">مقارنة بالشهر السابق</Label>
            <div className="flex items-center gap-2 mt-1">
              <Switch checked={comparePrev} onCheckedChange={setComparePrev} />
              <span className="text-xs text-muted-foreground">{comparePrev ? "مفعّل" : "متوقف"}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Button size="sm" variant="default" onClick={() => refetch()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ml-1 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
          <Button size="sm" variant="outline" onClick={print}>
            <Printer className="h-4 w-4 ml-1" /> طباعة
          </Button>
          <Badge variant="secondary" className="text-[11px]">
            {fmtDateDisplay(dateFrom)} → {fmtDateDisplay(dateTo)} • {filteredEmployees.length} موظف
          </Badge>
          {comparePrev && (
            <Badge variant="outline" className="text-[11px]">
              مقارنة مع: {fmtDateDisplay(prevRange.from)} → {fmtDateDisplay(prevRange.to)}
            </Badge>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="summary" className="print-area">
        <TabsList className="print:hidden">
          <TabsTrigger value="summary"><FileText className="h-4 w-4 ml-1" /> ملخص الدوام الشهري</TabsTrigger>
          <TabsTrigger value="incomplete"><AlertTriangle className="h-4 w-4 ml-1" /> البصمات غير المكتملة</TabsTrigger>
          <TabsTrigger value="readiness"><Wallet className="h-4 w-4 ml-1" /> جاهزية الرواتب</TabsTrigger>
          <TabsTrigger value="leaves"><CalendarDays className="h-4 w-4 ml-1" /> الإجازات</TabsTrigger>
          <TabsTrigger value="occasions"><Gift className="h-4 w-4 ml-1" /> المناسبات القادمة</TabsTrigger>
        </TabsList>

        {/* ── Summary tab ── */}
        <TabsContent value="summary" className="space-y-3 mt-4">
          <div className="flex items-center justify-between print:hidden">
            <h2 className="text-sm font-semibold">ملخص الدوام الشهري</h2>
            <Button size="sm" variant="outline" onClick={() => exportExcel("summary")} disabled={filteredSummaries.length === 0}>
              <Download className="h-4 w-4 ml-1" /> Excel
            </Button>
          </div>
          {/* Per-table filter bar */}
          <div className="flex flex-wrap items-center gap-2 print:hidden" dir="rtl">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={summaryQuery}
                onChange={(e) => setSummaryQuery(e.target.value)}
                placeholder="بحث: اسم الموظف، الفرع، أو القسم..."
                className="pr-8 h-9 text-sm"
              />
              {summaryQuery && (
                <button onClick={() => setSummaryQuery("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button size="sm" variant={summaryOnlyReview ? "default" : "outline"} onClick={() => setSummaryOnlyReview(v => !v)} className="h-9 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 ml-1" /> يحتاج مراجعة فقط
            </Button>
            <SummaryFilterBar
              filters={summaryFilters} setFilters={setSummaryFilters}
              branches={summaryBranchOptions} departments={summaryDeptOptions}
            />
          </div>
          <Card className="overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : summaries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">لا توجد بيانات للفترة المحددة</div>
            ) : (() => {
              const filtered = filteredSummaries;
              if (filtered.length === 0) return (
                <div className="text-center py-10 text-muted-foreground text-sm space-y-2">
                  <div>لا توجد نتائج مطابقة للفلاتر الحالية</div>
                  <Button size="sm" variant="outline" onClick={() => { setSummaryFilters(defaultSummaryFilters); setSummaryQuery(""); setSummaryOnlyReview(false); }}>مسح الفلاتر</Button>
                </div>
              );
              return (
              <div className="overflow-x-auto" dir="rtl">
                <table className="w-full text-sm" dir="rtl">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-right px-3 py-2 font-semibold sticky right-0 bg-muted/50 min-w-[150px]">الموظف</th>
                      <th className="text-right px-3 py-2 font-semibold">الفرع</th>
                      <th className="text-right px-3 py-2 font-semibold">القسم</th>
                      <th className="text-center px-3 py-2 font-semibold">المطلوبة</th>
                      <th className="text-center px-3 py-2 font-semibold">حضور</th>
                      <th className="text-center px-3 py-2 font-semibold">غياب</th>
                      <th className="text-center px-3 py-2 font-semibold">إجازة</th>
                      <th className="text-center px-3 py-2 font-semibold">عطل</th>
                      <th className="text-center px-3 py-2 font-semibold">ناقصة</th>
                      <th className="text-center px-3 py-2 font-semibold">ساعات</th>
                      <th className="text-center px-3 py-2 font-semibold">إضافي</th>
                      <th className="text-center px-3 py-2 font-semibold">تأخير (د)</th>
                      <th className="text-center px-3 py-2 font-semibold">خروج مبكر (د)</th>
                      <th className="text-center px-3 py-2 font-semibold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => {
                      const prev = prevByEmp.get(s.employee.id);
                      return (
                        <tr key={s.employee.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2 sticky right-0 bg-card font-medium">{s.employee.full_name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{s.branchName}</td>
                          <td className="px-3 py-2 text-muted-foreground">{s.employee.department || "-"}</td>
                          <td className="px-3 py-2 text-center">{s.required_days}</td>
                          <td className="px-3 py-2 text-center">
                            {s.present_days} {delta(s.present_days, prev?.present_days)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button className="text-red-600 hover:underline disabled:no-underline disabled:text-muted-foreground" disabled={s.absent_days === 0} onClick={() => openAbsentDrill(s)}>
                              {s.absent_days}
                            </button>{" "}{delta(s.absent_days, prev?.absent_days)}
                          </td>
                          <td className="px-3 py-2 text-center">{s.leave_days}</td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{s.holiday_days}</td>
                          <td className="px-3 py-2 text-center">
                            <button className="text-amber-600 hover:underline disabled:no-underline disabled:text-muted-foreground" disabled={s.incomplete_days === 0} onClick={() => openIncompleteDrill(s)}>
                              {s.incomplete_days}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">{s.work_hours.toFixed(1)}</td>
                          <td className="px-3 py-2 text-center">
                            <button className="text-emerald-600 hover:underline disabled:no-underline disabled:text-muted-foreground" disabled={s.overtime_hours === 0} onClick={() => openOvertimeDrill(s)}>
                              {s.overtime_hours.toFixed(1)}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button className="text-amber-600 hover:underline disabled:no-underline disabled:text-muted-foreground" disabled={s.late_minutes === 0} onClick={() => openLateDrill(s)}>
                              {s.late_minutes}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button className="text-amber-600 hover:underline disabled:no-underline disabled:text-muted-foreground" disabled={s.early_leave_minutes === 0} onClick={() => openEarlyDrill(s)}>
                              {s.early_leave_minutes}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {s.ready ? (
                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">مكتمل</Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">يحتاج مراجعة</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 border-t font-semibold text-xs">
                      <td colSpan={14} className="px-3 py-2 text-right text-muted-foreground">
                        عرض {filtered.length} من {summaries.length} موظف
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              );
            })()}
          </Card>
        </TabsContent>

        {/* ── Incomplete tab ── */}
        <TabsContent value="incomplete" className="space-y-3 mt-4">
          <div className="flex items-center justify-between print:hidden">
            <h2 className="text-sm font-semibold">البصمات غير المكتملة</h2>
            <Button size="sm" variant="outline" onClick={() => exportExcel("incomplete")} disabled={filteredIncomplete.length === 0}>
              <Download className="h-4 w-4 ml-1" /> Excel
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden" dir="rtl">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={incompleteQuery}
                onChange={(e) => setIncompleteQuery(e.target.value)}
                placeholder="بحث: اسم الموظف، الفرع، التاريخ، أو المشكلة..."
                className="pr-8 h-9 text-sm"
              />
              {incompleteQuery && (
                <button onClick={() => setIncompleteQuery("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <IncompleteFilterBar
              filters={incompleteFilters} setFilters={setIncompleteFilters}
              branches={summaryBranchOptions} departments={summaryDeptOptions} employees={employeeOptions}
            />
          </div>
          <Card className="overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (() => {
              const allRows = summaries.flatMap((s) =>
                s.incompleteDates.map((d) => {
                  const issue = !d.first_check_in ? "بدون دخول" : !d.last_check_out ? "بدون خروج" : "بصمة ناقصة";
                  const corr = (periodData?.corrections || []).find((c) => c.employee_id === s.employee.id && c.attendance_date === d.attendance_date);
                  return { s, d, issue, corr };
                })
              );
              if (allRows.length === 0) {
                return (
                  <div className="text-center py-12 text-emerald-600 text-sm">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-60" />
                    لا توجد بصمات ناقصة في هذه الفترة
                  </div>
                );
              }
              const rows = filteredIncomplete;
              if (rows.length === 0) return (
                <div className="text-center py-10 text-muted-foreground text-sm space-y-2">
                  <div>لا توجد نتائج مطابقة للفلاتر الحالية</div>
                  <Button size="sm" variant="outline" onClick={() => { setIncompleteFilters(defaultIncompleteFilters); setIncompleteQuery(""); }}>مسح الفلاتر</Button>
                </div>
              );
              return (
                <div className="overflow-x-auto" dir="rtl">
                  <table className="w-full text-sm" dir="rtl">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-right px-3 py-2 font-semibold">التاريخ</th>
                        <th className="text-right px-3 py-2 font-semibold">الموظف</th>
                        <th className="text-right px-3 py-2 font-semibold">الفرع</th>
                        <th className="text-center px-3 py-2 font-semibold">دخول</th>
                        <th className="text-center px-3 py-2 font-semibold">خروج</th>
                        <th className="text-center px-3 py-2 font-semibold">المشكلة</th>
                        <th className="text-center px-3 py-2 font-semibold">طلب تصحيح</th>
                        <th className="text-center px-3 py-2 font-semibold print:hidden">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ s, d, issue, corr }) => (
                        <tr key={d.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2">{fmtDateDisplay(d.attendance_date)}</td>
                          <td className="px-3 py-2 font-medium">{s.employee.full_name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{s.branchName}</td>
                          <td className="px-3 py-2 text-center">{d.first_check_in ? format(new Date(d.first_check_in), "HH:mm") : "-"}</td>
                          <td className="px-3 py-2 text-center">{d.last_check_out ? format(new Date(d.last_check_out), "HH:mm") : "-"}</td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant="outline" className="text-amber-600 border-amber-300">{issue}</Badge>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {corr ? (
                              <Badge className={
                                corr.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                                corr.status === "rejected" ? "bg-red-100 text-red-700" :
                                "bg-amber-100 text-amber-700"
                              }>
                                {corr.status === "pending" ? "قيد المراجعة" : corr.status === "approved" ? "معتمد" : "مرفوض"}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center print:hidden">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/hr-attendance?date=${d.attendance_date}&employee=${s.employee.id}`)}>
                              فتح اليوم
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/30 border-t font-semibold text-xs">
                        <td colSpan={8} className="px-3 py-2 text-right text-muted-foreground">
                          عرض {rows.length} من {allRows.length} بصمة ناقصة
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </Card>
        </TabsContent>

        {/* ── Readiness tab ── */}
        <TabsContent value="readiness" className="space-y-3 mt-4">
          <div className="flex items-center justify-between print:hidden">
            <h2 className="text-sm font-semibold">جاهزية الرواتب</h2>
            <Button size="sm" variant="outline" onClick={() => exportExcel("readiness")} disabled={summaries.length === 0}>
              <Download className="h-4 w-4 ml-1" /> Excel
            </Button>
          </div>
          {!loading && summaries.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">إجمالي الموظفين</div>
                <div className="text-2xl font-bold">{summaries.length}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">جاهزون</div>
                <div className="text-2xl font-bold text-emerald-600">{summaries.filter((s) => s.ready).length}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">يحتاجون مراجعة</div>
                <div className="text-2xl font-bold text-amber-600">{summaries.filter((s) => !s.ready).length}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">طلبات معلقة</div>
                <div className="text-2xl font-bold text-amber-600">{summaries.reduce((a, s) => a + s.pending_corrections, 0)}</div>
              </Card>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 print:hidden" dir="rtl">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={readinessQuery}
                onChange={(e) => setReadinessQuery(e.target.value)}
                placeholder="بحث: اسم الموظف، الفرع، أو القسم..."
                className="pr-8 h-9 text-sm"
              />
              {readinessQuery && (
                <button onClick={() => setReadinessQuery("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant={readinessFilter === "all" ? "default" : "outline"} onClick={() => setReadinessFilter("all")} className="h-9 text-xs">الكل</Button>
              <Button size="sm" variant={readinessFilter === "ready" ? "default" : "outline"} onClick={() => setReadinessFilter("ready")} className="h-9 text-xs">جاهز فقط</Button>
              <Button size="sm" variant={readinessFilter === "review" ? "default" : "outline"} onClick={() => setReadinessFilter("review")} className="h-9 text-xs">يحتاج مراجعة</Button>
            </div>
          </div>
          <Card className="overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : summaries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">لا توجد بيانات للفترة المحددة</div>
            ) : (() => {
              const q = readinessQuery.trim().toLowerCase();
              const filtered = summaries.filter(s => {
                if (readinessFilter === "ready" && !s.ready) return false;
                if (readinessFilter === "review" && s.ready) return false;
                if (!q) return true;
                return (
                  s.employee.full_name.toLowerCase().includes(q) ||
                  (s.branchName || "").toLowerCase().includes(q) ||
                  (s.employee.department || "").toLowerCase().includes(q)
                );
              });
              if (filtered.length === 0) return <div className="text-center py-10 text-muted-foreground text-sm">لا نتائج مطابقة</div>;
              return (
              <div className="overflow-x-auto" dir="rtl">
                <table className="w-full text-sm" dir="rtl">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-right px-3 py-2 font-semibold sticky right-0 bg-muted/50 min-w-[150px]">الموظف</th>
                      <th className="text-right px-3 py-2 font-semibold">الفرع</th>
                      <th className="text-right px-3 py-2 font-semibold">القسم</th>
                      <th className="text-center px-3 py-2 font-semibold">حضور</th>
                      <th className="text-center px-3 py-2 font-semibold">غياب</th>
                      <th className="text-center px-3 py-2 font-semibold">بصمات ناقصة</th>
                      <th className="text-center px-3 py-2 font-semibold">طلبات معلقة</th>
                      <th className="text-center px-3 py-2 font-semibold">إضافي</th>
                      <th className="text-center px-3 py-2 font-semibold">تأخير (د)</th>
                      <th className="text-center px-3 py-2 font-semibold">جاهز للراتب؟</th>
                      <th className="text-right px-3 py-2 font-semibold">سبب التعليق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => {
                      const reasons: string[] = [];
                      if (s.incomplete_days > 0) reasons.push(`${s.incomplete_days} بصمات ناقصة`);
                      if (s.pending_corrections > 0) reasons.push(`${s.pending_corrections} طلبات معلقة`);
                      return (
                        <tr key={s.employee.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2 sticky right-0 bg-card font-medium">{s.employee.full_name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{s.branchName}</td>
                          <td className="px-3 py-2 text-muted-foreground">{s.employee.department || "-"}</td>
                          <td className="px-3 py-2 text-center">{s.present_days}</td>
                          <td className="px-3 py-2 text-center">{s.absent_days}</td>
                          <td className="px-3 py-2 text-center">
                            <button className="text-amber-600 hover:underline disabled:no-underline disabled:text-muted-foreground" disabled={s.incomplete_days === 0} onClick={() => openIncompleteDrill(s)}>
                              {s.incomplete_days}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">{s.pending_corrections}</td>
                          <td className="px-3 py-2 text-center">{s.overtime_hours.toFixed(1)}</td>
                          <td className="px-3 py-2 text-center">{s.late_minutes}</td>
                          <td className="px-3 py-2 text-center">
                            {s.ready ? (
                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">نعم</Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">لا</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{reasons.length === 0 ? "-" : reasons.join(" • ")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 border-t font-semibold text-xs">
                      <td colSpan={11} className="px-3 py-2 text-right text-muted-foreground">
                        عرض {filtered.length} من {summaries.length} موظف
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              );
            })()}
          </Card>
          <p className="text-[11px] text-muted-foreground print:hidden">
            ملاحظة: هذا التقرير يعرض جاهزية البيانات فقط (بصمات + طلبات). لا يحسب أي مبالغ نهائية ولا يغيّر منطق الرواتب.
          </p>
        </TabsContent>

        {/* ── Leaves tab ── */}
        <TabsContent value="leaves" className="space-y-3 mt-4">
          <HRLeavesTab
            employees={filteredEmployees.map((e) => ({
              id: e.id,
              full_name: e.full_name,
              department: e.department,
              branch_id: e.branch_id,
              annual_leave_balance: e.annual_leave_balance ?? null,
              annual_leave_days: e.annual_leave_days ?? null,
              previous_year_balance: e.previous_year_balance ?? null,
            }))}
            branchName={(id) => (id && refData ? (refData.branches.find((b) => b.id === id)?.name || "-") : "-")}
            dateFrom={dateFrom}
            dateTo={dateTo}
            loading={loading}
          />
        </TabsContent>

        {/* ── Occasions tab ── */}
        <TabsContent value="occasions" className="space-y-3 mt-4">
          <HROccasionsTab
            employees={filteredEmployees.map((e) => ({
              id: e.id,
              full_name: e.full_name,
              department: e.department,
              branch_id: e.branch_id,
              date_of_birth: e.date_of_birth ?? null,
              start_date: e.start_date ?? null,
              phone: e.phone ?? null,
            }))}
            branchName={(id) => (id && refData ? (refData.branches.find((b) => b.id === id)?.name || "-") : "-")}
            loading={loading}
          />
        </TabsContent>
      </Tabs>

      <DrillDialog state={drill} onClose={() => setDrill(null)} />

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}