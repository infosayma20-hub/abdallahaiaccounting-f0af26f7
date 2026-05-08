# P6 — Autonomous Audit & Continuous Integrity Monitoring

Status: **Engine delivered (read-only, no UI yet).** No accounting writers, RPCs, schemas or migrations were touched.

## 1. Engine

File: `src/lib/audit/integrity-engine.ts`
Entry points:
- `runAuditEngine(uid, opts)` — full sweep, returns `AuditReport`.
- `runScheduledAudit(uid, days=30)` — sane defaults, console-logged, suitable for a periodic call from any admin/debug surface.

No UI page added. Output goes through the developer console (`console.groupCollapsed → console.table`) and the returned object.

## 2. Issue object

```ts
interface AuditIssue {
  code: string;                  // e.g. "INV_QTY_DRIFT"
  category: AuditCategory;       // 10 families
  severity: "info" | "warning" | "critical";
  entity_type: string;           // table / domain noun
  entity_id: string | null;      // null for aggregate checks
  description: string;           // arabic-first
  expected: number | string | null;
  actual: number | string | null;
  suggested_action: string;      // narrative; never auto-applied
}
```

Severity model: pure-numeric checks use `severityFromDiff(diff, tol)` —
`< tol` ⇒ pass, `< 100×tol` ⇒ `warning`, otherwise `critical`. Categorical
checks (orphans, duplicates, missing links) use a fixed severity per code.

## 3. Implemented checks

| Code | Category | Severity (default) | Detection |
|------|----------|--------------------|-----------|
| `TB_UNBALANCED` | trial_balance | dynamic | Σ debit postings ≠ Σ credit postings (system-level) |
| `TX_ORPHAN_MISSING_ACCOUNT` | orphan_transaction | critical | tx with empty `debit_account_code` or `credit_account_code` |
| `TX_SAME_ACCOUNT` | orphan_transaction | warning | both legs reference same account |
| `TX_ZERO_AMOUNT` | orphan_transaction | info | `amount = 0` |
| `INV_MISSING_TX_LINK` | missing_link | critical | non-void sale/purchase invoice without `transaction_id` |
| `INV_QTY_DRIFT` | inventory | dynamic | `products.quantity` ≠ Σ signed stock_movements per product |
| `INV_NEGATIVE_QTY` | negative_inventory | warning | live `products.quantity < 0` (excludes services) |
| `STOCK_DUPLICATE_MOVEMENT` | duplicate_movement | warning | same product+type+ref+qty appearing twice |
| `SALE_MISSING_COGS` | missing_cost_posting | warning | active sale invoice with `transaction_id` but no `5100` debit referencing it |
| `VAT_OUTPUT_DRIFT` | vat_drift | dynamic | GL `2190` credit ≠ Σ `tax_ledger.tax_amount` (output) |
| `VAT_INPUT_DRIFT` | vat_drift | dynamic | GL `1190` debit ≠ Σ `tax_ledger.tax_amount` (input) |
| `AR_SUBLEDGER_DRIFT` | ar_ap | dynamic | GL `1130` net ≠ Σ contact-tagged `1130` movements |
| `AP_SUBLEDGER_DRIFT` | ar_ap | dynamic | GL `2110` net ≠ Σ contact-tagged `2110` movements |
| `INV_VALUATION_DRIFT` | inventory | dynamic | live Σ `qty × buy_price` ≠ GL `1140` (debit nature) |

Totals returned: `{ checks: 10, pass, info, warning, critical }`.

## 4. Tenant / branch / date scope

- **Tenant:** `uid` (DataOwnerId) is required; the engine never crosses tenants.
- **Date:** `opts.from` and `opts.to` filter the **transactions** scan only. Inventory and link checks are intrinsically point-in-time (live snapshot).
- **Branch:** `opts.branchId` is reserved on the `AuditOptions` type but **not yet applied** — most writers do not stamp branch on `transactions`. Tracked under known blind spots.
- **Pagination:** `transactions` are paged in 1000-row chunks to bypass the Supabase default cap. `stock_movements` duplicate scan capped at 5000 most-recent rows for performance.

## 5. Known blind spots

1. **Branch attribution** — `transactions` lacks a normalized branch column for many writers; branch-scoped audit is a no-op until the writer-side gap closes.
2. **Fiscal-period awareness** — engine does not consult `fiscal_periods` / locks; reported drift may include closed periods that cannot be remediated through normal flows.
3. **Cost basis assumption** — `INV_VALUATION_DRIFT` uses `products.buy_price` (current), not historical weighted-average. Discrepancy with FIFO/WAC writers is expected.
4. **Duplicate movements** — only checks the most recent 5000 rows; long-history tenants need a chunked sweep.
5. **Hardcoded GL codes** — `1130`, `1140`, `1190`, `2110`, `2190`, `5100`, `4xxx` are hardcoded (mirror of `integrity-report.ts`). Tenants that remap base accounts will produce false drift.
6. **Missing-link check** — looks for `invoices.transaction_id`; any other source documents (vouchers, returns, payroll) bypass this signal.
7. **VAT input** — only triggers when at least one side has activity; tenants with zero input VAT are silently skipped (intentional).

