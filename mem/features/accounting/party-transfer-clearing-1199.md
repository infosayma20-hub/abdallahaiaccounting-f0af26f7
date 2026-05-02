---
name: Party Transfer Clearing Account (1199)
description: Manual journal entries that move balance between two parties on the same control account (e.g. 2110→2110 with different supplier_ids) MUST route through clearing account 1199 to preserve per-contact analytical effect
type: feature
---

## Why
The `transactions` schema carries one `contact_id` per row. When a journal voucher has two lines with the same account but different contacts (e.g. transferring debt from فادي to فراس on 2110), naive pair-matching merges them into a single row with `debit_account_code = credit_account_code` — the row is balanced but its net effect on every party's statement of account is zero.

## Rule
In `useSaveJournalVoucher.buildTransactionsFromLines`:
- If a debit line and a credit line being paired share the SAME `account_code` AND have different non-null `contact_id`s, do NOT emit a single merged row.
- Instead emit TWO rows through clearing account `1199` ("حساب وسيط لتحويل الذمم"):
  - Debit `<account>` (debit contact) / Credit `1199`
  - Debit `1199` / Credit `<account>` (credit contact)
- Call `ensure_party_transfer_clearing_account(p_user_id)` RPC to make sure 1199 exists for the tenant before insert.
- Net effect on the GL is zero; account 1199 always closes at zero per voucher.

## Validation Guard
`validateJournalInput` blocks any voucher where the SAME account+contact_id pair appears on both debit and credit sides — this would be pure noise (no analytical signal preserved even via clearing).

## Historical bug
QV-2026-0009 (user 948e365f…, 2026-05-02) was created before this fix and stored as a single self-zeroing row. It was repaired by soft-deleting the broken transaction and inserting two clearing-routed transactions with stable idempotency keys `VOUCHER-<id>-0D` and `VOUCHER-<id>-0C`.
