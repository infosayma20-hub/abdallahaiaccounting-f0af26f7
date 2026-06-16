---
name: Smart Accountant Phase 4 — AI Capture Edge Function
description: sa-capture edge function turns free Arabic text into a draft via Lovable AI + sa_resolve_account.
type: feature
---
# Smart Accountant — Phase 4

**Edge function:** `supabase/functions/sa-capture/index.ts` (verify_jwt enforced by `authenticateRequest`).

Flow:
1. Authenticate via JWT → `userId`.
2. Load active rows from `smart_accountant_categories` (global taxonomy).
3. `sa_guess_category(text)` → keyword fallback signal.
4. Lovable AI Gateway (`google/gemini-2.5-flash`, function-calling `emit_intent`) returns structured intent: `{category_code, amount, currency, transaction_date, description, contact_name, confidence, reasoning}`. Graceful degradation when `LOVABLE_API_KEY` missing or AI fails → keyword guess + raw text.
5. Resolve both legs with `sa_resolve_account(role, fallback, user_id)`. **Resolver still owns strict-leaf — function never bypasses it.**
6. Insert into `smart_accountant_drafts` with `status='ready'` only when **both legs resolved AND** policy = `auto_remember`; otherwise `pending` (UI confirmation required). SALE/CAPITAL always pending.
7. Returns `{draft, resolution:{debit,credit}, category, intent, next_action}`.

Hard contracts:
- Never writes to `transactions` directly — that remains `sa_post_journal_voucher_live(draft_id)`.
- Amount must be > 0; if AI fails to extract one, returns 422 `amount_required` (does NOT create a zero-amount draft).
- Uses correct columns: `debit_resolver_state` / `credit_resolver_state` (not `*_resolution`).
- Source defaulted to `ai`.
- Notes field carries trimmed AI reasoning for traceability.

Out of scope (Phase 4): UI widget on SmartAccountantPage, voice transcription endpoint, contact auto-provisioning, multi-line vouchers.