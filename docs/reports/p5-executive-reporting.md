# P5 — Executive Reporting & Drilldown Intelligence

Status: **Phase 1 delivered (read-only).** No accounting writers, RPCs, schema or migrations were touched.

## 1. Implemented drilldowns

| From | To | Mechanism | File |
|------|----|-----------|------|
| Trial Balance row | Account Statement (`/account-statement?code=...`) | Existing button (kept) | `src/pages/TrialBalancePage.tsx` |
| P&L line | Modal showing journal transactions | Existing modal (kept) | `src/pages/ProfitLoss.tsx` |
| Inventory Reconciliation row | Product Card filtered by product name | New `onRowClick` on `SortableReportTable` | `src/pages/reports/GenericReportPage.tsx` |
| Stock Movement row | Product Card filtered by product | New `onRowClick` | `src/pages/reports/GenericReportPage.tsx` |
| VAT periodic totals | Tax ledger detail (existing tab) | Already wired in `TaxPeriodicReport` | `src/components/tax/TaxPeriodicReport.tsx` |

New shared capability: `SortableReportTable` now accepts an optional `onRowClick(row, i)` prop. When provided, rows are visibly clickable (`cursor-pointer`) without changing default styling for read-only tables.

## 2. Executive KPI bar

Component: `src/components/reports/ExecutiveKPIBar.tsx`
Loader:    `src/lib/reports/executive-kpis.ts`
Embedded on: `src/pages/ReportsPage.tsx` (top of reports landing).

### KPI definitions

| KPI | Formula | Source |
|-----|---------|--------|
| الإيرادات (Revenue) | Σ credits − Σ debits on accounts starting `4` within range | `transactions` (is_deleted=false) |
| الربح الإجمالي (Gross Profit) | Revenue − COGS (5100) | `transactions` |
| صافي الربح (Net Profit) | Revenue − all `5*` net | `transactions` |
| قيمة المخزون (Inventory Value) | Σ max(qty,0) × buy_price (live) | `products` |
| الذمم المدينة (AR) | Net debit on `1130` (live) | `transactions` |
| الذمم الدائنة (AP) | Net credit on `2110` (live) | `transactions` |
| ضريبة مستحقة (VAT Payable) | Net credit on `2190` (live) | `transactions` |
| السيولة (Cash Position) | Net debit on `1110` + `1120` (live) | `transactions` |

Hardcoded base codes mirror the conventions used in `integrity-report.ts`. Multi-tenant remap support is tracked in tech-debt (P3 hardcoded-fallback audit).

## 3. Anomaly rules

File: `src/lib/reports/anomaly-rules.ts` — pure read-only helpers, no DB.

| Code | Trigger | Default tolerance |
|------|---------|-------------------|
| `negative_margin` | revenue > 0 AND profit < 0 | exact |
| `inventory_mismatch` | \|live_qty − derived_qty\| ≥ ε | 0.001 |
| `unbalanced_account` | balance flat but movement non-symmetric | 0.01 |
| `tax_variance` | \|declared − ledger\| > ε | 0.50 |
| `inactive_with_stock` | qty > 0 AND last movement older than N days | 180 d |
| `abnormal_balance` | sign opposite to expected nature | exact |

Helpers expose a `summarizeAnomalies(hits)` reducer for badges and dashboards. UI integration of these flags into individual reports is intentionally deferred to P5 Round 2.

## 4. Report metadata bar

Component: `src/components/reports/ReportMetadataBar.tsx`
Embedded on: `GenericReportPage` (footer of every dynamic report card).

Shows: `generated_at`, current user email, applied date filter, applied source filter (when relevant), and a data-source note. Print-friendly styling included (white background, black border).

## 5. Export readiness

Existing per-page Excel/PDF exports preserved. Print mode improvements:

- KPI bar uses `print:grid-cols-4` for compact print.
- Metadata bar uses `print:bg-white print:border-t print:border-black/30`.
- RTL preserved via `dir="rtl"` on every new component.

No new export pipeline. No new dependencies.

## 6. Performance notes

| Loader | Hot path | Notes |
|--------|----------|-------|
| `loadExecutiveKPIs` | Single `transactions` scan + `products` scan per render | Caching candidate; currently re-runs on KPI bar mount. Acceptable on landing page. |
| `loadInventoryReconciliation` | Full `products` × `stock_movements` scan in JS | Slow on > 50k movement rows. Future: push to DB function. |
| `loadProductCard` | `stock_movements` scan filtered in JS | Filter pushed to DB on `product_id` would be cheaper. |
| `runIntegrityChecks` (P3) | Fans out to 4 tables | Dev/console only; not on hot path. |

Duplicate calculation candidates (revenue, AR, AP) appear across `executive-kpis`, `integrity-report` and `accounting_center_snapshot` RPC. Future consolidation behind a single typed snapshot loader is recommended (kept out of P5).

## 7. Remaining limitations

1. KPI bar uses **lifetime** balances for AR/AP/Cash/VAT. A date-bounded variant is wired in the loader but not exposed in the UI yet.
2. Anomaly helpers exist but are not yet rendered as badges per row (deferred to P5 R2).
3. P&L drilldown modal lists transactions but does not yet deep-link to the original source document (invoice / voucher).
4. Branch scope filter not yet plumbed through KPI bar (single-branch tenants unaffected).
5. Hardcoded GL codes (`4`, `5100`, `1130`, `2110`, `2190`, `1110`, `1120`) — see P3 tech-debt for the full audit.
6. Inventory drift KPIs depend on writer-side fixes WB-1 and WB-2 (`docs/tech-debt/p2-writer-side-gaps.md`).

## 8. Future BI recommendations

- Materialise a `mv_executive_snapshot` view refreshed every 5 minutes, then have `ExecutiveKPIBar` read from it.
- Push drilldown filters as URL state (already done for product card) so dashboards can be deep-linked from email/Slack.
- Add a server-side anomaly digest table written nightly so the inbox surface can show "12 customers with abnormal balance" without re-running queries.
- When Phase 6 starts, layer forecasting on top of the same canonical KPIs (do **not** introduce a parallel revenue computation).

## 9. Files changed

- `src/components/reports/SortableReportTable.tsx` — added `onRowClick` prop.
- `src/components/reports/ReportMetadataBar.tsx` — new.
- `src/components/reports/ExecutiveKPIBar.tsx` — new.
- `src/lib/reports/executive-kpis.ts` — new.
- `src/lib/reports/anomaly-rules.ts` — new.
- `src/pages/reports/GenericReportPage.tsx` — drilldown wiring + metadata bar.
- `src/pages/ReportsPage.tsx` — embed Executive KPI bar.

No accounting writers, no schema, no RPCs, no migrations changed. Typecheck clean.