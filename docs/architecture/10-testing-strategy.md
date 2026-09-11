# ERP Testing Strategy

## 1. Current baseline

The repository contains Vitest/JSDOM, Playwright configuration, read-only accounting smoke coverage (`tests/e2e/full-accounting-cycle.spec.ts`), and limited write scenarios that intentionally leave tagged records (`full-accounting-cycle-phase2.spec.ts`). Existing audit SQL and `integrity-engine.ts` provide useful checks but are not yet a release-gating invariant suite.

## 2. Test pyramid

| Level | Purpose | Examples |
|---|---|---|
| L0 static contracts | prevent forbidden patterns | migration immutability, grants, command schema, no client service keys |
| L1 unit | deterministic calculations | VAT, rounding, currency, sign, numbering format, policy predicates |
| L2 domain service | command behavior without UI | receipt/journal/invoice/stock lifecycle, idempotency, reversal |
| L3 database/RPC | transaction, locks, RLS, triggers | rollback on failure, concurrent replay, fiscal lock, leaf account |
| L4 integration | Edge/provider adapters | webhook signature/replay, service account scope, outbox retry |
| L5 E2E | user business flows | create/post/reverse, offline queue/reconnect, approval segregation |
| L6 production-safe invariants | read-only continuous assurance | GL/source, stock/source, tenant isolation, queue health |

Prefer many deterministic L1-L3 tests, fewer E2E writes, and read-only production monitors.

## 3. Mandatory accounting invariants

1. Total debit equals total credit by command, currency/base amount, source, and period.
2. No active duplicate `(tenant, source, effect, posting_version)`.
3. No posting to parent/inactive/cross-tenant accounts.
4. No posting in closed period.
5. Every posted source has its required active effects.
6. Reversal exactly negates original and links both directions.
7. AR/AP and supported subledgers reconcile.
8. VAT ledger and GL reconcile.
9. Currency conversion follows versioned rounding.
10. Replaying a command returns the original result without new effects.

## 4. Inventory invariants

- Cached product and warehouse quantities equal canonical signed movements.
- One active movement effect per source line/version.
- Transfer OUT equals IN in quantity and cost.
- Return reverses original source/cost basis.
- Production material consumption and output match approved quantities.
- Inventory value reconciles to GL under certified costing policy.
- Posted movement correction uses reversal/replacement, not UPDATE.

## 5. Security and RLS suite

For each table/RPC/Edge command test: anon, unrelated tenant, same tenant wrong branch, wrong role, permitted actor, service account scope, self-approval restriction, and malformed/replayed request. Validate rows returned/changed, not merely HTTP status. Catalog tests assert RLS enabled, expected grants, pinned definer search paths, and no accidental PUBLIC execute on new privileged functions.

## 6. Offline suite

Use `fake-indexeddb` for queue state transitions and Playwright for browser lifecycle. Cover encrypted storage, unsupported crypto behavior, refresh/restart, duplicate replay, concurrent sync, closed session, expired prices, changed permissions/tax, quarantine/manual retry, partial server failure/resume, multi-terminal ordering, and version upgrade/rollback.

## 7. Migration tests

- Apply all migrations from clean baseline.
- Upgrade a production-like anonymized schema snapshot.
- Prove historical migration files unchanged.
- Run pre/post row counts, null/duplicate/FK checks and invariants.
- Test interrupted backfill resume and rollback compatibility.
- Verify old and new clients during the compatibility window.

## 8. Golden fixtures

Maintain small, reviewed scenarios for cash/credit sale, purchase, VAT-inclusive/exclusive, discount, multicurrency, receipt/payment allocation, cheque lifecycle, POS split tender/return, payroll, depreciation/disposal, production consumption/output, transfer, and cancellation/reversal. Expected journal and stock effects are accountant-approved data fixtures.

## 9. Release gates

1. Static and unit pass.
2. DB/RPC transaction and RLS pass.
3. Domain golden fixtures pass.
4. Migration upgrade/rollback compatibility pass.
5. E2E on isolated test company.
6. Shadow reconciliation has zero unexplained differences.
7. Performance budgets and observability present.
8. Pilot approval with flag OFF by default.

Any accounting, inventory, tenant, or replay invariant failure blocks rollout. A test that writes must never target a production company unless it is an explicitly approved, isolated test tenant and cleanup/reversal is documented.

## 10. Rollback tests are mandatory

Before rollout, prove flag disable, old-client compatibility, dispatcher stop, command replay behavior, and business reversal. Rollback must not require deleting posted transactions.
