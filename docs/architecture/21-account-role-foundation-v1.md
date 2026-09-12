# Account Role Foundation V1

Status: IMPLEMENTED (additive, inactive — no company configured)
Scope: prerequisite layer for Invoice V1. Invoice V1 remains STOPPED.

## 1. Why this layer exists

The Account Resolution Certification (doc 20) proved:

- AR can be derived safely from the customer's own linked postable account.
- Sales revenue CANNOT be inferred from descendants of `4100` (in 29 companies the
  only child is `4150 مردودات المبيعات`, a contra account).
- `resolve_postable_account` is unsuitable for revenue: it creates accounts and
  mutates contact links, and it has no semantic understanding of account roles.

Therefore revenue requires an **explicit, per-company, semantic role**.

## 2. Existing `accounts.system_role` — verdict: NOT SUFFICIENT

| Property | Finding |
|---|---|
| Type | `character varying`, free text, nullable |
| Uniqueness | none (no unique index, not per tenant) |
| Tenant scope | `accounts.user_id` (owner). No `company_id` column |
| Population | 30 distinct legacy values, sparse (`ar` 24 owners, `sales_revenue` 24 owners, `bank` 90 rows / 27 owners — duplicates exist) |
| Write control | Any team member with `accounts` access can `UPDATE` the row and set `system_role` freely (RLS allows update on the whole row) |
| Conflicts | Legacy lowercase values (`ar`, `sales_revenue`) overlap semantically with the new roles but are duplicated and unvalidated |

Conclusion: the field cannot enforce per-company uniqueness, cannot reject parent
accounts, and cannot restrict who assigns roles. Existing values were **not**
modified or overwritten. An additive table is used instead.

## 3. DB objects created (additive only)

- `public.account_system_roles_v1` — `(owner_id, role, account_id, notes, assigned_by, timestamps)`
  - `CHECK role IN ('ACCOUNTS_RECEIVABLE','SERVICE_SALES_REVENUE')`
  - `UNIQUE (owner_id, role)` → company-scoped uniqueness, never global
  - RLS on; `SELECT` only for the resolved tenant; no user `INSERT/UPDATE/DELETE` grants
- `validate_account_system_role_v1()` trigger — rejects cross-tenant, inactive,
  parent, self-parent and cyclic accounts
- `resolve_system_account_role_v1(role, owner_id default null)` — read-only resolver
- `resolve_customer_ar_account_v1(contact_id)` — AR resolution
- `assign_system_account_role_v1(role, account_id, notes)` — admin-only assignment RPC

No account was created, no hierarchy changed, no balance moved, no historical entry rewritten.

## 4. Resolution behaviour

**ACCOUNTS_RECEIVABLE (per invoice):**
1. the customer's linked postable account (`accounts.contact_id`, active, leaf) — exactly one, else
2. the company-level `ACCOUNTS_RECEIVABLE` role if explicitly configured, else
3. FAIL CLOSED (`P0002`). No account is created, no descendant of `1130` is guessed.

**SERVICE_SALES_REVENUE:**
- Only the explicitly assigned role. No first/only child, no code ordering, no name
  matching, no historical usage, no `resolve_postable_account`, no descendant inference.
- Zero assignment → fail closed. Ambiguous/invalid assignment → fail closed.

The resolver always re-validates at read time (tenant, active, leaf), so a role that
later becomes a parent account stops resolving instead of posting wrongly.

## 5. Hierarchy and cycle protection

- Parent detection: any active child whose `parent_code` equals the account's code.
- A self-parent row (`parent_code = account_code`, 13 such rows exist live) is its own
  child, so it is rejected by the parent rule **and** by an explicit self-parent rule.
- Upward walk is depth-capped (20) and cycle-detected. The historical `4100 -> 4100`
  anomaly is **detected and rejected, not repaired**.

## 6. Security

- Table: RLS enabled; tenant-scoped `SELECT` for `authenticated`; `ALL` for `service_role`; no `anon`.
- No write grants for `authenticated` → roles cannot be set by direct table writes.
- `assign_system_account_role_v1` requires `admin` or `super_admin` in the resolved tenant.
- All functions `SECURITY DEFINER` with `SET search_path = public`; `EXECUTE` revoked
  from `PUBLIC`/`anon`.
- Client-supplied `owner_id` is never trusted: the tenant comes from
  `get_team_owner_id(auth.uid())`; a mismatched argument raises `42501`.

## 7. Tests executed (internal test company, rolled back)

