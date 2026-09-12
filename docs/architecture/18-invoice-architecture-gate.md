# Stage 3D-GATE — Invoice Architecture Certification (READ-ONLY)

Date: 2026-09-12 · Mode: discovery/design only · No migration, no schema change, no flag, no data change.
Prerequisite: Manual Journal V1 = READY FOR INTERNAL PILOT (Stage 3C).

**GATE RESULT: NOT READY to start Invoice V1 pilot as a whole.**
A narrow first slice is defined in §15 and can be prepared once the P0 items in §14 are accepted as *documented* boundaries (not fixed) — see "Conditional entry" at the end.

---

## 1. Invoice types discovered

Source of truth is a single table `public.invoices` discriminated by `invoice_type` (live counts 2026-09-12):

| type | rows | cancelled | FX rows | posted w/o GL link |
|---|---|---|---|---|
| `sale` | 2179 | 56 | 3 | 27 |
| `purchase` | 1603 | 37 | 0 | 3 |
| `debit_note` | 22 | 2 | 0 | 1 |
| `credit_note` | 9 | 1 | 0 | 1 |

`generate_invoice_number()` also recognises `sales`, `sales_return`, `purchase_return` prefixes (SR/PR) that have no live rows.

Parallel/adjacent document families (separate tables, NOT `invoices`):
- `purchase_invoices` — legacy procurement module, 3 rows, abandoned since 2026-03 (see `docs/audit/purchase-vs-sales-invoices-2026-09-11.md`).
- `pos_orders` + `pos_order_items` — POS sales, own writers, own GL (`auto_journal_pos_meal`).
- `sparta_*` invoice family — separate tenant vertical with its own `sparta_post_invoice`, `sparta_next_invoice_number`, own balance triggers.
- `returns` (`return_type_enum: sales|purchase`), `delivery_notes` (`convert_delivery_note_to_invoice`), `call_center_orders`, `orders`.

Per-type behaviour differences (evidence-based):

| capability | sale | purchase | credit_note | debit_note |
|---|---|---|---|---|
| create UI | `InvoiceCreatePage` | `InvoiceCreatePage` (`?type=purchase`) | `CreditDebitNoteCreatePage` | same |
| edit | full re-write in place | full re-write in place | full re-write in place | same |
| cancel/reverse | `status='cancelled'` → `trg_90_invoice_cancel_cascade` | same | same | same |
| GL | Dr 1130 / Cr 4100 | Dr 5110 / Cr 2110 | reversed sign, separate tx build | reversed sign |
| inventory | `trg_invoice_item_stock_sync` (صادر) | same (وارد) | no stock effect | no stock effect |
| VAT | `fn_invoice_tax_ledger` output | input | follows `invoice_type<>'sale'` → **input** (suspect) | input |
| allocations | via receipt vouchers / `payment_invoice_links` | via payment vouchers | manual | manual |

---

## 2. Invoice writer registry

Machine-readable: `docs/architecture/invoice-writer-registry.json`.

Summary by class:

- **AUTHORITATIVE (server, transactional)**: `create_sale_invoice_atomic` (offline queue), `generate_invoice_number` + `invoice_sequences`, `sync_invoice_item_stock` → `stock_movements`, `tg_sync_product_qty_from_stock_movement`, `tg_maintain_product_warehouse_balance`, `fn_invoice_tax_ledger`, `cascade_invoice_cancel_to_transactions`, `reverse_invoice_stock`, `sync_cash_invoice_voucher`, `allocate_voucher_to_invoices_atomic`, `apply_rep_invoice_edit`, `rep_invoice_post_now`, `rep_cancel_owned_invoice`, `void_rep_sale_atomic`, `convert_delivery_note_to_invoice`, `recalc_invoice_payment_status`, `create_invoice_with_entry` (flag `invoices_use_rpc`, default OFF).
- **LEGACY (browser-driven multi-request writers, non-atomic)**: `InvoiceCreatePage.handleCreate` (create + edit), `InvoicesPage` (quick create / status flip / cancel / delete), `CreditDebitNoteCreatePage` + `CreditDebitNotesPage`, `ConvertToInvoiceModal`, `RecordReceiptModal`, `WorkshopCostModal`, `ReturnCreatePage`, `RepOrdersPage`/`SalesRepOrdersPage` hard deletes, `VoucherFormPage`/`FinanceReceiptsPage`/`FinancePaymentsPage`/`BulkVoucherPage` paid/remaining updates.
- **DERIVED / CACHE**: `products.quantity` (written both by trigger chain *and* by the browser), `product_warehouse_balances`, `contacts.current_balance`, `invoices.paid_amount/remaining_amount/payment_status`, `tax_ledger`, `invoice_activity_log`, warranty cards.
- **UNKNOWN / uncontrolled**: `process-transaction` Edge Function (AI accountant) inserts invoices with service role bypassing UI rules; `process-recurring-invoices` Edge Function; `malaki-data`; direct browser `tax_ledger` insert in `InvoiceCreatePage` (appears to be a no-op — see §7); `sparta_*` family.

