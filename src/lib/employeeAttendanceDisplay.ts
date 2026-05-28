/**
 * Helpers for the employee attendance month view.
 * Pure functions — no DB access. Safe with missing fields.
 */
import { tAttendanceStatus, attendanceStatusTone, tLeaveType } from "./hrLabels";

export type AttDay = {
  attendance_date: string;
  first_check_in?: string | null;
  last_check_out?: string | null;
  total_hours?: number | null;
  status?: string | null;
  notes?: string | null;
};

export type Leave = {
  from_date: string;
  to_date: string;
  leave_type?: string | null;
};

export type DayRow = {
  date: string;            // yyyy-MM-dd
  dayName: string;         // عربي
  checkIn: string;         // HH:MM or —
  checkOut: string;        // HH:MM or —
  hours: string;           // "7.5" or —
  status: string;          // normalized key
  statusLabel: string;     // arabic
  statusTone: string;      // tailwind classes
  notes: string;
};

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Local YYYY-MM-DD — never use toISOString here (it shifts to UTC). */
function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTime(t?: string | null): string {
  if (!t) return "—";
  try {
    return new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch { return "—"; }
}

function fmtHours(h?: number | null): string {
  const n = Number(h);
  if (!isFinite(n) || n <= 0) return "—";
  return n.toFixed(2);
}

function isInLeave(dateISO: string, leaves: Leave[]): Leave | null {
  const d = dateISO;
  for (const l of leaves) {
    if (!l.from_date || !l.to_date) continue;
    if (d >= l.from_date && d <= l.to_date) return l;
  }
  return null;
}

/** Normalize a single day's status across attendance + leaves. */
function deriveStatus(att: AttDay | undefined, leave: Leave | null): string {
  if (att?.status) {
    const s = att.status.toLowerCase();
    if (att.first_check_in && !att.last_check_out) return "incomplete";
    if (!att.first_check_in && att.last_check_out) return "incomplete";
    return s;
  }
  if (leave) return "leave";
  return "no_data";
}

export function buildMonthRows(
  monthStart: Date,
  monthEnd: Date,
  attendance: AttDay[],
  leaves: Leave[],
): DayRow[] {
  const byDate = new Map<string, AttDay>();
  for (const a of attendance) byDate.set(a.attendance_date, a);

  const rows: DayRow[] = [];
  const cur = new Date(monthStart);
  // Normalize to start of day to avoid DST drift
  cur.setHours(12, 0, 0, 0);
  const stop = new Date(monthEnd);
  stop.setHours(12, 0, 0, 0);
  while (cur <= monthEnd) {
    // Stop strictly inside the month (defensive: never include next-month leak)
    if (cur.getMonth() !== monthStart.getMonth() || cur.getFullYear() !== monthStart.getFullYear()) break;
    const iso = localISODate(cur);
    const att = byDate.get(iso);
    const leave = isInLeave(iso, leaves);
    const status = deriveStatus(att, leave);
    const leaveSuffix = leave?.leave_type ? ` (${tLeaveType(leave.leave_type)})` : "";
    const label = status === "no_data" ? "—" : (tAttendanceStatus(status) + leaveSuffix);
    rows.push({
      date: iso,
      dayName: AR_DAYS[cur.getDay()],
      checkIn: fmtTime(att?.first_check_in),
      checkOut: fmtTime(att?.last_check_out),
      hours: fmtHours(att?.total_hours),
      status,
      statusLabel: label,
      statusTone: attendanceStatusTone(status),
      notes: att?.notes || "",
    });
    cur.setDate(cur.getDate() + 1);
  }
  return rows;
}

export type MonthSummary = {
  workedDays: number;
  totalHours: number;
  annualLeave: number;
  regularLeave: number;
  sickLeave: number;
  holidays: number;
  absent: number;
  late: number;
  incomplete: number;
};

export function summarizeMonth(rows: DayRow[], leaves: Leave[]): MonthSummary {
  const s: MonthSummary = {
    workedDays: 0, totalHours: 0,
    annualLeave: 0, regularLeave: 0, sickLeave: 0,
    holidays: 0, absent: 0, late: 0, incomplete: 0,
  };
  for (const r of rows) {
    const h = parseFloat(r.hours);
    if (isFinite(h)) s.totalHours += h;
    switch (r.status) {
      case "present":
      case "complete":
      case "late":
        s.workedDays += 1;
        if (r.status === "late") s.late += 1;
        break;
      case "incomplete": s.incomplete += 1; break;
      case "absent": s.absent += 1; break;
      case "holiday":
      case "weekend":
      case "off": s.holidays += 1; break;
    }
  }
  // count leave days from leaves intersecting the month range, by type
  if (rows.length > 0) {
    const start = rows[0].date, end = rows[rows.length - 1].date;
    for (const l of leaves) {
      if (!l.from_date || !l.to_date) continue;
      const from = l.from_date > start ? l.from_date : start;
      const to   = l.to_date   < end   ? l.to_date   : end;
      if (from > to) continue;
      const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
      const t = (l.leave_type || "").toLowerCase();
      if (t === "annual") s.annualLeave += days;
      else if (t === "regular") s.regularLeave += days;
      else if (t === "sick" || t === "personal" || t === "unpaid") s.sickLeave += days;
      else s.regularLeave += days;
    }
  }
  return s;
}
