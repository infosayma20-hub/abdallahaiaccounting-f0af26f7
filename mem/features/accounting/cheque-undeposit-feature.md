---
name: Cheque Undeposit (Cancel Deposit)
description: Official "Cancel Deposit" flow via cancel_cheque_deposit RPC + Reverse Entry. Status مودع→مسجل blocked unless via this RPC.
type: feature
---
**Cancel Cheque Deposit** mirrors the unendorse flow for inbound cheques deposited but not yet collected/bounced.

- DB function: `cancel_cheque_deposit(p_user_id, p_cheque_id, p_reason)`.
  - Validates cheque is currently `مودع`, no subsequent lifecycle events (collect/bounce/cashed/return/endorse/cancel) after deposit.
  - Finds last non-reversed `cheque_deposit` transaction (debit 1125 / credit 1150 originally) and calls `create_reverse_entry()`.
  - Clears `deposit_bank_account_id`, `deposit_date`, `deposit_cash_box_id`; status → `مسجل`.
  - Logs `cheque_status_history` row with `action_type='undeposit'` containing original_deposit_tx_id, reverse_tx_id, previous bank/date.
  - Reason mandatory (≥3 chars).
- Trigger `validate_cheque_endorsement` extended to block direct UPDATE `مودع→مسجل` unless GUC `app.cheque_undeposit='true'` is set (only this RPC sets it). Same pattern as `app.cheque_unendorse`.
- UI: `UndepositChequeDialog` shown via amber "إلغاء الإيداع" button in `ChequesPage` action column — visible ONLY when `status='مودع'` AND `cheque_type='وارد'`.
- Accounting effect: bank statement shows original deposit + reverse on cancel date; net effect zero. Cheque returns to "in-hand" 1150 inventory.

**Why:** Operational reality (wrong bank, customer recall) needs an auditable, IFRS-compliant correction path instead of editing the original journal entry.