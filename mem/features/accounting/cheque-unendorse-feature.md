---
name: Cheque Unendorse (Cancel Endorsement)
description: Official "Cancel Endorsement" flow via cancel_cheque_endorsement RPC + Reverse Entry. Status مظهر→مسجل blocked unless via this RPC.
type: feature
---
**Cancel Cheque Endorsement** is a first-class operation, not "delete the voucher".

- DB function: `cancel_cheque_endorsement(p_user_id, p_cheque_id, p_reason)`.
  - Validates cheque is currently `مظهر`, no subsequent lifecycle events after endorsement, finds last non-reversed endorsement transaction.
  - Calls `create_reverse_entry()` (no destruction of original tx).
  - Resets `endorsed_to_*`, `endorsed_at`, `endorsement_voucher_id`, `endorsement_notes` to NULL; restores `contact_id` from original `party_name`; status→`مسجل`.
  - Logs `cheque_status_history` row with `action_type='unendorse'` and details payload.
  - Reason is mandatory (≥3 chars).
- Trigger `validate_cheque_endorsement` blocks any direct UPDATE `مظهر→مسجل` unless the session GUC `app.cheque_unendorse='true'` is set (only this RPC sets it).
- UI: `UnendorseChequeDialog` shown via amber "إلغاء التجيير" button in `ChequesPage` action column — visible ONLY when `status='مظهر'` AND `cheque_type='وارد'`.
- Accounting effect: supplier's account statement shows the original endorsement entry + a reverse entry on the unendorse date; net effect zero. Cheque returns to "in-hand" inventory.

**Why:** Operational reality (wrong supplier endorsement) needs an auditable, IFRS-compliant correction path instead of deleting the payment voucher.
