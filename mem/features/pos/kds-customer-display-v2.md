---
name: KDS Customer Display v2
description: Phase 2 — auto kitchen ticket creation, daily short numbers, order-level call orchestration
type: feature
---
## Phase 2 (Implemented)
- **Auto kitchen tickets**: created via trigger `trg_pos_order_lines_kds_sync` on `pos_order_lines` AFTER INSERT, calls `kds_create_tickets_for_order(_order_id)`. Also fires from `pos_orders` INSERT/UPDATE on state change. UPSERT with unique index `(order_id, station_id)` prevents duplicates while still updating items as more lines come in.
- **Skip conditions**: KDS disabled, `is_return=true`, `state in ('cancelled','draft_cancelled')`, or no kitchen station configured.
- **Station routing**: groups `pos_order_lines` by `products.kitchen_station_id`; missing station → first active station for user/branch.
- **Daily short number**: `pos_orders.daily_display_number` assigned via BEFORE INSERT trigger `trg_assign_kds_daily_display`. Per (company_id, branch_id, business_date) with pg_advisory_xact_lock for race safety. Business date = 6 AM Asia/Hebron cutoff (`kds_business_date()`).
- **Settings** (`company_settings`): `pos_kds_daily_number_start` (default 1), `pos_kds_daily_number_reset` (default true), `pos_kds_display_number_source` ('short_daily_number' | 'order_number').
- **Order-level call**: `trg_kitchen_tickets_order_ready` fires when last station goes ready → inserts ONE `kds_call_events` row with `event_type='auto_call'`, sets `pos_orders.kds_auto_called_at`. Unique partial index `uniq_kds_auto_call_per_order` enforces single auto-call per order.
- **Cancellation cascade**: trigger deletes pending/preparing tickets and cancels ready ones when order state moves to cancelled.
- **RPCs**:
  - `kds_get_active_orders(_token)` — aggregated per-order rows for customer display (preparing/ready), honors `pos_ready_auto_hide_seconds` auto-hide and `pos_kds_display_number_source`.
  - `kds_recall_order(_order_id)` — manual recall, owner-only, inserts `event_type='recall'` and bumps `call_count`.
- **Customer display page** (`/pos/order-display?token=...`) consumes `kds_get_active_orders`. Each order is announced once via `announcedRef` Set keyed by `order_id`.
- **Kitchen page** no longer creates call events manually for "ready" status (handled by trigger). Recall button calls `kds_recall_order` RPC.

## Acceptance scenarios
- Order created in inactive state → no tickets.
- Order paid + KDS enabled → tickets created per station, daily_display_number assigned.
- All stations marked ready → ONE auto_call event, voice fires once on display.
- Order cancelled → tickets removed (or marked cancelled if already ready).
- Display device with branch_id → only sees own branch tickets.
- Display reload → state restored via RPC (no loss).
