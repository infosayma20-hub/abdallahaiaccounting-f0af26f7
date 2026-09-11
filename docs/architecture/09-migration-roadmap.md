# Safe Migration Roadmap

## 1. Governing sequence

```text
Discover -> Baseline -> Add compatibility -> Shadow validate
-> Flagged pilot -> Reconcile -> Expand cohort -> Deprecate later
```

No phase removes the old path. Removal is a separate future decision after adoption, telemetry, customer communication, and rollback-window expiry.

## 2. Stage 0 — Baseline and freeze contracts

- **Current:** heterogeneous writers and incomplete traceability.
- **Target:** registry of commands/writers/contracts and invariant baseline.
- **Intermediate:** documentation in this folder plus machine-readable registries later.
- **Method:** catalog live functions/policies/triggers; capture representative outcomes and schemas.
- **Rollback:** none; read-only.
- **Risk:** stale conclusions from historical migrations. Mitigation: live catalog verification.
- **Tests:** contract snapshots, read-only reconciliation, auth matrix.
- **Observability:** baseline counts, latency, error and reconciliation rates.

## 3. Stage 1 — Command foundation pilot

Introduce envelope/context/idempotency/audit around one proven RPC; no business-rule change. See pilot below.

## 4. Stage 2 — Transactional outbox

- **Current:** side effects via Realtime, direct integrations, cron, and bespoke logs.
- **Target:** committed event in same transaction; retryable delivery.
- **Intermediate:** pilot command emits one internal event with no external subscriber.
- **Method:** additive tables/worker, shadow event validation, then one audit consumer.
- **Rollback:** stop dispatcher and flag event emission; source transaction remains valid.
- **Risk:** event duplication or sensitive payloads.
- **Tests:** transaction rollback, replay, ordering per aggregate, payload allow-list.
- **Observability:** queue depth, age, attempts, dead letters, consumer lag.

## 5. Stage 3 — Posting engine by document type

Order: receipts → payments without cheques → journals → invoices → payroll/assets/manufacturing → POS last.

For each type: model current effects; implement V1 engine; shadow compare; flag one test company; daily reconciliation; expand slowly. Never dual-post. Rollback flag returns future commands to legacy; posted pilot records remain and reverse through their own versioned path.

## 6. Stage 4 — Inventory engine by source

Order: manual adjustment → transfer → purchase receipt → sales invoice → returns → production → POS/offline last. Quantity and value reconciliation must pass before expansion. Historical drift is a separate approved data program.

## 7. Stage 5 — Semantic metrics

Certify one metric at a time against existing reports and accountant sign-off. Route one dashboard/report via flag. Rollback restores legacy loader. Definitions are versioned; differences are explained, never silently normalized.

## 8. Stage 6 — Policy/workflow and APIs

Wrap current permissions without weakening them; add contextual decisions for new commands. Then expose those commands through `/v1` and signed webhooks. Existing integrations remain until each adapter passes replay and tenant-isolation tests.

## 9. Stage 7 — AI tool registry

Start read-only. Then draft-only. Only low-risk confirmed commands may execute after explicit user confirmation and audit. Posted accounting/inventory commands remain human-approved until governance demonstrates otherwise.

## 10. Rollout rings

1. automated isolated fixtures;
2. internal test company;
3. one branch/user/device;
4. one low-volume pilot company;
5. 5% eligible companies;
6. 25%;
7. 100% eligible;
8. legacy deprecation review after a defined stability window.

Every ring has objective stop conditions: invariant failure, unexplained reconciliation difference, cross-tenant denial failure, duplicate rate, command error/latency regression, or support incident.

## 11. Recommended first pilot — Receipt Command Envelope V1

### Why this pilot

`src/lib/voucher-rpc.ts:107-155` already wraps `create_receipt_with_entry`; `vouchers_use_rpc` already defaults OFF and demonstrates tenant-controlled routing. Receipts have clear accounting effects, existing idempotency, and narrower complexity than invoices, payroll, inventory, or POS.

### Scope

- One existing atomic receipt RPC.
- One internal test company, optionally one user.
- No UI redesign, no schema removal, no historical migration.
- Envelope/context validation, command audit, correlation ID, result contract, and automated invariant tests.
- Event emission may be shadow-only; no external delivery in the pilot.

### Current state

Caller builds RPC parameters; feature flag selects RPC or legacy path. Audit/correlation is not a standardized command record.

### Safe intermediate state

`execute_business_command_v1` or a typed receipt-specific V1 adapter validates envelope/context, claims idempotency, invokes the proven receipt function within the controlled server transaction, records outcome/effects, and returns the existing-compatible result.

### Migration method

1. Baseline receipt outcomes and schemas.
2. Add isolated command/audit structures.
3. Build unit, DB, RLS, replay, and reconciliation tests.
4. Shadow-validate context without changing writes.
5. Enable for test company/user.
6. Compare voucher, transaction, allocation, balance, numbering, and latency daily.
7. Expand only after approval.

### Rollback

Set flag OFF. No historical rows are rewritten. The pilot's valid receipts stay valid and use existing reversal rules if business reversal is required. Command audit rows are retained.

### Risks and controls

| Risk | Control |
|---|---|
| duplicate receipt | deterministic idempotency and replay test |
| scope mismatch | server-derived context + RLS tests |
| numbering difference | retain current allocator |
| latency regression | command duration metric and threshold |
| adapter changes behavior | golden fixture comparison |

## 12. Explicitly not in the pilot

Invoice editing, POS, stock, payroll, AI writes, historical repairs, tenant-key changes, policy replacement, public APIs, external webhooks, or old-path deletion.
