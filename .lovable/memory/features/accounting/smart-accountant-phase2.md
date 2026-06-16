---
name: Smart Accountant Phase 2 — Drafts + Post RPC (dry-run)
description: Per-tenant drafts table and SECURITY DEFINER posting RPC with strict guards. Dry-run validated; live posting gated for Phase 3.
type: feature
---
# Smart Accountant — Phase 2

**Table:** `smart_accountant_drafts` (per-tenant, RLS via `is_team_member`).
Workflow: `pending → ready → posted` (or `cancelled`). `delete` blocked on `posted`.
Tracks: category_code (FK), description, amount, currency, foreign_amount, exchange_rate, transaction_date, contact/workshop/cost_center, chosen debit/credit account_ids, resolver state cache, source (manual/voice/text/ai), source_text, posted_transaction_id, posted_at.

**RPC:** `sa_post_journal_voucher(p_draft_id uuid, p_dry_run boolean default true) → jsonb`. SECURITY DEFINER.
- Defaults to dry-run. Live posting (writes to `transactions`) becomes active in Phase 3.
- Guards (in order): draft exists → caller is team member → status='ready' → both account_ids present → both accounts belong to draft.user_id → strict-leaf on both sides (no parent account postable) → idempotency check.
- Idempotency key: `'sa_draft:' || draft.id` — leverages existing unique partial index on `transactions.idempotency_key`. On repeat call: returns existing transaction_id without re-insert.
- Returns `{ok, error?, dry_run, would_post?, transaction_id?, idempotency_key, …}`.
- Posts as a single-row JV (`transactions` is single-row Dr/Cr; balance is structural).

**Tested (5/5 dry-run scenarios):** happy path returns full payload + zero ledger writes; pending→`invalid_status`; parent account→`parent_account_forbidden`; cross-tenant account→`cross_tenant_account`; missing draft→`draft_not_found`.

**Out of scope (Phase 2):** UI, edge function, ambiguity-resolution UX, fiscal period guard exercise (lives in existing trigger; will fire automatically when live posting starts), GIFT/DISCOUNT categories.