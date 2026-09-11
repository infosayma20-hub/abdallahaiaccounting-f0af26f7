# Offline Architecture

## 1. Current state

Unify has two browser-local durable queues:

- POS: `src/lib/pos-offline-db.ts` (`finix_pos_offline`, products/customers/settings/pending sales/sync logs/keys).
- Accounting outbox: `src/lib/accounting-outbox-db.ts` (`amwali_accounting_offline`, command payload/summary/status/keys).

Both use IndexedDB, AES-GCM where Web Crypto is available, retry counters, quarantine after five failures, and manual requeue. POS bootstrap/cache supports operation during outages; `usePOSOffline.ts:362-514` verifies connectivity, retries every 10 seconds offline, syncs every 15 minutes, and resyncs on visibility return.

## 2. Safety controls confirmed

- POS local IDs include terminal and time entropy (`usePOSOffline.ts:323-354`).
- Live DB has a unique partial index on `(user_id, local_id)` for POS orders.
- POS stock effects have a partial unique source-reference index.
- Accounting outbox passes `local_id` as server idempotency key (`accounting-outbox-db.ts:34-43`).
- Failed records are quarantined rather than silently discarded.
- POS network events upload to `pos_network_diagnostics` (`usePOSOffline.ts:534-571`).

## 3. Findings

### OF-01 — Two queue engines duplicate protocol code — **P2**

Crypto, state, retry, quarantine, and storage are separately maintained. Future design should share a queue protocol while retaining domain-specific payload validation.

### OF-02 — Encryption silently degrades — **P2**

`pos-offline-db.ts:18-44` and `accounting-outbox-db.ts:82-111` return plaintext entries when Web Crypto/key access fails, with no persisted security signal. Target behavior should classify device support and visibly/auditably disable sensitive offline operations rather than silently downgrade.

### OF-03 — Offline stock availability is stale — **P1 business risk**

`createOfflineSale` queues a sale but does not decrement a shared cross-terminal stock reservation. Multiple disconnected terminals can oversell the same remaining units. This may be an accepted availability trade-off, but it must be explicit and monitored.

### OF-04 — Partial server completion/retry semantics need invariant tests — **P1**

`sync_offline_pos_sale` deduplicates by local ID and calls POS completion. Tests must prove that a failure after order creation resumes missing effects rather than returning duplicate success with incomplete stock/GL. No production mutation was used to test this.

### OF-05 — Conflict policy is domain-specific but undocumented — **P1**

Price, tax, customer status, fiscal locks, closed shifts, stock, and permissions may change while offline. Current queue semantics need an explicit accept/reprice/reject/quarantine matrix for each command type.

## 4. Evolution levels

| Level | Capability | Required gate |
|---|---|---|
| 1 | app shell and read-only cached navigation | cache versioning and expiry |
| 2 | local drafts only | encrypted storage, no server side effects |
| 3 | selected queued operations | versioned command schema + local ID |
| 4 | safe synchronization | server idempotency, conflict policy, resumable effects, audit |
| 5 | local Unify Edge node | authenticated node identity, replicated command/event log, deterministic reconciliation |

Unify currently has strong Level 3 and parts of Level 4 for POS/accounting, not a general Level 4 platform.

## 5. Future protocol

Use a versioned offline command envelope: command ID, schema version, tenant/company/branch, actor/device/session, effective time, captured master-data versions, payload hash, dependencies, retry state, and confirmation policy. Server acceptance must return command status and effect references. Never resolve financial conflicts by last-write-wins.

## 6. Migration and rollback

Extract shared queue primitives without changing payloads; add protocol adapters; compare behavior in tests using `fake-indexeddb`; gate by device/company. Rollback swaps adapter to current queue code. Do not migrate existing IndexedDB records without versioned, resumable, locally reversible conversion.
