## Sales & Purchase Reports — Audit & Fix Plan (read-only)

Scope: 18 reports (10 sales + 8 purchases) under `src/lib/reports/*` rendered via `src/pages/reports/GenericReportPage.tsx`. No code modified.

---

### 1. Cross-cutting findings (apply to many reports)

| # | Finding | Affected | Severity |
|---|---|---|---|
| C1 | **`returns` column bug** — `loadTotalSales` (line 218) and `loadTotalPurchases` (line 511) `.select("return_date, total, status")` but the column is `total_amount`. Returns aggregate is **always 0** silently, identical to the Customer Profitability bug already fixed. | Total Sales, Total Purchases | HIGH |
| C2 | **VAT mixed into "Sales/Purchases"** — `loadTotalSales`, `loadDailySalesReport`, `loadInvoiceRegister`, `loadByCustomer`, `loadSalesPerformance`, `loadTotalPurchases`, `loadPurchaseInvoiceRegister`, `loadBySupplier`, `loadSupplierComparison` all sum `transactions.amount` from `sale_*`/`purchase_*` GL rows. That amount is **inclusive of VAT** (it's the cash/AR leg). Reports labelled "Sales" / "Purchases" therefore show **gross-with-VAT**, not net. | 9 reports | HIGH |
| C3 | **Frontend filters by `user_id`** — every loader passes `uid` and adds `.eq("user_id", uid)`. Core memory: "Never filter by user_id manually in frontend; rely on RLS via `dataOwnerId`/`get_team_owner_id`." Currently safe only because `useDataOwnerId` is what's passed in, but team-member tenants whose owner ≠ `auth.uid()` may still see partial scope, and we duplicate logic that RLS already enforces. | All loaders | MED |
| C4 | **Account prefix for AR is wrong** — `loadCustomerStatementAll` matches receivables via `debit_account_code.startsWith("12")`. Real AR account in this tenant family is **1130** (memory: "Receivables Realtime — calculated from 1130 ledger"). `"1130".startsWith("12")` = false → debit/credit assignment inverted or nulled for every customer txn. | Customer Statement | HIGH |
| C5 | **Voided/cancelled filter inconsistent** — `loadInvoiceRegister`, `loadByCustomer`, `loadTotalSales` filter via `getVoidedInvoiceTxnIds`, but `loadCollections`, `loadSupplierPayments`, `loadPurchaseInvoiceRegister`, `loadBySupplier`, `loadSupplierComparison`, `loadSupplierPayments` do NOT. | 6 reports | MED |
| C6 | **Returns subtraction missing** — only Total Sales / Total Purchases / Customer Profitability subtract returns (and TS/TP are broken per C1). Daily Sales subtracts only legacy `transaction_type='return'`, not the new `returns` table. Sales by Customer / by Product do not subtract returns at customer/product level. | Daily Sales, By Customer, By Product, By Supplier | MED |

---

### 2. Per-report audit

| # | Report | Status | Issue | Minimal fix | Priority |
|---|---|---|---|---|---|
| **Sales** | | | | | |
| S1 | Total Sales | FAIL | C1 (returns bug), C2 (VAT-inclusive) | (a) `select("return_date, total_amount, status")` and aggregate `r.total_amount`. (b) Switch source to `invoices` (`subtotal` for net, `total_amount` for gross), label column accordingly. | P1 |
| S2 | Daily Sales | PARTIAL | C2, C6 (only legacy returns) | Source from `invoices.subtotal` grouped by date; subtract `returns.total_amount` (less VAT) when status ∈ confirmed/posted. | P1 |
| S3 | Invoice Register | PARTIAL | C2 (totals row sums VAT-incl), no remaining/paid columns | Add `subtotal`, `tax_amount`, `total_amount`, `paid_amount`, `remaining_amount`, `payment_status` from `invoices` directly; keep linkage to `transactions` only for source filter. | P1 (with S6) |
| S4 | Sales by Customer | PARTIAL | C2, C5 (no voided filter applied to `pos_sale`), no returns subtraction | Aggregate `invoices.subtotal` by `contact_id`; subtract returns by contact_id from `returns`. | P2 |
| S5 | Sales by Product | PASS-ish | Real source `invoice_items` ✓, profit ✓; **does not subtract returns** at product level (returns table has no item join here) | Add optional `returns_items` table join if it exists; otherwise display banner "returns not deducted at product level" similar to existing `cost_incomplete`. | P3 |
| S6 | Sales Returns | PASS | Source = `returns` ✓ | None (already correct). | — |
| S7 | Collections | PARTIAL | Only `transaction_type='receipt'`; misses `sale_cash`/`pos_sale` cash collections; no voided filter; no contact name join | Either (a) keep semantics = "vouchers only" and rename, or (b) include cash sales as collections. Recommend (a) and add `voided=false` filter and `contact_name`. | P1 |
| S8 | Outstanding Invoices (`loadUnpaidInvoices`) | FAIL | Filters out invoices that have **any** payment link, so partially-paid invoices are excluded; should use `remaining_amount > 0` only | Drop the `linkedIds` exclusion; show `remaining_amount`, `paid_amount`, `days_overdue`. | P1 |
| S9 | Customer Statement | FAIL | C4 (1130 vs prefix "12"); also includes ALL contact txns regardless of contact_type (already filtered by contact list, OK); no opening balance | Replace prefix check with: load contact's AR account from `contacts.receivable_account_code` if exists, else fall back to AR codes returned by `chart_of_accounts` where account_type='accounts_receivable'; add opening balance before `dateFrom`. | P1 |
| S10 | Customer Profitability | PASS (post-hotfix) | Returns now subtracted; cost-incomplete flag OK | None. | — |
| **Purchases** | | | | | |
| P1 | Total Purchases | FAIL | C1, C2 | Same fix pattern as S1, sourcing `invoices` where `invoice_type='purchase'`. | P1 |
| P2 | Purchase Invoice Register | PARTIAL | C2, C5, no remaining/paid | Mirror S3 fix on purchase invoices. | P1 (with P1) |
| P3 | Purchases by Supplier | PARTIAL | C2, C5, no returns subtraction | Mirror S4 fix on purchase side. | P2 |
| P4 | Supplier Payments | PARTIAL | Only `transaction_type='payment'`; no contact_name join; no voided filter | Rename to "Payment Vouchers", join contact, exclude voided, add cheque/bank info. | P2 |
| P5 | Purchase Returns | PASS | Source = `returns` ✓ | None. | — |
| P6 | Supplier Statement | PARTIAL | C4-equivalent: prefix "21" works for many AP codes, but parent `2110` may be empty; doesn't include opening balance; no opening section | Same template as S9; for AP use `accounts_payable` account type lookup, prefix-match all returned codes. | P1 |
| P7 | AP Aging (`loadAgingReport(contactType='مورد')`) | PASS-ish | Uses `invoices.remaining_amount` ✓; status filter ✓; OK | None functional, but consider adding `due_date` column. | — |
| P8 | Supplier Price Comparison (`loadSupplierComparison`) | MISLABELED / MISSING | Returns one row per purchase txn with `(supplier, description, amount, date)` — **no product, no unit price**. This is not a price comparison. | Rebuild from `invoice_items` joined to `invoices` (purchase) joined to `contacts`: per `(product_id, supplier)`, show `min/avg/max unit_price`, `last_purchase_date`, `qty`, `delta_vs_min%`. | P2 |

---

### 3. Three high-value missing **Sales** reports

1. **Sales VAT Detail (per invoice)** — `invoice_number, contact_name, date, subtotal, tax_amount, total, payment_status` for VAT return preparation; reconciles to VAT Reconciliation. Source: `invoices` + `invoice_items.tax_amount`.
2. **Salesperson Performance** — uses existing `invoices.salesperson_id`; revenue, # invoices, gross profit, avg ticket, target attainment per rep. Already have data, no UI today.
3. **Cost-of-Goods-Sold by Period** — net COGS from `invoice_items.cost_price * quantity` for sale invoices, less return COGS. Pairs with Daily Sales for true daily gross profit.

### 4. Three high-value missing **Purchase** reports

1. **Purchase VAT (Input) Detail** — symmetric to Sales VAT; mandatory for Palestinian VAT filings. Source: purchase `invoices` + items.
2. **Open Purchase Orders / GRN vs Invoice Reconciliation** — uses `purchase_orders` (if present) or `import_shipments` vs invoiced quantity to surface uninvoiced receipts.
3. **Supplier Returns Reconciliation** — per supplier: total purchases, total returns, net, return %, with link to credit notes (where `is_credit_note=true`). Helps detect quality issues and AP credits not yet applied.

---

### 5. QA test data needed

To validate fixes deterministically on the QA tenant `d8b4ab85-de4f-4178-b637-d41ebdbf1c78`:

- One **credit sale invoice** with VAT (e.g. subtotal 100, VAT 16, total 116) → tests S1/S2/S3 net vs gross + VAT separation.
- One **partial receipt voucher** (50 ILS) against the above invoice → tests S7 collections and S8 partial outstanding.
- One **sales return** (20 ILS subtotal, 3.20 VAT) confirmed/posted → tests S1, S2, S4, S6 deduction.
- One **purchase invoice** with VAT (e.g. 200 / 32 / 232), one partial **payment voucher** (100), one **purchase return** (40) → mirrors above for P1, P2, P3, P4, P5, P6, P7.
- One **second supplier** selling the same product at a different unit price → tests P8 price comparison.
- One **voided invoice** in range → confirms voided filter on registers (C5).
- One **sale by a team-member account** different from the team owner → confirms tenant scope works without frontend `user_id` filter (C3).

---

### 6. Recommended implementation order (matches your priority list)

| Wave | Reports | Tested via |
|---|---|---|
| **B1** | S3 Invoice Register + P2 Purchase Invoice Register (plus shared net/VAT helper) | SQL totals vs UI |
| **B2** | S1 Total Sales + P1 Total Purchases (also fixes C1) | SQL |
| **B3** | S8 Outstanding Invoices + P7 AP Aging polish | SQL |
| **B4** | S9 Customer Statement + P6 Supplier Statement (resolve AR/AP codes properly — C4) | SQL + manual SoA cross-check |
| **B5** | S5 Sales by Product (returns deduction) + P8 Supplier Price Comparison rebuild | SQL |
| **B6** | S7 Collections + P4 Supplier Payments (semantics + voided filter) | SQL |
| **B7 (later)** | Missing reports: Sales VAT Detail, Purchase VAT Detail, Salesperson Performance, COGS by Period, Open POs, Supplier Returns Reconciliation | Playwright once B1–B6 PASS |

**Test strategy:** B1–B6 are deterministic numeric audits → **SQL verification** (one query per report comparing UI rows to source aggregate). Playwright is reserved for B7 once core math is trusted, plus regression smoke after the Cash Flow Phase B work.

**Constraints honored:** no migrations needed for B1–B6 (all source columns exist). No UI redesign — only column additions where data is clearly missing (e.g. `paid_amount`, `remaining_amount` on registers). All loaders continue to receive `dataOwnerId` (we will not introduce `auth.uid()` calls).

**Do not implement yet — awaiting approval of this plan and the wave order.**
