---
name: Sparta Phase 1 Hardening
description: Shared-tenancy model and auto-sync for Sparta inventory/batches
type: feature
---

## Canonical tenancy (all Sparta tables)
- `product_batches.company_id` & `batch_movements.company_id` → `sparta_holding_id()` = `0a0655c6-b2b1-4607-a949-311cb8fb9f77`.
- `products.user_id` & `warehouses.user_id` & `stock_movements.user_id` → `sparta_owner_user_id()` (= holding.created_by).
- Frontend MUST use `useSpartaContext()` (`src/hooks/sparta/useSpartaContext.ts`) — never pass `auth.user.id` to Sparta queries.

## Quantity sync
- Trigger `trg_batch_movements_sync_qty` on `batch_movements` updates `products.quantity` automatically (+ for `in`/`adjustment`, - for `out`).
- `consume_batches_fifo` writes `batch_movements` rows internally; do NOT also insert a stock_movements row for batch-tracked products (would double-count once we replace that legacy path).
- New batch insert in `SpartaBatchesPage` writes an `in` movement to keep `products.quantity` consistent.

## RLS split
- `product_batches` / `batch_movements`: SELECT = any `is_sparta_holding_member`; INSERT/UPDATE/DELETE (batches) and INSERT (movements) = `is_sparta_holding_admin` only. Movements have no UPDATE/DELETE (audit log).
- `consume_batches_fifo` requires `holding_admin`.

## Integrity
- CHECK `product_batches_expiry_after_manufacture` blocks expiry < manufacture.
- Composite index `idx_product_batches_fifo (company_id, product_id, warehouse_id, status, expiry_date, created_at)` speeds FIFO.
- UI confirms before saving batch with past expiry.

## Routes
- `/sparta/movements` → `SpartaBatchMovementsPage` (audit trail viewer).