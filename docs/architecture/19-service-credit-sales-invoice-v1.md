# Stage 3D-1 — Service Credit Sales Invoice V1

Date: 2026-09-12 · Status: **NOT READY FOR INTERNAL PILOT — blocked** (see §Blocker)
Everything is additive and inactive: all three flags are absent/OFF for all 18 companies, no screen is wired, no invoice/command/event was created.

---

## 1. Slice

CREATE only, for a sales invoice that is simultaneously:
- `invoice_type = sale`
- credit / deferred (`payment_mode = 'credit'`, `paid_amount = 0`, no `cash_account_code`)
- every line is service or non-product (`products.product_type = 'service'` or `product_id IS NULL`)
- no allocations, no auto receipt, no order/delivery-note/workshop/warehouse linkage
- no bonus quantities, no draft, source `manual`/`web`
- customer exists inside the tenant

Anything else returns `status = 'unsupported'` with a reason and `route = 'legacy'` — nothing is written.

### Excluded (unchanged legacy)
EDIT/UPDATE, cancel/void/delete, purchase invoices, credit/debit notes, returns, cash invoices and their auto vouchers, allocations, stock-managed lines, POS, offline queue, sales-rep/van paths, recurring-invoice and AI Edge Functions, imports, public API, historical data.

---

## 2. Legacy path modeled (authority: live code + live schema)

`InvoiceCreatePage.handleCreate` for this exact case does:
`invoices.insert` (triggers 10→60: van warehouse, warehouse scope, rep guard, numbering, feature perm, tax ledger) → `invoice_items.insert` (stock trigger is a documented no-op for service lines) → `transactions.insert` Dr **1130** / Cr **4100**, `transaction_type='sale_credit'`, `reference = invoice_number`, `idempotency_key = 'INV-<invoice_id>'` → `invoices.update linked_transaction_id` → `contacts.current_balance += remaining_amount` → `invoice_activity_log`.
Header fields: `paid_amount=0`, `remaining_amount=total`, `payment_status='unpaid'`, `payment_method='آجل'`, `status='sent'`, `source='manual'`.
FX convention (differs from receipts): `transactions.amount = total × rate` (ILS base), `foreign_amount = total`, `exchange_rate = rate`.

---

## 3. Trusted totals

`compute_service_invoice_totals_v1(owner, payload)` reproduces the current UI maths exactly:
`vat_enabled` from `company_settings`; per line `base = qty × price`, discount percent/amount, inclusive mode extracts tax as `after − after/(1+rate)`, exclusive adds `after × rate`; `subtotal = gross` (or `base_total − tax` when inclusive); invoice-level discount applied on the taxed total, clamped to `[0, base_total]`; `total = base_total − invoice_discount`. Results rounded to 4 decimals.

Verified example (owner = internal test company, VAT on, exclusive):
lines `3×100 −10%` and `1×250`, invoice discount 50 → subtotal 550, items discount 30, invoice discount 50, tax 83.2, total 553.2 — identical to the browser formula.

The client may only *declare* totals; `shadow_compare_service_invoice_v1` rejects the command when any declared figure differs by more than 0.005.

---

## 4. Accounting

`build_invoice_posting_intent_v1` → PostingIntentV1 (`source_type='finance.sales_invoice.command'`, `effect_type='sales_invoice.gl'`), roles `ACCOUNTS_RECEIVABLE` / `SALES_REVENUE`, codes 1130 / 4100 (legacy parity), fiscal-period lock check, tenant-ownership check, `_fc_validate_postable_account` on both codes, `amount = base_amount` (debit = credit).
`post_service_credit_sales_invoice_v1` writes header + lines + one GL row + contact cache + activity log + one immutable `posting_intents_v1` row in a single PostgreSQL transaction and is idempotent on `(owner, source_type, source_id, effect_type, posting_version)`.

---

## 5. Contact balance

Ledger effect = the AR transaction (authoritative).
`contacts.current_balance += total` is kept **only** as a compatibility/cache effect so existing screens show what they show today; it is written inside the same transaction and is explicitly NOT a source of truth. No historical repair.

---

## 6. VAT

No tax rule invented. `tax_amount` is computed as above and stored on the header; the certified trigger `fn_invoice_tax_ledger` continues to own `tax_ledger` (one row per invoice, deleted on draft/cancel). The browser's own unchecked `tax_ledger` insert is not reproduced. No FX-specific VAT treatment is added (matching today).

