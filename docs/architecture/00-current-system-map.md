# Unify ERP — Current System Map

**Assessment date:** 2026-09-11  
**Mode:** read-only discovery; no production data, schema, permissions, routes, or behavior changed.

## 1. Executive map

Unify is a large client-heavy ERP deployed as a React/Vite application over PostgreSQL, RLS, RPCs, triggers, Edge Functions, Realtime, storage, and PWA/IndexedDB mechanisms. It is not one homogeneous architecture: direct table CRUD, atomic RPCs, trigger-driven side effects, privileged Edge Functions, and offline queues coexist.

Measured baseline:

| Surface | Observed size |
|---|---:|
| TypeScript/TSX files under `src/` | 1,367 |
| Page files | 466 |
| Component files | 587 |
| Hooks | 114 |
| Historical SQL migrations | 1,350 |
| Edge Function directories | 78 |
| Live public tables / views | 417 / 27 |
| Live public functions / non-internal triggers | 704 / 395 |
| Live public indexes / foreign keys | 1,211 / 522 |
| RLS-enabled public tables | 417 of 417 |
| Live RLS policies | 1,079 |
| Materialized views | 0 |
| Active scheduled jobs | 14 |

These counts are a discovery snapshot, not architecture quality metrics.

## 2. Runtime topology

```text
Browser / installed PWA
  React Router + Auth/Company/Theme contexts
  TanStack Query (partial adoption) + useEffect fetches
  direct PostgREST CRUD + RPC calls + Edge Function calls
  BroadcastChannel + Realtime
  IndexedDB POS queue + IndexedDB accounting outbox
             |
             v
PostgreSQL / PostgREST / Auth / Realtime / Storage
  RLS policies
  704 public functions, including atomic commands and reporting helpers
  395 triggers, including posting, stock, numbering, audit, and guards
             |
             v
Edge Functions
  auth/admin, AI, attendance, POS, email, integrations, public endpoints
             |
             v
External providers
  AI gateway, Wheels, ZKTeco, FCM, wallet/email/telephony integrations
```

## 3. Frontend composition

- `src/App.tsx:408-418` creates one global Query Client; defaults are 60-second staleness, 10-minute garbage collection, reconnect refetch, no focus refetch, and one retry.
- `src/App.tsx:537+` implements authentication routing and workspace redirection. Route access is layered through `ProtectedRoute`, `RoleGuard`, `ModuleGuard`, `POSDeviceAuthGuard`, `SpartaTenantGuard`, and setup guards.
- The route tree contains roughly 492 route/path declarations and includes public, core ERP, employee, sales-representative, POS, CRM, super-admin, and Sparta/holding workspaces.
- `src/hooks/useAuth.tsx` owns browser auth/session behavior. `src/hooks/useDataOwnerId.ts:57-118` resolves the effective data owner using `get_team_owner_id`, then a profile fallback, and caches it in `sessionStorage` for 30 minutes.
- React Query is not the universal data boundary. Many pages call the database directly and maintain local loading/error/cache state. This is a transitional architecture, not a defect by itself.
- `src/lib/crossTabSync.ts:1-75` writes on `pos-sync` and mirrors to legacy `malaky-sync` for backward compatibility.
- `src/hooks/useRealtimeRefresh.ts:7-22` subscribes dashboards independently to invoices, transactions, and products. Live publication currently includes 36 public tables.

## 4. Domain map and principal records

| Domain | Principal records and mechanisms | Current boundary condition |
|---|---|---|
| Identity & organization | auth users, profiles, companies, branches, roles, permissions, owner resolution | Multiple identifiers (`auth.uid`, `user_id`, `company_id`, `branch_id`) coexist |
| Finance | `transactions`, `vouchers`, receipt/payment tables, accounts, contacts, tax ledger, fiscal periods | Some commands are atomic RPCs; legacy pages still assemble writes client-side |
| Sales & purchasing | canonical `invoices` + `invoice_items`; legacy `purchase_invoices` remains | Create/edit/post behavior is not yet one command boundary |
| Inventory | `stock_movements`, `products.quantity`, warehouse balances, transfers, counts | Ledger and cached quantities coexist; writers use different conventions |
| POS & restaurant | orders, lines, payments, sessions, shifts, kitchen, tables, tracking | Mature server functions coexist with a very large client orchestration page |
| HR & payroll | employees, attendance, leave, forms, payroll, deductions, advances | Mix of company-scoped and owner-scoped tables; workflows spread across DB/UI |
| CRM & service | leads, opportunities, activities, tickets, calls, meetings | Mostly table-centric CRUD with workflow-specific policies |
| Manufacturing | production orders, materials, outputs, costing/posting helpers | Requires deeper command-by-command certification before migration |
| Assets | assets, depreciation, disposals, transfers, revaluations | Separate transaction writers; linked to owner and sometimes branch |
| Integrations & AI | Edge Functions, webhooks, cron, gateway calls | Privileged functions often enforce tenancy in application code |

