/**
 * راتب البصمة (المبلغ) — مصدر واحد للمعادلة المستخدمة في «العرض الشهري»
 * لشاشة الحضور، وفي عمود «راتب البصمة» بطلبات السلف.
 *
 * المعادلة (مطابقة للعرض الشهري):
 *   الساعات العادية = صافي ساعات الدوام − الإضافي
 *   الإضافي بالنسبة = الإضافي × 1.5
 *   ساعات السنوية   = أيام السنوية × 8
 *   ساعات المرضية   = أيام المرضية المدفوعة المكافئة (14 كامل / 14 نصف / بدون) × 8
 *   المبلغ = (العادية + الإضافي بالنسبة + السنوية + المرضية) × معدل الساعة
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { splitSickPayDays } from "@/lib/hr-utils";

export const ATTENDANCE_STANDARD_DAY_HOURS = 8;
export const ATTENDANCE_OVERTIME_MULTIPLIER = 1.5;

/** دقائق العمل الفعلية لليوم (نفس قاعدة العرض الشهري). */
export function dayWorkMinutes(r: { net_work_minutes?: number | null; total_hours?: number | null }): number {
  const net = Number(r.net_work_minutes);
  if (Number.isFinite(net) && net > 0) return Math.round(net);
  return Math.round((Number(r.total_hours) || 0) * 60);
}

export type AttendanceSalaryInput = {
  hours: number;          // صافي ساعات الدوام (تشمل الإضافي)
  overtime: number;       // ساعات الإضافي
  annualDays: number;
  sickDays: number;
  priorSickDays: number;  // مرضية مستهلكة بنفس السنة قبل بداية الفترة
  hourlyRate: number;
};

export function computeAttendanceSalary(i: AttendanceSalaryInput) {
  const regular = Math.max(0, (i.hours || 0) - (i.overtime || 0));
  const overtimeWeighted = (i.overtime || 0) * ATTENDANCE_OVERTIME_MULTIPLIER;
  const annualHours = (i.annualDays || 0) * ATTENDANCE_STANDARD_DAY_HOURS;
  const sickSplit = splitSickPayDays(i.priorSickDays || 0, i.sickDays || 0);
  const sickHours = sickSplit.paidEquivalentDays * ATTENDANCE_STANDARD_DAY_HOURS;
  const totalHours = regular + overtimeWeighted + annualHours + sickHours;
  return {
    regular, overtimeWeighted, annualHours, sickHours, sickSplit, totalHours,
    amount: totalHours * (Number(i.hourlyRate) || 0),
  };
}

type LeaveRow = { employee_id: string; leave_type: string | null; start_date: string; end_date: string; days_count: number | null };
const pad2 = (n: number) => String(n).padStart(2, "0");
const spanDays = (s: string, e: string) =>
  Math.floor((Date.parse(`${e}T00:00:00`) - Date.parse(`${s}T00:00:00`)) / 86400000) + 1;
/** سجلات الرصيد المستورد: مدى طويل وعدد أيام فعلي أقل → تُحسب مرة واحدة. */
const aggregateDays = (lv: LeaveRow): number | null => {
  const dc = Number(lv.days_count) || 0;
  return dc > 0 && spanDays(lv.start_date, lv.end_date) > dc ? dc : null;
};

/** عدّ أيام الإجازات المعتمدة داخل الفترة (نفس قاعدة العرض الشهري). */
export function tallyLeaves(leaves: LeaveRow[], from: string, to: string) {
  const out: Record<string, { annual: number; sick: number }> = {};
  leaves.forEach((lv) => {
    const b = (out[lv.employee_id] ||= { annual: 0, sick: 0 });
    const add = (n: number) => {
      if (lv.leave_type === "سنوية") b.annual += n;
      else if (lv.leave_type === "مرضية") b.sick += n;
    };
    const agg = aggregateDays(lv);
    if (agg !== null) { add(agg); return; }
    const s = lv.start_date < from ? from : lv.start_date;
    const e = lv.end_date > to ? to : lv.end_date;
    const [sy, sm, sd] = s.split("-").map(Number);
    const [ey, em, ed] = e.split("-").map(Number);
    const stop = new Date(ey, em - 1, ed);
    for (let dt = new Date(sy, sm - 1, sd); dt <= stop; dt.setDate(dt.getDate() + 1)) add(1);
  });
  return out;
}

