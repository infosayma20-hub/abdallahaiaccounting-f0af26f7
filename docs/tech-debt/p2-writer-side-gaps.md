# P2 — Writer-Side Gaps & Deferred Items

Scope: items surfaced during P2 (B5/B6/B7) verification that are **NOT**
report-side bugs. Reports were fixed and closed in P2. The items below
belong to data writers, RPCs, or future report scaffolding and require a
separate work cycle.

---

## WB-1 — Purchase invoice ↔ `stock_movements` linkage gap

**Symptom**
On QA tenant `6fb346d9-…`, every row in `stock_movements` with
`reference_type = 'invoice'` belongs to a **sale** invoice (101 rows).
Purchase invoices produce `stock_movements` with `reference_type = NULL`
(or are not produced at all on some flows), so reports cannot trace a
stock-in row back to its source purchase invoice.

**Affected**
- Tables: `stock_movements`, `invoices` (`invoice_type='purchase'`)
- Writers: purchase-invoice create/update path (UI + any RPC) — likely
  `InvoiceCreatePage` purchase branch and any purchase-side RPC.
- Reports impacted (read-side OK, but blind without the link):
  - Stock Movement (cannot drill back to purchase doc)
  - future per-product COGS (F7)
  - Inventory Reconciliation traceability

**Operational risk:** Medium. Stock totals are still correct via the
signed-sum convention, but auditors cannot trace incoming qty to a source
document. Drill-down and dispute resolution are degraded.

**Recommended future fix:** When posting a purchase invoice, write the
matching `stock_movements` row with `reference_type = 'invoice'` and
`reference_id = invoices.id`, mirroring the sales path. Backfill via a
one-shot migration that joins purchase invoices to existing
`stock_movements` by `(user_id, product_id, created_at, quantity)` where
`reference_id IS NULL`.

**Risk class:** **Production risk** (not QA-only). Affects every tenant
that posts purchase invoices.

---

## WB-2 — Adjustment sign inconsistency

**Symptom**
`stock_movements.movement_type IN ('adjustment','transfer')` rows are
expected to carry a **signed** `quantity` (positive for in, negative for
out). On older tenants some adjustments were stored unsigned (always
positive) with the intent encoded only in `reference_note`. The shared
`stockMoveSign()` helper falls through to `+1` for these types, so an
unsigned negative adjustment will be added instead of subtracted.

**Affected**
- Tables: `stock_movements` (legacy rows where `movement_type =
  'adjustment' | 'transfer' | 'تسوية' | 'تحويل'` with unsigned magnitude)
- Writers: stock adjustment dialog / bulk adjustment paths
- Reports impacted: Inventory Reconciliation (false drift), Product Card
  (running balance off on adjustment days)

**Operational risk:** Low–Medium. Only old/manually-edited tenants are
affected. Net diff on QA tenant `6fb346d9` after P2 fix is ~−103 units
across 7/231 SKUs, plausibly attributable to this class.

**Recommended future fix:**
1. Enforce signed `quantity` in the adjustment writer (negative = out).
2. Add a CHECK / trigger guard rejecting `quantity = 0`.
3. Optional: backfill migration that reads `reference_note` keywords
   (`out`, `صادر`, `نقص`) and flips sign where unsigned.

**Risk class:** **Production risk** (data shape varies across tenants).

---

## Residual opening-balance drift

**Symptom**
After the P2 sign-map fix, Inventory Reconciliation on tenant
`6fb346d9-…` collapses to 7/231 mismatched SKUs with a net diff of
~−103 units. This is **not** a report bug — it is genuine drift between
`products.quantity` (live counter mutated by triggers) and the historical
`stock_movements` ledger.

**Likely causes**
- Manual edits to `products.quantity` outside the writer chain.
- Pre-WB-1 purchase rows whose `stock_movements` were never written.
- Pre-WB-2 unsigned adjustments.
- Imported opening balances posted directly to `products.quantity`
  without a corresponding `opening` row in `stock_movements`.

**Operational risk:** Low. Surfaces only in Inventory Reconciliation;
does not affect P&L, AR/AP, or VAT reports.

**Recommended future fix:** Per-tenant data-cleanup tool that proposes
`opening` adjustment rows to bring derived qty == live qty as of a
chosen cutoff date. Manual review required before applying.

**Risk class:** **Production risk** (data, not code).

---

## Deferred — F7 Per-product COGS report

**Status**
Plan B7 marked F7 as deferred. No scaffold exists in
`src/lib/reports/report-loaders.ts`, `report-helpers.ts`, or
`GenericReportPage.tsx`. Existing COGS visibility is limited to the
roll-up inside `loadProfitability` (GL `51xx` debits).

**Blockers before implementation**
1. **WB-1** must be fixed first, otherwise per-product COGS for purchased
   items cannot be reconciled against `stock_movements`.
2. POS COGS writer chain must be audited — confirm whether `pos_sale`
   rows post to `51xx` per line and with which cost basis (FIFO vs avg
   vs `products.buy_price` snapshot).
3. Decide cost basis: snapshot at sale time vs. moving average vs. FIFO.

**Affected (when implemented)**
- Tables: `invoice_items`, `stock_movements`, `transactions` (`51xx`),
  POS order line tables.
- New: `loadProductCOGS` loader, route `/reports/product-cogs`,
  reconciliation query `Σ items × cost vs Σ GL 51xx debits`.

**Operational risk:** N/A until built.

**Risk class:** N/A (deferred report; no code in tree).

---

## P2 Closed

- **Report-side fixes completed:** Inventory Reconciliation and Product
  Card now honour both English and legacy Arabic `movement_type` values
  via shared `stockMoveSign()` in `src/lib/reports/report-loaders.ts`.
  All other B5/B6/B7 report items previously verified PASS.
- **Remaining items are writer/data issues only** (WB-1, WB-2, residual
  opening drift) plus one **deferred** report (F7 per-product COGS).
- **No further report-side changes required now.** Future report work in
  this area should wait until WB-1 is fixed so COGS / drill-down can be
  built on stable linkage.

_Last updated: P2 close._