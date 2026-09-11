# Finance Integrity Map

## 1. Current accounting model

The main ledger is `transactions`: each row carries debit and credit account codes plus one amount. Source documents link by identifiers, references, and idempotency keys. `vouchers`, invoices, POS, payroll, assets, manufacturing, and special Sparta flows can create ledger effects through different functions or client sequences.

Controls already present include fiscal-period guards, postable-account validation, deterministic idempotency keys, source links, reversals, document allocators, cancellation cascades, and soft deletion. These controls are unevenly reached by all writers.

## 2. Posting map

| Source | Principal path | Accounting effects | Key concern |
|---|---|---|---|
| Manual journal | `useSaveJournalVoucher` or atomic journal RPC | paired `transactions`, voucher link | legacy manual rollback and client validation |
| Sale/purchase invoice | invoice create/edit paths and invoice RPCs | AR/AP/cash, revenue/purchase, VAT, COGS | create and edit paths differ; server recomputation must be certified |
| Receipt/payment | direct legacy path or `*_with_entry` RPC | cash/bank/cheque vs customer/supplier/expense | safest existing atomic family; allocations add complexity |
| POS close/sale | `complete_pos_order` | tender, VAT, revenue, discount, COGS, meal subsidy | large function, but deterministic `POS-ORDER-*` keys and paid-state replay guard exist |
| Payroll | payroll batch/employee RPCs | salary expense, employee liability/payment | overloaded signatures and batch partial-failure risk |
| Assets | depreciation/disposal/revaluation writers | asset, accumulated depreciation, gain/loss | source lifecycle and reversal tests incomplete |
| Manufacturing | release/completion functions | inventory consumption/output and manufacturing accounts | inventory and GL must reconcile as one command |
| Sparta | separate `sparta_*` tables/RPCs | parallel ledger/report family | intentional bounded workspace, but semantic duplication |

## 3. Findings

### FI-01 — Multi-step invoice edit can partially post — **P0**

- **Evidence:** `InvoiceCreatePage.tsx:1757-2332` directly mutates contacts, invoice items, transactions, products, tax ledger, and related vouchers.
- **Impact:** document total, AR/AP, VAT, inventory, and GL may disagree after a mid-flight failure or concurrent edit.
- **Future:** one `UpdateInvoiceCommandV1` database transaction; recompute trusted totals from server-validated lines; reverse and recreate effects.
- **Safe migration:** shadow calculation only → reconciliation report → test company flag → pilot document type. Roll back by disabling flag; never auto-repair history.

### FI-02 — Client is trusted for financial calculations in some paths — **P0 design risk**

- **Evidence:** invoice subtotal/discount/VAT/rounding logic in `InvoiceCreatePage.tsx:981-1272`; values are sent to server writers. The exact current body of every invoice overload must be contract-tested before asserting which values are recomputed.
- **Impact:** a client defect or stale client can post internally inconsistent totals.
- **Future:** browser calculates previews; server calculates authoritative totals using a versioned tax/rounding policy.
- **Safe migration:** compare client/server calculations without changing posts; reject only after measured parity and tenant pilot.

### FI-03 — Ledger source linkage is heterogeneous — **P1**

- **Evidence:** `linked_transaction_id`, references, transaction IDs, and deterministic keys coexist. Historical audit `docs/audit/posting-integrity-report.md:7-44` found posted invoices without ledger rows and deliberately avoided automatic repair.
- **Impact:** orphan detection and reversal are source-specific; reports can miss documents.
- **Future:** mandatory `(source_type, source_id, posting_version, effect_type)` identity for new engine postings, backed by uniqueness.
- **Safe migration:** additive columns/indexes on new records; compatibility view maps legacy references. No historical rewrite until dry-run reconciliation.

### FI-04 — Hard-coded account semantics are widespread — **P1**

- **Evidence:** `src/lib/audit/integrity-engine.ts:87-97` embeds AR `1130`, AP `2110`, inventory `1140`, COGS `5100`, VAT `2190/1190`; `useSaveJournalVoucher.ts:86-92` embeds clearing `1199`. Migrations contain many equivalent constants.
- **Impact:** tenant chart variants or future localization can produce wrong postings/reports.
- **Future:** versioned system account roles resolved under tenant context, with no posting to parent accounts.
- **Safe migration:** resolve role and compare with current code; fail closed only for flagged pilot commands. Keep legacy fallback until each tenant is configured.

### FI-05 — Public RPC surface is broad — **P1**

- **Evidence:** live catalog reports 135 PUBLIC execute grants and 624 SECURITY DEFINER functions. Only four current definer functions lack a configured search path (`enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`); earlier migration snapshots suggesting broader exposure are superseded.
- **Impact:** callable privileged business functions need explicit authorization contracts and regression tests.
- **Future:** command functions revoke PUBLIC by default and grant only intended roles; each validates actor/tenant/action internally.
- **Safe migration:** catalog and test one RPC family at a time; do not bulk revoke privileges.

### FI-06 — Function overloads create contract ambiguity — **P2**

- **Evidence:** live overloads include payroll payment/batch, invoice-with-entry, journal atomic, mixed voucher, reverse entry, and account search functions.
- **Impact:** generated clients and callers can bind the wrong generation or retain obsolete behavior.
- **Future:** versioned command names/schemas; old signatures remain adapters until callers are migrated.

## 4. Accounting invariants

Every future posting command must enforce and test:

1. debit equals credit;
2. every account exists, belongs to the tenant, and is postable/leaf;
3. fiscal period is open;
4. source/version/effect is unique;
5. posted documents have complete ledger effects;
6. cancellation creates auditable reversal, not destructive mutation;
7. currency amount × rate reconciles to base amount under documented rounding;
8. VAT ledger and GL reconcile;
9. AR/AP control accounts reconcile to supported subledger definitions;
10. inventory value and COGS reconcile to the certified costing method.

## 5. Do not change yet

Do not bulk repair orphan links, replace account codes, remove overloads, consolidate Sparta, change costing, or rewrite cancellation triggers. First create read-only reconciliation by source and accounting period, obtain accountant approval, then pilot one command.
