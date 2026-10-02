export type AttendanceEventLike = {
  event_type: string;
  event_time: string;
  created_at?: string | null;
};

export function getOpenAttendanceSession(events: AttendanceEventLike[], maxOpenHours = 36): AttendanceEventLike | null {
  const sorted = [...events].sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());
  let open: AttendanceEventLike | null = null;

  for (const event of sorted) {
    if (event.event_type === "check_in") {
      // Always track the latest check_in. If a previous check_in was never
      // matched by a check_out (orphan from a past day), it should NOT mask
      // a fresh check_in — otherwise the UI thinks there's no open session
      // and shows the wrong action button.
      open = event;
    } else if (event.event_type === "check_out") {
      // 🛡️ A check_out may only close a check_in that already existed when
      // that check_out row was written. HR sometimes pre-writes a manual
      // check_out with a future event_time; that row must not swallow a real
      // punch recorded afterwards (mirrors the server-side rule).
      const writtenAt = event.created_at
        ? new Date(event.created_at).getTime()
        : new Date(event.event_time).getTime();
      const openAt = open ? new Date(open.event_time).getTime() : 0;
      if (!open || writtenAt >= openAt) open = null;
    }
  }

  if (!open) return null;
  const ageMs = Date.now() - new Date(open.event_time).getTime();
  if (ageMs > maxOpenHours * 60 * 60 * 1000) return null;
  return open;
}

/**
 * Single source of truth for "does this open session still justify offering
 * a check-OUT?" — mirrors the server-side rule in the `attendance` edge
 * function (MAX_OPEN_SHIFT_HOURS): a session is actionable when it belongs
 * to the SAME Hebron day, or it crossed midnight by at most 18 hours
 * (after-midnight shift). Anything older is a forgotten punch from a
 * previous day: it must NOT flip today's UI to "تسجيل خروج" — the punch is
 * a new check-in and the orphan day stays "incomplete" for HR correction.
 */
export const OPEN_SESSION_ACTIONABLE_HOURS = 18;

const hebronDay = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hebron" }).format(d);

export type AttendanceDayLike = {
  attendance_date: string;
  last_check_out?: string | null;
  is_manually_adjusted?: boolean | null;
  first_check_in?: string | null;
  status?: string | null;
};

const LOCKED_DAY_STATUSES = new Set(["leave", "absent", "holiday", "on_leave", "sick_leave"]);

/**
 * 🛡️ HR-entered check-in (attendance_day_overrides.override_in via
 * hr_save_attendance_day) writes NO raw attendance_event. When the employee
 * could not punch (e.g. broken GPS) and HR entered today's check-in while he
 * is still at work, the day row has first_check_in but no last_check_out.
 * Treat that as an open session so the employee is offered "تسجيل خروج".
 * Mirrors the identical fallback in the `attendance` edge function.
 */
export function getManualOpenSessionFromDays(
  days: AttendanceDayLike[] = [],
  now: Date = new Date(),
): AttendanceEventLike | null {
  const today = hebronDay(now);
  const yesterday = hebronDay(new Date(now.getTime() - 24 * 3_600_000));
  const candidates = days
    .filter((d) => d.attendance_date === today || d.attendance_date === yesterday)
    .sort((a, b) => (a.attendance_date < b.attendance_date ? 1 : -1));
  for (const d of candidates) {
    if (!d.is_manually_adjusted || !d.first_check_in || d.last_check_out) continue;
    if (d.status && LOCKED_DAY_STATUSES.has(d.status)) continue;
    const inAt = new Date(d.first_check_in);
    const ageHours = (now.getTime() - inAt.getTime()) / 3_600_000;
    if (ageHours < 0 || ageHours > OPEN_SESSION_ACTIONABLE_HOURS) continue;
    return { event_type: "check_in", event_time: d.first_check_in, created_at: d.first_check_in };
  }
  return null;
}

/**
 * 🛡️ Mirrors the server rule in the `attendance` edge function: HR can close a
 * session by correcting `attendance_days` without writing a synthetic
 * check_out event. In that case the raw event stream still holds an unmatched
 * check_in, so the UI would keep offering "تسجيل خروج" forever while the
 * server answers "لا يوجد بصمة دخول مفتوحة".
 *
 * CRITICAL: the authoritative row is the one for the OPEN SESSION'S OWN DATE,
 * not today's. A session opened yesterday and closed by HR yesterday must be
 * treated as closed when the employee punches today.
 */
export function isSessionManuallyClosed(
  open: AttendanceEventLike | null,
  days: AttendanceDayLike[] = [],
): boolean {
  if (!open) return false;
  const openAt = new Date(open.event_time);
  const openDate = hebronDay(openAt);
  const dayRow = days.find((d) => d.attendance_date === openDate);
  if (!dayRow?.is_manually_adjusted || !dayRow.last_check_out) return false;
  // A real punch recorded AFTER the manual close is a genuine new session.
  return new Date(dayRow.last_check_out).getTime() >= openAt.getTime();
}

export function getActionableOpenSession(
  events: AttendanceEventLike[],
  now: Date = new Date(),
  days: AttendanceDayLike[] = [],
): AttendanceEventLike | null {
  // Look back 30 days (same as the server) so the raw pairing is identical,
  // then apply the actionable rule.
  const open = getOpenAttendanceSession(events, 30 * 24);
  if (!open) return getManualOpenSessionFromDays(days, now);
  const openAt = new Date(open.event_time);
  const ageHours = (now.getTime() - openAt.getTime()) / 3_600_000;
  const sameHebronDay = hebronDay(openAt) === hebronDay(now);
  if (!sameHebronDay && ageHours > OPEN_SESSION_ACTIONABLE_HOURS) return null;
  if (isSessionManuallyClosed(open, days)) return null;
  return open;
}
