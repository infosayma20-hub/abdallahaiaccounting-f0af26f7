# AI, Integrations, Workflows, and Events

## 1. Current surfaces

AI functions include `database-command`, `ai-assistant-chat`, smart reports/briefs, support/chat agents, voice transaction parsing, and template enhancement. Integrations include Wheels, ZKTeco, PBX, FCM, wallet passes, email, and portal APIs. The live scheduler has 14 active jobs, including recurring invoices, subscriptions, device cleanup, call-center recovery, reminders, weekly backup, HR intake, notifications, and diagnostic cleanup.

No external message broker is required today. PostgreSQL, cron, and an outbox are sufficient foundations.

## 2. Findings

### AI-01 — AI can directly mutate business tables — **P0**

- **Evidence:** `supabase/functions/database-command/index.ts:11-22` authenticates then uses a service-role client; `:220-385` allows add/edit/delete for contacts, accounts, products and more. Product quantity can be changed directly (`:355-370`).
- **Risk:** model output participates in privileged writes without a deterministic domain command boundary. Prompt filtering (`:31-48`) is not authorization or accounting validation.
- **Impact:** unaudited master-data, inventory, or journal changes; policy bypass within the actor's scope.
- **Target:** AI proposes a registered tool call; policy/confirmation and deterministic command validate and commit.
- **Safe migration:** disable new high-risk AI tools by default; first convert write tools to draft-only or existing command RPCs. Preserve read-only chat.

### AI-02 — AI mutation audit is insufficient — **P1**

Super-admin actions have an audit pattern, but `database-command` lacks a comparable immutable record of model, prompt hash, proposed action, approval, command ID, and effects. Add audit before expanding AI permissions.

### IN-01 — Webhook authentication is heterogeneous — **P1**

Wheels/ZKTeco and other public endpoints use custom secrets/tokens while `verify_jwt=false`. Each needs explicit HMAC/signature, timestamp/replay, scope, and idempotency contracts. Do not turn on JWT globally because device/provider callbacks may not support it.

### IN-02 — Raw filter construction is an injection surface — **P1**

The Wheels webhook builds a PostgREST `.or()` expression from external order references. Validate strict identifier formats or use separate parameterized equality queries before any future expansion.

### IN-03 — Integration writes are coupled to internal tables — **P1**

Several Edge Functions use service-role CRUD. Future integrations should issue versioned commands and subscribe to outbox events, not know internal table layouts.

### WF-01 — Workflow rules are distributed — **P2**

Approvals live across status columns, policies, pages, triggers, and specific functions. Humans and AI do not yet share one policy/workflow decision boundary.

## 3. Future AI Tool Registry

Each tool declares: name/version, intent, risk level, required permission/action, company/branch resolution, input/output schema, confirmation rule, deterministic command, idempotency behavior, audit fields, and allowed data projection.

```text
LLM intent
  -> registered tool proposal
  -> schema validation
  -> policy + scope + confirmation
  -> deterministic business command
  -> one DB transaction
  -> audited result + domain event
```

Default levels: read tools may execute after authorization; draft tools create non-posted proposals; posted financial/inventory actions require human confirmation and command validation. AI never chooses account posting rules or owns calculations.

## 4. Integration platform target

- `/v1` API contracts and service accounts/scopes.
- Signed webhooks with timestamp, event ID, constant-time verification, replay window, delivery attempts, and dead-letter state.
- Versioned event catalog (`invoice.posted.v1`).
- Provider adapters for payments, banking, messaging, identity, storage, and AI.
- PostgreSQL transactional outbox initially; no Kafka until measured throughput/operational requirements justify it.

## 5. Migration/rollback

Place adapters beside current functions; emit shadow events after current transactions; validate counts/payloads; enable subscriptions per company/integration. Rollback disables event delivery/tool flag without touching the source transaction. Never allow an external consumer's failure to roll back an already committed ERP transaction; delivery is retryable and observable.
