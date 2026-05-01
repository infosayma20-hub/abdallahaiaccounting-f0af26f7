---
name: Financial Core Stabilization Phase 5C/5D/5E
description: VoucherFormPage simple receipt/payment + allocations behind vouchers_use_rpc + journal voucher (save/update) routed through create_journal_entry_multi_party_atomic
type: feature
---

## Phase 5C — VoucherFormPage simple receipt/payment (frontend, flag-gated)

`src/pages/VoucherFormPage.tsx`:
- Imports `isVouchersRpcEnabled`, `callCreateReceiptRpc`, `callCreatePaymentRpc` from `@/lib/voucher-rpc`.
- Computes `vouchersRpcOn = isVouchersRpcEnabled(settings)` once per save.
- `isSimpleContactVoucher` = contact party + ILS + non-cheque + non-employee + non-account + no smart-routing intent.
- When flag ON AND simple path: receipt creates via `create_receipt_with_entry` with new optional params (voucher_date, cash_account_code, notes, workshop_id) — eliminates the post-insert `transactions.update` hack.
- When flag ON AND simple path: payment creates via `create_payment_with_entry` (replaces direct `transactions.insert`).
- Flag OFF: legacy direct paths run unchanged for every tenant.

## Phase 5D — Allocations through atomic RPC (frontend, flag-gated)

Same file: when flag ON and `!asDraft`:
- Receipt allocations call `allocate_voucher_to_invoices_atomic({ paymentId: receipt.id, allocations })`.
- Payment allocations call `allocate_voucher_to_invoices_atomic({ transactionId: txId, allocations })` (because payment vouchers live in `vouchers`, not `receipt_vouchers`).
- The RPC inserts `payment_invoice_links` AND recalcs `invoices.paid_amount/remaining_amount/payment_status` server-side; replaces the per-invoice update loop.
- Flag OFF: legacy `payment_invoice_links` insert + manual `invoices.update` loop unchanged.
- Edit-mode allocation block at the top of the file (lines ~2215, 2236) NOT touched yet.

## Phase 5E — Journal voucher save & update (hook, flag-gated)

`src/hooks/useSaveJournalVoucher.ts`:
- New helper `fetchVouchersRpcFlag(userId)` reads `company_settings.feature_flags.vouchers_use_rpc` (defaults false on any error).
- `save()` and `update()`: when `mode==='posted'` AND flag ON, the same Debit×Credit pair-matching loop now feeds `create_journal_entry_multi_party_atomic` instead of a direct `transactions.insert`. Reference uses `voucher.ref_number` (save) or `existing.ref_number` (update). `linked_transaction_id` is still set on `vouchers` for cascade delete.
- Flag OFF: legacy `transactions.insert(txns)` path unchanged. `delete()` and rollback paths unchanged on both sides.

## Activation (test users only)

```sql
UPDATE company_settings
SET feature_flags = COALESCE(feature_flags,'{}'::jsonb) || '{"vouchers_use_rpc": true}'::jsonb
WHERE user_id = '<test-user-id>';
```

Flag default OFF for all tenants. No DB migration in 5C/5D/5E. No data backfill. No UI change.

## Manual test matrix (after flipping flag for one user)

1. Simple cash receipt from a customer + multi-invoice allocation → check `payment_invoice_links` keyed to `payment_id=receipt.id`, invoice `paid/remaining/status` updated.
2. Simple cash payment to a supplier + invoice allocation → links keyed to `transaction_id=txId`, supplier 2110 updated.
3. Bank transfer receipt → debit account = correct bank GL (no post-insert mutation).
4. Multi-line journal voucher (3+ lines, mixed contacts) → `create_journal_entry_multi_party_atomic` produces the same pair count as legacy with stable idempotency keys `VOUCHER-<voucher_id>-<idx>`.
5. Edit a posted journal voucher → old txns deleted by reference, new ones recreated through RPC.
6. Regression with flag OFF on the same user → all 5 scenarios behave exactly as before.

## Out of scope (deferred)

- Cheque-bearing vouchers (شيك) — still legacy.
- Employee/account party payments — still legacy.
- Foreign currency vouchers — still legacy.
- VoucherFormPage edit mode (top of `handleSave`) — still legacy.
- Smart-routing intents (advance/refund/reverse_settlement) — still direct insert.