| Test | Result |
|---|---|
| Role on parent account (`4100`) | rejected |
| Role on foreign-company account | rejected |
| Unsupported role value | rejected |
| Valid leaf account | accepted |
| Duplicate role in same company | rejected (unique violation) |
| Resolver without tenant context | fails closed |
| Self-parent / cyclic account | rejected by parent + cycle rules |

All test rows were removed; `account_system_roles_v1` currently holds **0 rows**.

## 8. Internal test company evidence (`d8ddc6f2-…`)

**AR:** parent `1130 ذمم عملاء` has many per-customer leaf accounts
(`11300001…`), each linked to exactly one contact → AR resolves per customer with
no configuration needed. Optional company-level fallback is not required.

**Revenue candidates:**

| Code | Name | Leaf | Historical use |
|---|---|---|---|
| `4100` | إيرادات مبيعات | No (parent of 4110, 4150) | 10 transactions (legacy posting target) |
| `4110` | إيرادات المبيعات العامة | Yes | 0 |
| `4200` | إيرادات خدمات | Yes (top-level, no parent) | 0 |
| `4150` | مردودات المبيعات | Yes | 0 — contra, must never be used |

`4200 إيرادات خدمات` is the semantically correct target for service sales revenue;
`4110` is the alternative if service revenue must sit under `4100`.
**No role was assigned — accounting approval is required.**

## 9. Reporting impact

Assigning a future revenue role is **not** equivalent to the historical postings on
`4100`. Historical entries remain on `4100` itself. Once future entries post to a
child (`4110` or `4200`):
- Reports that aggregate by parent/rollup keep totalling correctly.
- Reports that read the `4100` row's own direct balance will show the split
  (history on the parent, new activity on the child).
- `4200` sits outside the `4100` subtree, so choosing it moves service revenue into a
  separate top-level revenue line. Choosing `4110` keeps it inside the `4100` rollup.

## 10. Migration strategy / rollout

1. Internal test company only, after explicit accounting approval of one account.
2. Certify Invoice V1 eligibility gate: company is eligible only when the role resolves.
3. Per-company opt-in rollout; no bulk assignment across the 109 companies.
4. Unresolved companies simply stay on the legacy path — fail closed, never guess.

## 11. Rollback

`DELETE FROM account_system_roles_v1` (config only), then drop the two resolvers, the
assignment RPC, the trigger and the table. Nothing else references them; no chart of
accounts, transaction or report depends on this layer today.

## 12. Reporting impact check (read-only) — PASS

| Report | Revenue selection logic | 4200 included |
|---|---|---|
| Trial Balance / Balance Sheet | per-account, `account_type` driven | yes |
| Profit & Loss (`ProfitLoss.tsx`) | `classifyAccount()` on `account_type` (`إيرادات`), contra codes excluded | yes (own line `إيرادات خدمات`) |
| Dashboard KPIs (`useDashboardData.ts`) | `credit_account_code.startsWith("4")` − debits | yes |
| Executive KPIs (`lib/reports/executive-kpis.ts`) | prefix `"4"` credit − debit | yes |
| Periodic reports (`reports/PeriodicReportsPage.tsx`) | `1x → 4x` pairs | yes |
| VAT / tax reports | invoice-based (`invoices`, tax fields), not revenue-code based | unaffected |

No authoritative report is hard-coded to `4100` or to descendants of `4100` only.
The `4100` literals found in code are **writers** (legacy invoice create/edit RPCs,
POS, credit notes, product default `sales_account_code`), not reports.

**Residual risk (documented, out of scope):** the legacy invoice *edit* RPCs hard-code
`v_new_rev_acc := '4100'`. If a V1-created invoice is later edited through the legacy
screen, its revenue line moves from `4200` back to `4100`. Edit remains legacy by design;
this must be addressed before Update Invoice V1.

## 13. Internal test company certification (executed, rolled back)

- Role assigned: `SERVICE_SALES_REVENUE → 4200 إيرادات خدمات` (internal company only, committed).
- Resolver returns exactly `4200`; owner spoofing rejected; 4200 verified active, leaf,
  same tenant.
- Service credit sales invoice V1, shadow mode: `Dr 11300020 (ذمة نهاد غزال) / Cr 4200` — no writes.
- Service credit sales invoice V1, posting mode: succeeded, GL `Dr 11300020 / Cr 4200 = 100.00`,
  invoice `INV-2026-0024`, replay returned `replayed=true` with no duplicate.
- The entire certification transaction was rolled back: no test invoice, no command row,
  no event, and all feature flags returned to `false` for every company.