## 5. Where business logic lives

| Layer | Examples | Consequence |
|---|---|---|
| React/pages | invoice totals and edit orchestration in `InvoiceCreatePage.tsx`; POS orchestration in `POSPage.tsx` | Fast feature delivery, but partial-failure and duplication risks |
| Hooks/libraries | `useSaveJournalVoucher.ts`, `voucher-rpc.ts`, `invoice-rpc.ts`, report loaders | Emerging reusable boundaries, still optional in places |
| RPC/functions | receipt/payment creation, POS completion, stock adjustment, numbering, reversals | Strongest place for atomic deterministic rules |
| Triggers | fiscal locks, stock synchronization, auto-posting, audit, numbering | Protects all writers but creates hidden coupling and ordering risk |
| Edge Functions | AI, integrations, admin, attendance, email | Needed for secrets/providers; service-role use bypasses RLS |

## 6. Confirmed architecture findings

### CS-01 — Fragmented write ownership — **P1**

- **Current implementation:** 1,362 direct client write calls were found across 351 files; major tables are referenced by many independent frontend/function files (for example `transactions` in 108, `products` in 73, `invoices` in 55).
- **Evidence:** `src/pages/InvoiceCreatePage.tsx:1757-2332`; `src/pages/POSPage.tsx`; `src/hooks/useSaveJournalVoucher.ts`; repository search snapshot.
- **Risk / business impact:** changing a rule in one path does not guarantee every writer follows it; partial failures can produce document/ledger/stock divergence.
- **Future architecture:** domain commands with one authoritative server transaction per business action.
- **Safe path:** inventory writers first; wrap existing proven RPCs before introducing new behavior. Keep old path behind an OFF-by-default flag.

### CS-02 — Tenant identity is transitional — **P1**

- **Current implementation:** many core tables use `user_id` as effective owner; 88 tables expose `company_id`, 57 expose `branch_id`, while 304 of 417 base tables expose `user_id`. Core `invoices`, `transactions`, and `stock_movements` have `user_id` but no `company_id`/`branch_id` columns.
- **Evidence:** live `information_schema`; `src/hooks/useDataOwnerId.ts:7-20,57-118`.
- **Risk / business impact:** every caller must understand owner vs actor vs company vs branch; analytics and future APIs can scope incorrectly.
- **Future architecture:** explicit actor, tenant/company, and branch context in command envelopes while retaining `user_id` compatibility.
- **Safe path:** add context to new command/audit records first; do not rewrite historical ownership columns.

### CS-03 — Mature controls already exist — **positive control**

All live public tables have RLS enabled; deterministic idempotency is present on several POS/voucher paths; fiscal/postability guards and safe numbering functions exist; `src/lib/voucher-rpc.ts:1-17` already demonstrates feature-flagged strangler migration. The target architecture should standardize these proven patterns rather than replace the platform.

## 7. Dangerous areas to change

Do not modify without dedicated reconciliation and pilot approval: `transactions`; invoice create/edit/post; stock movement triggers and quantity caches; POS completion/offline replay; fiscal-period guards; account-role resolution; document number allocators; cancellation/reversal chains; payroll posting; tenant-owner resolution; or service-role Edge Function authorization.

## 8. Evidence limitations

- Static call counts do not prove runtime frequency.
- Historical migration definitions may have been superseded; live catalog state wins when they conflict.
- No destructive or load-generating probes were run. Performance findings are candidates until measured with production-safe telemetry.
