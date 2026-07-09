---
name: POS Visa Routing & Cash-Transfer Shift Close
description: Delivery-app visa routing on payment edits + mid-shift cash transfers deducted from expected cash
type: feature
---
## Visa routing on payment edit
- `change_pos_payment_method` accepts `p_visa_gl_account_code` (single card) and reads `visa_gl_account_code` from each `split_payments` element.
- Single card: `v_new_debit_account := COALESCE(NULLIF(BTRIM(p_visa_gl_account_code),''), v_card_bank_gl)`.
- Split card leg: `v_new_debit := COALESCE(v_tender_visa_gl, v_card_bank_gl)`.
- UI: `ChangePaymentMethodDialog` fetches active `delivery_apps` with `visa_gl_account_code` and shows a picker under the method grid + per split row.

## Cash-transfer auto-link and shift-close
- Trigger `trg_cash_transfers_autolink_pos_session` (BEFORE INSERT on `cash_transfers`) sets `pos_session_id` when `from_box_id` matches an OPEN `pos_sessions.cash_box_id` for the same user.
- `computeExpectedCashPerCurrency` accepts `transfersOutByCurrency`/`transfersInByCurrency` and adjusts expected per currency.
- `POSPage.handleCloseShift` fetches `cash_transfers` where `pos_session_id = session.id`, buckets by currency and direction (from_box_id vs to_box_id vs session.cash_box_id) and subtracts OUT / adds IN. Totals + counts are included in the shift summary payload as `transfersOutILS/USD/JOD`, `transfersInILS/USD/JOD`, `transfersOutCount`, `transfersInCount`.

## Diagnostic doc: `docs/audit/pos-visa-cash-transfer-audit.md`
