/**
 * Order note utilities for call-center delivery orders.
 *
 * The dispatch dialog auto-composes an `order_note` string from structured
 * pieces (delivery info, customer, phone, base note). When a dispatched order
 * is re-opened for edit (or accepted into the cashier cart), we must NEVER
 * re-feed that composed string back as the "base note" — otherwise the
 * delivery prefix gets prepended again on every save and balloons across
 * successive edits (see the bug screenshot with 3× duplicated delivery
 * blocks).
 *
 * `extractBaseNote` strips the auto-generated segments and returns only the
 * customer's original free-text note. The set of stripped segments matches
 * `buildOrderNote` in `CallCenterDispatchDialog.tsx`, plus a couple of legacy
 * prefixes used by `onAcceptOrder` in `POSPage.tsx` (مصدر, نقدي/فيزا).
 */
const AUTO_PREFIXES = [
  "توصيل: ",
  "الفرع: ",
  "رسوم التوصيل: ",
  "الزبون: ",
  "جوال: ",
  "مصدر: ",
];

const AUTO_EXACT = new Set(["نقدي", "فيزا"]);

export function extractBaseNote(note: string | null | undefined): string {
  if (!note) return "";
  const segs = String(note)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const seg of segs) {
    if (AUTO_EXACT.has(seg)) continue;
    if (AUTO_PREFIXES.some((p) => seg.startsWith(p))) continue;
    if (seg.startsWith("ملاحظة: ")) {
      // The trailing real note. Strip the label and keep the rest.
      const tail = seg.slice("ملاحظة: ".length).trim();
      if (tail) kept.push(tail);
      continue;
    }
    kept.push(seg);
  }
  return kept.join(" | ").trim();
}

/**
 * Human-readable summary of the customer-side breakdown for an order with
 * a known delivery_fee. Returns items subtotal, delivery, and grand total.
 * Used by the dispatched-orders log card and any place that wants to show
 * the split without recomputing.
 */
export function deliveryBreakdown(opts: { total: number; deliveryFee: number }) {
  const total = Number(opts.total) || 0;
  const delivery = Math.max(0, Number(opts.deliveryFee) || 0);
  const items = Math.max(0, total - delivery);
  return { items, delivery, total };
}