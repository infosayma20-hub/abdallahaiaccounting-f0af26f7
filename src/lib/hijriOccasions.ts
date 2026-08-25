// Hijri (Umm al-Qura) helpers + religious occasions calendar.
// Used by the owner portal to compare sales on the same *religious* day
// last year instead of the same Gregorian date.

export interface HijriDate { y: number; m: number; d: number }

const HIJRI_FMT = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
  year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
});

export function parseISO(iso: string): Date {
  const [y, m, d] = (iso || '').split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function toHijri(date: Date): HijriDate {
  const parts = HIJRI_FMT.formatToParts(date);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value.replace(/[^\d]/g, '') || 0);
  return { y: get('year'), m: get('month'), d: get('day') };
}

export const HIJRI_MONTHS = [
  'محرّم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوّال', 'ذو القعدة', 'ذو الحجة',
];

export function formatHijri(h: HijriDate): string {
  return `${h.d} ${HIJRI_MONTHS[h.m - 1] || ''} ${h.y}هـ`;
}

/** Convert a Hijri date to the matching Gregorian date (search around estimate). */
export function hijriToGregorian(h: HijriDate, near?: Date): Date | null {
  const base = near ? new Date(near.getTime()) : new Date();
  // rough estimate: 354.367 days per Hijri year from `near`
  const nearH = toHijri(base);
  const yearDiff = h.y - nearH.y;
  const est = new Date(base.getTime() + Math.round(yearDiff * 354.367) * 86400000);
  for (let off = 0; off <= 400; off++) {
    for (const sign of off === 0 ? [1] : [1, -1]) {
      const c = new Date(est.getTime() + sign * off * 86400000);
      const ch = toHijri(c);
      if (ch.y === h.y && ch.m === h.m && ch.d === h.d) return c;
    }
  }
  return null;
}

export interface Occasion { name: string; m: number; d: number; span?: number }

/** Fixed-Hijri religious occasions. */
export const OCCASIONS: Occasion[] = [
  { name: 'رأس السنة الهجرية', m: 1, d: 1 },
  { name: 'عاشوراء', m: 1, d: 10 },
  { name: 'المولد النبوي الشريف', m: 3, d: 12 },
  { name: 'الإسراء والمعراج', m: 7, d: 27 },
  { name: 'ليلة النصف من شعبان', m: 8, d: 15 },
  { name: 'أول رمضان', m: 9, d: 1 },
  { name: 'ليلة القدر', m: 9, d: 27 },
  { name: 'عيد الفطر', m: 10, d: 1, span: 3 },
  { name: 'يوم عرفة', m: 12, d: 9 },
  { name: 'عيد الأضحى', m: 12, d: 10, span: 4 },
];

export interface OccasionMatch { occasion: Occasion; hijri: HijriDate; dayOfOccasion: number }

/** Returns the religious occasion covering the given Gregorian date, if any. */
export function occasionForDate(date: Date): OccasionMatch | null {
  const h = toHijri(date);
  for (const o of OCCASIONS) {
    const span = o.span || 1;
    if (h.m === o.m && h.d >= o.d && h.d < o.d + span) {
      return { occasion: o, hijri: h, dayOfOccasion: h.d - o.d + 1 };
    }
  }
  return null;
}

/**
 * Same Hijri day, previous Hijri year → Gregorian ISO date.
 * e.g. 12 Rabi' I 1448 (2026-08-25) → 12 Rabi' I 1447 (2025-09-04)
 */
export function sameHijriDayLastYear(iso: string): string | null {
  const d = parseISO(iso);
  const h = toHijri(d);
  const g = hijriToGregorian({ y: h.y - 1, m: h.m, d: h.d }, d);
  return g ? toISO(g) : null;
}
