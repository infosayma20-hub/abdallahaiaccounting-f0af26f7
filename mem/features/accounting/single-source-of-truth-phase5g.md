---
name: Single Source of Truth — Contact Balance (Phase 5G)
description: All contact/supplier balances in UI must come from get_contact_balance RPC, not from contacts.current_balance
type: feature
---

## Rule

UI surfaces (ContactsPage, ContactDetailPage, useCustomer360, and any
future contact balance display) MUST read live balance via
`get_contact_balance` RPC — never directly from `contacts.current_balance`.

The stored `contacts.current_balance` column is treated as a stale legacy
cache. It is intentionally NOT removed from the DB schema (audit /
compatibility), but the UI must not present it as truth.

## How to apply

- Use the helpers in `src/lib/contact-balance.ts`:
  - `fetchContactBalance(contactId)` — single contact
  - `fetchManyContactBalances(ids)` — list pages, parallel fan-out
  - `fetchContactBalanceDetail(contactId)` — full RPC payload
- Never call `supabase.from('contacts').update({ current_balance: ... })`
  from anywhere in the frontend. Opening balances must go through
  `create_opening_balance_entry` RPC; the ledger is the source.
- For credit decisions, `evaluateCreditDecision` reads
  `financials.ledger_balance` first, then `outstanding`, then (last
  resort) `contact.current_balance` for any unmigrated callers.

## RPC contract

`get_contact_balance(p_contact_id uuid, p_as_of_date date, p_currency text)`
returns jsonb `{ balance, total_debit, total_credit, currency, as_of_date }`.

Computes balance as `SUM(debit on 113%/211%) - SUM(credit on 113%/211%)`
filtered by `contact_id`, `is_deleted=false`, `transaction_date <= as_of_date`.

### Caveat

The RPC currently does NOT include the Smart Allocation prepayment
accounts (2115 customer prepayments, 1146 supplier prepayments).
ContactsPage's old local computation included them. If a tenant relies
on Smart Allocation prepayments to net against AR/AP, the RPC must be
extended in a future migration. Track as known gap.

## What this replaces

Before Phase 5G the same contact balance was sourced 4 different ways:

| Surface | Old source | New source |
|---|---|---|
| ContactsPage list | local AR/AP/2115/1146 sum | `get_contact_balance` RPC |
| ContactDetailPage credit card | `contacts.current_balance` | `get_contact_balance` RPC |
| Customer360 (CRM) | invoices outstanding only | `get_contact_balance` RPC |
| AccountStatementV2 | transactions ledger (correct) | unchanged ✅ |

## Files touched

- `src/lib/contact-balance.ts` — new helper module
- `src/pages/ContactsPage.tsx` — list now reads RPC; removed 3 direct
  writes to `current_balance` (lines previously at 329, 393, 396)
- `src/pages/ContactDetailPage.tsx` — `liveBalance` state from RPC
  replaces `contact.current_balance` in credit info card
- `src/pages/crm/hooks/useCustomer360.ts` — outstanding now derived from
  ledger; added `ledger_balance` to financials
- `src/pages/crm/lib/policyEngine.ts` — `LiveFinancials.ledger_balance`
  added; `evaluateCreditDecision` prefers it

## Out of scope (deferred)

- VoucherFormPage (Phase 5C/D/E ground)
- Cheques, POS, Invoice creation, Workshops
- Removing the `current_balance` column from DB schema
- Extending RPC to include 2115/1146 prepayments