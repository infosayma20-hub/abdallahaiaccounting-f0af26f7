# Performance and Observability Risks

## 1. Live scale snapshot

Largest live tables include roughly 318k order modifiers, 197k POS lines, 132k transactions, 108k POS orders, 106k kitchen tickets, and 104k POS payments. `transactions` and POS tables are already large enough that browser-wide scans and N+1 writes matter. Statistics are estimates/counters, not billing or SLA measurements.

## 2. Prioritized findings

### PF-01 — Integrity monitoring downloads full ledgers — **P1**

- **Current:** `src/lib/audit/integrity-engine.ts:113-132` pages all transactions to the browser; `:251-277` fetches all products and movements; duplicate check caps at 5,000 (`:303-331`).
- **Impact:** growing tenants incur O(n) transfer/browser CPU and incomplete duplicate coverage beyond the cap.
- **Target:** read-only server aggregations returning issues/counts with bounded detail pages.
- **Safe migration:** run old/new in comparison mode; never schedule current browser engine globally.

### PF-02 — N+1 and sequential writes on operational screens — **P1**

Confirmed examples include invoice-link loops in finance voucher/payment/receipt pages, six sequential usage counts in `useCostCenters.ts`, per-supplier/per-item procurement writes, and per-row attendance RPC/update loops. These increase latency and partial-completion risk. Replace only with domain-specific bulk RPCs after behavior tests; do not generic-batch blindly.

### PF-03 — High full-scan pressure on POS orders — **P1**

Live statistics show approximately 297k sequential scans on `pos_orders`, despite many indexes. This requires query-level measurement using `pg_stat_statements`; table counters alone cannot identify the caller. Prioritize top total execution time and rows read, not speculative indexing.

### PF-04 — Query/cache conventions are fragmented — **P2**

React Query is globally configured (`App.tsx:408-418`) but many pages use direct effects. Cross-tab invalidation (`crossTabSync.ts`) and Realtime (`useRealtimeRefresh.ts`) can overlap with polling. Establish domain query keys and invalidation ownership incrementally.

### PF-05 — Realtime subscriptions are decentralized — **P2**

Live publication includes 36 tables; individual pages create channels. Open tabs can multiply connections and refreshes. Measure channel count and message rate before consolidating.

### PF-06 — Pagination and projection are inconsistent — **P2**

Wide `select('*')`, `.limit()` without navigable ranges, and client-side filters occur across list/report pages. Adopt cursor/range pagination and explicit projections per high-volume screen, preserving export/report semantics.

### PF-07 — Observability is fragmented — **P1**

Business audit tables and POS network diagnostics exist, but there is no consistent `trace_id/request_id/command_id` from browser through RPC/Edge to source and accounting effects. Runtime logs are mostly console-based; no unified alerting/SLO evidence was found.

## 3. Severity discipline

No finding is P0 solely because a query is large. P0 requires demonstrated outage, data corruption, or security impact. Performance candidates become P0 only after measurements show production unavailability or cascading integrity failure.

## 4. Measurement plan

1. Define SLOs by workflow: login, invoice open/save, POS pay, stock search, payroll post, core reports.
2. Review `pg_stat_statements` weekly for total time, mean/p95, calls, rows, and temp I/O; redact literals.
3. Add command-level timing and correlation IDs for new command paths.
4. Sample frontend Web Vitals and route/query durations into existing `app_perf_samples` only after retention/privacy review.
5. Monitor Realtime connection/message volume and cron duration/failures.
6. Benchmark RLS and triggers with isolated fixtures; never use `EXPLAIN ANALYZE` on production write statements.

## 5. Index policy

Do not add indexes from static review alone. For each candidate capture normalized query, frequency, rows, current plan (`EXPLAIN` first), write amplification, tenant predicate, and rollback. Prefer compound indexes matching owner/company + date/status/access predicates.
