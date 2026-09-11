# Stage 3B — Payment Command + Payment Posting V1 (non-cheque only)

Status: **CERTIFIED READY FOR INTERNAL PILOT** (allocations excluded and uncertified).
All feature flags are OFF for every company, including the internal test company.

## 1. Discovered legacy payment behaviour (`create_payment_with_entry`)

Payments are **not** the mirror of receipts.

| Aspect | Legacy behaviour |
| --- | --- |
| Ledger | single row in `transactions`, `transaction_type='payment'` |
| Debit | explicit `contact_account_code`; else `2140` for employees; else `2110` (supplier). Non-employee contacts resolve through `resolve_postable_account`, keeping `113%` only when applicable |
| Credit | explicit `cash_account_code`; else cash `1110`, bank `1120`, cheque `2120` |
| Currency | stores `exchange_rate` and `foreign_amount = ROUND(amount/rate, 4)` |
| Allocations | `allocate_voucher_to_invoices_atomic` |
| Idempotency | `(user_id, idempotency_key)` unique index |
| Fiscal locks | enforced by existing `transactions` triggers |
| Tenancy | `assert_owner_scope`; leaf/postable account validation |
| Errors | `{success:false,error}` with no financial effect |

Live population at discovery: 601 payments, 38 cheque payments, 4 FX payments.

## 2. Stage 3B design

```
Payment UI → finance.create_payment.v1 → CommandContextV1 (server-resolved)
 → cheque/allocation guard → build_payment_posting_intent_v1
 → post_payment_v1 (Posting Engine V1) → transactions (GL)
 → business_commands audit → finance.payment.created.v1 (outbox)
 → ONE PostgreSQL transaction
```

DB objects (additive): `is_cheque_payment_v1`, `resolve_payment_account_roles_v1`,
`build_payment_posting_intent_v1`, `post_payment_v1`, `create_payment_command_v1`,
reusing `posting_intents_v1`, `business_commands`, `domain_events_outbox`,
`shadow_compare_posting_v1`.

Client (additive, unwired): `src/lib/commands/payment-command-v1.ts` + tests.

## 3. Supported vs excluded

Supported by V1: cash payment, bank payment, supplier payment, expense/account
payment, customer refund, foreign currency.

Excluded → always legacy: **all cheque logic** (method, cheque fields,
`2120%`/`1150%` accounts), payments with invoice allocations (uncertified),
and any tenant without the flags.

## 4. Certification results (internal test company only)

- Shadow mode: 5/5 scenarios matched legacy, 0 mismatches, no dual posting (6 tx / 6 keys).
- V1 vs legacy parity: 6/6 identical on debit, credit, amount, currency, rate,
  foreign amount, date, type, contact, reference.
- Replay: returned the same transaction, `replayed=true`, no second entry.
- Concurrency arbiters: duplicate active intent, duplicate transaction key and
  duplicate command all blocked by unique constraints.
- Negative: parent account, unknown account, cross-tenant account (both sides)
  and locked fiscal period all rejected with **zero** financial effect
  (0 transactions for 6 failed commands).
- Security: `post_payment_v1`, `build_payment_posting_intent_v1`,
  `is_cheque_payment_v1` are service-role only; `anon` cannot execute the
  command; users cannot write `posting_intents_v1`; intent reads are RLS-scoped;
  foreign accounts are invisible to the tenant.
- Atomicity/events: 13 succeeded commands, 13 events, 0 orphan events.
- Cheque proof: cheque method and cheque account both returned
  `posting_version=0`, `cheque_excluded=true`, no intent, credit `2120` (legacy).

## 5. Cleanup

13 test payments reversed with `create_reverse_entry` (13 reversal rows,
net effect 0). No hard deletion. Temporary locked-period fixture removed.
Test intents marked `reversed`; 0 active payment intents remain.

## 6. Flags and rollback

`commands.payment_v1`, `posting.payment_v1`, `posting.payment_v1_shadow`,
`events.payment_v1` = **false** for all 18 companies.
Rollback = set `commands.payment_v1` / `posting.payment_v1` to false; future
payments immediately return to legacy behaviour. No backfill, no historical
change, no legacy deletion.

## 7. Untouched

Cheques, manual journals, invoices, inventory, POS, payroll, assets,
manufacturing, AI, public APIs, historical transactions.
