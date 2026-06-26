---
name: Sparta Phase 2 — Sales & Invoices
description: Customer/invoice/payment data model + post/cancel RPCs that consume FIFO batches
type: feature
---

## Data model
- `sparta_customers` — clinics/doctors. `balance` auto-synced from posted invoices minus active payments.
- `sparta_invoices` — status: draft → posted → cancelled. Numbering `SPI-YYYY-NNNN` via `sparta_next_invoice_number()`.
- `sparta_invoice_items` — line_total recalculated by trigger; mutation blocked once parent is posted/cancelled.
- `sparta_payments` — methods: cash/transfer/cheque/card. `is_voided` flag instead of delete.

## Workflow
1. UI creates a draft invoice with `sparta_invoices.insert({status:'draft'})` after grabbing a number via RPC.
2. Items added/edited freely while draft. Totals recompute via `sparta_recalc_invoice` trigger.
3. `sparta_post_invoice(_invoice_id)` — admins only:
   - For batch-tracked products → calls `consume_batches_fifo` (writes `batch_movements`, auto-syncs `products.quantity`).
   - For non-tracked products → decrements `products.quantity` directly.
   - Snapshots COGS into `cost_total` per line using `products.buy_price` (per-batch cost is a future upgrade).
   - Locks invoice as `posted`.
4. `sparta_record_payment(...)` — admins only. Validates ≤ balance_due; trigger refreshes `paid_amount`/`balance_due` and `customer.balance`.
5. `sparta_cancel_invoice(_invoice_id, _reason)` — blocks if active payments exist. If posted, reverses every `out` batch_movement with an `in` movement (`reference_type='sparta_invoice_cancel'`).

## RLS
- SELECT: any `is_sparta_holding_member`.
- INSERT/UPDATE/DELETE on invoices, customers, payments: `is_sparta_holding_admin` only.
- Invoice delete restricted to `status='draft'`.
- Customer delete restricted to `balance = 0`.

## UI routes
- `/sparta/customers` — list + create.
- `/sparta/invoices` — list with status filter + search.
- `/sparta/invoices/:id` — edit (draft) / view (posted/cancelled), post, cancel, record payment, print.

## Future (Phase 3)
- Per-batch cost capture so COGS = Σ(batch_cost × taken) instead of buy_price snapshot.
- GL integration (post invoice → JE: Dr AR / Cr Revenue / Cr VAT, plus Dr COGS / Cr Inventory).
- Payment voiding RPC (today only triggers handle voided flag correctly; UI not yet exposed).