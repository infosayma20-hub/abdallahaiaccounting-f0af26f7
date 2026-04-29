---
name: Payroll Payment Dynamic Account
description: Cashier picks the actual cash box / bank / cheque GL account from the company's chart of accounts when paying salaries; no hardcoded 1110/1120/1160.
type: feature
---
# B3.7.1.1 — Dynamic payment account selection

`payroll_pay_employee` and `payroll_pay_batch` accept `_payment_account_code text DEFAULT NULL`.

## Resolution priority for credit account
1. Explicit `_payment_account_code` (validated: same owner, active, no children → leaf).
2. For `bank`: `bank_accounts.gl_account_code`.
3. For `cheque`: `bank_accounts.outgoing_checks_account_code`.
4. Hardcoded `1110/1120/1160` are NOT used as silent fallback. If nothing resolves, the RPC raises a clear Arabic error so the user defines the account first.

## UI (PayrollPaymentDialog)
- **cash** → `cash_boxes` dropdown (filters `gl_account_code IS NOT NULL`).
- **bank** → `bank_accounts` dropdown; RPC derives credit code from chosen bank.
- **cheque** → bank picker (optional) + dropdown of accounts under `1160`. Bank choice auto-fills its `outgoing_checks_account_code` if set.
- Empty list ⇒ destructive Alert with link to setup page; submit blocked.

Debit side stays `5150` (مصروف الرواتب).
