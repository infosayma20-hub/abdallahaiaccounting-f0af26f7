/**
 * POS Business Day helpers.
 *
 * The POS accounting day starts at `cutoffHour` (default 6 AM) and ends at
 * (cutoffHour - 1):59:59 the next morning. So a sale paid at 02:00 on
 * 2026-06-04 belongs to business date 2026-06-03.
 *
 * Mirrors the SQL function `public.pos_business_date(ts, cutoff)` and the
 * `pos_orders.business_date` column (auto-filled by trigger).
 */

export const DEFAULT_POS_CUTOFF_HOUR = 6;

/**
 * Get the POS business date (YYYY-MM-DD) for a given timestamp.
 *
 * If the local hour of `ts` is less than `cutoffHour`, the business date is
 * the previous calendar day; otherwise it's the same calendar day.
 */
export function getPosBusinessDate(
  ts: string | Date,
  cutoffHour: number = DEFAULT_POS_CUTOFF_HOUR,
): string {
  const d = typeof ts === "string" ? new Date(ts) : new Date(ts.getTime());
  const cutoff = Number.isFinite(cutoffHour) ? cutoffHour : DEFAULT_POS_CUTOFF_HOUR;
  if (d.getHours() < cutoff) {
    d.setDate(d.getDate() - 1);
  }
  // Format as local YYYY-MM-DD (NOT toISOString — that converts to UTC).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get the [start, end) ISO range that maps to a given POS business date.
 * Use this for filtering `pos_orders` / `pos_payments` by `created_at` when
 * `business_date` column is unavailable (legacy rows).
 *
 * For dateStr = '2026-06-03' and cutoff = 6:
 *   start = 2026-06-03T06:00:00 (local)
 *   end   = 2026-06-04T06:00:00 (local)
 */
export function getPosBusinessDayRange(
  dateStr: string,
  cutoffHour: number = DEFAULT_POS_CUTOFF_HOUR,
): { start: string; end: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const cutoff = Number.isFinite(cutoffHour) ? cutoffHour : DEFAULT_POS_CUTOFF_HOUR;
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, cutoff, 0, 0, 0);
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}