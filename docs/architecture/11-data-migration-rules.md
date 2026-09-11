# Data Migration Rules

## 1. Non-negotiable rules

1. Historical migrations are immutable.
2. Production transformations are separate from ordinary refactoring.
3. Prefer additive schema and dual compatibility.
4. Never drop/rename first.
5. Never rewrite posted accounting or inventory history without approved reconciliation and reversal strategy.
6. Every new public table includes GRANTs, RLS, policies, indexes, retention, and ownership semantics in the same migration.
7. Time-dependent validation uses triggers/functions, not non-immutable CHECK logic.

## 2. Standard lifecycle

### A. Pre-check

Define scope, owner, affected tenants/rows, constraints, dependencies, estimated lock/runtime/storage, old/new application compatibility, invariants, backup evidence, and stop thresholds.

### B. Additive expand

Add nullable columns/tables/functions/views/indexes. Use versioned names for external contracts. Avoid long blocking defaults and validations on large tables.

### C. Backfill

Use deterministic ordered batches, checkpoints, idempotent predicates, bounded transactions, throttle, and resumability. Record counts/checksums/errors. Do not infer financial truth from fuzzy matching without human approval.

### D. Dual compatibility

Old readers/writers continue. New path shadows or writes only after flag. Avoid uncontrolled dual-write; if temporary dual-write is necessary, one transaction and one authoritative result are required.

### E. Validate

Check nulls, uniqueness, FK candidates, tenant scope, accounting/stock invariants, totals by tenant/period/source, and old/new read equivalence.

### F. Cut over

Enable by rollout ring with observability and explicit owner. Freeze unrelated migrations during high-risk cutover.

### G. Contract and cleanup later

Only after all clients and integrations migrate, stability window passes, backups/restore are tested, and separate approval is granted. Deprecated data remains readable through compatibility views until final removal.

## 3. Production transformation checklist

- [ ] approved purpose and affected domain
- [ ] exact row estimate and tenant list
- [ ] backup/restore evidence
- [ ] dry-run output stored
- [ ] accountant/inventory/security owner sign-off as applicable
- [ ] idempotent/resumable script
- [ ] lock and runtime estimate
- [ ] invariant baseline
- [ ] rollback or compensating reversal
- [ ] audit trail and operator identity
- [ ] post-check and reconciliation
- [ ] customer-impact and support plan

## 4. Financial and stock corrections

Use new adjustment/reversal documents with source, reason, actor, approval, effective period, and link to original. Never update/delete posted entries merely to make a report agree. Historical bulk backfills must generate proposal reports before commands.

## 5. Constraints and indexes

For large tables: create supporting index, backfill invalid rows through approved workflows, add constraint `NOT VALID` where appropriate, validate later, then enforce on new writes. Every constraint needs old-client compatibility analysis and rollback.

## 6. Rollback taxonomy

| Change | Preferred rollback |
|---|---|
| new read path | feature flag to legacy |
| new writer | flag OFF for future commands; retain valid committed records |
| event dispatcher | stop delivery; preserve outbox |
| additive column/table | leave unused; do not emergency-drop |
| backfill | restore snapshot only if safe, otherwise compensating versioned correction |
| accounting/stock effect | domain reversal, never hard delete |

## 7. Migration evidence record

Each migration initiative records decision, SQL hash, operator, approval, start/end, batches, rows scanned/changed/skipped, invariant before/after, errors, rollout ring, and rollback result. Secrets and personal data are excluded.
