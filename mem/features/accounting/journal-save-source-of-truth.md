---
name: Journal Save Source of Truth
description: useSaveJournalVoucher (save/update/remove) is the ONLY allowed path for journal vouchers. Atomic create/edit/delete + fiscal-period lock guard + rollback.
type: feature
---

# Source of Truth: Journal Voucher Save

## Rule
ALL journal-entry **create / edit / delete** (page, popup, future quick-add, AI accountant follow-ups) MUST go through `useSaveJournalVoucher` (`src/hooks/useSaveJournalVoucher.ts`).
The hook now exposes three operations: `save(input)`, `update(voucherId, input)`, `remove(voucherId)`.

## Why
Before this hook, `JournalEntryPopup` inserted directly into `transactions`, skipping `vouchers` and `voucher_lines`. Result:
- Entry visible in journal book but missing from vouchers list
- Account statement missing line memos and contacts
- `linked_transaction_id` never wired → cascade delete broken
- `idempotency_key` used `Date.now()` → duplicates possible
- `currency: "شيكل"` and `transaction_type: "قيد يومية"` broke filters

## What the hook guarantees
1. **Validation** — debit=credit when posted, ≥2 valid lines, no debit+credit on same line, description required.
2. **Fiscal-period lock guard** — `checkFiscalPeriodLock(user_id, date)` blocks save/update/delete when the date falls inside any `fiscal_periods` row with `status='closed'`. Update also re-checks the OLD date so a sealed entry cannot be moved out.
3. **Master voucher** — row in `vouchers` (`type='journal'`, subtype, status, posted_by/at, attachments).
4. **`voucher_lines`** — one row per valid line with contact_id, line_comment, line_order.
5. **Transactions** (only when `mode='posted'`) — Debit×Credit pairs via min-matching queue, each with stable key `VOUCHER-{voucher.id}-{idx}`, `currency: "ILS"`, `transaction_type: "journal"` (or `"opening_balance"` for `subtype=opening`).
6. **`vouchers.linked_transaction_id`** ← first transaction id (for cascade delete).
7. **Manual rollback** — on failure after voucher created: deletes voucher_lines, related transactions (by reference + user_id), then voucher.
8. **Update path** — wipes voucher_lines + transactions tied to the existing `ref_number`, then rebuilds them via the same logic. No "ghost" rows can survive.
9. **Delete path** — removes voucher_lines, then transactions by `reference` + `user_id`, then the voucher master.

## Forbidden
- ❌ Direct `supabase.from('transactions').insert(...)` for a journal entry
- ❌ Direct `supabase.from('transactions').update(...)` for a single row that belongs to a voucher/invoice/payment/etc. — read-only screens (مثل تقرير القيود `JournalEntriesPage`) must route the user to the source document editor instead.
- ❌ Direct `supabase.from('vouchers').update/delete(...)` for journal vouchers — use `update`/`remove`
- ❌ Inserting `vouchers` without matching `voucher_lines`
- ❌ Re-implementing pairing/idempotency logic in any other component
- ❌ Currency strings in Arabic (`"شيكل"`) — must be ISO `"ILS"`
- ❌ `transaction_type` in Arabic (`"قيد يومية"`) — must be `"journal"` / `"opening_balance"`
- ❌ Hard-coded template arrays inside popup/page UIs — the unified `JournalTemplatesPicker` (DB-backed via `useJournalTemplates`) is the single source for templates.

## Subtype mapping (popup → hook)
`عادي → normal`, `افتتاحي → opening`, `تسوية → adjustment`, `إقفال/إقفالي → closing`.

## Files
- `src/hooks/useSaveJournalVoucher.ts` — the hook (source of truth)
- `src/pages/JournalNewPage.tsx` — uses `saveJournalVoucher(...)`
- `src/pages/FinanceJournalPage.tsx` — uses `save` / `update` / `remove` (cancel)
- `src/pages/JournalEntriesPage.tsx` — read-only report; the edit pencil now opens a **resolution dialog** that detects whether the row is voucher-based (→ navigate to `/finance/journals?edit={voucher_id}`), invoice/payment/etc. (→ message pointing to source document), or orphan (→ propose creating an adjustment voucher). No direct `transactions` update.
- `src/components/JournalEntryPopup.tsx` — uses `saveJournalVoucher(...)`
- `src/components/journal/JournalTemplatesPicker.tsx` — only place that lists templates (no static `TEMPLATES` arrays anywhere else)
