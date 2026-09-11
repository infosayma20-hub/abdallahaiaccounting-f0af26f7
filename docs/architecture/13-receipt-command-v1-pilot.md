# 13 — Receipt Command Envelope V1 (Controlled Pilot)

Status: **implemented, disabled for every tenant, awaiting approval to activate.**
Scope: receipts only. Stage 2 (Posting Engine, Inventory API, Workflow, Semantic Layer, AI Tool Registry) is **not** started.

This document does not replace `00`–`12`; it is the pilot record.

---

## 1. Verified reality before implementation

- `src/lib/voucher-rpc.ts` already wraps `create_receipt_with_entry` (`callCreateReceiptRpc`) behind `vouchers_use_rpc`.
- Live `public.create_receipt_with_entry(uuid,uuid,text,numeric,text,text,text,text,date,numeric,text,text,text,text,uuid,uuid,jsonb,uuid)` is `SECURITY DEFINER`, PL/pgSQL. It:
  - calls `assert_owner_scope(p_user_id)`,
  - validates user/amount,
  - returns `duplicate` when `(user_id, idempotency_key)` already exists in `transactions`,
  - resolves debit (`1110/1120/1150` or an explicit cash account code) and credit (`1140` for employees, otherwise `1130`, or an explicit contact account code),
  - validates both accounts with `_fc_validate_postable_account`,
  - inserts exactly one `transactions` row,
  - optionally calls `allocate_voucher_to_invoices_atomic`,
  - catches exceptions and returns `{success:false,error}` after rolling back its own effects.
- Live unique index `idx_transactions_user_idempotency_key` on `transactions(user_id, idempotency_key)` where the key is not null.
- `assert_owner_scope` permits self / team owner / `super_admin` / holding membership / `active_owner_context`, otherwise raises `42501`.
- Two tenants already have `vouchers_use_rpc = true`, so that flag **cannot** be reused for the pilot.

## 2. What was added (additive only)

Database (one migration, no existing object altered, no data backfilled):

| Object | Purpose |
| --- | --- |
| `public.business_commands` | Command audit log: command id/type/version, resolved actor & owner, company, branch, source, device, idempotency key, correlation/causation, status, payload digest (SHA-256, no financial values), duration, result reference, error code |
| `public.resolve_command_context_v1(source, company_id, branch_id, device_id)` | Server-authoritative context resolution + existing authorization rules |
| `public.validate_receipt_command_v1(envelope)` | Shadow validation. `STABLE`, performs no writes, produces no financial effect |
| `public.create_receipt_command_v1(envelope)` | The command. Thin versioned boundary around the existing receipt logic |

Frontend:

| File | Purpose |
| --- | --- |
| `src/lib/commands/command-envelope-v1.ts` | Reusable envelope type + builder + result type |
| `src/lib/commands/command-context-v1.ts` | Client hints only; calls server context resolver |
| `src/lib/commands/receipt-command-v1.ts` | Flag, payload contract, submit/validate, legacy-result adapter |
| `src/pages/VoucherFormPage.tsx` | One nested branch inside the **existing** simple-contact receipt path |

## 3. Command contract

```jsonc
{
  "command_id": "uuid",
  "command_type": "finance.create_receipt.v1",
  "schema_version": 1,
  "source": "web|mobile|pos|offline|api|automation|device",
  "device_id": "string|null",
  "company_id": "uuid|null",   // hint, re-validated against the tenant
  "branch_id":  "uuid|null",   // hint, re-validated against the tenant
  "idempotency_key": "string",
  "correlation_id": "uuid",
  "causation_id": "uuid|null",
  "occurred_at": "iso",
  "effective_date": "YYYY-MM-DD|null",
  "payload": {
    "contact_id", "contact_name", "amount", "payment_method", "description",
    "currency", "voucher_date", "exchange_rate", "reference",
    "cash_account_code", "contact_account_code", "notes",
    "employee_id", "workshop_id", "cost_center_id", "allocations"
  }
}
```

Result (stable, versioned):

```jsonc
{ "version": 1, "status": "succeeded|failed", "command_id": "uuid",
  "correlation_id": "uuid|null", "replayed": true|false,
  "transaction_id": "uuid|null", "transaction_ids": ["uuid"],
  "allocations": …, "error": "…" }
```

## 4. Context resolution (never trusted from the browser)

`actor_id = auth.uid()` (null ⇒ `42501`), `owner_id = get_team_owner_id(actor)`, then `assert_owner_scope(owner)`.
`company_id` must satisfy `companies.owner_id = owner`; `branch_id` must satisfy `branches.user_id = owner`; otherwise `42501`.
Any `user_id` / `owner_id` sent by a client is ignored — the envelope has no such field.

## 5. Atomicity and single-writer guarantee

