# Invoice Orphan Posting Repair Plan

**Audit only. No code, no SQL writes, no repairs were executed.**
_Source query: `invoices` where `status IN ('posted','sent','paid','partial','approved')` AND `linked_transaction_id IS NULL`._

## 1. The 13 orphan invoices

| # | invoice_number | date | customer | status / pay_status | total | paid | items | inv_items | stock_moves | tax_rows | pay_links | tx_by_ref* | source | currency | class |
|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| 1 | REP-1777637565798 | 2026-05-01 | (no contact) | posted / paid | 210 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | rep | شيكل | **D** |
| 2 | REP-1777637589696 | 2026-05-01 | (no contact) | posted / paid | 210 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | rep | شيكل | **D** |
| 3 | TEST-P7-S1-CASH | 2026-05-01 | (test) | posted / paid | 160 | 0 | 2 | 2 | 0 | 0 | 0 | 1† | manual | شيكل | **D** |
| 4 | TEST-P7-S2-CREDIT | 2026-05-01 | (test) | posted / paid | 110 | 0 | 2 | 2 | 0 | 0 | 0 | 1† | manual | شيكل | **D** |
| 5 | TEST-P7-S3-NOCOST | 2026-05-01 | (test) | posted / paid | 180 | 0 | 2 | 2 | 0 | 0 | 0 | 1† | manual | شيكل | **D** |
| 6 | REP-QA-CASH-1777144452 | 2026-04-25 | (qa) | posted / paid | 1200 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | rep | شيكل | **D** |
| 7 | REP-QA-CREDIT-1777144452 | 2026-04-25 | (qa) | posted / paid | 1500 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | rep | شيكل | **D** |
| 8 | PO-2026-0001 | 2026-03-31 | احمد احمد | sent / unpaid | 480 | 0 | 1 | 0 | 0 | 0 | 0 | 3† | manual | شيكل | **D** |
| 9 | INV-2026-0001 (a) | 2026-03-28 | احمد احمد | sent / unpaid | 183 | 0 | 1 | 1 | 0 | 0 | 0 | 4† | manual | شيكل | **D** |
| 10 | INV-2026-0004 | 2026-03-14 | عبدالله صايمة | sent / paid | 2050 | 2050 | 3 | 3 | 0 | 0 | 0 | 2† | manual | شيكل | **D** |
| 11 | INV-2026-0006 | 2026-03-14 | عبدالله صايمة | sent / paid | 1550 | 1550 | 2 | 2 | 0 | 0 | 0 | 0 | manual | شيكل | **B** |
| 12 | INV-2026-0001 (b) | 2026-03-13 | عبدالله صايمة | sent / unpaid | 2050 | 0 | 3 | 3 | 0 | 0 | 1 | 4† | manual | شيكل | **D** |
| 13 | INV-2026-0002 | 2026-03-13 | عبدالله صايمة | sent / unpaid | 2050 | 0 | 3 | 3 | 0 | 0 | 0 | 5† | manual | شيكل | **D** |

\* `tx_by_ref` = transactions whose `reference` column equals the invoice_number AND `is_deleted=false`.
† **None of those `tx_by_ref` matches actually belong to the orphan invoice.** Inspection shows they belong to *other* invoices that share the same `invoice_number` string (sale credit notes, different customers, different dates, different amounts). This is a separate data-quality issue (invoice number collisions) — do **not** treat them as existing posting and do **not** attempt to "link" them to the orphan.

## 2. Why these are orphans (root causes observed)

1. **Test/QA/REP seed data with `subtotal = 0`.** Rows 1–7. The schema integrity check fails (`total_amount` ≠ `subtotal + tax`), and `contact_id` is NULL. They were inserted by seed scripts or rep-sale paths that bypassed `create_sale_invoice_atomic`.
2. **Schema mis-fit.** Row 8 (`PO-2026-0001`) has `invoice_type='purchase'` but lives in `invoices` (sales) instead of `purchase_invoices`. Posting it from this side would create a wrong sale entry.
3. **Invoice number collision.** Rows 9 & 12 both carry `INV-2026-0001` for two different customers; the unposted ones cannot be safely repaired by reference, and would corrupt SOA grouping if posted with the same number.
4. **Legacy posted-without-ledger.** Rows 10, 11, 13 — created before the atomic RPC enforcement; none have stock movements, none have COGS, none have AR/Cash entries.

