---
name: Wheels Delivery Integration
description: ربط Amwali بنظام Wheels — 4 فروع (سفيان/فيصل/بلازا/الطيرة)، استخراج الفرع من session→terminal، تحليل المنطقة من customer_address
type: feature
---

## Branches → wheels_branch_config (4 rows)
- سفيان `ff450748` → `47777651-...` (WHEELS_API_KEY_NABLUS)
- فيصل `6296a204` → `8FDF0281-...` (WHEELS_API_KEY_NABLUS)
- رام الله بلازا مول `f82642e1` → `f4e7335b-...` (WHEELS_API_KEY_RAMALLAH)
- رام الله (الطيرة) `15af6bae` → `aa0b991a-...` (WHEELS_API_KEY_RAMALLAH)

## Branch resolution (edge function send-to-wheels)
Canonical path: `pos_orders.session_id → pos_sessions.terminal_id → pos_terminals.branch_id`.
`warehouses.branch_id` is the fallback only — warehouses rarely have branch_id set on this tenant.

## Area resolution
`pos_orders.area_name` is usually NULL on real orders. The function extracts the area from
`customer_address` by splitting on " - " and taking the last segment (e.g. "نابلس - شارع يافا" → "شارع يافا").
If the address has no dash, the full string is used. Lookup is exact-match first on
`delivery_zones(branch_id, area_name)` then case-insensitive ILIKE fallback.

## Tireh zones
الطيرة branch shares Ramallah's 153 Wheels-mapped areas; they are mirrored from Plaza Mall
into `delivery_zones` (branch_id = 15af6bae...) with the same `wheels_area_id` and `wheels_fixed_price`.