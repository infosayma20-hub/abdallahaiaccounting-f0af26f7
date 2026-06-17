/**
 * HR Time Display — Single Source of Truth for showing attendance times.
 *
 * WHY: Employees were manipulating their phone clock to fake fingerprint times.
 * Native `new Date().toLocaleString()` formats in the DEVICE timezone, so a
 * tampered phone shows a tampered time — even though the DB has the correct
 * server timestamp. This helper formats every timestamp in the COMPANY's fixed
 * timezone (Asia/Hebron by default), making the displayed time independent
 * of the device clock and immune to client-side spoofing.
 *
 * Use this helper EVERYWHERE attendance/HR times are displayed.
 */
import { formatInTimeZone } from "date-fns-tz";

export const COMPANY_TIMEZONE = "Asia/Hebron";

/** Format an ISO timestamp in the company timezone. */
export function formatHrTime(
  iso: string | Date | null | undefined,
  pattern = "HH:mm",
  tz: string = COMPANY_TIMEZONE,
): string {
  if (!iso) return "";
  try {
    return formatInTimeZone(iso, tz, pattern);
  } catch {
    return "";
  }
}

/** Full date+time in company tz, e.g. "2026-06-17 14:35". */
export function formatHrDateTime(
  iso: string | Date | null | undefined,
  tz: string = COMPANY_TIMEZONE,
): string {
  return formatHrTime(iso, "yyyy-MM-dd HH:mm", tz);
}

/** Just the date in company tz, e.g. "2026-06-17". */
export function formatHrDate(
  iso: string | Date | null | undefined,
  tz: string = COMPANY_TIMEZONE,
): string {
  return formatHrTime(iso, "yyyy-MM-dd", tz);
}

/** 12-hour clock with AM/PM in Arabic-friendly form, e.g. "02:35 م". */
export function formatHrTime12(
  iso: string | Date | null | undefined,
  tz: string = COMPANY_TIMEZONE,
): string {
  return formatHrTime(iso, "hh:mm a", tz);
}

/**
 * Check the skew between the device clock and server time.
 * Returns absolute seconds difference. Useful to warn the employee on the
 * fingerprint screen if their phone clock is wrong.
 */
export function getDeviceClockSkewSeconds(serverNowIso: string): number {
  try {
    const server = new Date(serverNowIso).getTime();
    const device = Date.now();
    return Math.round(Math.abs(server - device) / 1000);
  } catch {
    return 0;
  }
}