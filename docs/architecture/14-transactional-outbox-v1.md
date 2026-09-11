# 14 — Transactional Outbox + Domain Events V1 (Stage 2)

Status: **prepared for review. Migration NOT applied. Flag OFF for every tenant. No external delivery.**
Scope: one event, emitted only by Receipt Command V1. Stage 3 (Posting Engine) is not started.

Prerequisite note: Receipt Command V1 (doc `13`) is implemented and disabled for every tenant; it is **not yet certified as READY FOR INTERNAL PILOT** (no live financial test has been run). Therefore Stage 2 adds infrastructure, tests and a prepared migration only — no production behaviour is expanded.

---

## 1. Schema (additive only)

`public.domain_events_outbox`

| Group | Columns |
| --- | --- |
| identity | `id`, `event_id` (unique), `event_type`, `event_version`, `aggregate_type`, `aggregate_id`, `aggregate_sequence` |
| resolved context | `owner_id`, `actor_id`, `company_id`, `branch_id` |
| traceability | `command_id`, `correlation_id`, `causation_id`, `dedupe_key` |
| time | `occurred_at`, `effective_at`, `created_at`, `updated_at`, `processed_at`, `dead_lettered_at` |
| data | `payload` (safe, versioned) |
| delivery | `status`, `attempt_count`, `next_attempt_at`, `last_error` |

Indexes: unique `(owner_id, event_type, dedupe_key)`; partial `(status, next_attempt_at)` for pending/failed; `(owner_id, created_at desc)`; `(aggregate_type, aggregate_id, occurred_at)`; `(command_id)`.

Supporting objects: `is_command_flag_enabled_v1`, `emit_domain_event_v1`, `dispatch_domain_events_v1` (test-only, dry-run default, super_admin only, **no external calls**), view `domain_events_outbox_health_v1`.

## 2. Event contract — `finance.receipt.created.v1`

A committed fact, never a command.

```jsonc
{
  "event_type": "finance.receipt.created.v1",
  "event_version": 1,
  "aggregate_type": "finance.receipt",
  "aggregate_id": "<transaction uuid>",
  "owner_id": "…", "actor_id": "…", "company_id": "…", "branch_id": "…",
  "command_id": "…", "correlation_id": "…", "causation_id": "…",
  "dedupe_key": "finance.create_receipt.v1:<idempotency_key>",
  "occurred_at": "…", "effective_at": "<voucher date>",
  "payload": {
    "schema_version": 1,
    "transaction_id": "uuid",
    "currency": "شيكل",
    "amount_bucket": "lt_100 | lt_1k | lt_10k | lt_100k | gte_100k",
    "has_contact": true,
    "has_allocations": false,
    "source": "web"
  }
}
```

Excluded on purpose: amount value, exchange rate, contact id/name, employee id, description, notes, reference, account codes, allocations, and any phone/email/IBAN.

## 3. Atomicity

`emit_domain_event_v1` is a plain PL/pgSQL `INSERT` called from inside `create_receipt_command_v1`, which itself runs as a single PostgreSQL statement/transaction. There is no `COMMIT`, no `dblink`, no `pg_net`, no autonomous transaction anywhere in the path. Therefore the receipt row, the command audit row and the event row commit or roll back together. Proof scripts: `supabase/migrations-pending/20260911_stage2_outbox_v1_tests.sql` tests T1–T3.

Failure ordering: the event is emitted only **after** the receipt has succeeded and the command audit is marked `succeeded`. A failed receipt returns before the emit block, so it produces zero events.

## 4. Naming and versioning

`<domain>.<aggregate>.<fact>.v<N>`. A breaking payload change becomes `…v2`; `v1` is never mutated. `payload.schema_version` mirrors the version for consumers reading the JSON alone.

## 5. Idempotency and replay

The unique index on `(owner_id, event_type, dedupe_key)` plus `ON CONFLICT DO NOTHING` guarantees exactly one logical event per logical command, whether the duplicate arrives as a retry, an offline replay, or a concurrent request (the second one blocks on the index and then finds the existing row). A replayed command that short-circuits on the command audit returns before the emit block and produces no second event.

