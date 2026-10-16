# Project Rules

Subdirectories may have their own `AGENTS.md` (e.g. `src/components/pos/`, `src/pages/procurement/`); read it before changing files there.

- User-facing text uses only “يونيفاي”/“UNIFY”; keep legacy `amwali` identifiers only where renaming breaks storage, routes, DB objects or links.
- Session bootstrap: RPC `get_my_bootstrap()` feeds `useBootstrap` (React Query + sessionStorage + one realtime channel); all role/permission/owner/subscription hooks read from it — never add per-hook fetches for those. Why: one startup request.
- Employee hot-drink sales use the dedicated atomic RPC and `[EMPLOYEE_HOT_DRINK]` line marker; first two drinks per POS business day are half price, later ones full price, marked lines bypass stock. Why: auditable and race-safe.
- Attendance rules (Asia/Hebron, 06:00 business-day start, gap/grace/tolerance/cap defaults) live only in DB function `attendance_departure_rules()`; `recompute_attendance_day`, `hr_backfill_attendance` and the UI read from it. Why: one source of truth.
- HR attendance edits never mutate raw `attendance_events`; only RPC `hr_save_attendance_day` (overrides, break diffs, gap dismissals, recompute, audit in one transaction). Why: edits survive new punches and stay auditable.
- Camera scanning uses shared `POSBarcodeScanner` (native detector or local `public/zxing/` ponyfill); inputs normalize via `src/lib/barcode.ts`; RPCs match via `_barcode_variants()`. Why: fast offline scans.
- Barcodes are unique per tenant across products.barcode and product_barcodes (trigger enforce_unique_product_barcode); one product may have many barcodes. Why: a scan must resolve to exactly one product.
- Role checks in RLS policies and helper functions (admin, hr_manager, accountant_*) must be AND-combined with a tenant check (is_team_member / is_same_team / company owner); only super_admin may be global. Why: every company owner holds 'admin', so a bare has_role leaks data across tenants.
- Business units (multi-shop on one tenant): `business_units` + `branches.business_unit_id` + `warehouses.business_unit_id` + `product_business_units` (unlinked product = visible everywhere); active workspace per-device via `useBusinessUnits`. Why: one subscription/ledger with per-shop analytics.
- Stock count (`can_stock_count`): only `stock_count_*` RPCs; edits/new products (multi-barcode, ≤640px photo in `company-assets`) log to `product_edit_log`; counts post only on review. Why: audited.
- Inventory costing: `stock_movements` is the only cost source; trigger `tg_inventory_costing_engine` feeds `inventory_cost_*` per product×warehouse; opt-in via `initialize_inventory_costing`, method locked after activation, changed only via audited RPCs. Why: one auditable cost.
<!-- LOVABLE:BEGIN -->
- POS v2 stockout creation reuses `StockoutAlertButton` beside pending-order alerts, gated by Malaky data owner ID and cashier mode; kitchen navigation lives in More. Why: keep one alert workflow and tenant-specific presentation.
<!-- LOVABLE:END -->
- Delivery note → invoice only via RPC `convert_delivery_note_to_invoice` (draft invoice with `source_delivery_note_id`, no second stock deduction); cancelling it calls `release_delivery_note_from_invoice`. Why: the note already moved stock.
- Portal ops alerts come only from triggers calling `notify_ops_alert` (errors swallowed). Why: never block the source operation.
- SECURITY DEFINER functions taking a client owner id must guard it (team/holding member, super_admin, or no JWT). Why: they bypass RLS.
- Employee visibility RLS uses array helpers `my_chain_employee_ids()`/`my_managed_branch_employee_ids()` via `id = ANY((SELECT ...))`, identical to `is_my_team_employee`/`is_managed_branch_employee`. Why: per-row calls were 100x slower.
- Invoice numbers: `generate_invoice_number` increments `invoice_sequences` atomically; MAX only on first seed. Why: race-safe.
- Document search loads complete tenant-scoped lookup lists with stable pagination; linked-record lookups use `fetchRowsByIds` and Arabic matching uses `multiWordMatchAny`. Why: avoid silently missing contacts or old vouchers and oversized lookup URLs.
- Journal voucher edits never soft-delete posted lines: RPC `reverse_voucher_transactions` mirrors them on their original date, then new lines post. Why: audit trail.
- Unified invoice creation keeps returns in `returns`/`return_items` via `save_return_command_v1`; managed documents use the same RPC for edits and cancellation, independent of tenant pilot flags. Why: never mix invoice posting with returns or bypass managed-write guards.