## 3. Repair classification

| Class | Count | Invoices |
|---|---:|---|
| **A — Financial-only repair safe** (no inventory) | **0** | — |
| **B — Full posting repair required** (clean inventory invoice, nothing posted, no duplicates) | **1** | #11 INV-2026-0006 |
| **C — Ledger missing but stock already moved** | **0** | — (no orphan has any stock_movement) |
| **D — Conflicted / manual review** | **12** | #1–#10, #12, #13 |

## 4. Risk per invoice

| # | Invoice | Risk |
|---|---|---|
| 1, 2 | REP-… | `subtotal=0`, no contact. Posting would credit revenue 4100 against a non-existent customer; SOA would not show. **Likely should be marked `cancelled` not posted.** |
| 3, 4, 5 | TEST-P7-… | Hand-crafted QA seeds. Should not be posted at all. **Recommended: void / hard-delete in test cleanup, not repair.** |
| 6, 7 | REP-QA-… | QA fixtures with `subtotal=0`. Same as 1–2. |
| 8 | PO-2026-0001 | Wrong table (purchase row in sales table). Posting would double-count as revenue. **Manual decision: move to `purchase_invoices` or void.** |
| 9 | INV-2026-0001 (احمد) | Number collides with #12. Cannot share reference safely. Needs renumbering before any posting. |
| 10 | INV-2026-0004 (عبدالله) | `paid_amount=2050` with NO `payment_invoice_links` and NO matching transaction. Cash/AR side untraceable. Posting now would inflate revenue if a hidden receipt is later linked. **High risk.** |
| 11 | INV-2026-0006 (عبدالله) | Same risk as #10 but at least no collision and no stale tx_by_ref noise. **Lowest risk in the set.** |
| 12 | INV-2026-0001 (عبدالله) | Number collision with #9 + has 1 `pay_links` row pointing at it. Means a receipt was allocated to this invoice but the invoice itself never produced an AR entry → SOA shows the credit (receipt) but no original debit. **Potentially negative balance for the customer if posted out of order.** |
| 13 | INV-2026-0002 (عبدالله) | Same family as #12, no pay_link, no number collision but stale tx_by_ref noise from credit notes sharing prefix. |

## 5. Repair approach per category

### Category B (only invoice #11)
- **Helper to use:** there is **no idempotent "repost-existing-invoice" RPC** today. `create_sale_invoice_atomic` creates a *new* invoice + items + stock + journal in one shot — it cannot target an existing invoice id without producing duplicate rows. Therefore even category B is **not** safe to auto-repair.
- **Proposed (manual) repair sequence for #11:**
  1. Reload the existing `invoice_items` for the invoice into memory.
  2. Open a single SQL transaction.
  3. Insert `transactions` rows:
     - Dr 1130 (AR / customer sub-account) `total_amount`, Cr 4100 (revenue net) `subtotal − discount`, Cr 2120 (VAT output) `tax_amount` if > 0.
     - Dr 5100 (COGS) `Σ(qty × cost_price)`, Cr 1300 (Inventory) same.
  4. Insert `stock_movements` rows (`movement_type='out'`, `reference_type='invoice'`, `reference_id=invoice.id`).
  5. Insert `tax_ledger` row only if `tax_amount > 0`.
  6. Update `invoices.linked_transaction_id` to the AR/Revenue txn id.
  7. Idempotency key: `INV-REPAIR-{invoice.id}-{ts}` on every transactions insert. The `INV-REPAIR-` prefix MUST be unique-checked first via `SELECT 1 FROM transactions WHERE idempotency_key LIKE 'INV-REPAIR-' || invoice.id || '%' AND is_deleted=false LIMIT 1` to abort if a previous repair already ran.
  8. Because `paid_amount=1550` already, also create the missing receipt-side journal Dr 1110/1120 / Cr 1130 with key `RCV-REPAIR-{invoice.id}-{ts}` *only if* a real cash receipt actually happened in business reality — otherwise leave invoice as unpaid and reset `paid_amount` to 0 with a correction note.

