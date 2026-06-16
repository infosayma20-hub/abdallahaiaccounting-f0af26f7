---
name: Smart Accountant Phase 3 — Live posting + COA gap-fill
description: Idempotent baseline-account helper per tenant + explicit live posting wrapper. End-to-end smoke verified inside rollback (zero permanent impact).
type: feature
---
# Smart Accountant — Phase 3

**`sa_ensure_baseline_accounts(p_user_id uuid) → jsonb`** — SECURITY DEFINER, idempotent gap-fill for the 8 baseline accounts the resolver needs but most tenants lack:
- `1310 مخزون مواد خام` (raw_materials_inventory)
- `1320 إنتاج تحت التشغيل` (wip)
- `1330 بضاعة تامة الصنع` (finished_goods)
- `3120 مسحوبات شخصية` (owner_drawings)
- `6000 مصاريف توصيل` (delivery_expense)
- `6400 مصاريف تسويق وإعلان` (marketing_expense)
- `6500 مصاريف تمويلية وفوائد` (finance_expense)
- `6900 مصاريف متفرقة` (misc_expense)

All inserted as top-level leaves (`parent_code=NULL`, `nature='debit'`, `currency='شيكل'`, `is_system=false`). Idempotent: re-runs return `added=[]`, `skipped_existing=[…]`. **Opt-in per tenant — never auto-executed.**

**`sa_post_journal_voucher_live(p_draft_id uuid) → jsonb`** — explicit live-posting wrapper that calls `sa_post_journal_voucher(p_draft_id, false)`. Use this from edge functions / UI to remove any chance of accidental dry-run misfire.

**End-to-end smoke (verified, all inside ROLLBACK — zero permanent impact):**
1. Gap-fill 1st run on T1: `added_count=8`. ✅
2. Gap-fill 2nd run on T1: `added_count=0, skipped_count=8` (idempotent). ✅
3. Post-gap-fill resolver: `DRAWINGS-D=R(3120)`, `DELIVERY-D=R(6000)`, `FABRIC-D=R(1310)`. ✅
4. Live posting INVENTORY_IN draft (1234.56₪ via 1140→2111): transaction inserted with `debit_account_code=1140`, `credit_account_code=2111`, `idempotency_key=sa_draft:<uuid>`. Draft updated to `status=posted` with `posted_at` + `posted_transaction_id`. ✅
5. Second call on same posted draft: returns `invalid_status` (status moved to `posted`, no longer `ready`). Single transaction confirmed (no duplicate). ✅
6. RLS proves itself: direct `UPDATE` on `smart_accountant_drafts` by a non-team role is blocked (only the SECURITY DEFINER RPC can mutate workflow state from `ready`). ✅

**Production rollout policy:**
- Call `sa_ensure_baseline_accounts(user_id)` once per tenant before enabling SA features for that tenant.
- Live posting is opt-in via the `_live` wrapper; the base RPC still defaults to dry-run for safety.
- Fiscal-period lock trigger fires automatically on the INSERT — no extra plumbing.