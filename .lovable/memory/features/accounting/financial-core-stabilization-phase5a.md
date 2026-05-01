---
name: Financial Core Stabilization Phase 5A/5B
description: Voucher allocation, multi-party journal, and update RPCs (backend) plus voucher-rpc.ts adapter behind vouchers_use_rpc flag (default OFF)
type: feature
---

## Phase 5A — Backend RPCs (live)

New/extended atomic RPCs:
- `recalc_invoice_payment_status(p_invoice_id)` — computes paid/remaining/status from `payment_invoice_links`.
- `allocate_voucher_to_invoices_atomic(user, payment_id|null, transaction_id|null, voucher_amount, allocations[], allow_overpay)` — single source of truth for allocations. Either `payment_id` (legacy `receipt_vouchers`) OR `transaction_id` (new pathway) but not both.
- `create_journal_entry_multi_party_atomic(...)` — multi-line journal with per-line `contact_id`, `workshop_id`, `payment_method`.
- `create_receipt_with_entry` extended with `p_employee_id`, `p_workshop_id`, `p_allocations` (auto-calls allocator).
- `create_payment_with_entry` extended identically.
- `update_voucher_atomic` extended with `p_journal_lines`, `p_allocations`, `p_employee_id`, `p_workshop_id`. Now supports `kind='journal'` via void-all-lines-by-reference + recreate.

Schema changes:
- `payment_invoice_links` now has nullable `transaction_id`, `user_id`, `source` columns. `payment_id` made nullable. CHECK constraint enforces exactly one source. RLS enabled with user-scoped policies. Unique partial indexes prevent duplicate allocation per source.

All RPCs are backward compatible (new params are optional). Single signature each — no overload ambiguity. SQL test suite (T1–T8) passed: backward compat, multi-allocation, overpay rejection, idempotency replay, journal multi-party, edit, duplicate-link rejection.

## Phase 5B — Frontend adapter (passive, flag OFF)

`src/lib/voucher-rpc.ts`:
- Feature flag: `vouchers_use_rpc` in `company_settings.feature_flags` (default OFF, mirror of `cheques_use_rpc`).
- Helpers: `callCreateReceiptRpc`, `callCreatePaymentRpc`, `callCreateJournalMultiPartyRpc`, `callUpdateVoucherRpc`, `callVoidVoucherRpc`, `callAllocateVoucherRpc`, `isVouchersRpcEnabled`.
- VoucherFormPage NOT modified. Adapter is unused until Phase 5C wires it behind the flag for simple receipt/payment paths first.
