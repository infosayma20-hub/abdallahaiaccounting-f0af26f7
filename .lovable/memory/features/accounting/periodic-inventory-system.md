---
name: Periodic Inventory (بضاعة آخر المدة)
description: IAS 2 / IAS 1 periodic inventory system with protected accounts 1148/1149/5101/5102 and RPC-only posting
type: feature
---

# Periodic Inventory System — IAS 2 §34 / IAS 1 §54(g)

## Toggle
- `company_settings.periodic_inventory_enabled` (bool) — default false (Perpetual is the default)
- `company_settings.inventory_system` — 'perpetual' | 'periodic'
- `company_settings.periodic_disclosure_method` — 'weighted_avg' | 'fifo' (disclosure only)

## Chart of accounts (protected, is_system_protected=true)
| Code | Name | Nature | Parent | Purpose |
|------|------|--------|--------|---------|
| 1148 | مخزون أول المدة | debit / Asset | 1140 | Opening inventory (period-start snapshot) |
| 1149 | مخزون آخر المدة | debit / Asset | 1140 | Closing inventory (physical count value) |
| 5101 | بضاعة أول المدة | debit / COGS | 5100 | Opening added to COGS |
| 5102 | بضاعة آخر المدة | credit contra / COGS | 5100 | Closing deducted from COGS |

## Adjusting entries (auto-posted via RPC only)
1. `Dr 5101 / Cr 1148 = opening_value` (transfers opening to COGS)
2. `Dr 1149 / Cr 5102 = closing_value` (recognises closing as asset, reduces COGS)

## Guardrails
- Trigger `protect_periodic_inventory_accounts` blocks all manual posting on the 4 codes.
- RPC `post_periodic_inventory_adjustment(_count_id)` uses session GUC `app.allow_periodic_inventory_posting=on` to bypass the trigger.
- RPC `reverse_periodic_inventory_adjustment(_count_id)` soft-deletes both entries.
- One active (non-reversed) count per `(user_id, period_start, period_end)`.

## Table
`inventory_period_counts`: period_start, period_end, count_date, opening_value, closing_value, costing_method, status (draft|posted|reversed), opening_journal_id, closing_journal_id.

## UI
- Settings → Inventory → «نظام الجرد وبضاعة آخر المدة» section (toggle + method dropdown)
- Page `/periodic-inventory` (PeriodicInventoryPage) — entry form, JV preview, history table, reverse button
- ProfitLoss.tsx auto-injects "بضاعة أول المدة" and "(-) بضاعة آخر المدة" lines under COGS when 5101/5102 balances exist
- BalanceSheetPage.tsx renders 1148/1149 naturally as Asset children of 1140

## Formula enforced on P&L
`COGS = Opening (5101) + Purchases (51xx except 5101/5102) − Discounts − Returns − Closing (5102)`

## Seed for new companies
`seed_periodic_inventory_accounts(_user_id uuid)` — call from `handle_new_user` if you want auto-seed. Not wired to signup yet — safe to call idempotently later.
