# WB-1 / WB-2 — Writer-side Stock Movement Gaps (Plan Only)

Status: NOT IMPLEMENTED — plan only, awaiting explicit approval.

## Affected reports
- #29 Stock Movement, #33 Inventory Reconciliation, #34 Product Card, future per-product COGS.

## WB-1 — Purchase invoice → stock_movements linkage gap
- Symptom: stock_movements rows from purchase invoice posting do not consistently carry reference_type/reference_id pointing back to invoices.id. Drilldown unreliable.
- Tables/functions: public.stock_movements (reference_type, reference_id, reference_note); purchase invoice posting trigger/RPC.
- Operational risk: Medium (totals correct; drilldown/audit degraded).
- Recommended fix:
  1. Backfill migration matching orphan purchase movements to invoices via created_at + product_id + quantity.
  2. Update purchase posting writer to always populate both fields.
  3. Add deferred integrity trigger on new rows where movement_type='purchase'.
- Risk class: Production (audit/drilldown).

## WB-2 — Adjustment / movement sign inconsistency
- Symptom: adjustment and transfer movement_types store signed delta on some tenants and absolute value on others. stockMoveSign() falls back to +1 for unknown types, masking shrinkage.
- Tables/functions: public.stock_movements; adjustment writer (UI + RPC); legacy import scripts.
- Operational risk: High for inventory accuracy on tenants with manual adjustments.
- Recommended fix:
  1. Standardise: quantity always positive; sign derived fully from movement_type. Add explicit direction column (in/out).
  2. Backfill: re-sign legacy adjustments via linked source documents; flag the rest.
  3. Update adjustment writer + import path to enforce the new contract.
- Risk class: Production (real inventory drift).

## Source-document drilldown
- Blocked by WB-1. Stock Movement / Product Card already row-click to Product Card; true source-doc drilldown depends on WB-1.

## Migrations / RPC patches required?
- Yes — both require a migration (backfill + schema tightening) and writer-side RPC/trigger changes. Out of scope for the current read-only remediation phase.

## Residual opening-balance drift
- Product Card opening balance = Σ stock_movements before dateFrom. Any historical row missing (WB-1) or mis-signed (WB-2) drifts every subsequent opening balance. Fixing WB-2 fixes the drift.
