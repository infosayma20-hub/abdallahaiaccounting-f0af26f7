---
name: Voucher Smart Allocation Engine
description: Receipt/Payment vouchers route postings by intent (settlement / advance / refund / reverse-settlement) using accounts 1130/2110/2115/1146.
type: feature
---

# Smart Allocation — Receipt & Payment Vouchers

## Intents (from `src/lib/voucher-allocation.ts`)
- **settlement** — receipt + customer + invoices, OR payment + supplier + invoices.
- **advance** — receipt + customer + no invoices (or mode=advance).
- **supplier_advance** — payment + supplier + no invoices (or mode=advance).
- **refund** — payment + customer + no invoices (or mode=refund).
- **reverse_settlement** — payment + customer + open SALE invoices (return / discount).
- **direct** — GL-account or employee party (passthrough).

## Account routing (in `VoucherFormPage.handleSave`)
| Intent | Counter account |
|---|---|
| receipt + settlement | **1130** ذمم عملاء |
| receipt + advance | **2115** دفعات مقدمة من العملاء (liability) |
| payment + settlement (supplier) | **2110** ذمم موردين |
| payment + supplier_advance | **1146** دفعات مقدمة للموردين (asset) |
| payment + refund / reverse_settlement (customer) | **1130** ذمم عملاء |

When intent ≠ settlement, the legacy RPC (`create_receipt_with_entry`, etc.) is
bypassed because it hardcodes 1130/2110. We use a direct `transactions` insert.

## Invoice fetching
- Receipt voucher → fetches `invoice_type='sale'` only.
- Payment voucher → fetches BOTH `purchase` AND `sale` for the same contact, so
  reverse-settlement (payment to customer with open sale invoices) is selectable.

## Required accounts
Migration seeds them for every user; `ensure_advance_accounts(p_user_id)` RPC
seeds them at runtime if missing:
- `2115` — دفعات مقدمة من العملاء (خصوم, parent 2100)
- `1146` — دفعات مقدمة للموردين (أصول, parent 1100)

## Posting guards (`checkPostingGuards`)
- **Block** if total allocated > voucher amount.
- **Confirm** if open invoices exist but nothing was allocated.

## Legacy 2110 references kept as-is
- Cheque endorsement block (~line 1428): debit 2110 / credit 1150 — separate flow.
- Employee-payment edit fallback `editDebitAccountCode = "2110"` — overridden later.