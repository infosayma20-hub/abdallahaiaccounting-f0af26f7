# POS Visa Routing + Cash Transfer Shift-Close Fix (2026-07-09)

## Findings

### 1. Visa payments — cash-drawer impact
- `complete_pos_order` routes each visa tender to `visa_gl_account_code` from
  the payment payload → Wheels 1131 / Yummy 1132 / FoodOnTime 1133 / …
  Falls back to `card_bank_account_id` (default 1120).
- Shift-close `expectedCash` only sums `pos_payments.payment_method='cash'`;
  visa rows are ignored → **visa can never cause a cash shortage** at sale time.

### 2. BUG in `change_pos_payment_method` (pre-fix)
- When switching to `card` (or a mixed split with a card leg) the debit was
  always routed to `v_card_bank_gl` (1120). `visa_gl_account_code` was ignored.
- **Fix**: function now accepts `p_visa_gl_account_code` (single card) and
  reads `visa_gl_account_code` from each `split_payments` element. When
  provided, that account is used as the debit; otherwise falls back to the
  card bank as before. Backward compatible.
- **UI**: `ChangePaymentMethodDialog` gained a visa-app picker that appears
  when the new method is card (or a split line is card), populated from
  `delivery_apps` where `visa_gl_account_code` is set.

### 3. BUG causing false cash shortage — `cash_transfers` not deducted
- Cashiers/managers frequently drop cash from the POS drawer to the safe
  via manual transfers **during** an open shift. The old
  `computeExpectedCashPerCurrency` did not subtract these, so the drawer
  showed a shortage exactly equal to the transferred amount.
- `cash_transfers.pos_session_id` was NULL for all POS-drawer transfers.
- **Fix A (DB)**: BEFORE-INSERT trigger `tg_cash_transfers_autolink_pos_session`
  auto-fills `pos_session_id` when the transfer's `from_box_id` matches a
  currently-open session's cash box.
- **Fix B (DB backfill)**: existing transfers whose `from_box_id` matches
  an open session were linked in place.
- **Fix C (math)**: `computeExpectedCashPerCurrency` accepts
  `transfersOutByCurrency` / `transfersInByCurrency`; POSPage's
  `handleCloseShift` fetches `cash_transfers` linked to the session and
  reduces (or adds) expected cash per currency accordingly. Transfer totals
  are also written to the shift summary payload for display.

## Diagnostic queries

```sql
-- Transfers already linked to this session
SELECT id, transfer_date, amount, currency, from_box_id, to_box_id, description
FROM cash_transfers WHERE pos_session_id = '<session_id>' ORDER BY created_at;

-- Recompute expected ILS for a closed session including transfer effects
WITH s AS (SELECT * FROM pos_sessions WHERE id = '<session_id>')
SELECT s.opening_cash,
  (SELECT COALESCE(SUM(p.amount),0) FROM pos_payments p
    JOIN pos_orders o ON o.id = p.order_id
    WHERE o.session_id = s.id AND p.payment_method='cash'
      AND p.currency='ILS' AND o.state='paid' AND NOT o.is_return) AS cash_sales_ils,
  (SELECT COALESCE(SUM(amount),0) FROM cash_transfers
     WHERE pos_session_id = s.id AND from_box_id = s.cash_box_id
       AND upper(COALESCE(currency,'ILS')) = 'ILS') AS transfers_out_ils,
  (SELECT COALESCE(SUM(amount),0) FROM cash_transfers
     WHERE pos_session_id = s.id AND to_box_id = s.cash_box_id
       AND upper(COALESCE(currency,'ILS')) = 'ILS') AS transfers_in_ils
FROM s;
```

## Test scenarios

1. Sell 100 ₪ cash → close → variance 0.
2. Sell 100 ₪ visa (regular) → tx debits 1120 → drawer unchanged.
3. Sell 100 ₪ visa Wheels → tx debits 1131 → drawer unchanged.
4. Switch a paid cash invoice to card + Wheels → tx.debit updates to 1131,
   pos_payments.payment_method=card, drawer expected drops by 100.
5. Deposit 500 ₪ from POS drawer to safe mid-shift → trigger auto-fills
   `pos_session_id`; close shift → expected drops by 500; variance 0.