## 6. High-risk modules

| Module | Why it is risky | Likely audit codes |
|--------|------------------|--------------------|
| Purchase invoice writer | **WB-1** — does not stamp `reference_type='invoice'` on `stock_movements`; F7 COGS report blind. | `SALE_MISSING_COGS`, `INV_QTY_DRIFT` |
| Adjustment writer | **WB-2** — unsigned quantity falls through to `+1` in sign helper. | `INV_QTY_DRIFT`, `INV_VALUATION_DRIFT` |
| Opening-balances importer | Residual ~−103 net diff on 7/231 SKUs (QA tenant `6fb346d9`). | `INV_QTY_DRIFT` |
| POS multi-currency returns | Cross-currency rounding can produce `TX_ZERO_AMOUNT` and small AR drift. | `TX_ZERO_AMOUNT`, `AR_SUBLEDGER_DRIFT` |
| Tax-inclusive invoice mode | Subtotal/discount split can produce `VAT_*_DRIFT` if the writer changes mid-stream. | `VAT_OUTPUT_DRIFT` |
| Cheque collection (1125 → 1120) | Manual two-step trigger absent; orphans can appear during interim state. | `TX_SAME_ACCOUNT`, `AR_SUBLEDGER_DRIFT` |

## 7. Modules still relying on legacy patterns

(non-exhaustive; cross-references P3 hardcoded-fallback audit and P2 writer-side gaps doc)

- **Hardcoded GL accounts:** `InvoiceCreatePage`, `VoucherFormPage`, `POSPage`, `executive-kpis.ts`, `integrity-report.ts`, `integrity-engine.ts`. Should consult `account_mappings` once that table is populated per tenant.
- **Unsigned inventory logic:** adjustment + transfer movements (WB-2). Engine flags resulting drift but cannot pinpoint the writer.
- **Missing transaction links:** purchase invoice writer (WB-1), some legacy voucher flows.
- **Missing idempotency:** historical tx rows pre-dating `idempotency_key`. Engine does not flag this directly today (candidate for `TX_NO_IDEMPOTENCY` in next round).
- **Fallback accounting assumptions:** several POS code paths default to `1110` cash when payment_method is null; not detectable until payment-method audit code is added.

## 8. Future auto-repair candidates

Strictly future — not in scope for P6.

| Issue code | Auto-repair feasibility | Constraint |
|-----------|------------------------|------------|
| `INV_QTY_DRIFT` | Medium | Requires signed adjustment writer (WB-2 fix) before a safe "propose `opening` adjustment" job can run. |
| `INV_NEGATIVE_QTY` | Low | Needs human review; auto-fix would mask data loss. |
| `STOCK_DUPLICATE_MOVEMENT` | Medium | Could soft-delete the newer of two if they share `reference_id`; needs idempotency key on writer first. |
| `INV_MISSING_TX_LINK` | High after WB-1 | Re-run posting RPC for orphan invoices in dry-run mode. |
| `VAT_*_DRIFT` | Low | Requires per-invoice VAT recalculation; risky without fiscal-period guard. |
| `AR/AP_SUBLEDGER_DRIFT` | Low | Usually a writer bug; auto-tagging contact_id retroactively is risky. |

Any future auto-repair must:
1. Run dry-run first and emit a proposal stream of candidate writes.
2. Respect `fiscal_periods` locks.
3. Use `create_reverse_entry()` rather than mutation when undoing.
4. Be feature-flagged per tenant.

## 9. Performance considerations

| Concern | Today | Mitigation |
|---------|-------|------------|
| Transaction scan | Paged 1000 rows; full table on tenants > 100k rows can take several seconds. | Add `transaction_date` window for routine scheduled runs (`runScheduledAudit` defaults to 30 days). |
| Stock-movements scan | Full table for drift check, last-5000 for duplicates. | Push drift aggregation into a SQL view or RPC when tenants exceed ~50k movements. |
| Tax ledger | Sums in JS; small tables — fine. | None required. |
| Parallelism | `Promise.all` over independent checks. | Avoid running concurrent audit calls per tenant — use a per-tenant lock if surfaced via cron. |
| Memory | All issues kept in-memory; bounded by data drift. | Cap issue list at e.g. 1000 per category if surfaced to UI. |

## 10. Files changed

- `src/lib/audit/integrity-engine.ts` — new (engine + types).
- `src/lib/reports/executive-kpis.ts` — fixed wrong column names (`account_code/debit/credit` → `debit_account_code/credit_account_code/amount`) discovered during P6 schema review. Read-only loader; no behaviour change for accounting.
- `docs/audit/p6-integrity-monitoring.md` — this document.

No UI pages, no RPCs, no schema changes, no migrations. Typecheck clean.

**Stop point:** awaiting approval before remediation phase.