# Inventory Integrity Map

## 1. Current source-of-truth model

The intended auditable source is `stock_movements`; `products.quantity` is a cached aggregate, and warehouse-specific balances also exist. Live `stock_movements` contains owner, warehouse, quantity, movement type, reference, and unit cost. Core stock tables do not consistently carry company or branch directly; ownership and warehouse/related document links supply context.

`stock_movement_signed_qty()` defines a canonical sign helper, but reports and historical functions also contain inline sign conventions. `recalc_product_quantity()` is a repair/re-derivation mechanism. Invoice items, POS completion, transfers, adjustments, returns, delivery notes, production, and opening balances can generate movements.

## 2. Writer map

| Source | Writer/control | Reference/idempotency | Integrity note |
|---|---|---|---|
| Invoice items | `sync_invoice_item_stock` trigger family | unique invoice-line reference in live indexes | strongest current single-writer shape for invoice lines |
| POS | `_pos_sync_stock_movements` | partial unique source-reference index | replay resistant |
| Manual adjustment | `adjust_product_stock` | each invocation is a new business event | requires explicit request id for retry-safe APIs |
| Transfer | `confirm_stock_transfer` | status-based lifecycle | concurrency/idempotency needs a dedicated test |
| Opening quantity | product/opening triggers | implicit trigger interaction | ordering/compensation risk |
| Production | release/complete production functions | source-specific | quantity and GL effects must be one invariant set |
| Legacy helper | `decrement_stock_safe` | direct cached quantity update | dormant in repository search, but callable surface must be classified |

## 3. Findings

### II-01 — Ledger/cache divergence exists — **P0 data-integrity signal**

- **Evidence:** live read-only comparison found 344 products with `abs(products.quantity - signed stock movement sum) >= 0.01`; `docs/tech-debt/p2-writer-side-gaps.md:75-98` records prior drift causes.
- **Interpretation:** not all rows are necessarily wrong; legacy opening balances and sign conventions require classification. It is not safe to overwrite either side.
- **Impact:** availability, valuation, reorder, and audit reports can disagree.
- **Future:** append-only canonical movements with transactionally derived product/warehouse snapshots.
- **Safe migration:** read-only reconciliation by tenant/product/source era; classify cause; propose adjustments; accountant/inventory approval; reversible movement, never direct rewrite.

### II-02 — Direct cached quantity mutation remains reachable — **P0 design risk**

- **Evidence:** `InvoiceCreatePage.tsx:1950,2065` updates products directly; legacy `decrement_stock_safe` updates quantity without a movement and has no repository callers.
- **Impact:** a stale client or future reuse can bypass the audit ledger.
- **Future:** cached quantity writable only by inventory engine internals.
- **Safe migration:** first instrument and deny only on a pilot source; do not drop old function or revoke access globally in this phase.

### II-03 — Transfer double-execution needs certification — **P1**

- **Evidence:** reviewed `confirm_stock_transfer` historically used state checking without the same source uniqueness convention as POS. Live index inventory shows no transfer-specific unique stock reference.
- **Impact:** concurrent confirmation could duplicate outgoing/incoming movement pairs.
- **Future:** lock transfer row, deterministic movement identities, terminal state update in one transaction.
- **Safe migration:** concurrency test against an isolated test transfer; then additive unique identity and flagged V2 function.

### II-04 — Movement update semantics are unsafe — **P1**

- **Evidence:** quantity synchronization logic historically handles insert/delete; in-place edits can bypass delta correction. The accounting rule already favors reversal over mutation.
- **Impact:** movement ledger and cache drift after administrative corrections.
- **Future:** posted movements immutable; corrections append reversal + replacement.
- **Safe migration:** audit actual UPDATE callers; block only after all correction paths are converted and tested.

### II-05 — Costing method is not one explicit engine — **P1**

- **Evidence:** unit cost can originate from product buy price, POS line snapshot, invoice/production-specific calculations. `docs/tech-debt/p2-writer-side-gaps.md:102-123` explicitly blocks per-product COGS until writer/cost-basis questions are resolved.
- **Impact:** inventory valuation and GL COGS can drift even when quantities reconcile.
- **Future:** versioned costing policy (current snapshot/WAC/FIFO decision), cost layers where required, and source-to-GL reconciliation.
- **Safe migration:** document current outcome per source first; no retroactive recosting in ordinary refactoring.

## 4. Canonical future movement

Every new inventory command should emit immutable movement records carrying tenant, branch, warehouse, product, signed quantity, unit/base cost, source type/id/line, command id, posting version, occurred/effective timestamps, actor, and reversal link. Cached balances update in the same transaction.

## 5. Reconciliation suite

- Product cached quantity = signed movement sum.
- Warehouse balance sum = product balance where warehouse tracking applies.
- Every posted stock-affecting source line has exactly one active movement effect.
- Transfer outgoing quantity/cost equals incoming quantity/cost.
- Sale return reverses original quantity and cost basis.
- Production consumption/output matches bill/run and GL.
- Inventory valuation by certified method = inventory GL within tolerance.
