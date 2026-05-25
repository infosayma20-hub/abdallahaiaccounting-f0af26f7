---
name: Sales Rep Cancellation Policy
description: Sales reps cancel own invoices via rep_cancel_owned_invoice only; no delete permission; admin handles broad ops
type: constraint
---
## Policy (approved by user)

1. **sales_rep accounts** (e.g. `jamal@lion.com`) are sales-only.
2. They cancel their own invoices **only** through `rep_cancel_owned_invoice` RPC, which enforces:
   - Caller owns the invoice (`salesperson_id` matches)
   - Not yet collected (`paid_amount = 0`)
   - Reverse entry if posted; no hard delete
3. **Never** grant `sales.invoices.delete` to the `sales_rep` role.
4. Broad admin ops (hard delete, administrative void, accounting corrections) must use the **admin account** (e.g. `jamal.4jojo@gmail.com`).
5. **No per-user overrides** to widen rep permissions unless the customer explicitly requests it — discouraged for SoD/audit reasons.

**Why:** Segregation of Duties + clean audit trail. Even when one person owns both accounts, the role boundary must be preserved at the system level.
