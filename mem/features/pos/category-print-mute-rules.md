---
name: POS Category Print Mute Rules
description: Matrix-based per-branch, per-category, per-station mute control for kitchen tickets. Customer receipt is unaffected.
type: feature
---

## Table: `pos_category_print_rules`
Columns: `user_id`, `branch_id` (NULL = all branches), `category_id` (pos_categories), `station_id` (kitchen_stations).

Presence of a row = MUTED for that (branch, category, station). No row = print as usual.

RLS: owner via `auth.uid() = user_id`. Unique index on `(user_id, COALESCE(branch_id,'00000000…'), category_id, station_id)`.

## Enforcement points
- `src/pages/POSPage.tsx` payment flow (kitchenJobs builder) and `handleSendToKitchen`. Both:
  1. Select `pos_category_id` alongside `kitchen_station_id`.
  2. Call `loadMuteChecker(getDeviceBranchId())` once.
  3. Filter station targets by `!isMuted(categoryId, stationId)` BEFORE pushing to `stationItems`.
- Empty station groups are auto-dropped by existing `.filter(j => j.items.length > 0)` — no bridge changes needed.

## UI
- `src/components/settings/CategoryPrintRulesMatrix.tsx` — matrix toggle (rows: pos_categories, cols: stations).
- Mounted in `src/components/settings/POSSettingsSection.tsx` under accordion `category-print-rules`.
- Branch selector includes "كل الفروع" (NULL scope). When viewing a specific branch, a global NULL rule is shown locked with hint "مكتوم من كل الفروع".
- After save, `invalidatePrintMuteRulesCache()` broadcasts via `BroadcastChannel("malaky-sync")` event `pos_category_print_rules:changed`.

## Invariants
- Customer receipt path is never touched. Mute only narrows kitchen ticket targets.
- Default behaviour (no rules) preserves the pre-existing broadcast/unassigned logic.
- Works with Ramallah Plaza unified_kitchen because mute runs BEFORE `shouldUseUnifiedKitchenPrinter` merging in `image-print-service.ts`.