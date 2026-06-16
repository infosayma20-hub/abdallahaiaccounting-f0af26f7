---
name: Smart Accountant Phase 1 — Classification Layer
description: GLOBAL taxonomy + strict-leaf account resolver. Zero ledger risk. No collapse.
type: feature
---
# Smart Accountant — Phase 1

**Table:** `smart_accountant_categories` (GLOBAL taxonomy — no `user_id`; PK = `code`). Read = all (authenticated+anon); write = service_role only. Per-tenant overrides will live in a separate `smart_accountant_account_bindings` table in Phase 4.
Columns: `code, name_ar, name_en, debit_role, credit_role, debit_code_fallback, credit_code_fallback, posting_target, affects_stock, ambiguity_resolution_policy, default_currency, keywords[], is_active, sort_order`.

**Resolver:** `sa_resolve_account(p_role text, p_fallback_code text, p_data_owner_id uuid) → jsonb`.
- `SECURITY INVOKER` — tenant isolation enforced by RLS on `accounts`; no explicit `is_team_member` guard (was tried, removed: it required `auth` schema access that blocked migration-time verification, and was redundant with RLS).
- Lookup priority: **fallback_code → system_role**. Code-first reflects reality (~95% of tenants rely on code, not system_role).
- **STRICT-LEAF RULE:** A parent account (any children > 0) NEVER auto-resolves. Returns `ambiguous` with structured `candidates[]` jsonb. No single-child collapse. Rationale: deterministic behavior across COA mutations — adding a sibling must never silently flip a previously-resolved category.
- Returns `{status, account_id, account_code, account_name, candidates, source}`. Candidates = ALL leaf descendants (recursive), not just direct children.
- Three statuses: `resolved` | `ambiguous` | `missing`.

**NLP guesser:** `sa_guess_category(text) → text` matches over `keywords[]` of active categories ordered by `sort_order`. Known conflict: `شحن للزبون` currently matches `SHIPPING_IN` before `DELIVERY` — to tune via sort_order in Phase 2.

**Ambiguity policy** (storage policy on category, NOT a posting gate):
- `auto_remember` (default) — user pick saved as silent default.
- `explicit_confirm` — user must consciously confirm every post. Seeded for: `SALE`, `CAPITAL`.

**Save independence:** A category is saved regardless of resolver outcome. No CHECK/FK/trigger on resolver state. M/A categories are active and editable.

**14 seeded codes:** SALE, CAPITAL, DRAWINGS, FABRIC, CUTTING, SEWING, LABELS, SHIPPING_IN, CUSTOMS, INVENTORY_IN, DELIVERY, ADS, FINANCE, OTHER.

**Test contract v3 (verified 84/84 + 6/6 smoke):** 14 cats × 3 tenants × 2 sides on tenants T1=`0b08eba6-c81a-4f6c-b371-e6e324016e73`, T2=`452c2b08-72b8-463a-aaf0-93a3011c8f32`, T3=`948e365f-fb00-4429-a85c-64bf56cef80e`. Cash-leaf counts: T1=29, T2=5, T3=7 — drift = test failure.

**Smoke tests (must pass on any new tenant with a baseline COA):**
1. `INVENTORY_IN-D` → `resolved` on code `1140` (pure leaf path).
2. `INVENTORY_IN-C` → `ambiguous` with candidate `2111` (parent + jsonb path).

**Out of scope (Phase 1):** ledger writes, `sa_post_journal_voucher` RPC, UI, edge function, GIFT/DISCOUNT categories (deferred).