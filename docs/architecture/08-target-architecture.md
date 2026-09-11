# Evolutionary Target Architecture

## 1. Decision

Evolve Unify as a **modular monolith on the existing PostgreSQL/Edge platform**. Do not introduce microservices, Kafka, or Kubernetes. New architecture is added beside legacy flows and adopted command by command.

```text
Web / Mobile / POS / Offline / API / Automation / AI
                         |
                  Command Gateway
                         |
       Context -> Policy -> Validation -> Idempotency
                         |
               Domain Command Handler
                 /               \
        Posting Engine      Inventory Engine
                 \               /
           One PostgreSQL transaction
                         |
             Audit + Transactional Outbox
                         |
        projections / webhooks / analytics / AI reads
```

## 2. Bounded domains

| Domain | Owns | May depend on |
|---|---|---|
| Identity | actors, sessions, credentials, devices | Organization |
| Organization | tenant/company/branch/membership | Identity |
| Finance | accounts, journals, fiscal locks, currencies, tax posting | Organization |
| Sales | customers, quotes, sales invoices, returns | Finance, Inventory commands |
| Purchasing | suppliers, purchase documents, receipts | Finance, Inventory commands |
| Inventory | products, warehouses, movements, costing, counts, transfers | Organization, Finance effects |
| Payments | receipts, payments, cash, banks, cheques | Finance |
| POS | sessions, orders, tenders, restaurant/KDS | Sales, Payments, Inventory, Finance |
| HR | employees, attendance, leave, payroll inputs | Organization, Finance command for posting |
| CRM | leads, activities, opportunities, service | Organization |
| Manufacturing | orders, consumption, output | Inventory, Finance |
| Assets | asset lifecycle, depreciation, disposal | Finance |
| Workflow | approvals, tasks, decisions | Identity, Organization, domain commands |
| Documents | numbering, files, templates, print | domains via stable contracts |
| Integrations | APIs, webhooks, providers | commands/events only |
| AI | intent, tools, summaries, drafts | registry, policies, commands; never raw posting logic |

These are code/data ownership boundaries inside one deployable system. They are not services.

## 3. Canonical command layer

### Command envelope V1

```json
{
  "command_id": "uuid",
  "command_type": "finance.create_receipt.v1",
  "schema_version": 1,
  "actor_id": "uuid",
  "tenant_id": "uuid",
  "company_id": "uuid|null",
  "branch_id": "uuid|null",
  "source": "web|pos|mobile|offline|api|automation|ai",
  "device_id": "string|null",
  "occurred_at": "timestamp",
  "effective_date": "date|null",
  "idempotency_key": "string",
  "correlation_id": "uuid",
  "causation_id": "uuid|null",
  "payload": {}
}
```

The server derives actor and allowed scope; it never trusts actor/tenant fields supplied by a browser. The envelope stored for audit may contain the resolved values.

### Command contract

Each handler must:

1. resolve context;
2. authorize action and record scope;
3. validate versioned payload;
4. claim idempotency key;
5. lock affected aggregate/source rows;
6. enforce fiscal/status/approval rules;
7. calculate deterministic results;
8. write document and effects atomically;
9. write audit and outbox event in the same transaction;
10. return a stable versioned result.

Existing `*_atomic` and `*_with_entry` functions become internal handlers or adapters; they are not rewritten wholesale.

## 4. Posting Engine

The future engine accepts validated posting intents, not arbitrary debit/credit rows from clients. It resolves system account roles, validates leaf accounts and fiscal period, applies currency/tax rules, creates balanced immutable effects, and guarantees uniqueness by source/effect/version.

Minimum record identity:

```text
(tenant_id, source_type, source_id, effect_type, posting_version, reversal_state)
```

Migration is document-specific. Legacy and new engines must never both post active effects. Shadow mode calculates and compares only.

## 5. Inventory Engine

