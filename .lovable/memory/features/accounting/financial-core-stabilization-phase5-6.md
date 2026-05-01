---
name: financial-core-stabilization-phase5-6
description: Phase 5/6 — RPCs مُوسّعة (receipt/payment/cheque) backward compatible + void/update/bounce جديدة + ChequesPage خلف flag cheques_use_rpc
type: feature
---

## Phase 5/6 — Voucher & Cheque RPC layer

### Expanded RPCs (BACKWARD COMPATIBLE — old short signatures dropped, new wide ones cover them via DEFAULTs)
- `create_receipt_with_entry(...8 old args + p_voucher_date, p_exchange_rate, p_reference, p_cash_account_code, p_contact_account_code, p_notes)` — 14 args total.
- `create_payment_with_entry(...same shape...)` — 14 args total.
- `create_cheque_lifecycle_event(...7 old args + p_bank_fees, p_bank_fees_account_code, p_endorsed_to_contact_id, p_reason)` — 11 args total.
  - New events supported: `register, deposit, cashed, outgoing_bounced, recover, return_to_customer, cancel_with_reverse`. Old events kept identical.

### New RPCs
- `void_voucher_atomic(user, tx_id, reason, create_reverse, void_date)` — soft-deletes a voucher tx; optional IFRS reverse entry.
- `update_voucher_atomic(...)` — canonical delete-and-recreate path. Currently supports `'receipt'` and `'payment'` kinds; returns `fallback_required: true` for `'journal'` (multi-line) so callers fall back to legacy path.
- `create_cheque_bounce_atomic(user, cheque_id, bounce_date, reason, bank_fees, outbound)` — convenience wrapper around lifecycle event.

### CRITICAL: Overload removal
The old short signatures of all three lifecycle RPCs were **dropped** in the same migration to avoid PostgREST overload ambiguity. Old callers continue to work because all new params are DEFAULT NULL.

### ChequesPage feature flag
- Flag: `company_settings.feature_flags.cheques_use_rpc` (boolean, **default OFF**).
- Helper: `src/lib/cheque-rpc.ts` — `isChequesRpcEnabled(settings)` + `callChequeLifecycleRpc(params)`.
- When OFF (default): legacy direct-insert path runs unchanged.
- When ON per-tenant: 9 actions (deposit/collected/bounced/endorse/cancel/cashed/outgoing_bounced/recover/return_to_customer) route through the RPC; UI applies non-accounting column updates afterward.
- Enable per tenant: `UPDATE company_settings SET feature_flags = COALESCE(feature_flags,'{}'::jsonb) || '{"cheques_use_rpc": true}'::jsonb WHERE user_id = '...'`.

### VoucherFormPage status
NOT modified in Phase 5/6. 11 dangerous direct-insert paths documented; full migration deferred to Phase 5-real (requires `update_voucher_atomic` for journal kind + endorsement helper + multi-line allocation RPC).
