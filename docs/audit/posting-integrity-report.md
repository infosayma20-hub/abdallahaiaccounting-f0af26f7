# Document Posting Integrity Audit

_Date: 2026-05-08 — scope: receipts, payments, sales/purchase invoices, returns, journals, cheques._

## Snapshot (live DB)

| Document        | Total | Orphans (posted, no ledger) | Notes |
|-----------------|------:|----------------------------:|-------|
| receipt_vouchers | 25   | 1 (already repaired earlier — REC-2026-0007) | self-heal in place |
| vouchers (payment) | 115 | 1 | self-heal added in this pass |
| invoices         | 126  | 13 (status posted/sent) | warning surfaced; **no auto-repair** |
| purchase_invoices | 3   | 0 | OK |
| returns          | 0    | 0 | nothing to audit yet |
| journal entries  | n/a  | journals ARE transactions | OK |
| cheques          | n/a  | only post via voucher path | OK |

## Audit verdict per document type

| Type | Verdict | Reason |
|------|---------|--------|
| Receipt voucher | FIXED | Self-heal already created in prior pass; warning panel already mounted |
| Payment voucher | FIXED | Self-heal added (mirrors receipt pattern, repair idempotency key) |
| Sales invoice | NEEDS APPROVAL | Atomic RPC `create_sale_invoice_atomic` is for the create path. We do **not** auto-rebuild posting on edit because `line_profit`, `cogs`, stock movements and tax legs would all need to be re-derived; doing that silently on save would risk duplicates. Warning is shown via `RelatedJournalPanel`. Manual repair = open & re-post via the existing posting helper. |
| Purchase invoice | PASS | No orphans today. Same warning surface available. |
| Returns | PASS | No data yet; warning surface available once any return exists. |
| Journal entries | PASS | Journals are stored directly in `transactions`; no header/ledger split. |
| Cheques | PASS | Cheques never write to GL on their own. The originating voucher does, and that voucher now self-heals. |

## Files changed

- `src/pages/VoucherFormPage.tsx` — payment voucher edit path now self-heals when `linked_transaction_id IS NULL` and the voucher is being posted (not draft). Uses `PAY-REPAIR-{editId}-{ts}` idempotency key so repairs are traceable and never duplicated.
- `docs/audit/posting-integrity-audit.sql` — read-only SQL queries to find orphans, mismatches, wrong AR/AP accounts, and contact balance drift.
- `docs/audit/posting-integrity-report.md` — this file.

## Behavior after fix

- Saving any posted **receipt** or **payment** voucher whose ledger link is missing now creates the correct journal entry and links it back. Existing linked transactions are still rewritten via "soft-delete + insert fresh" (Golden Rule).
- The amber warning **«غير مرحّل محاسبياً»** appears on any receipt / payment / invoice detail panel whose `RelatedJournalPanel` finds zero ledger rows for that document reference. Posted-but-unlinked invoices therefore stop being silent.

## What we deliberately did NOT do

- No migrations.
- No bulk historical repair of the 13 orphaned posted/sent invoices. They need a re-post through the existing safe RPC and an accountant decision about COGS/stock effects on backdated rows.
- No change to `contacts.current_balance` writers. Display-side reads should already be using `get_contact_balance` per the Single Source of Truth memory; this audit did not refactor any panel that still violates that rule — that is a follow-up.
- No production deploy.

## Manual QA checklist

1. Create a new receipt voucher → confirm it shows up in Account Statement and the side panel balance equals SOA.
2. Create a new payment voucher → confirm it shows up in Supplier Statement.
3. Open the orphan payment voucher (the one in `vouchers` with `linked_transaction_id IS NULL`) and click **تحديث** → confirm a new transaction row is created with `idempotency_key` starting `PAY-REPAIR-…` and that `vouchers.linked_transaction_id` now points to it. Re-save once more and confirm only one active transaction exists for that voucher.
4. Open a posted invoice with no ledger row → confirm the amber **«غير مرحّل محاسبياً»** banner appears in the side panel.
5. Run Trial Balance and confirm Dr = Cr.
6. Spot-check one customer and one supplier statement against `get_contact_balance` to confirm parity.

## Verification — no duplicate transactions

```sql
SELECT linked_transaction_id, COUNT(*)
FROM transactions
WHERE idempotency_key LIKE 'PAY-REPAIR-%' OR idempotency_key LIKE 'RCV-REPAIR-%'
GROUP BY 1 HAVING COUNT(*) > 1;
```
Expected: zero rows.