---

## 3. CREATE flow (manual sales/purchase, the dominant path)

`InvoiceCreatePage.handleCreate`, online mode, ~12 sequential client→server round-trips:

1. contact lookup/upsert (client)
2. `invoices.insert` (server: triggers 10→60, number allocated, tax ledger written)
3. `invoice_items.insert` (server: stock trigger → `stock_movements` → product qty + warehouse balance)
4. per-product `products.update` of `quantity`/`buy_price` (client) — **second, independent quantity write**
5. GL: either `create_invoice_with_entry` RPC (flag OFF today) or direct `transactions.insert`
6. `invoices.update linked_transaction_id`
7. `contacts.current_balance` read-modify-write (client)
8. cash invoices: `create_receipt_with_entry` / `create_payment_with_entry` + `receipt_vouchers`/`vouchers` insert + `transactions.update reference`
9. `tax_ledger.insert` (client, unchecked)
10. `invoice_activity_log.insert`
11. optional `workshops.update`, `orders.update`

Atomic: only steps inside a single statement + its triggers (2, 3, 5-RPC, 8-RPC).
Retry-safe: 5 and 8 (idempotency keys `INV-<id>`, `INV-VOUCHER-<id>`), 2 (duplicate-number retry).
NOT retry-safe: 4, 7, 9 (read-modify-write / unconditional insert).
Partial-failure boundaries: every step 3→11. The catch block performs a best-effort compensation (delete items, soft-delete tx, mark invoice cancelled) which itself is multi-request and can fail.

Offline: queued as `create_sale_invoice_atomic` (single server RPC) — structurally the cleanest existing create path.

---

## 4. EDIT flow — forensic

Edit is *destructive re-write*, not versioned:

1. `invoices.update` full payload (number preserved from ref; draft→sent promotion).
2. `invoice_items.delete` by invoice_id → stock trigger DELETE branch removes movements → product qty and warehouse balances move.
3. `invoice_items.insert` new rows → stock trigger re-creates movements → qty moves again.
4. GL: finds linked tx by `linked_transaction_id`, else by idempotency key, else by `reference` — then **UPDATE in place** (mutates a posted journal entry; no reversal, no new entry).
5. `contacts.current_balance` adjusted by computed delta (client arithmetic, snapshot-based).
6. `products.quantity` adjusted by a *second* client-computed delta on top of the trigger effect of steps 2-3.
7. `sync_cash_invoice_voucher` RPC (atomic inside) for the cash voucher.
8. `invoice_activity_log`.

Failure windows leaving partial state: after 1 (header totals ≠ items), after 2 (items and their stock gone), after 3 (stock double-applied by step 6), after 4 (GL ≠ document), after 5 (contact cache skewed), after 7 (voucher ≠ invoice). No compensation path exists in edit mode (rollback block only runs for `!isEditMode`).

Known collisions:
- **P0 — double inventory accounting**: `trg_invoice_item_stock_sync` (+`tg_sync_product_qty`) and the client `products.update` both move `products.quantity`. Ownership of on-hand quantity is ambiguous.
- **P0 — in-place mutation of a posted journal entry** on edit, contradicting the project rule "delete & recreate / reverse, never mutate".
- **P0 — `contacts.current_balance` is a client-maintained cache** derived from client snapshots.
- Editing cannot be made atomic in the current shape.

---

## 5. Accounting model

