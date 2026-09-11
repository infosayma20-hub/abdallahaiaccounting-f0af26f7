# Architecture Decision Log

This log records decisions from discovery. It does not approve implementation.

## ADR-001 — Evolutionary modular monolith

- **Status:** proposed baseline.
- **Decision:** retain the current application/PostgreSQL platform and create domain boundaries internally.
- **Why:** current scale and coupling do not justify microservice operational cost; atomic cross-domain ERP transactions benefit from one database.
- **Rejected now:** rewrite, microservices, Kafka, Kubernetes.
- **Revisit when:** measured independent scaling, regulatory isolation, deployment autonomy, or organizational ownership requires extraction.

## ADR-002 — Database transaction is the command consistency boundary

- **Status:** proposed.
- **Decision:** important business writes execute through versioned commands/RPCs in one transaction.
- **Why:** direct multi-request browser orchestration is the dominant integrity risk.
- **Compatibility:** current direct paths remain behind flags.

## ADR-003 — `transactions` and `stock_movements` remain current ledgers

- **Status:** protect/current.
- **Decision:** do not replace or migrate historical ledgers during architecture foundation work.
- **Why:** real customers and reports depend on them; known drift requires reconciliation, not replacement.

## ADR-004 — Actor, tenant/company, and branch are distinct

- **Status:** proposed for new contracts.
- **Decision:** command context records each explicitly; server resolves and validates scope.
- **Why:** current `user_id` owner convention is not sufficient for long-term APIs/policies.
- **Compatibility:** no immediate column rename/backfill.

## ADR-005 — Transactional outbox before external broker

- **Status:** proposed.
- **Decision:** use PostgreSQL outbox and worker.
- **Why:** sufficient current infrastructure, atomic with source transactions, simpler operations.
- **Revisit when:** measured throughput, retention, ordering, or multi-region requirements exceed it.

## ADR-006 — AI is an intent/tool client, not a ledger owner

- **Status:** mandatory target principle.
- **Decision:** AI cannot directly define/post accounting or inventory effects; it uses registered deterministic tools.
- **Current exception:** `database-command` has direct privileged writes and is a P0 migration target, not a pattern to extend.

## ADR-007 — Feature flags are migration controls, not security controls

- **Status:** accepted.
- **Decision:** flags select compatible implementations by cohort; authorization/RLS always applies.
- **Evidence:** existing `vouchers_use_rpc` and `invoices_use_rpc` patterns.

## ADR-008 — Semantic metrics are versioned contracts

- **Status:** proposed.
- **Decision:** reports, dashboards, APIs, and AI share official metric definitions.
- **Why:** current calculations and hard-coded account semantics are distributed.

## ADR-009 — Posted corrections are reversals

- **Status:** protect/current principle.
- **Decision:** posted accounting/stock history is not destructively rewritten; use linked reversal/replacement.

## ADR-010 — First pilot is Receipt Command Envelope V1

- **Status:** recommendation only; awaiting explicit approval.
- **Decision:** wrap the existing atomic receipt function for one test cohort, without business-rule change.
- **Why:** limited blast radius, existing adapter/flag/idempotency, meaningful reusable pattern.
- **Not approved:** no implementation may start from this assessment alone.

## Open decisions requiring later domain approval

1. Official inventory costing policy and effective-date/version behavior.
2. Canonical tenant/company migration model for legacy owner-scoped tables.
3. Branch as accounting dimension vs operational scope per domain.
4. Authoritative tax/rounding rules per jurisdiction and document version.
5. Workflow schema and segregation-of-duties policies.
6. Retention/privacy policy for command/event/AI audit payloads.
7. Public API authentication model and partner onboarding.
