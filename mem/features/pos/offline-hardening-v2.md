---
name: POS Offline Hardening v2
description: sync_offline_pos_sale RPC + UNIQUE local_id + offline payment fallback path + MAX_SYNC_RETRIES quarantine + terminal-prefixed order numbers
type: feature
---

# POS Offline Hardening v2 (June 2026)

Closed the 3 critical gaps identified for Malaki's 17-terminal rollout.

## DB layer
- `pos_orders`: added `sync_retry_count INT`, `sync_error TEXT`, and `UNIQUE INDEX uniq_pos_orders_user_local_id ON (user_id, local_id) WHERE local_id IS NOT NULL` to block duplicates on retry.
- New `public.sync_offline_pos_sale(p_payload jsonb)` SECURITY DEFINER RPC:
  1. Idempotency check on `(user_id, local_id)` — returns existing order if already synced.
  2. INSERT `pos_orders` (draft, was_offline=true) + `pos_order_lines` from payload.
  3. Calls existing `complete_pos_order` to write accounting/stock/payments — same path as online sales.
  4. On RPC failure: marks `sync_status='failed'`, bumps `sync_retry_count`.

## Frontend
- `src/lib/pos-offline-db.ts`:
  - `PendingSale` now carries `items`, `payments[]`, `subtotal`, `tax_amount`, `discount_amount`, `notes`.
  - `sync_status` adds `'quarantined'`; `MAX_SYNC_RETRIES = 5`. After 5 failures the sale is quarantined (excluded from auto-retry, surfaced for manual review via `getQuarantinedSales`/`requeueSale`).
- `src/hooks/usePOSOffline.ts`:
  - `syncPendingQueue` now calls `sync_offline_pos_sale` RPC with full payload (lines + payments) instead of bare INSERT.
  - Auto-syncs on mount if pending sales exist and connection is healthy.
  - Exposes `quarantinedCount`.
  - `createOfflineSale` signature changed to single options object; generates terminal-prefixed `local_id` and `order_number` (`OFFLINE-<TERM6>-<DATE>-<TS>`) to avoid collisions across the 17 terminals.
- `src/pages/POSPage.tsx`:
  - Early offline branch at the top of `handleCompleteOrder`. If `!offlineMode.isOnline`:
    - Blocks `employee_account`, call-center, and table-based sales (need server validation).
    - Builds line + payment payload from current cart, saves via `createOfflineSale`, renders receipt (Print Bridge prints via the dialog over LAN), and clears the order tab.
    - All server-only steps (employee journal, exchange-rate update, kitchen tickets via Realtime) are skipped — they happen later via `complete_pos_order` inside the sync RPC.
- `OfflineStatusBar.tsx`: optional `quarantinedCount` badge.

## Out of scope (Phase 3 follow-ups)
- IndexedDB encryption (sales contain customer names + prices).
- `DB_VERSION` bump still pending — current schema changes are additive on the same v1 stores so existing browsers keep working.

## Phase 2.1 additions
- **Offline guard on Shift Close** (`handleCloseShift` in POSPage.tsx): refuses to close while offline, while `pendingCount > 0`, or while `quarantinedCount > 0` — prevents false cash variance from stale totals.
- **Offline guard on Returns** (`ReturnDialog.handleSubmit`): refuses when `!navigator.onLine` — refunds require server-side stock reversal + GL reverse entry.
- **Quarantine admin UI** in `SyncLogSheet.tsx`: shows quarantined sales (>= MAX_SYNC_RETRIES) with error detail, "إعادة المحاولة" (requeueSale → resets retry_count and status to 'pending'), and "حذف نهائي" (removePendingSale with confirm). Broadcasts on `pos-sync` channel after requeue so any open POS tab triggers a sync.
