---
name: Smart Accountant Phase 1 — Classification Layer
description: Per-tenant business event catalogue + strict-leaf account resolver. Zero ledger risk. No collapse.
type: feature
---
# Smart Accountant — Phase 1

**Table:** `smart_accountant_categories` (per-tenant, RLS via `is_team_member`).
Columns: `code, name_ar, description_ar, debit_role, debit_code_fallback, credit_role, credit_code_fallback, ambiguity_resolution_policy, is_active, sort_order`.

**Resolver:** `sa_resolve_account(user_id, role, code_fallback, preferred_code) → jsonb`.
- `SECURITY INVOKER` (relies on RLS on `accounts`).
- Lookup priority: **preferred_code → code_fallback → role**. Code-first reflects reality (~95% of tenants rely on code, not system_role).
- **STRICT-LEAF RULE:** A parent account (any children > 0) NEVER auto-resolves. Returns `ambiguous` with structured `candidates[]` jsonb. No single-child collapse. Rationale: deterministic behavior across COA mutations — adding a sibling must never silently flip a previously-resolved category.
- Returns `{status, account_id, account_code, account_name, candidates, source}`.
- Three statuses: `resolved` | `ambiguous` | `missing`.

**Ambiguity policy** (storage policy, NOT a posting gate):
- `auto_remember` (default) — user pick saved as silent default (cash/bank/inventory/etc).
- `explicit_confirm` — user must consciously confirm every post. Seeded for: `SALE`, `CAPITAL`.

**Save independence:** A category is saved regardless of resolver outcome. No CHECK/FK/trigger on resolver state. M/A categories are active and editable.

**14 seeded codes:** SALE, CAPITAL, DRAWINGS, FABRIC, CUTTING, SEWING, LABELS, SHIPPING_IN, CUSTOMS, INVENTORY_IN, DELIVERY, ADS, FINANCE, OTHER.

**Smoke tests (must pass on any new tenant with a baseline COA):**
1. `INVENTORY_IN-D` → `resolved` on code `1140` (pure leaf path).
2. `INVENTORY_IN-C` → `ambiguous` with candidate `2111` (parent + jsonb path).

**Out of scope (Phase 1):** ledger writes, `sa_post_journal_voucher` RPC, UI, edge function, GIFT/DISCOUNT categories (deferred).