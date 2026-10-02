/**
 * تحويل وقت محلي بتوقيت فلسطين (Asia/Hebron) إلى لحظة زمنية حقيقية،
 * بغض النظر عن توقيت جهاز المستخدم، ومع مراعاة التوقيت الصيفي/الشتوي.
 */
const TZ = "Asia/Hebron";

function offsetMinutesAt(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60000);
}

/** "2026-09-30" + "09:05" (بتوقيت فلسطين) ⇒ Date */
export function hebronLocalToDate(dateStr: string, hhmm: string): Date | null {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  if (!y || !mo || !d || Number.isNaN(h) || Number.isNaN(mi)) return null;
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  let ms = naive - offsetMinutesAt(naive) * 60000;
  // تصحيح ثانٍ حول لحظة تغيّر التوقيت
  ms = naive - offsetMinutesAt(ms) * 60000;
  return new Date(ms);
}

/** يضيف أيامًا لتاريخ YYYY-MM-DD */
export function addDaysIso(dateStr: string, days: number): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** وقت HH:mm بتوقيت فلسطين للحظة معيّنة */
export function hebronHHmm(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(typeof iso === "string" ? new Date(iso) : iso);
}
