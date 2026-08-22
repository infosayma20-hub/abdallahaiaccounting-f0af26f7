---
name: Bellona order↔procurement link gate
description: manual_ref + item supplier picker + sales→purchase order features are gated to the Bellona tenant only via src/config/orderProcurementLink.ts
type: constraint
---
The manual order reference (orders.manual_ref), per-item SupplierPicker, and "إنشاء طلبيات شراء" button are **Bellona-exclusive**. Owner id: `1042ca69-b091-4dc4-8722-34b326fdc9cb` (company "Bellona").

**Why:** The owner explicitly required these changes never appear for other tenants (2026-08-22).

**How to apply:** Any new UI surface for this feature set must be wrapped with `isOrderProcurementLinkEnabled(dataOwnerId || user?.id)` from `src/config/orderProcurementLink.ts`. Never render them unconditionally. Display-only paths may rely on `manual_ref` being NULL for other tenants.

Suppliers for the picker come from `pos_suppliers` (tenant directory, RLS `is_team_member` scoped — do NOT filter by auth uid). Bellona's مورد contacts were backfilled into `pos_suppliers` (26 rows). Quick-add from the order form inserts with the data-owner id, not auth uid.
