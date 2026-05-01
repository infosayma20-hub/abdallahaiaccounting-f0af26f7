---
name: Single Source of Truth (Phase 5G + 5G.1)
description: Contact/supplier balances come exclusively from get_contact_balance RPC; covers AR, AP, customer prepayments (2115), and supplier prepayments (1146)
type: feature
---

## Rule
All UI surfaces (ContactsPage, ContactDetailPage, Customer360, credit decisions) MUST read contact balances via `get_contact_balance(contact_id)` RPC, wrapped in `src/lib/contact-balance.ts` (`fetchContactBalance`, `fetchManyContactBalances`).

NEVER read `contacts.current_balance` for display. NEVER recompute balances from `invoices` or `paid_amount` only. NEVER write to `contacts.current_balance` from the UI.

## Account perimeter (Phase 5G.1)
The RPC matches transactions where `contact_id = :id` AND debit/credit account code matches:
- `113%`  → Accounts Receivable (1130 + sub-accounts like 113001)
- `211%`  → Accounts Payable (2110) AND customer prepayments (2115)
- `1146%` → Supplier prepayments (Advances to Suppliers, asset)

Matches the canonical AccountStatementV2 formula:
- Customer: 1130 + 2115
- Supplier: 2110 + 1146

## Sign convention
- `balance > 0` → contact owes us (customer with debit AR, or supplier we prepaid)
- `balance < 0` → we owe contact (supplier with credit AP, or customer who overpaid)

## Verification (2026-05-01)
- 99 contacts tested: 95 exact match with canonical formula. 4 "mismatches" were RPC being MORE accurate by ignoring incorrect `contact_type` labels and using ledger as truth.
- All 12 transactions touching 1146/2115 have `contact_id` populated.
