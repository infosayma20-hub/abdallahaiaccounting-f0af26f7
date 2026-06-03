/**
 * Centralized helper for the printed/displayed order-type label.
 *
 * Rules:
 *  - delivery   → "توصيل"
 *  - takeaway   → "استلام"
 *  - dine_in    → if table number/name exists → "طاولة رقم {X}"
 *                 (avoid duplicating the word "طاولة" if the name already
 *                  starts with it).
 *                 if no table → "طاولة"
 *
 * UI/print only — does NOT change any DB value, payment, inventory or
 * accounting behavior.
 */
export function formatOrderTypeLabel(
  normalizedType: "dine_in" | "takeaway" | "delivery" | string | undefined,
  tableLabel?: string | null,
): string {
  if (normalizedType === "delivery") return "توصيل";
  if (normalizedType === "takeaway") return "استلام";
  // dine_in (or fallback when a table exists)
  const raw = (tableLabel ?? "").toString().trim();
  if (!raw) return "طاولة";
  // Already starts with the word "طاولة" → keep as-is (e.g. "طاولة 5").
  if (/^طاولة\b/.test(raw)) return raw;
  return `طاولة رقم ${raw}`;
}
