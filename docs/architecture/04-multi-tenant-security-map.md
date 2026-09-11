# Multi-Tenant and Security Map

## 1. Current identity and scope model

Unify uses overlapping scope concepts:

- `auth.uid()` — authenticated actor;
- `user_id` — commonly the effective data owner/legacy tenant key;
- `company_id` — organizational company on newer domains;
- `branch_id` — branch scope, sometimes operational metadata and sometimes access context;
- role/permission tables and helper functions;
- portal/holding-specific owner resolution.

`useDataOwnerId.ts:7-20,84-111` resolves an owner for team accounts. This is a usability/data-routing mechanism, not a security boundary; RLS/RPC/Edge authorization must independently enforce access.

## 2. Current privilege architecture

```text
UI visibility / route guards
  convenience only; never authoritative
       |
JWT + RLS policies (417/417 live public tables RLS-enabled)
       |
RPC EXECUTE grants + internal actor/tenant validation
       |
SECURITY DEFINER functions (624 live)
       |
Edge Function authentication and role checks
       |
service-role client (bypasses RLS; manual scope becomes critical)
```

## 3. Findings

### ST-01 — Ownership model is inconsistent across domains — **P1**

- **Evidence:** the latest live `information_schema` snapshot found 284 base tables with `user_id`, 84 with `company_id`, and 55 with `branch_id`; core invoices/transactions/stock movements use owner ID, while POS and payroll also expose company/branch. These counts can change as the live schema evolves.
- **Impact:** cross-domain joins and reports can use the wrong key; future API clients may confuse actor with tenant.
- **Target:** immutable tenant/company ID and explicit actor/branch context in new command/audit records, with legacy owner mapping.
- **Safe migration:** additive context only; compare resolved context to current RLS result. No mass backfill or policy rewrite.

### ST-02 — Service-role usage creates manual isolation boundaries — **P1**

- **Evidence:** many Edge Functions load the service-role secret. `database-command/index.ts:11-22` authenticates then creates a privileged client; each query must apply owner scope manually.
- **Impact:** one omitted predicate can expose or mutate another tenant.
- **Target:** privileged functions call tenant-validating commands; shared auth/context resolver; structured authorization tests.
- **Safe migration:** function-by-function matrix of endpoint, auth mechanism, allowed roles, scope resolver, tables, writes, and audit. Do not bulk replace clients.

### ST-03 — Gateway JWT verification is disabled for 24 configured functions — **P1 until individually classified**

- **Evidence:** `supabase/config.toml:3-51`. Some correctly self-authenticate (`database-command` uses `_shared/auth.ts`); others are intentionally public/webhook endpoints.
- **Impact:** any endpoint without equivalent internal JWT, HMAC, one-time token, or strictly public read contract is an auth bypass.
- **Target:** explicit endpoint classification: authenticated JWT, signed webhook, public tokenized read, scheduled internal, or device credential.
- **Safe migration:** verify each endpoint contract and tests before changing `verify_jwt`; changing it blindly can break integrations.

### ST-04 — Broad callable function surface — **P1**

- **Evidence:** 135 PUBLIC execute grants; 624 SECURITY DEFINER functions. Live verification found four definers without configured search path, all email-queue helpers—not the previously suspected POS function.
- **Impact:** privileged functions may be callable beyond intended roles; search-path hardening remains incomplete.
- **Target:** least-privilege grants, pinned search path, explicit internal authorization, versioned commands.
- **Safe migration:** classify by caller and test under anon/authenticated/role accounts before revoking or changing.

### ST-05 — Historical policy findings can be stale — **control lesson**

The migration history contains permissive policies for `item_categories` and `procurement_items`, but the live policies now scope by `user_id` or `get_team_owner_id`. Live `pos_payments` is also team/module scoped. Architecture audits must compare repository history to live catalog before escalating a finding.

### ST-06 — Branch is not yet a universal accounting dimension — **P2**

Core GL/invoice/stock tables do not consistently carry `branch_id`; POS/payroll/assets do. Reports may infer branch through source relations. Future branch accounting must be additive and source-certified, not assumed from current metadata.

## 4. Security test matrix

For every command and table: unauthenticated, unrelated tenant, same tenant wrong branch, correct branch wrong role, correct role, self-approval prohibition, amount threshold, service account, and replay. Verify both read and write behavior and ensure errors reveal no cross-tenant existence.

## 5. Immediate architecture actions (documentation/testing only)

1. Build the endpoint/RPC privilege registry.
2. Add automated catalog assertions for RLS, grants, search path, and tenant predicates.
3. Define one server-side `CommandContextV1` resolver.
4. Treat UI guards as non-security controls in all decision records.
