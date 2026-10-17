# POS report rules

- Shift sales additions use `pos_shift_add_sale_v1` and `ShiftAddSaleDialog`, gated by the dedicated shift-sale permission. Why: stock, customer debt, cash, tax and audit must commit atomically on the selected shift without mutating historical postings.
- The new sale wrapper sets exact-order transaction-local posting date/time context for the shared sale engine and numbering; ordinary sales keep their original behavior. Why: historical shift additions must date their new postings correctly and remain inside statement shift groups.