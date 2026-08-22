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
  is_manually_adjusted?: boolean | null;
};

export type Leave = {
  from_date: string;
  to_date: string;
  leave_type?: string | null;
};

export type AttEvent = {
  event_type: "check_in" | "check_out" | string;
  event_time: string;
  attendance_date?: string; // local YYYY-MM-DD (Asia/Hebron) — computed on fetch
  /** نية الخروج المصرّح بها: مغادرة مؤقتة أم إنهاء دوام (لبصمات الخروج فقط). */
  checkout_kind?: "temporary" | "end_of_day" | null;
};

export type DaySession = {
  checkIn: string;       // ISO
  checkOut: string | null;
  durationMs: number;
  /** نية بصمة الخروج التي أغلقت هذه الجلسة. */
  checkoutKind?: "temporary" | "end_of_day" | null;
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
  sessions: DaySession[];  // ordered in→out pairs (debounced, min 60s)
  sessionsHours: string;   // recomputed from sessions, "7.50" or "—"
};

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Local YYYY-MM-DD — never use toISOString here (it shifts to UTC). */
function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Bucket raw events by "attendance business day".
 *
 * Rule: a check-out that follows an open check-in within `maxOpenHours`
 * belongs to the **same** attendance_date as that check-in — even if the
 * calendar date already rolled over past midnight.
 *
 * This fixes the case where a cashier checks in at 11:30pm and checks out
 * at 12:30am: without this rule the in stays on day N (as "مفتوحة") and
 * the out becomes a lone event on day N+1 (as "ناقص").
 */
