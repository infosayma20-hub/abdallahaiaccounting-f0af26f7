---
name: Employee Sub-Ledger B3.2 — POS Meal Integration
description: POS meal sales for employees auto-write to employee_financial_movements with category=food and use food_individual_percentage from payroll_settings to compute the actual deduction
type: feature
---

# B3.2 — POS Meal → Employee Sub-Ledger

When a POS order is paid via `employee_account` (دفع على حساب الموظف):

1. POS reads `payroll_settings.food_individual_percentage` for the company (default 50%).
2. Inserts into `employee_financial_movements` with:
   - `source_type = 'pos_meal'` (auto/exempt from lock guard)
   - `category = 'food'` (B3.1 explicit category — Payroll Preview maps it to "وجبات" bucket)
   - `reference_number = order_number` (also stored in legacy `source_reference` for compatibility)
   - `source_id = orderId`
   - `amount = round(cart_total * food_individual_percentage / 100, 2)` ← **employee's actual share**, not full ticket
   - `notes` includes a transparency line: full amount, share %, calculated deduction
   - `movement_type = 'debit'`, `status = 'approved'`
3. If the calculated amount is 0 (company subsidizes 100%), no row is inserted.

## Why this matters
- Before B3.2 the full cart total was deducted from the employee — wrong if the company covers part.
- Payroll Preview now reads `category='food'` directly (B3.1 logic) and groups under "وجبات".

## What B3.2 does NOT touch
- ❌ No accounting vouchers (no PV/RV).
- ❌ No cash session settlement.
- ❌ No payroll posting.
- ❌ No journal entries.
- Only writes to `employee_financial_movements`.

## File
- `src/pages/POSPage.tsx` — checkout handler when `effectivePaymentMethod === 'employee_account'`.