| case | debit | credit |
|---|---|---|
| credit sale | 1130 AR (or tenant sub-account via RPC) | 4100 revenue |
| cash sale (voucher flow, current default) | 1130 AR, then receipt voucher Dr cash-box / Cr 1130 | 4100 |
| cash sale (legacy override, edit path) | `cash_account_code` | 4100 |
| credit purchase | 5110 purchases | 2110 AP |
| cash purchase (voucher flow) | 5110 | 2110, then payment voucher Dr 2110 / Cr cash |
| credit/debit note | mirrored codes built in `CreditDebitNoteCreatePage` | |

Observations: VAT is **not** a separate GL line — the journal posts the gross total only; VAT lives in `tax_ledger` plus `fn_invoice_tax_ledger`. Discounts are netted into line totals, no discount account. Rounding is client-side (`toFixed(4)` on line profit only). FX stores `amount` in ILS, `foreign_amount`, `exchange_rate` — same shape as certified Receipt/Payment V1.

Reusable by Posting Engine V1 today: the single balanced AR/Revenue or Purchases/AP effect for one-line-per-document invoices. NOT reusable yet: VAT split, per-line cost-center/workshop dimensions, cash-leg vouchers (they already go through certified Receipt/Payment V1 minus allocations).

---

## 6. Inventory dependency classification

- **A. No inventory effect**: credit notes, debit notes, service-only invoices (`products.product_type='service'` lines are explicitly skipped by `sync_invoice_item_stock`), invoices with no `product_id` on any line, invoices sourced from a delivery note (`source_delivery_note_id` → trigger skips).
- **B. Inventory effect, wrappable**: none with confidence, because of the duplicate quantity writer in §4.
- **C. Must wait for Inventory Engine V1**: every sale/purchase invoice with stocked product lines, all returns, cancellation stock reversal (`reverse_invoice_stock`), warehouse relocation (`trg_80`), costing (`buy_price` refresh, `cost_price`/`line_profit` computed in the browser).

---

## 7. VAT / tax

- Mode: `tax_inclusive` boolean per invoice; per-line `tax_rate`; totals summed in the browser and stored in `tax_amount`.
- Server: `fn_invoice_tax_ledger` (AFTER INSERT OR UPDATE OF tax_amount, status) deletes and re-inserts the ledger row; deletes it on `draft`/`cancelled`. Rate falls back to `tax_settings.tax_rate`, else 16.
- `credit_note`/`debit_note` are classified as **input** VAT because the function tests only `invoice_type = 'sale'` — flagged, not fixed.
- `InvoiceCreatePage` also inserts into `tax_ledger` from the browser with no error check; live data shows **0 invoices with more than one tax row** (204 rows total), i.e. that client insert appears to be silently failing/blocked. Uncontrolled and unverified — treat as a writer to remove, not to trust.
- Frontend is trusted for: taxable base, inclusive/exclusive maths, per-line rate, discount-before-tax ordering, rounding. No FX-specific VAT handling exists.

---

## 8. Customer / supplier balances

Three coexisting sources:
1. Ledger-derived (`transactions` under 1130/2110 + sub-accounts) — used by the account statement and receivables reports.
2. `contacts.current_balance` — a cache written directly by the browser (355 contacts non-zero) on invoice create/edit only for `sales`; purchases never adjust it.
3. Per-invoice settlement fields `paid_amount/remaining_amount/payment_status`, written by vouchers, `recalc_invoice_payment_status`, and the cancel cascade.

No trigger maintains (2). No historical repair performed here.

---

## 9. Payments + allocations

- Receipt/payment vouchers link through `payment_invoice_links` and `allocate_voucher_to_invoices_atomic` (SECURITY DEFINER, atomic).
- Cash invoices auto-create a voucher **with an allocation** (`allocations: [{invoice_id, amount}]`).
- Allocation behaviour is **NOT certified** in Receipt V1 / Payment V1 (documented exclusion in Stage 3A/3B).
- Consequence: any Invoice V1 slice that includes cash invoices inherits the uncertified allocation path. The first slice must therefore exclude cash invoices, or keep their voucher leg on legacy.

---

## 10. Foreign currency

`currency` + `exchange_rate` on the header; `transactions.amount` holds the ILS base, `foreign_amount` the document currency amount, `exchange_rate` the rate — identical to the certified Receipt/Payment FX model, so FX is reusable. Gaps: no FX handling in `tax_ledger` (net/tax stored in document currency), `buy_price` refresh is skipped for non-ILS purchases, and edit recomputes the rate from the form with no revaluation entry. Live FX invoices: 3 (all sales).

---

