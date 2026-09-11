# Database Write Map

**Rule:** this map describes current writers; it does not authorize consolidation or removal.

## 1. Write-channel taxonomy

| Channel | Transaction boundary | Authorization boundary | Typical risk |
|---|---|---|---|
| Direct browser CRUD | One HTTP statement per call | JWT + RLS | multi-step partial completion |
| Browser RPC | One PostgreSQL transaction per function call | execute grant + function checks/RLS | safest current command shape when correctly guarded |
| Edge Function CRUD | Function request, then one or many DB calls | custom auth; often service role | RLS bypass and manual tenancy |
| Trigger | same transaction as initiating statement | invoker/definer semantics | hidden side effects/order coupling |
| Offline replay | local durable queue then RPC | local identity + server validation | duplicates, conflicts, stale master data |
| Cron/background | scheduled SQL or HTTP call | database/job secret/function auth | retry and observability gaps |

## 2. Major entity write matrix

| Entity / command | UI/direct writes | RPC / server writer | Other writers | Atomicity / idempotency assessment |
|---|---|---|---|---|
| Sales invoice | `InvoiceCreatePage.tsx` create/edit; invoice list actions; representative flows | `create_sale_invoice_atomic`, `create_invoice_with_entry`, rep-post/cancel functions | invoice-item stock trigger, cancellation triggers, imports | Create has atomic options; edit still contains multi-call legacy orchestration. Mixed contract. |
| Purchase invoice | Same canonical `invoices` table with `invoice_type='purchase'`; legacy `purchase_invoices` remains | invoice RPC variants | item/stock triggers | Canonical and legacy paths coexist; traceability gaps documented in `docs/tech-debt/p2-writer-side-gaps.md`. |
| Journal entry | `useSaveJournalVoucher.ts` legacy insert sequence | journal atomic/multi-party RPCs behind `vouchers_use_rpc` | numbering and fiscal guards | Stable idempotency keys exist, but legacy path uses manual rollback and fail-soft prechecks. |
| Receipt | voucher form direct path | `create_receipt_with_entry`, `create_basic_voucher_atomic` | allocation and self-heal logic | Best candidate for command-envelope pilot because atomic RPC and feature flag already exist. |
| Payment | voucher form direct path | `create_payment_with_entry`, mixed voucher RPC | cheque/allocation/cascade logic | Similar to receipts; higher cheque/payment-method surface. |
| Stock movement | some direct writes and product quantity writes | `adjust_product_stock`, invoice/POS/transfer functions | invoice item and quantity-sync triggers | Multiple conventions; reference/idempotency quality differs by source. |
| Stock adjustment | adjustment UI | `adjust_product_stock` | quantity sync trigger | Atomic per call; business idempotency not inherent. |
| Transfer | transfer UI | `confirm_stock_transfer` | inserts paired movements | Needs concurrency certification; no assumption of safety from UI status checks. |
| POS transaction | large `POSPage.tsx` orchestration | `complete_pos_order`, `sync_offline_pos_sale`, manager adjustment functions | stock/accounting triggers, tracking/KDS | Strong deterministic order IDs and unique `(user_id,local_id)` constraint; failure-state recovery still needs tests. |
| Payroll | HR/payroll pages | `_payroll_post_payment`, `payroll_pay_employee`, `payroll_pay_batch` overloads | payroll triggers/financial movement writers | Unique employee/period constraint exists; overloaded APIs and per-employee processing increase migration risk. |
| Production | manufacturing pages/hooks | release/cancel/complete production functions | stock and journal effects | Must be certified as a single lifecycle before any engine migration. |
| Fixed asset transaction | asset pages | depreciation/disposal/revaluation helpers | asset journals/triggers | Separate lifecycle writers; requires source-to-GL invariant coverage. |

## 3. Confirmed high-risk write paths

### WM-01 — Invoice edit is a browser-managed transaction — **P0 design risk**

- **Current:** `InvoiceCreatePage.tsx:1757-2332` updates contact balance, replaces items, mutates transactions, changes product quantities, creates payment/receipt artifacts, writes tax ledger, and attempts cleanup in separate requests.
- **Risk:** network/auth/RLS failure between calls can leave a partially applied business document.
- **Impact:** incorrect customer balance, stock, VAT, or GL after editing.
- **Target:** `UpdateInvoiceCommandV1` calling one server transaction that validates line totals, regenerates effects, and records source/version/idempotency.
- **Migration:** add shadow validation and a company-scoped flag; do not alter current edit behavior until parity tests pass. Rollback is flag OFF.

### WM-02 — Journal legacy path relies on client orchestration — **P1**

- **Current:** `useSaveJournalVoucher.ts:8-16` documents header → lines → transactions → link plus manual rollback. Fiscal lock and duplicate prechecks fail soft (`:292-301`, `:348-381`).
- **Existing mitigation:** feature-flagged RPC adapter in `voucher-rpc.ts:1-17`; stable transaction idempotency keys.
- **Target:** server command is authoritative; client validation remains UX only.
- **Migration/rollback:** existing `vouchers_use_rpc`, tenant pilot, invariant comparison, flag OFF.

### WM-03 — Direct quantity writers coexist with stock ledger — **P1**

- **Current:** product quantity is a cached balance, while `stock_movements` is the auditable ledger. Direct product updates still exist in invoice and other UI paths.
- **Live signal:** a read-only reconciliation found 344 products differing by at least 0.01 from signed stock movement sums. This is a signal, not permission to backfill; legacy signs/opening balances require classification first.
- **Target:** every inventory command appends/reverses canonical movement rows; caches derive transactionally.
- **Migration:** certify one source type at a time; compare old/new effects without dual-posting.

### WM-04 — Edge service-role writers — **P1**

- **Current:** many Edge Functions create service-role clients, bypassing RLS. `database-command/index.ts:22,242+` writes AI-selected changes after custom authentication and filtering.
- **Risk:** a missed tenant predicate becomes a privileged cross-tenant path.
- **Target:** Edge Functions call scoped business commands, never arbitrary tables.
- **Migration:** inventory each function's auth and write set; replace table writes incrementally; no global permission change.

## 4. Existing controls to preserve

- Unique `(user_id, local_id)` for offline POS orders.
- Partial unique index for POS stock movement references.
- Zero duplicate active `transactions.idempotency_key` groups in the read-only live check.
- `create_reverse_entry()` and soft-delete/reversal conventions.
- `allocate_*number` functions and advisory-lock-based numbering.
- Feature flags defaulting to the legacy path on missing/error.

## 5. Required registry artifact

Before migrating any entity, create a machine-readable writer registry with: entity, action, caller, function/table, actor source, tenant derivation, transaction boundary, idempotency key, side effects, reversal path, feature flag, and tests. The documentation above is the human baseline; it is not yet enforcement.