The engine owns movement creation, sign, costing, warehouse context, source uniqueness, reversal, and transactional balance projections. Operational modules issue commands such as `ReceiveInventory`, `ShipInventory`, `TransferInventory`, and `AdjustInventory`; they cannot update `products.quantity` directly.

Costing policy is versioned by tenant/effective date. No historical recosting occurs during adoption.

## 6. Transactional outbox and events

Additive future tables should hold `domain_events` and delivery attempts. An event is inserted in the same DB transaction as the command. A worker publishes to internal consumers/webhooks.

Required fields: event ID, type/version, tenant/company/branch, aggregate type/id/version, command/correlation/causation IDs, occurred/effective times, safe payload, status, attempts, next attempt, and error summary.

Events describe committed facts, never commands. Consumers are idempotent. Initial transport is PostgreSQL + cron/worker.

## 7. Semantic business layer

Create a metric registry with name/version, business definition, source domains, filters, currency/date semantics, owner, tests, and deprecation status. Implement metrics as versioned SQL functions/views first. Dashboard, reports, API, and AI call the same contract.

Initial certified metrics should be trial balance, revenue, AR, AP, cash position, inventory quantity/value, and payroll cost. Do not certify profit metrics until COGS policy is certified.

## 8. Policy and workflow

Current RLS/roles remain. Add a policy decision layer for new commands:

```text
allow(actor, action, tenant, company, branch, record, amount, state)
```

Workflow definitions reference command actions and support initiator, approver, segregation of duties, amount thresholds, escalation, and immutable decisions. AI and humans use the same workflow. RLS remains the final data boundary.

## 9. API and integration boundary

- Versioned `/v1` resources and commands.
- Service accounts with scopes, tenant/company assignment, expiry/rotation.
- Idempotency keys for mutating APIs.
- Signed, versioned webhooks from outbox events.
- Provider interfaces: `PaymentProvider`, `BankingProvider`, `MessagingProvider`, `AIProvider`, `StorageProvider`, `IdentityProvider`.

## 10. Feature flags

Reuse the existing `company_settings.feature_flags` pattern initially. Flag resolution supports global default, company, branch, user/device, and command source. Security rules are never disabled by a flag.

Required metadata: owner, description, default, eligibility, start/expiry, rollback behavior, metrics, and audit. Example: `commands.receipt_v1 = false`.

## 11. Observability

New command paths carry `trace_id`, `request_id`, `command_id`, actor, tenant/company/branch, source, command type, aggregate, duration, result, and effect counts. Do not log secrets, tokens, financial payloads, or personal data by default.

Start with structured Edge/DB audit records, `pg_stat_statements`, command metrics, and reconciliation alerts. Introduce OpenTelemetry-compatible IDs without requiring an external collector immediately.

## 12. Capability transition matrix

| Capability | Current | Safe intermediate | Target | Rollback |
|---|---|---|---|---|
| Commands | optional RPC adapters + direct CRUD | envelope wraps proven RPC | all writers call commands | flag to legacy |
| Posting | many source-specific writers | shadow calculation, one source pilot | centralized engine | disable source flag |
| Inventory | mixed movement/cache writers | certify one source and compare | one movement engine | source flag, no dual-post |
| Events | Realtime/cron/ad hoc logs | outbox for pilot command | versioned event catalog | stop dispatcher |
| Metrics | report-specific SQL/JS | registry + one certified metric | shared semantic layer | report uses legacy loader |
| Policy | roles/RLS/page guards | command policy adapter | contextual policy decisions | fall back to existing checks, never weaker |
| AI | direct reads/writes in functions | registered read/draft tools | approved command tools | disable tool/AI flag |

## 13. Deliberately postponed

- Microservices, Kafka, Kubernetes, or independent domain databases.
- Historical transaction migration or recosting.
- Global tenant-key rewrite.
- Removal of legacy tables/RPCs/Edge Functions.
- POS posting-engine migration before simpler financial commands prove the pattern.
- Full workflow engine before policy and command context are stable.
- AI financial posting.
- Materialized analytics until metric definitions and freshness requirements are certified.
