/**
 * Single source of truth for "which work day does this moment belong to?".
 *
 * WHY: the server (`attendance` edge function) and `attendance_days` treat a
 * work day as [date 06:00, date+1 06:00) Asia/Hebron — the standard cutoff for
 * restaurants and night shifts. The client screens used calendar midnight
 * instead, so the tail of a shift that ended after midnight (e.g. 00:52 → 01:31)
 * showed up inside the NEXT day's session list while the stored attendance row
 * correctly counted it on the previous day. Same punches, two different days.
 *
 * Every client screen that groups attendance punches must use these helpers.
 */

export const WORK_DAY_CUTOFF_HOUR = 6;
export const WORK_DAY_TZ = "Asia/Hebron";

/** Timezone offset (hours) of `tz` at the given instant. */
function tzOffsetHours(at: Date, tz: string): number {
  const localHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false }).format(at),
  );
  const utcHour = at.getUTCHours();
  let diff = localHour - utcHour;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  return diff;
}

/**
 * The work-day key (YYYY-MM-DD) a timestamp belongs to.
 * Mirrors the server: shift the instant back by the cutoff, then read the
 * local calendar date.
 */
export function workDayKey(
  at: Date | string = new Date(),
  tz: string = WORK_DAY_TZ,
  cutoffHour: number = WORK_DAY_CUTOFF_HOUR,
): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const shifted = new Date(d.getTime() - cutoffHour * 3_600_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

/**
 * UTC ISO bounds of a work day: [dateKey 06:00 local, dateKey+1 06:00 local).
 */
export function workDayRange(
  dateKey: string,
  tz: string = WORK_DAY_TZ,
  cutoffHour: number = WORK_DAY_CUTOFF_HOUR,
): { start: string; end: string } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const boundary = (dayOffset: number) => {
    // Approximate first (to resolve the correct DST offset), then correct.
    const approx = new Date(Date.UTC(year, month - 1, day + dayOffset, cutoffHour));
    const offset = tzOffsetHours(approx, tz);
    return new Date(
      Date.UTC(year, month - 1, day + dayOffset, cutoffHour - offset),
    ).toISOString();
  };
  return { start: boundary(0), end: boundary(1) };
}
