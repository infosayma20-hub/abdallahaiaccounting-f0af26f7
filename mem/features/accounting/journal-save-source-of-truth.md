---
name: Journal Save Source of Truth
description: useSaveJournalVoucher is the ONLY allowed path to save journal vouchers. Always creates voucher + voucher_lines + transactions atomically with rollback.
type: feature
---

# Source of Truth: Journal Voucher Save

## Rule
ALL journal-entry saves (page, popup, future quick-add, AI accountant follow-ups) MUST go through `useSaveJournalVoucher` (`src/hooks/useSaveJournalVoucher.ts`).

## Why
Before this hook, `JournalEntryPopup` inserted directly into `transactions`, skipping `vouchers` and `voucher_lines`. Result:
- Entry visible in journal book but missing from vouchers list
- Account statement missing line memos and contacts
- `linked_transaction_id` never wired → cascade delete broken
- `idempotency_key` used `Date.now()` → duplicates possible
- `currency: "شيكل"` and `transaction_type: "قيد يومية"` broke filters

## What the hook guarantees
1. **Validation** — debit=credit when posted, ≥2 valid lines, no debit+credit on same line, description required.
2. **Master voucher** — row in `vouchers` (`type='journal'`, subtype, status, posted_by/at, attachments).
3. **`voucher_lines`** — one row per valid line with contact_id, line_comment, line_order.
4. **Transactions** (only when `mode='posted'`) — Debit×Credit pairs via min-matching queue, each with stable key `VOUCHER-{voucher.id}-{idx}`, `currency: "ILS"`, `transaction_type: "journal"` (or `"opening_balance"` for `subtype=opening`).
5. **`vouchers.linked_transaction_id`** ← first transaction id (for cascade delete).
6. **Manual rollback** — on failure after voucher created: deletes voucher_lines, related transactions (by reference + user_id), then voucher.

## Forbidden
- ❌ Direct `supabase.from('transactions').insert(...)` for a journal entry
- ❌ Inserting `vouchers` without matching `voucher_lines`
- ❌ Re-implementing pairing/idempotency logic in any other component
- ❌ Currency strings in Arabic (`"شيكل"`) — must be ISO `"ILS"`
- ❌ `transaction_type` in Arabic (`"قيد يومية"`) — must be `"journal"` / `"opening_balance"`

## Subtype mapping (popup → hook)
`عادي → normal`, `افتتاحي → opening`, `تسوية → adjustment`, `إقفال/إقفالي → closing`.

## Files
- `src/hooks/useSaveJournalVoucher.ts` — the hook (source of truth)
- `src/pages/JournalNewPage.tsx` — uses `saveJournalVoucher(...)`
- `src/components/JournalEntryPopup.tsx` — uses `saveJournalVoucher(...)`