## 6. Security

- RLS enabled; the only policy is `SELECT` scoped to the owner, their employees, or `super_admin`.
- No `INSERT`/`UPDATE`/`DELETE` policy exists, so no ordinary user can write, edit or delete events.
- `GRANT SELECT` to `authenticated`, `GRANT ALL` to `service_role`. No `anon` grant.
- `emit_domain_event_v1` is revoked from `PUBLIC`/`anon`/`authenticated`; it is reachable only from `SECURITY DEFINER` command functions.
- Cross-tenant reads are impossible via the policy; the health view is `security_invoker`.

## 7. Retry model

`status ∈ pending | processing | processed | failed | dead_letter | suppressed`, with `attempt_count`, `next_attempt_at` and `last_error`. Stage 2 ships no active worker: `dispatch_domain_events_v1` defaults to `p_dry_run = true`, requires `super_admin`, and performs no external delivery. Backoff and dead-lettering thresholds are deferred to the stage that introduces a real consumer.

## 8. Observability

`domain_events_outbox_health_v1` exposes per owner/event type: `event_count`, `pending_count`, `processed_count`, `retry_count`, `dead_letter_count`, `max_attempts`, `oldest_pending_at`, `oldest_pending_age_seconds`. `command_id` / `correlation_id` / `causation_id` link every event back to its command audit row in `business_commands`.

## 9. Tests

Client contract tests: `src/lib/events/__tests__/domain-event-v1.test.ts` (event name, default-OFF flag, dedupe key stability, amount bucketing, payload shape, deep sensitive-data detection, no client-supplied identity).

Database tests (prepared, not executed against production): T1 one event on success, T2 zero events on failure, T3 rollback removes both, T4/T5 retry and replay produce one event, T6 event context equals server-resolved command context, T7 payload has no disallowed keys, T8 SELECT-only policy set, T9 cross-tenant isolation, T10 aggregate identity/ordering stability.

## 10. Feature flag

`events.receipt_v1`, read from `company_settings.feature_flags`, default **OFF**. OFF: Receipt Command V1 behaves exactly as today and no event is required or written. ON: the event is written atomically. Not enabled for any company.

## 11. Rollback

1. Set `events.receipt_v1 = false` (or remove the key) — emission stops immediately.
2. Leave `dispatch_domain_events_v1` unused/dry-run.
3. Optionally `CREATE OR REPLACE` the pre-Stage-2 body of `create_receipt_command_v1` (doc `13`).

Never delete committed receipt data and never delete outbox rows as part of rollback.

## 12. Known limitations

- No consumer, no delivery, no ordering guarantees across aggregates (only per aggregate, by `occurred_at`).
- `aggregate_sequence` is reserved and currently unused.
- No backfill of historical receipts, by design.
- Same-transaction atomicity relies on all callers avoiding autonomous transactions; any future emitter must follow the same rule.

## Applied status — 2026-09-11

Stage 2 migration APPLIED to the live database (additive only).

Deviation from the prepared file: the RLS read policy originally referenced
`employees.created_by`, which does not exist. It was replaced with the same
tenant scoping already proven on `business_commands`:
`owner_id = public.get_team_owner_id(auth.uid())`.

Additional hardening migration applied: the project's default privileges had
granted `anon`/`authenticated` full DML on any new public table. INSERT/UPDATE/
DELETE/TRUNCATE were revoked from both roles, SELECT revoked from `anon`, and
`is_command_flag_enabled_v1` EXECUTE revoked from PUBLIC/anon/authenticated.

Test results: 14 isolated functional tests + 6 impersonated-user security tests
all passed. Outbox left empty (0 rows). No tenant enabled for
`events.receipt_v1` or `commands.receipt_v1`. No receipt or financial
transaction was created.

Not yet executed (requires approval): enabling `events.receipt_v1` on an
internal test company and running the end-to-end receipt+event atomicity tests
(T1/T2/T3/T6 of the prepared script), which require creating real receipts.