## 11. Numbering + idempotency

- `trg_40_invoice_number` → `generate_invoice_number()`: prefix from `company_settings` (sales/purchase only), year from `invoice_date`, offset from `companies.invoice_number_offset`, MAX-scan + `invoice_sequences` upsert + collision loop.
- Uniqueness enforced by `idx_invoices_unique_number_per_user_type (user_id, invoice_type, invoice_number)`.
- Scope is **per owner + type + year**, not per company/branch.
- Concurrency: sequence row upsert + retry loop; the client retries once on duplicate-number errors.
- Idempotency for GL: `idempotency_key = 'INV-<invoice_id>'` and `'INV-VOUCHER-<invoice_id>'`. There is **no command-level idempotency for the document itself** — a retried create yields a second invoice with a new number.
- No edit versioning: no `version`, no revision snapshot other than `build_invoice_snapshot` (used elsewhere) and `invoice_activity_log`.

---

## 12. Security findings

- RLS present on `invoices`/`invoice_items`; insert additionally gated by `user_can_access('invoices')` and `accountant_perm('can_create_sale_invoice'|'can_create_purchase_invoice')`; rep-scoped policies bind `user_id = get_rep_owner_id()` and `warehouse_id = get_rep_warehouse_id()`.
- Isolation is **owner-scoped (`user_id`)**, not company/branch scoped. `company_id`/`branch_id` are not part of the invoice write policy surface.
- `DELETE` on invoices is allowed to the owner from the browser, and two rep screens hard-delete invoices + items.
- Most invoice functions are `SECURITY DEFINER` (see registry `secdef` flags); `guard_invoice_stock_movement_line` and `guard_rep_invoice_must_be_posted` are INVOKER guards.
- Edge Functions `process-transaction` and `process-recurring-invoices` write invoices with the service role, bypassing UI-level validation.
- Cross-tenant reference validation (account code / product / warehouse belonging to the same owner) is enforced only partially, via `enforce_user_warehouse_scope` and the postable-account guard on the RPC path (flag OFF).

---

## 13. POS / offline dependencies

- POS uses `pos_orders`, not `invoices`; shared surfaces are products/stock movements and cash-box GL. OUT OF SCOPE.
- Offline queue (`queueOfflineDocument` → `create_sale_invoice_atomic`) is a real second create path for sales invoices and must keep working unchanged.
- Other consumers: orders → `ConvertToInvoiceModal`, delivery notes → `convert_delivery_note_to_invoice`, rep/van sales, recurring invoices Edge Function, AI accountant Edge Function, `malaki-data`/public statement readers, warranty card creation.

---

## 14. Invoice V1 invariants (future certification checklist)

1. line total = qty × price − discount, recomputed server-side.
2. document totals = Σ lines + tax − header discount, server-trusted.
3. debit = credit on every posted effect.
4. VAT: base + rate + amount consistent with lines; ledger row count per invoice = 1.
5. AR/AP effect equals document net effect; no client-maintained contact cache.
6. inventory: exactly one owner of `products.quantity` and of `stock_movements` per invoice line.
7. tenant isolation: owner + company + branch on every referenced account/product/warehouse/contact.
8. fiscal lock respected at post time.
9. postable (leaf) accounts only.
10. numbering unique per (owner, type, year) and never reused.
11. command idempotency: same `idempotency_key` ⇒ same invoice, no duplicate.
12. atomicity: one PostgreSQL transaction per command.
13. reversal by documented reverse entry, never in-place mutation.
14. edit integrity: version increment + immutable posting intent per version.

---

## 15. FIRST SAFE SLICE (recommendation — one only)

**`CreateInvoiceCommandV1` restricted to: credit (non-cash) SERVICE-ONLY sales invoices, CREATE only.**

