# Stage 3D-1 Gate — Account Resolution Certification (READ-ONLY)

Date: 2026-09-12. Scope: read-only audit. No schema, accounts, transactions, flags, or behavior changed.

## 1. Population audited

- Total account owners (companies/tenants) with a chart of accounts: **109**
- Owners having `1130`: 107 — of which **41 have children (non-postable)**, 66 already postable (Class D)
- Owners having `4100`: 106 — of which **40 have children (non-postable)**, 66 already postable (Class D)

## 2. `1130` (Accounts Receivable) hierarchy findings

- 605 child accounts across the 41 affected owners; **0** of them are themselves parents (flat, depth 1)
- 505 children carry `contact_id` (customer-linked); 12 inactive
- **0 contacts own more than one active AR sub-account** → per-customer resolution is unique where a link exists
- AR is therefore *customer-scoped*, not a single default account. This matches the existing receipt/payment semantics.

## 3. `4100` (Sales Revenue) hierarchy findings

Candidate = active, leaf, not a returns/discount contra account.

| Class | Count | Meaning |
|---|---|---|
| A — single valid candidate | 9 | exactly one revenue-semantic leaf (`4110 إيرادات المبيعات العامة`) |
| B — ambiguous | 2 | `ab4aa857…` (branch revenue 410001/410002), `0b08eba6…` (410001/410002/4110) |
| C — no valid candidate | 29 | the **only** child of `4100` is `4150 مردودات المبيعات` (sales returns, contra) |
| D — already postable | 66 | `4100` has no children |

Critical: in 29 companies a naive "single postable child" rule would post **sales revenue into the sales-returns contra account**. Descendant resolution is unsafe by construction.

Data anomaly: owner `caa0545a-6c9c-4909-827b-a72d4834d079` has account `4100` whose `parent_code` is also `4100` (self-referencing cycle). Any recursive resolver must guard against this.

## 4. `resolve_postable_account` behavior (reviewed source)

- Remaps by contact type (customer→1130, supplier→2110, employee→2180), then requires a contact.
- Selection order: existing child with matching `contact_id` → `contacts.linked_account_code` → child with matching `account_name` → **creates a new child account** (`MAX(code)+1`) and links it.
- Tenant isolation: enforced via `assert_owner_scope(p_user_id)` and `user_id` on every read/write. Adequate.
- Determinism: deterministic **only** for contact-scoped parents. With `p_contact_id = NULL` it raises `P0001`; it never picks an arbitrary child.
- It has **no notion of account role/purpose** — it cannot distinguish revenue from returns.
- It is **not read-only**: it INSERTs accounts and UPDATEs `contacts.linked_account_code`. Unsuitable for revenue resolution and unsuitable inside a shadow/dry-run comparison.

Conclusion: safe for AR (contact-scoped, proven by receipts/payments), **not usable for revenue**.

## 5. Historical evidence (read-only)

Credits to `41%` accounts for the 9 Class-A owners:

- `4100` (the parent itself): 212 entries, ~1,014,833 ₪
- `4110` (the would-be resolved child): 8 entries, ~1,540 ₪

The legacy invoice path posts revenue **directly on `4100`**. Resolving to `4110` would split revenue across two accounts, breaking parity with all existing reports and historical balances. This is evidence, not permission — nothing was changed.

Role metadata coverage is also thin: only 24 accounts system-wide carry `system_role='sales_revenue'` and 24 carry `'ar'`, i.e. no per-company role mapping exists to rely on.

## 6. Company classification summary

- A — SAFE_UNIQUE_RESOLUTION (revenue): 9, but see §5 — technically unique, **semantically unproven** (target account effectively unused historically)
- B — AMBIGUOUS: 2
- C — NO_POSTABLE_TARGET: 29
- D — ALREADY_POSTABLE: 66

Internal test company `d8ddc6f2-d666-468f-85c3-f8845fb9c71c`: `1130` has customer sub-accounts (`113000xx`, in active use), `4100` has children `4110` (candidate) and `4150` (contra). Revenue history: 10 entries on `4100`, 0 on `4110`. → Class A for structure, but revenue resolution would diverge from its own history.

## 7. Long-term recommendation — explicit account roles

Unify already has the right primitive (`accounts.system_role`) but it is unpopulated per company. Recommendation: introduce **versioned, per-company account roles** (`ACCOUNTS_RECEIVABLE`, `SERVICE_SALES_REVENUE`, …) as explicit, admin-approved mappings, validated to point at a postable leaf in the correct tenant and account type. This is strictly safer than descendant inference, which cannot tell revenue from a contra account. Not implemented in this audit.

## 8. Invoice V1 decision

- Can Create Service Credit Sales Invoice V1 rely on server-side descendant resolution? **No, not for revenue.** AR resolution is safe; revenue resolution is not certifiable today.
- Companies where revenue resolution is currently unique: 9 (semantically unproven). Ambiguous: 2. Unresolved: 29. Already postable: 66.
- Internal test company: **cannot be certified** for revenue resolution as-is.
- Required resolver semantics (FAIL CLOSED), when approved:
  1. AR: explicit customer sub-account under `1130` matched by `contact_id` (read-only lookup; no auto-create inside the engine). No match → UNRESOLVED.
  2. Revenue: explicit configured role account only (`system_role='sales_revenue'`, active, leaf, same tenant, revenue type). No configured role → UNRESOLVED.
  3. UNRESOLVED ⇒ do not post; route to legacy/unsupported. Never pick by lowest code, first child, or name inference. Guard against self-parent cycles.

**Verdict: NOT SAFE to continue Invoice V1 on descendant resolution.** The viable path is explicit per-company role mapping (§7) for revenue, plus read-only AR lookup, piloted only on a company whose roles are configured and approved.
