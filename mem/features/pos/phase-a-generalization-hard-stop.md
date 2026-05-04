---
name: POS Phase A Generalization Hard Stop
description: pos_mode + pos_call_center_enabled in company_settings, pos_printers.settings.image_mode, pos-sync channel rename with malaky-sync legacy listener
type: feature
---

# POS Phase A — Generalization Hard Stop (May 2026)

Goal: make POS safe for non-restaurant tenants without changing Malaky's behavior.

## Schema additions (no data writes)
- `company_settings.pos_mode text NOT NULL DEFAULT 'restaurant'` — `restaurant|retail|service`.
- `company_settings.pos_call_center_enabled boolean NOT NULL DEFAULT false`.
- `pos_printers.settings jsonb NOT NULL DEFAULT '{}'` — recognized key `image_mode = 'unified_kitchen'`.

## Frontend
- New hook `src/hooks/usePosMode.ts` resolves owner's `company_settings`, returns `{ posMode, restaurantFeatures, callCenterEnabled }`.
  - Legacy fallback: if Malaky email and no DB value → callCenterEnabled = true.
- `src/pages/POSPage.tsx`:
  - Replaced `user?.email === 'malakybroast@gmail.com'` with `callCenterEnabled` (Call Center cash box).
  - Order-type pills hide `dine_in` when `!restaurantFeatures`.
  - Send-to-kitchen button (`F9 طباعة`) hidden when `!restaurantFeatures`.
  - Table picker dropdown hidden when `!restaurantFeatures`.
- `src/lib/image-print-service.ts`:
  - `shouldUseUnifiedKitchenPrinter` now async; checks active `pos_printers` for the device branch where `settings->>'image_mode' = 'unified_kitchen'`. Falls back to legacy Plaza branch ID + name match for back-compat.
- `src/lib/crossTabSync.ts`:
  - Channel renamed `malaky-sync` → `pos-sync`. Writes mirror to legacy channel; listener subscribes to BOTH so old open tabs keep working.

## What was NOT touched (locked by Phase A scope)
- `pos_inventory_movements` / `stock_movements` / accounting / shift close.
- Payment / cancel / return flows.
- POSPage refactor (still 6,154 lines).
- pos_categories vs categories duplication.
- pos_audit_log vs pos_audit_logs duplication.

These belong to Phase B (Schema Convergence) and Phase C (Refactor).
