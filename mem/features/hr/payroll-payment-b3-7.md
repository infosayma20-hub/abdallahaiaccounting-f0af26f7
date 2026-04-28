---
name: Payroll Payment B3.7 (Hybrid Cash)
description: Cash-basis payroll payment via RPC creating voucher + journal entry, supports cash/bank/cheque, individual + batch
type: feature
---

# Payroll Payment (B3.7)

## Model: Hybrid Cash
- **No accrual entry on approve** (B3.6).
- **Single journal on payment**: Dr 5150 (رواتب وأجور) / Cr 1110 (cash) | bank.gl_account_code | 1160 (outgoing cheques).

## RPCs (only path to mark paid)
- `payroll_pay_employee(_payroll_id, _payer, _payment_method, _bank_account_id?, _cheque_number?, _cheque_due_date?, _payment_date?)`
- `payroll_pay_batch(_user_id, _month, _year, _payer, _payment_method, ...)` — pays all approved+unpaid for the month, updates `payroll_batches.status='paid'`.

## Guards
- `trg_auto_journal_payroll` is **DROPPED** — replaced by RPC.
- `guard_employee_payroll_payment` BEFORE UPDATE — blocks manual `is_paid=true` / `status='paid'` unless `app.payroll_paying='on'` (set only inside RPC).
- Pay only `approved` rows. Reject submitted / returned / paid.
- Double-pay blocked (checks `is_paid`, `voucher_id`, `linked_transaction_id`).

## Side effects per payment
1. Insert into `vouchers` (type=payment, subtype=cash|bank|cheque, employee_id, amount=net_salary, posted).
2. Insert into `transactions` (5150 / credit_code, idempotency_key=`PAYROLL-{id}`).
3. Update `employee_payroll`: voucher_id, linked_transaction_id, payment_method, is_paid, paid_date, status=paid.
4. Update voucher.linked_transaction_id.

## UI
- `PayrollPaymentDialog` (shared cash/bank/cheque selector + bank picker + cheque fields).
- `PayrollApprovalBar`: "دفع الراتب" button on approved rows.
- `PayrollApprovalCenter`: "دفع جماعي" button + batch dialog.
