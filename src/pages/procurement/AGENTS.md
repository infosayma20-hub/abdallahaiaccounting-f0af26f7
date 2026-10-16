# Procurement & Receiving Rules

- Barcode goods receiving writes only via SECURITY DEFINER RPCs (`receiving_*`, `assign_receiving_session`) on `procurement_receiving_*`; stock/GL stay in the purchase-invoice flow. Why: workers never see prices.
- Purchase order lines reference `procurement_items`; stock goes to `procurement_items.inventory_product_id` via `ensure_procurement_item_product`, and invoice lines carry `procurement_order_item_id` for cumulative received qty. Why: order item ids are not product ids (FK failed silently before).
- Warehouse receiving is a standalone employee workspace: entry requires an active receiver flag or an assigned session, and back returns only to the workspace chooser. Why: keep warehouse staff out of the admin ERP shell.
- Purchase-order edits go only through RPC `update_procurement_order` (gate: `procurement_order_edit_block_reason`); it keeps line ids, forbids qty below invoiced or deleting received lines, logs before/after in `procurement_order_edits`. Why: keep links and audit.
- Direct receiving (no PO): `employees.can_direct_receive` users act only via `direct_receiving_*` RPCs on `procurement_orders` (`source='direct_receiving'`); submit creates a receiving session so the invoice flow posts stock/GL; temp lines linked via `direct_receiving_link_temp_line`. Why: finance stays in one audited path.
