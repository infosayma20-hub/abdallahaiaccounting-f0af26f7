---
name: Payroll Payment Center (B3.7.1)
description: Dedicated /payroll/payment screen for finance role to execute approved payrolls — checkbox selection, "pay selected" loops payroll_pay_employee, "pay all" calls payroll_pay_batch
type: feature
---

## B3.7.1 — Payroll Payment Execution UI

**Why separate from Approval Center:** HR control (Approval) and Finance execution (Payment) are distinct roles. Mixing them in one screen creates UX clash and role-permission conflict (Odoo / SAP / Oracle pattern).

## Route
- `/payroll/payment` — `RoleGuard: admin, accountant_senior`
- Deep-linkable via `?year=YYYY&month=MM&branch=<uuid>`
- Approval Center has a **"انتقل إلى الدفع"** link that pre-fills filters

## UX rules
- Lists ONLY `approved` rows as actionable. `paid` rows shown as audit context (opacity-60, no checkbox).
- Checkboxes per row + select-all (default: all approved selected).
- Single payment-method picker per action (cash/bank/cheque) — NOT per employee.
- Two action buttons:
  - **دفع المحدد (N)** → loops `payroll_pay_employee` per row, one voucher per employee.
  - **دفع الكل (N)** → calls `payroll_pay_batch`, single consolidated voucher.
- Per-row "دفع" button for ad-hoc single payment without disturbing selection.
- Last used method/bank cached in `localStorage` (`payroll-payment:last-method`, `payroll-payment:last-bank`).

## Why per-row loop for "Pay Selected"?
- No need to change the RPC signature.
- Each payroll gets its own voucher + journal entry — cleaner audit trail.
- DB triggers (`trg_guard_employee_payroll_payment`) protect against double-pay.
- Failures are reported per-row; partial success is acceptable.

## Filters
- Year, Month, Branch (resolved via `employees.branch_id` join).

## Guarantees
- Cannot pay `submitted` / `returned` (filtered out + RPC rejects).
- Cannot double-pay (DB guard + frontend hides paid rows from selection).
- All accounting flows through `payroll_pay_employee` / `payroll_pay_batch` RPCs only.
- `auto_journal_payroll` function fully removed (B3.7 hardening).

## Files
- `src/pages/hr/PayrollPaymentCenter.tsx`
- `src/components/hr/payroll/PayrollPaymentDialog.tsx` (reused from B3.7)
- `src/hooks/hr/usePayrollApproval.ts` (`usePayPayrollEmployee`, `usePayPayrollBatch`)
