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

## Note duplication guard (v2)
`order_note` is auto-composed by `buildOrderNote(...)` from delivery_info + base note. When a dispatched order is re-opened (cashier `onAcceptOrder` or call-center `onEditInCart`), the orderNote field MUST be set from `extractBaseNote(order.order_note)` (in `src/lib/order-note-utils.ts`) — NOT from the raw composed string — otherwise the delivery prefix gets prepended again on every save (was visible as 3× duplicated delivery blocks). Display surfaces (`DispatchedOrdersLog`, `PendingOrdersPanel`) also render via `extractBaseNote` to keep the UI clean even for legacy rows.

## Reports separation (v2)
`pos_orders.delivery_fee numeric default 0` mirrors the dispatch-time fee on the cashier-side invoice. Customer-facing `total` still INCLUDES delivery (so cash collection stays accurate), but every "restaurant sales" KPI in `usePOSReportsData` subtracts `delivery_fee`:
- `restaurant_sales = total − delivery_fee` (per order)
- `delivery_collected = delivery_fee`
- `customer_total = total`
`pos_order_lines` never contain a delivery line, so item/product/profit reports stay clean automatically. `DispatchedOrdersLog` card shows the explicit split (سعر الطلبية / رسوم التوصيل / الإجمالي للتحصيل).