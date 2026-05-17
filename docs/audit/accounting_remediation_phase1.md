# Accounting Remediation — Phase 1A

Date: 2026-05-17
Scope: Future-safe guards + targeted, idempotent repair. **No broad blocking
triggers on invoices, no schema redesign, no RLS changes, no deploys.**

---

## 1. What this phase delivered

### 1.1 Future protection (DB triggers/functions)

| Object | Effect |
|---|---|
| `public.guard_voucher_must_have_journal()` + trigger `trg_guard_voucher_must_have_journal` on `vouchers` | Blocks `status='posted'` if `linked_transaction_id` is `NULL` or its transaction is missing/deleted. Safe because the current FE flow (`VoucherFormPage.tsx`) always creates the transaction first and only then inserts the voucher with `linked_transaction_id` set. |
| `public.reverse_invoice_stock(p_invoice_id uuid)` | Idempotent helper: for every `stock_movements` row tied to an invoice, creates exactly one offsetting movement tagged `reference_type='invoice_void'` and `notes='reverse_of:<orig_id>'`. Re-running yields **zero** new rows. |
| `public.cascade_invoice_cancel_to_transactions()` (extended) | When an invoice flips to `status='cancelled'`, now ALSO calls `reverse_invoice_stock(NEW.id)` in addition to the existing journal reversal. Un-cancel path is unchanged. |

No trigger added on `invoices` that requires a journal at insert time
(deliberate — the FE still posts in two steps).

### 1.2 Targeted repair (data only)

Tenant: `douliakitchens@gmail.com` (`user_id = 948e365f-fb00-4429-a85c-64bf56cef80e`).

After deeper inspection the 11 "missing-journal" vouchers from the audit
were NOT missing journals. Their transactions existed, were balanced, and
were correctly linked via `vouchers.linked_transaction_id`. What was
missing was the human-readable `transactions.reference` (NULL because an
older FE path skipped the post-insert reference update on line 1820 of
`VoucherFormPage.tsx`).

Repair executed (single `UPDATE`, no inserts, no deletes):

```sql
UPDATE public.transactions t
SET reference = v.ref_number
FROM public.vouchers v
WHERE t.id = v.linked_transaction_id
  AND v.user_id = '948e365f-fb00-4429-a85c-64bf56cef80e'
  AND v.status = 'posted'
  AND COALESCE(t.is_deleted, false) = false
  AND (t.reference IS NULL OR t.reference <> v.ref_number);
```

10 voucher–transaction pairs updated:
`PV-2026-0011`, `PV-2026-0012`, `PV-2026-0013`, `PV-2026-0014`,
`PV-2026-0015` (×2 lines), `PV-2026-0016` (×3 lines), `PV-2026-0035`.

Each transaction retained its original `id`, `amount`, `debit_account_code`,
`credit_account_code` and `transaction_date`. Nothing duplicated, nothing
removed.

### 1.3 Documentation

- `docs/audit/accounting_integrity_checks.sql` — 9 health-check queries
  for daily monitoring.
- `docs/audit/accounting_remediation_phase1.md` — this file.

---

## 2. Verification (run-before vs run-after)

| Check | Before | After |
|---|---:|---:|
| Posted vouchers with NULL/mismatched `transactions.reference` (douliakitchens) | 10 | **0** |
| Posted vouchers truly without any linked transaction (whole DB) | 0 | **0** |
| Trial balance unbalanced tenants | 0 | **0** |
| One-sided transactions | 0 | **0** |
| Cancelled invoices with stock movements awaiting reversal (legacy) | 10 | 10 *(intentionally deferred to Phase 1B)* |
| Duplicate invoice numbers | 0 | **0** |
| `invoice_sequences` lag | 0 | **0** |

SQL used for verification is contained in `accounting_integrity_checks.sql`
queries #3, #4, #5, #6 and the focused query:

```sql
-- douliakitchens reference repair verification
SELECT COUNT(*) FROM public.vouchers v
JOIN public.transactions t ON t.id = v.linked_transaction_id
WHERE v.user_id = '948e365f-fb00-4429-a85c-64bf56cef80e'
  AND v.status = 'posted'
  AND (t.reference IS NULL OR t.reference <> v.ref_number);
-- expected: 0
```

---

## 3. Risks accepted

1. **Voucher posting guard** — if any non-FE path (RPC, edge function,
   manual import) writes `vouchers.status='posted'` without first creating
   a transaction, it will now throw. All known paths in
   `src/pages/VoucherFormPage.tsx`, `src/pages/rep/RepCollectPage.tsx`,
   `src/pages/rep/RepExpensePage.tsx` and `src/lib/voucher-rpc.ts` create
   the transaction first, so this is acceptable.
2. **Stock reversal on cancel** — runs SECURITY DEFINER inside the cascade
   trigger. The reversal is fully idempotent, so manual re-triggering or
   accidental re-cancellation is harmless.
3. **`reference` backfill** — purely cosmetic for journal search; cannot
   alter balances. Zero risk.

---

## 4. Phase 1B — deferred items

Do NOT touch in this phase. Picked up next, each behind explicit user approval:

1. **Stock reversal backfill** for the 10 legacy cancelled REP invoices
   (`jamal.4jojo@gmail.com`). Requires per-invoice verification that the
   physical stock today reflects the unreversed state (otherwise
   reversing would double-count).
   Suggested approach: run `SELECT public.reverse_invoice_stock(i.id)`
   per invoice **after** the user confirms the current quantities, and
   record results in a dedicated migration note.
2. **Posted invoices without journal** (18 historical rows) — manual
   per-tenant decision: backfill journals or document as out-of-scope
   migration data.
3. **`contacts.current_balance` desync** — convert into a computed view
   or trigger-maintained value sourced from `transactions`.
4. **Orphan transactions** (`saymehosaid`, 2 rows) — link to a synthetic
   "archival" invoice or soft-delete after audit.
5. **Product invoices without stock movement** (68 sale + 12 purchase)
   — NOT to be auto-fixed. Needs human review per tenant of current
   on-hand quantities first.
6. **Hard `invoice_must_have_journal` trigger** — only after invoice
   posting becomes a single atomic RPC. Tracked separately.

---

## 5. Files changed in Phase 1A

- `supabase/migrations/<timestamp>_*.sql` — DB triggers/functions.
- `docs/audit/accounting_integrity_checks.sql` — new.
- `docs/audit/accounting_remediation_phase1.md` — new.

No application TypeScript code modified.