---
name: Employee Sub-Ledger Foundation (B3.1)
description: Unified employee_financial_movements with category + lock guard + HR Movements CRUD tab in Employee 360
type: feature
---

# Employee Sub-Ledger Foundation (B3.1)

## Single Source of Truth
`public.employee_financial_movements` is the canonical sub-ledger for every monetary effect on an employee's salary **except attendance**.

## Schema (B3.1 additions)
| Column | Type | Purpose |
|---|---|---|
| `category` | TEXT, CHECK constrained, NULL allowed | Classification of the movement |
| `reference_number` | TEXT | Human-visible voucher number (PV/RV/POS-### etc.) |

### Allowed `category` values
`food`, `transport`, `loan_installment`, `advance`, `penalty`, `purchase`, `cash_shortage`, `cash_surplus`, `adjustment`, `previous_balance`, `other`.

`NULL` = legacy row (pre-B3.1). Treated as **"غير مصنفة"** in UI and **NOT deducted** in Payroll Preview until classified by HR.

> Decision: **text + CHECK** (not enum) for flexibility. Future B3.3 may convert to enum once categories stabilize.

## Lock Guard
Trigger `trg_efm_lock_guard` on INSERT/UPDATE/DELETE rejects manual edits when the day is locked via `hr_attendance_locks`.

**Exemptions** (to avoid breaking production writers):
- `source_type` starts with `pos`, equals `system`, or starts with `payroll`/`webhook`.

Manual writers (HR app, `hr_manual` source) are blocked with Arabic error message.

## Payroll Preview Integration
`usePayrollPreview` reads `category` first, falls back to heuristics for legacy rows. `other` → "uncategorized" bucket → shown in "حركات تحتاج مراجعة" — never auto-deducted.

## UI: Employee 360 → "الحركات المالية" tab
- Filter by date range, category, direction (debit/credit)
- KPIs: total debit, total credit, net, unclassified count
- Manual creation only for `source_type = hr_manual` (POS/system rows are read-only)
- Delete restricted to manual rows
- Warning banner when unclassified rows exist

## Forbidden in B3.1
- ❌ No POS write changes
- ❌ No voucher (`transactions`) modifications
- ❌ No cash-closing integration
- ❌ No `employee_payroll` writes
- ❌ No journal entries
- ❌ No auto-classification of legacy rows

## Hooks
- `useEmployeeMovements(employeeId, filters)` — read with filters
- `useCreateEmployeeMovement` — HR manual insert (always `source_type = hr_manual`)
- `useUpdateEmployeeMovement` / `useDeleteEmployeeMovement` — only manual rows
- Constants: `MOVEMENT_CATEGORIES`, `tCategory(value)`

## Future phases
- **B3.2**: Wire POS meal sales to write `category = 'food'` directly (replace heuristics)
- **B3.3**: Wire cash-closing to write `cash_shortage` / `cash_surplus`
- **B3.4**: Wire payment vouchers (`transactions`) for employee to auto-create `advance` / `purchase` rows via `payroll_allocation_type`