- One PostgreSQL transaction: audit claim → existing receipt logic → audit completion.
- The command performs **no** financial insert of its own. `create_receipt_with_entry` remains the single authoritative writer. There is no dual posting and no shadow ledger.
- On business failure the inner function has already rolled back its own effects; the command marks the audit row `failed` and returns a failed result — no partial financial state can survive.
- Numbering, VAT, fiscal-period locks, posting rules, contact resolution and allocation behaviour are untouched.

## 6. Idempotency and concurrency

Two composed layers, no competing mechanism:

1. `business_commands` unique `(resolved_owner_id, command_type, idempotency_key)`. A duplicate submit finds the committed row; if it is `succeeded` the stored result is returned with `replayed: true` and the receipt logic is never re-entered. A previously `failed` row is retried in place.
2. The pre-existing `transactions(user_id, idempotency_key)` unique index plus the RPC's own duplicate check remain the final guard; the RPC's `duplicate` flag is surfaced as `replayed`.

Concurrent identical submits serialize on the unique index: the loser waits, then reads the committed row and replays instead of posting twice.

## 7. Security posture

- Both command functions: `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated` only. Verified live: **0 grants to `anon`/`PUBLIC`**.
- `business_commands`: RLS enabled, `SELECT` only for the actor or tenant members. **No `INSERT`/`UPDATE`/`DELETE` policy exists** (verified live: 0 non-SELECT policies), so audit rows can only be written by the definer functions and cannot be edited or deleted by any signed-in user.
- No global RLS, role, or tenancy change was made. No existing policy was modified.
- The command is **not** registered as an AI tool and is not reachable from `database-command` or any AI surface.
- The audit row stores a SHA-256 digest of the payload, not amounts or party names.

## 8. Tests

`src/lib/commands/__tests__/receipt-command-v1.test.ts` — 11 tests, all passing:

- flag OFF by default, OFF for missing settings, OFF for `vouchers_use_rpc`, requires literal `true`;
- envelope shape/versioning/effective date;
- envelope carries **no** client actor/owner/tenant identity;
- stable idempotency key across rebuilds, unique command ids;
- invalid amount and missing idempotency key rejected before any network call;
- legacy-parity mapping for success, replay (`duplicate`), and failure.

Live database assertions executed read-only:

- `business_commands` rows: 0; tenants with `commands.receipt_v1`: 0; non-SELECT policies: 0; `anon` grants: 0; `create_receipt_with_entry` still present and unchanged.
- Executing `validate_receipt_command_v1` from a non-`authenticated` SQL role is rejected with `42501: permission denied`.

**Not executed:** end-to-end posting, rollback and concurrency tests against a live tenant. Those require an authenticated internal test session and would write real financial rows. They must be run in an internal test company after activation approval, using `validate_receipt_command_v1` first (no financial effect), then a single small receipt, then a deliberate duplicate submit.

## 9. Parity with the legacy path

The pilot branch is nested **inside** the existing `vouchersRpcOn && isSimpleContactVoucher` receipt branch and forwards the identical argument set (contact, amount, mapped payment method, currency label, `RCV-${postingNonce}` key, reference, date, deposit account, notes, workshop, cost center). The result is adapted back to `VoucherRpcResult`, so downstream UI code is byte-for-byte unchanged.

Untouched: payments, journals, cheques, endorsements, allocations, attachments, drafts, refunds, reverse settlements, employee vouchers, account-party vouchers, foreign currency, invoices, POS, inventory, payroll, statements, orders, reports.

## 10. Performance

One additional round trip is **not** introduced: the client still makes a single RPC call. Inside PostgreSQL the command adds one insert and one update on a small, indexed audit table, plus one context resolution. Expected overhead is a few milliseconds; `duration_ms` is recorded on every command row so real overhead can be measured directly after activation.

## 11. Rollout state and rollback

- Flag `company_settings.feature_flags."commands.receipt_v1"` — **absent/false everywhere**. Nothing is live.
- Activation for one internal test tenant only, then observation, then a single low-volume real tenant.
- Rollback level 1 (instant, no deploy): set the flag to false — the legacy path resumes immediately.
- Rollback level 2: revert the `VoucherFormPage` branch.
- Rollback level 3: `DROP FUNCTION create_receipt_command_v1 / validate_receipt_command_v1 / resolve_command_context_v1` and optionally drop `business_commands`. No historical data depends on them.

## 12. Limitations (honest)

- V1 covers the **accounting command** for a simple receipt. The `receipt_vouchers` UI record is still created by the page exactly as today; folding it into the command is a Stage 2 decision.
- Allocations are accepted by the contract but the UI branch that reaches the command excludes them by construction (allocation flows use other paths today).
- The command cannot be exercised end-to-end from service-role SQL by design, because it requires `auth.uid()`.

## 13. Recommendation

Activate `commands.receipt_v1` for one internal test company, run the manual checklist in §8, review `business_commands` (status, `duration_ms`, `replayed`) for a few days, then decide on Stage 2. Do not widen scope before that evidence exists.
