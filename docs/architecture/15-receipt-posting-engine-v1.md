# Stage 3A — Receipt Posting Engine V1

Status: **CERTIFIED READY FOR INTERNAL PILOT** (allocation receipts excluded).
Scope: receipts only. No payments, cheques, journals, invoices, VAT, inventory, POS, payroll, assets, manufacturing, AI or public API behaviour was changed.
All Stage 3A feature flags are **OFF for all 18 companies**. Production behaviour is byte-for-byte unchanged.

---

## 1. Documented current live receipt behaviour (pre-change baseline)

Authoritative writer today: `public.create_receipt_with_entry(...)`, called directly by the UI or through `create_receipt_command_v1` (Stage 1 pilot).

| Aspect | Live behaviour |
|---|---|
| Ledger | Single balanced row in `public.transactions` (`debit_account_code` / `credit_account_code` / `amount`) |
| Cash receipt | Debit resolved from role `CASH` → default parent family `1110`, tenant leaf required |
| Bank receipt | Debit role `BANK` → `1120` family |
| Cheque receipt | Debit role `CHEQUES_RECEIVABLE` → `1150` family |
| Explicit account | `cash_account_code` in the payload overrides role resolution, still validated |
| Customer credit | `1130` family, resolved to the contact subledger via `resolve_postable_account` (may create the subledger, as today) |
| Employee credit | `1140` family |
| Allocations | `allocate_voucher_to_invoices_atomic` — unchanged, legacy only |
| Foreign currency | Stores `exchange_rate` and `foreign_amount = ROUND(amount / exchange_rate, 4)`; `amount` stays in base currency |
| Fiscal locks | Enforced by the existing `check_fiscal_period_open` trigger on `transactions` |
| Parent accounts | Rejected by `_fc_validate_postable_account` (posting only to leaf accounts) |
| Numbering / references | Existing sequence + source reference logic, untouched |
| Reversal | `create_reverse_entry(transaction_id, reason)` — no hard deletes |

Stage 3A **reuses** every rule above. It does not re-implement accounting logic.

---

## 2. Flow

```text
Receipt Command V1  (create_receipt_command_v1)
      -> resolve_command_context_v1        server-side tenant / actor / permissions
      -> business_commands insert          idempotency (digest of envelope)
      -> build_receipt_posting_intent_v1   PostingIntentV1 (roles -> accounts, amounts, rates)
      -> post_receipt_v1                   Posting Engine: validate -> write GL effect
      -> posting_intents_v1                immutable intent + effect traceability
      -> emit_domain_event_v1              finance.receipt.created.v1 (outbox)
   all inside ONE PostgreSQL transaction
```

## 3. PostingIntentV1

Versioned, tenant-scoped, immutable record in `public.posting_intents_v1`:
`posting_version`, `source_type`, `source_id` (command), `effect_type`, `owner_id`, `company_id`,
`branch_id`, `actor_id`, `effective_date`, `currency`, `amount`, `exchange_rate`, `foreign_amount`,
`debit_role`, `credit_role`, `debit_account_code`, `credit_account_code`, `contact_id`,
`transaction_id`, `reversal_transaction_id`, `status`, `result_code`, `duration_ms`.

Invariants enforced by the engine:
- tenant ownership of every account (`accounts.user_id = resolved owner`)
- leaf/postable accounts only; parent accounts rejected
- fiscal period must be open for `effective_date`
- currency + rate consistency; `debit = credit` (single balanced effect)
- one active effect per `(source_type, source_id, effect_type, posting_version)` (unique index)
- immutability trigger: an existing intent's financial fields and `transaction_id` cannot be edited; only `status` / reversal linkage may change
- reversal only via `create_reverse_entry`, never delete

Client-side mirror of the contract (types, flags, parity comparator, no authority):
`src/lib/posting/posting-intent-v1.ts` with unit tests in `src/lib/posting/__tests__/posting-intent-v1.test.ts`.

## 4. Feature flags (all default OFF)

| Flag | Meaning |
|---|---|
| `commands.receipt_v1` | Stage 1 command envelope |
| `events.receipt_v1` | Stage 2 outbox event emission |
| `posting.receipt_v1_shadow` | Build intent + compare with legacy result, **no** engine write |
| `posting.receipt_v1` | Engine writes the GL effect |

Allocation receipts always fall back to the legacy writer, regardless of flags.

## 5. Security

- `post_receipt_v1`, `build_receipt_posting_intent_v1`, `resolve_receipt_account_roles_v1`,
  `shadow_compare_receipt_posting_v1`: `EXECUTE` granted to `service_role` only.
- `create_receipt_command_v1`: `authenticated` only; `anon` revoked.
- All new functions are `SECURITY DEFINER` with `SET search_path = public`; pgcrypto is called as `extensions.digest(...)`.
- `posting_intents_v1`: RLS on, tenant-scoped `SELECT` policy only; `INSERT/UPDATE/DELETE` revoked from `authenticated` and `anon`; `service_role` full.

## 6. Certification results (internal test company only)

Company: `مؤسسة صايمة للمحاسبة والتدقيق`. No customer company was used.

| Test | Result |
|---|---|
| Shadow parity — cash / bank / customer / foreign currency | 4/4 match, zero differences, no engine write |
| Engine V1 — cash / bank / customer / foreign currency | posted, one transaction + one intent + one event each |
| Legacy vs V1 field parity (debit, credit, amount, rate, foreign amount, date, contact) | 4/4 identical |
| Idempotent replay (same key) | no duplicate command, transaction, intent or event |
| Parent account `1110` | rejected, zero financial rows |
| Unknown account `99999999` | rejected, zero financial rows |
| Locked fiscal period (temporary fixture) | rejected, zero transactions, zero intents |
| Direct call to `post_receipt_v1` as signed-in user | permission denied |
| Direct call to `build_receipt_posting_intent_v1` as signed-in user | permission denied |
| Direct INSERT / UPDATE / DELETE on `posting_intents_v1` | blocked (RLS + revoked privileges) |
| Cross-tenant read of `posting_intents_v1` | 0 rows |
| Atomicity | failures leave no command effect, no intent, no transaction, no event |
| Traceability | every active intent → 1 succeeded command, 1 transaction, 1 event, `effect_count = 1`, `posting_version = 1` |
| Latency | 2–11 ms per posting |

Cleanup: all 17 test receipts reversed with `create_reverse_entry` (net financial effect **0**), intents marked `reversed`, temporary fiscal-period fixture removed, all four flags set back to `false`. Zero companies have any Stage 3A flag enabled; zero active intents remain.

## 7. Known limitations

1. **Allocation receipts are NOT certified** and are deliberately excluded from the engine — no safe reversible fixture exists. They stay on the legacy path.
2. No dedicated cross-tenant account-code fixture exists in this database (chart-of-account codes are per-tenant rows), so tenant scoping is proven by the ownership predicate and the unknown-account rejection rather than by a foreign code.
3. Concurrency is guaranteed structurally (unique indexes on command idempotency, transaction idempotency key and active intent) rather than by a multi-session load test.

## 8. Rollback

Set `posting.receipt_v1 = false` for the tenant: the command instantly returns to `create_receipt_with_entry`. The engine, intents table and flags are additive; disabling them restores today's behaviour with no data migration.

## 9. Not started

Stage 3B (payments), journals and invoices remain untouched and require explicit approval.