export function bucketEventsByBusinessDay(
  events: { event_type: string; event_time: string }[],
  tz: string = "Asia/Hebron",
  maxOpenHours = 18,
): AttEvent[] {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const sorted = [...events].sort(
    (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  );
  let openDate: string | null = null;
  let openTs: number | null = null;
  const out: AttEvent[] = [];
  for (const e of sorted) {
    const localDate = dtf.format(new Date(e.event_time));
    if (e.event_type === "check_in") {
      if (!openDate) {
        openDate = localDate;
        openTs = new Date(e.event_time).getTime();
      }
      out.push({ event_type: e.event_type, event_time: e.event_time, attendance_date: openDate ?? localDate });
    } else if (e.event_type === "check_out") {
      const ts = new Date(e.event_time).getTime();
      const pair =
        openDate && openTs && ts - openTs <= maxOpenHours * 3600 * 1000
          ? openDate
          : localDate;
      out.push({ event_type: e.event_type, event_time: e.event_time, attendance_date: pair });
      openDate = null;
      openTs = null;
    } else {
      out.push({ event_type: e.event_type, event_time: e.event_time, attendance_date: localDate });
    }
  }
  return out;
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

/** Build clean sessions from raw events for a single day (debounced + min 60s). */
export function buildDaySessions(events: AttEvent[]): DaySession[] {
  const MIN_MS = 60_000;
  const DEBOUNCE_MS = 60_000;
  const sorted = [...events].sort(
    (a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
  );
  const cleaned: AttEvent[] = [];
  for (const evt of sorted) {
    const last = cleaned[cleaned.length - 1];
    if (last && last.event_type === evt.event_type) {
      const gap = new Date(evt.event_time).getTime() - new Date(last.event_time).getTime();
      if (gap < DEBOUNCE_MS) continue;
    }
    cleaned.push(evt);
  }
  const result: DaySession[] = [];
  let openIn: string | null = null;
  for (const e of cleaned) {
    if (e.event_type === "check_in") {
      openIn = e.event_time;
    } else if (e.event_type === "check_out" && openIn) {
      const dur = new Date(e.event_time).getTime() - new Date(openIn).getTime();
      if (dur >= MIN_MS) {
        result.push({
          checkIn: openIn,
          checkOut: e.event_time,
          durationMs: dur,
          checkoutKind: e.checkout_kind ?? null,
        });
      }
      openIn = null;
    }
  }
  if (openIn) result.push({ checkIn: openIn, checkOut: null, durationMs: 0 });
  return result;
}

/**
 * الجلسات الحقيقية الواقعة خارج نافذة التعديل اليدوي.
 * الجلسة المتقاطعة مع نافذة الإدارة تُعتبر مغطّاة بالتعديل (تُخفى لمنع الازدواج)،
 * وأي جلسة كاملة قبل النافذة أو بعدها (كوردية مسائية فُتحت بعد تعديل الإدارة)
 * تبقى ظاهرة حتى لا تختفي من شاشة الموظف.
 */
export function realSessionsOutsideWindow<T extends { checkIn: string; checkOut: string | null }>(
  windowIn: string,
  windowOut: string | null,
  sessions: T[],
): T[] {
  const wIn = new Date(windowIn).getTime();
  if (!isFinite(wIn)) return sessions;
  const wOut = windowOut ? new Date(windowOut).getTime() : Number.POSITIVE_INFINITY;
  return sessions.filter((s) => {
    const sIn = new Date(s.checkIn).getTime();
    const sOut = s.checkOut ? new Date(s.checkOut).getTime() : Number.POSITIVE_INFINITY;
    return !(sIn < wOut && sOut > wIn); // احتفظ فقط بما لا يتقاطع مع النافذة اليدوية
  });
}

/**
 * دمج جلسة التعديل اليدوي (من attendance_days) مع بصمات اليوم الحقيقية:
 *  • بصمات مكتملة داخل نافذة التعديل → تُعرض كما هي (التفصيل الحقيقي لليوم —
 *    يحل مشكلة إخفاء "الجلسة الثانية" عندما تغطي نافذة الإدارة كامل اليوم).
 *  • بصمة مفتوحة/ناقصة داخل النافذة صحّحتها الإدارة → تُعرض جلسة الإدارة مكانها.
 *  • أي جلسة خارج النافذة (وردية ثانية بعد التعديل) → تبقى ظاهرة دائماً.
 * الجلسة اليدوية تُعامل كـ"إنهاء دوام" حتى لا يُحتسب فاصل الورديتين الطويل مغادرة.
 */
export function mergeManualWithRealSessions(
  manual: { checkIn: string; checkOut: string | null },
  real: DaySession[],
): DaySession[] {
  const wIn = new Date(manual.checkIn).getTime();
  const wOut = manual.checkOut ? new Date(manual.checkOut).getTime() : Number.POSITIVE_INFINITY;
  const overlaps = (s: DaySession) => {
    const sIn = new Date(s.checkIn).getTime();
    const sOut = s.checkOut ? new Date(s.checkOut).getTime() : Number.POSITIVE_INFINITY;
    return sIn < wOut && sOut > wIn;
  };
  const inside = isFinite(wIn) ? real.filter(overlaps) : [];
  const outside = isFinite(wIn) ? real.filter((s) => !overlaps(s)) : real;
  const insideAllComplete = inside.length > 0 && inside.every((s) => !!s.checkOut);
  let middle: DaySession[];
  if (insideAllComplete) {
    middle = inside;
  } else {
    const inMs = new Date(manual.checkIn).getTime();
    const outMs = manual.checkOut ? new Date(manual.checkOut).getTime() : null;
    middle = [{
      checkIn: manual.checkIn,
      checkOut: manual.checkOut,
      durationMs: outMs != null ? Math.max(0, outMs - inMs) : 0,
      checkoutKind: "end_of_day" as const,
    }];
  }
  return [...middle, ...outside].sort(
    (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime(),
  );
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
  events: AttEvent[] = [],
): DayRow[] {
  const byDate = new Map<string, AttDay>();
  for (const a of attendance) byDate.set(a.attendance_date, a);

  const eventsByDate = new Map<string, AttEvent[]>();
  for (const e of events) {
    const key = e.attendance_date;
    if (!key) continue;
    const arr = eventsByDate.get(key) || [];
    arr.push(e);
    eventsByDate.set(key, arr);
  }

  const rows: DayRow[] = [];
  const cur = new Date(monthStart);
  // Normalize to start of day to avoid DST drift
  cur.setHours(12, 0, 0, 0);
  const stop = new Date(monthEnd);
  stop.setHours(12, 0, 0, 0);
  while (cur <= stop) {
    // Stop strictly inside the month (defensive: never include next-month leak)
    if (cur.getMonth() !== monthStart.getMonth() || cur.getFullYear() !== monthStart.getFullYear()) break;
    const iso = localISODate(cur);
    const att = byDate.get(iso);
    const leave = isInLeave(iso, leaves);
    const status = deriveStatus(att, leave);
    const leaveSuffix = leave?.leave_type ? ` (${tLeaveType(leave.leave_type)})` : "";
    const label = status === "no_data" ? "—" : (tAttendanceStatus(status) + leaveSuffix);
    const sessions = buildDaySessions(eventsByDate.get(iso) || []);
    const sessionsMs = sessions.reduce((s, x) => s + (x.checkOut ? x.durationMs : 0), 0);
    const sessionsHoursNum = sessionsMs / 3_600_000;
    const sessionsHours = sessionsHoursNum > 0 ? sessionsHoursNum.toFixed(2) : "—";
    const firstSessionIn = sessions[0]?.checkIn ?? null;
    const lastSessionOut = [...sessions].reverse().find((s) => s.checkOut)?.checkOut ?? null;
    // 🛠️ HR manual override: when the day was corrected from the HR portal,
    // attendance_events remain untouched but attendance_days holds the
    // authoritative check-in/out and total_hours. Show the adjusted values.
    const manual = !!att?.is_manually_adjusted;
    const displayIn = manual ? att?.first_check_in : (firstSessionIn ?? att?.first_check_in);
    // النافذة اليدوية تغطي البصمات المتقاطعة معها فقط؛ أي جلسة حقيقية خارجها
    // (كوردية ثانية بعد تعديل الإدارة) تُدمج وتبقى ظاهرة للموظف.
    const mergedSessions = manual && displayIn
      ? mergeManualWithRealSessions({ checkIn: displayIn, checkOut: att?.last_check_out ?? null }, sessions)
      : sessions;
    const mergedLastOut = [...mergedSessions].reverse().find((s) => s.checkOut)?.checkOut ?? null;
    const displayOut = manual ? (mergedLastOut ?? att?.last_check_out) : (lastSessionOut ?? att?.last_check_out);
    const displayHours = manual
      ? fmtHours(att?.total_hours)
      : (sessionsHours !== "—" ? sessionsHours : fmtHours(att?.total_hours));
    rows.push({
      date: iso,
      dayName: AR_DAYS[cur.getDay()],
      checkIn: fmtTime(displayIn),
      checkOut: fmtTime(displayOut),
      hours: displayHours,
      status,
      statusLabel: label,
      statusTone: attendanceStatusTone(status),
      notes: (manual ? "معدّل من الإدارة" + (att?.notes ? " — " + att.notes : "") : (att?.notes || "")),
      // عند التعديل اليدوي تُعرض جلسة الإدارة + أي جلسات حقيقية خارج نافذتها
      // بدل إخفاء كل البصمات خلف جلسة واحدة مُصطنعة.
      sessions: mergedSessions,
      sessionsHours,
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