Definition of the slice (all conditions must hold, else the command refuses and the UI stays on legacy):
- `invoice_type = 'sale'`
- every line has `product_id IS NULL` or `products.product_type = 'service'` ⇒ zero stock effect (§6-A, enforced by the existing trigger's own rule)
- `invoiceKind = 'credit'` ⇒ no auto voucher, no allocation (§9)
- no `source_delivery_note_id`, no `order_id`, no workshop conversion
- ILS or FX allowed (FX model already certified)
- CREATE only — EDIT, cancel, returns, notes all remain legacy

Rationale: lowest blast radius, no inventory writer conflict, no uncertified allocation, single balanced AR/Revenue effect reusable by Posting Engine V1, existing VAT trigger untouched, reversal available through the certified reverse-entry path.

### Must remain LEGACY after the slice
Edit (all types), cancel/void cascade, credit & debit notes, returns, purchase invoices, cash invoices and their auto vouchers, any invoice with stocked lines, delivery-note conversion, order conversion, rep/van invoices, recurring-invoice Edge Function, AI accountant Edge Function, POS, Sparta family, `purchase_invoices`, `contacts.current_balance` cache, `products.quantity` client writes, allocations, warranty cards, tax_ledger trigger.

---

## 16. Target design (design only — NOT implemented)

### CreateInvoiceCommandV1
```
finance.create_invoice.v1
payload: { invoice_type, contact_id|contact_name, invoice_date, currency, exchange_rate,
           lines:[{description, product_id?, qty, unit_price, discount, discount_type, tax_rate}],
           notes, payment_terms, idempotency_key }
```
Server pipeline, one PostgreSQL transaction:
1. `resolve_command_context_v1` (actor, owner, company, branch, source, device)
2. policy: `user_can_access('invoices')` + `accountant_perm('can_create_sale_invoice')`
3. slice guard: service-only / credit-only / no order / no delivery note → else `SLICE_NOT_SUPPORTED`
4. trusted totals recomputed server-side from lines; client totals compared and rejected on mismatch
5. `build_invoice_posting_intent_v1` → PostingIntentV1 (Dr AR role, Cr revenue role, leaf + fiscal-lock validated)
6. insert `invoices` + `invoice_items` (existing triggers keep numbering and VAT ledger)
7. `post_invoice_v1` → `transactions` + `posting_intents_v1`, linked back to the invoice
8. audit row in `business_commands`; idempotent replay returns the original invoice
9. `emit_domain_event_v1('finance.invoice.created.v1')` behind `events.invoice_v1`
Flags: `commands.invoice_v1`, `posting.invoice_v1`, `posting.invoice_v1_shadow`, `events.invoice_v1` — all default OFF.

### UpdateInvoiceCommandV1 (separate, later, NOT in the first slice)
```
finance.update_invoice.v1
payload: { invoice_id, expected_version, ...same line shape..., reason }
```
Required semantics before it can be built: optimistic `expected_version`, immutable revision snapshot, GL handled by reverse + repost (never UPDATE in place), single owner for inventory effects, server-recomputed balances with no client cache write, and a compensation-free single transaction. Migrating CREATE and EDIT together is explicitly rejected.

---

## 17. Note on the Manual Journal legacy difference

Stage 3C recorded a movement-type difference between the direct-save and RPC journal paths. No invoice path was found to depend on it: invoice GL rows use `transaction_type` values `sale_credit`/`purchase_credit`/`sale_cash`/`purchase_cash`, not the manual-journal types. Documented only; not touched.

---

## 18. Risks

**P0**
- Dual ownership of `products.quantity` (trigger chain + browser) on create and edit.
- Edit mutates a posted journal entry in place; no reversal, no versioning.
- Edit has no rollback path; at least six partial-failure windows.
- `contacts.current_balance` is a browser-maintained cache with no server reconciliation.
- Allocation path (auto voucher on cash invoices) is uncertified in the new architecture.

**P1**
- Browser is trusted for all totals, VAT base and rounding.
- Unverified browser `tax_ledger` insert (silently ineffective today).
- `credit_note`/`debit_note` classified as input VAT.
- Numbering is owner+type+year scoped, with no company/branch dimension; no document-level idempotency.
- Hard deletes of invoices/items from two rep screens and an owner DELETE policy.
- 12 posted invoices have no `linked_transaction_id` (documented, not repaired).

**P2**
- Multiple service-role Edge Function writers outside the UI rule set.
- `purchase_invoices` legacy table still reachable.
- Costing (`buy_price`, `cost_price`, `line_profit`) computed client-side.

---

## Gate decision

**NOT READY** for a general Invoice V1 pilot (P0 items: inventory ownership ambiguity, unsafe edit semantics, uncontrolled cache writers, uncertified allocation dependency).

**Conditional entry**: the slice in §15 is admissible as a *pilot-scoped* Invoice CREATE command because it is defined precisely to avoid every P0 item. It requires explicit approval before any code, migration or flag is created.
