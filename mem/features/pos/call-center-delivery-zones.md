---
name: Call Center Delivery Zones
description: نظام مناطق التوصيل للكول سنتر — منتقي المدينة/المنطقة/الفرع الأرخص، حفظ delivery_fee/delivery_info، حقن سطر التوصيل عند الكاش، صفحة إدارة /pos/delivery-zones
type: feature
---

## Data
- `delivery_zones` table: `(user_id, city, area_name, branch_id, branch_name, price, is_active)` with UNIQUE(user_id, city, area_name, branch_id). Idempotent upsert on that key. 741 zones seeded for Nablus (سفيان/فيصل) and Ramallah (الطيرة/بلازا مول).
- `call_center_orders` extended with `delivery_fee numeric` and `delivery_info jsonb` ({city, area, branch_id, branch_name, original_fee, final_fee, manually_adjusted, caller_name, caller_phone, note}).
- `finish_editing_call_center_order` RPC accepts optional `p_delivery_fee` and `p_delivery_info`.

## UI Flow
- `DeliveryZonePicker` (src/components/pos/DeliveryZonePicker.tsx): City chips → area search → auto-pick cheapest branch; on tie shows "اختيار يدوي"; editable final fee (`manually_adjusted` flag).
- `CallCenterDispatchDialog`: zone picker auto-binds `selectedBranch` to picked branch (locked in edit mode); summary shows separate "🚚 توصيل" line + final total; `order_note` is auto-generated from `buildOrderNote(...)` and used for display/print only.
- `PendingOrdersPanel`: shows delivery fee line in cashier summary.
- POSPage `onAcceptOrder`: injects a synthetic cart line `"🚚 توصيل - <area>"` with the fee so totals/print/invoice flow naturally; the edit-in-cart path does NOT inject (avoids double counting) — instead loads `delivery_info` back into the dialog via `editingDeliveryInfo`/`editingDeliveryFee`.

## Admin
- `/pos/delivery-zones` (DeliveryZonesPage): search by city/area/branch, edit price/name, add zone, toggle is_active (soft disable instead of delete to preserve historical data).

## Rules
- Never compute totals only from `order_note`; the truth is `delivery_fee` + `delivery_info`.
- Never delete a zone if it's historically used — disable it.
- Avoid double counting: items[] never contains the delivery line; the cashier-side injection happens once at `onAcceptOrder`.