---

## 7. Numbering & idempotency

Numbering untouched — `trg_40_invoice_number` allocates the number during the same insert. Command-level idempotency is provided by `business_commands (resolved_owner_id, command_type, idempotency_key)`: a replay returns the original result without a second invoice, and the posting intent uniqueness gives a second guard. Retries and double submits therefore yield one invoice, one number, one GL row, one event.

---

## 8. Atomicity

Header, lines, GL, contact compatibility effect, tax-ledger trigger effect, audit row and outbox event all commit or roll back together — a single server round trip, no browser-managed cleanup.

---

## 9. Domain event

`finance.sales_invoice.created.v1` via `emit_domain_event_v1`, same transaction, dedupe key `finance.create_service_credit_sales_invoice.v1:<idempotency_key>`, payload limited to ids, currency, line count and an amount bucket. Emitted only when `events.invoice_service_credit_v1` is ON. No external delivery.

---

## 10. Security

All new functions are `SECURITY DEFINER` with `search_path = public` except the pure comparator (INVOKER, fixed search_path).
Privileges: only `create_service_credit_sales_invoice_command_v1` is granted to `authenticated`; eligibility, totals, intent, comparator and writer are `service_role` only; `PUBLIC`/`anon` revoked on all five, and `anon` revoked on the command.
Identity is never client-supplied: actor/owner/company/branch come from `resolve_command_context_v1`; permissions re-checked with `accountant_perm('can_create_sale_invoice')` and `user_can_access(actor,'invoices')`; customer, products and accounts are validated to belong to the resolved tenant; foreign company/branch ids are rejected by the context resolver.

---

## 11. Feature flags

`commands.invoice_service_credit_v1`, `posting.invoice_service_credit_v1`, `events.invoice_service_credit_v1` — all absent/OFF for all 18 companies (verified). With the command flag OFF the function returns `unsupported/legacy` before touching anything. With command ON but posting OFF it runs shadow-only and writes nothing financial.

---

## 12. BLOCKER — why this is NOT READY

The certified posting rule (`_fc_validate_postable_account`) forbids posting to a parent account. The legacy invoice path posts **directly to 1130 and 4100**. Live check: **41 of 107 tenants have sub-accounts under 1130** and **40 under 4100** — including the approved internal test company. For those tenants:
- legacy keeps posting to the parent (today's behaviour), and
- the V1 engine refuses the posting.

So "exact GL parity" and "postable leaf accounts" cannot both hold. Per the stage stop conditions this is reported, not silently resolved. Three possible decisions, all needing explicit approval:
1. **Parity first** — allow the invoice intent to post to 1130/4100 exactly as legacy does, documenting the exception.
2. **Correctness first** — resolve customer/revenue sub-accounts (`resolve_postable_account`, as `create_invoice_with_entry` already does under flag `invoices_use_rpc`). This changes the GL accounts versus today ⇒ not parity, needs accountant sign-off.
3. **Narrow the slice** — eligible only for tenants whose 1130 and 4100 are leaf accounts; the internal test company then cannot be used for certification.

Because of this, no live pilot invoice was created and no reversal fixture was needed.

---

## 13. Tests executed so far

- eligibility: eligible payload accepted; rejection reasons implemented for cash, allocations, auto receipt, linked documents, draft, stock-managed product, out-of-tenant product/customer, zero/negative quantity, bonus quantity, missing description.
- trusted totals: exact match with the browser formula on a two-line discounted taxed invoice (see §3).
- flags/state: 0 companies enabled, 0 commands, 0 posting intents, 0 events.
- Not executed (blocked by §12): live GL parity, FX parity, contact balance parity, concurrency/idempotency against real invoices, failure-rollback proof, internal pilot.

---

## 14. Rollback

Disable the three flags (they are already off). Every eligible invoice then returns to the legacy screen path immediately. No V1 financial effect exists to remove; if any is created later it must be reversed, never hard-deleted.

---

## 15. Known limitations

Parent-account divergence (§12); no EDIT/cancel in V1; allocations and cash invoices excluded; `contacts.current_balance` remains a cache; frontend still owns costing and bonus logic for other paths; numbering scope stays owner+type+year.