/** أيام المرضية المستهلكة من بداية السنة حتى ما قبل `from`. */
export function tallyPriorSick(leaves: LeaveRow[], from: string) {
  const yearStart = `${from.slice(0, 4)}-01-01`;
  const out: Record<string, number> = {};
  leaves.forEach((lv) => {
    const agg = aggregateDays(lv);
    if (agg !== null) { out[lv.employee_id] = (out[lv.employee_id] || 0) + agg; return; }
    const s = lv.start_date < yearStart ? yearStart : lv.start_date;
    const rawEnd = lv.end_date < from ? lv.end_date : from;
    if (rawEnd < s) return;
    const [sy, sm, sd] = s.split("-").map(Number);
    const [ey, em, ed] = rawEnd.split("-").map(Number);
    for (let dt = new Date(sy, sm - 1, sd); dt < new Date(ey, em - 1, ed + 1); dt.setDate(dt.getDate() + 1)) {
      const iso = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
      if (iso >= from) break;
      out[lv.employee_id] = (out[lv.employee_id] || 0) + 1;
    }
  });
  return out;
}

const chunk = <T,>(arr: T[], n: number) => {
  const o: T[][] = [];
  for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n));
  return o;
};

/** يحمّل راتب البصمة لموظفين محددين ضمن فترة (from/to بصيغة YYYY-MM-DD). */
export async function loadAttendanceSalaries(employeeIds: string[], from: string, to: string) {
  const result: Record<string, { amount: number; totalHours: number; hourlyRate: number }> = {};
  const ids = Array.from(new Set(employeeIds.filter(Boolean)));
  if (!ids.length || from > to) return result;
  const yearStart = `${from.slice(0, 4)}-01-01`;
  for (const part of chunk(ids, 150)) {
    const [days, leaves, prior, emps] = await Promise.all([
      fetchAllRows<any>((f, t) => supabase.from("attendance_days")
        .select("id, employee_id, total_hours, overtime_hours, net_work_minutes, employees!inner(full_name)")
        .in("employee_id", part).gte("attendance_date", from).lte("attendance_date", to)
        .order("id", { ascending: true }).range(f, t)),
      fetchAllRows<any>((f, t) => supabase.from("employee_leaves")
        .select("id, employee_id, leave_type, start_date, end_date, days_count, employees!inner(full_name)")
        .eq("status", "approved").in("employee_id", part).lte("start_date", to).gte("end_date", from)
        .order("id", { ascending: true }).range(f, t)),
      from <= yearStart ? Promise.resolve([] as any[]) : fetchAllRows<any>((f, t) => supabase.from("employee_leaves")
        .select("id, employee_id, leave_type, start_date, end_date, days_count")
        .eq("status", "approved").eq("leave_type", "مرضية").in("employee_id", part)
        .lt("start_date", from).gte("end_date", yearStart)
        .order("id", { ascending: true }).range(f, t)),
      supabase.from("employees").select("id, hourly_rate").in("id", part),
    ]);
    const hrs: Record<string, { hours: number; overtime: number }> = {};
    (days || []).forEach((d: any) => {
      const h = (hrs[d.employee_id] ||= { hours: 0, overtime: 0 });
      h.hours += dayWorkMinutes(d) / 60;
      h.overtime += Number(d.overtime_hours) || 0;
    });
    const lt = tallyLeaves(leaves || [], from, to);
    const ps = tallyPriorSick(prior || [], from);
    const rates: Record<string, number> = {};
    ((emps as any).data || []).forEach((e: any) => { rates[e.id] = Number(e.hourly_rate) || 0; });
    part.forEach((id) => {
      const c = computeAttendanceSalary({
        hours: hrs[id]?.hours || 0, overtime: hrs[id]?.overtime || 0,
        annualDays: lt[id]?.annual || 0, sickDays: lt[id]?.sick || 0,
        priorSickDays: ps[id] || 0, hourlyRate: rates[id] || 0,
      });
      result[id] = { amount: c.amount, totalHours: c.totalHours, hourlyRate: rates[id] || 0 };
    });
  }
  return result;
}