### Category D (12 invoices)
- **No automation.** Each one needs accountant review. Sub-paths:
  - **Test/QA seeds (1–7):** open in UI, click "Cancel" → status `cancelled`, no ledger needed. Or hard-delete from test-data cleanup tool.
  - **Wrong-table (#8):** void in `invoices`, recreate properly in `purchase_invoices` via the purchase create path.
  - **Number collisions (#9, #12):** rename one of the two via the existing edit form (change `invoice_number` to next free in sequence) THEN treat as Category B if eligible.
  - **Hidden-receipt risk (#10, #12, #13):** trace `paid_amount` and `pay_links` to the originating receipt voucher; allocate the receipt **after** the invoice is posted. If no receipt exists, set `paid_amount=0` first, then post.

## 6. Idempotency & duplicate prevention

- Use prefix `INV-REPAIR-{invoice_id}-` on every transactions row, checked with `LIKE` before insert.
- Stock movements use `(reference_type='invoice', reference_id=invoice.id)` as a logical unique pair; check existence first.
- `tax_ledger` use `(reference_type='invoice', reference_id=invoice.id, tax_type='output')` as logical unique.
- Any repair must run inside a single SQL transaction so failure rolls back partial writes.

## 7. Verification SQL (run BEFORE and AFTER any future repair)

```sql
-- AR impact for invoice
SELECT debit_account_code, credit_account_code, SUM(amount)
FROM transactions
WHERE idempotency_key LIKE 'INV-REPAIR-' || :invoice_id || '%' AND is_deleted=false
GROUP BY 1,2;

-- Net revenue posted vs invoice subtotal
SELECT (SELECT subtotal-discount_amount FROM invoices WHERE id=:invoice_id) AS expected_net,
       (SELECT SUM(amount) FROM transactions WHERE credit_account_code='4100'
         AND idempotency_key LIKE 'INV-REPAIR-' || :invoice_id || '%' AND is_deleted=false) AS posted_net;

-- VAT output posted vs invoice tax
SELECT (SELECT tax_amount FROM invoices WHERE id=:invoice_id) AS expected_vat,
       (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE credit_account_code='2120'
         AND idempotency_key LIKE 'INV-REPAIR-' || :invoice_id || '%' AND is_deleted=false) AS posted_vat;

-- COGS / inventory parity
SELECT SUM(CASE WHEN debit_account_code='5100' THEN amount END) cogs_dr,
       SUM(CASE WHEN credit_account_code='1300' THEN amount END) inv_cr
FROM transactions
WHERE idempotency_key LIKE 'INV-REPAIR-' || :invoice_id || '%' AND is_deleted=false;

-- Stock movements created
SELECT product_id, SUM(quantity) FROM stock_movements
WHERE reference_id=:invoice_id GROUP BY 1;

-- Tax ledger row
SELECT * FROM tax_ledger WHERE reference_id=:invoice_id;

-- Trial Balance still balanced (system-wide sanity)
SELECT SUM(amount) FILTER (WHERE debit_account_code IS NOT NULL) AS tot_dr,
       SUM(amount) FILTER (WHERE credit_account_code IS NOT NULL) AS tot_cr
FROM transactions WHERE is_deleted=false;

-- Account Statement visibility for the customer
SELECT * FROM transactions
WHERE contact_id=(SELECT contact_id FROM invoices WHERE id=:invoice_id)
  AND (debit_account_code LIKE '113%' OR credit_account_code LIKE '113%')
  AND is_deleted=false
ORDER BY transaction_date;
```

## 8. Recommended sequence

1. **Cancel** invoices 1–7 (test/QA/rep seeds). No ledger work. Single status update.
2. **Move** invoice 8 to `purchase_invoices` (or cancel + recreate). Manual.
3. **Renumber** the duplicate `INV-2026-0001` (rows 9 and 12) so the two customers don't share a number. Manual edit.
4. **Investigate** invoices 10, 12, 13 for the hidden receipt that the `paid_amount` / `pay_links` implies. Decide: (a) post invoice + keep receipt allocation, or (b) reset `paid_amount` to 0 first.
5. **Only invoice #11** is a viable Category B candidate, and even then a manual SQL transaction is required because no safe re-post RPC exists yet.
6. After every step, re-run the verification queries above.

## 9. Verdict on auto-repair

- **Safe to auto-repair: 0 of 13.**
- **Manual approval required: 13 of 13.**

The single "cleanest" candidate (#11 INV-2026-0006) still fails the auto-repair bar because the codebase does not expose an idempotent `repost_existing_invoice(invoice_id)` RPC. Building such an RPC is the prerequisite for any future bulk repair pass, and it is out of scope for this audit.

## 10. No code, no writes, no migrations

This document is the only artifact produced. Database state was not altered.