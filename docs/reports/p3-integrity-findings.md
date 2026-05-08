# P3 — Financial Report Integrity Findings

Read-only audit. No writers, RPCs, migrations, or UI changed. Helpers
added under `src/lib/reports/reconciliation.ts` and
`src/lib/reports/integrity-report.ts` (debug console only).

---

## Run results

Two QA tenants exercised:
- **T1** = `6fb346d9-f8a6-44a7-a99c-fd2b440f6060` (busy: 136 txs, 231 products)
- **T2** = `948e365f-fb00-4429-a85c-64bf56cef80e` (busy: 159 txs, products)

| Check | Description | T1 result | T2 result | Status |
|---|---|---|---|---|
| **A** revenue | GL `4xxx` credit balance vs Σ(invoice subtotal − discount) | gl=7 226.00, inv=7 226.00, diff=**0.00** | gl=26 280.00, inv=26 280.00, diff=**0.00** | **PASS** |
| **B** output VAT | GL `2190` credit vs `tax_ledger` `output` total | 0 vs 0 | 0 vs 0 | **PASS** (vacuous: tenants have no VAT activity) |
| **C** inventory | Σ products.qty×buy_price vs GL `1140` debit balance | val=53 451.30, gl=51 342.20, diff=**+2 109.10** | val=14 976.60, gl=0, diff=**+14 976.60** | **FAIL** |
| **D** AR | Σ contact-tagged `1130` subledger vs GL `1130` | sub=−59 115, gl=−59 115, diff=**0.00** | sub=−145 770, gl=−145 770, diff=**0.00** | **PASS** |
| **E** AP | Σ contact-tagged `2110` subledger vs GL `2110` | sub=11 684.10, gl=11 684.10, diff=**0.00** | sub=294 618.60, gl=294 618.60, diff=**0.00** | **PASS** |

### PASS items
- **A revenue**, **D AR control**, **E AP control** match exactly across both tenants.
- **B VAT output** matches at zero on both tenants (no VAT-bearing invoices in QA — re-run on a VAT-active tenant before final sign-off).

### WARN items
- *(none)* — all non-zero diffs cross the hard tolerance and are reported as FAIL below.

### FAIL items
- **C inventory** on **both** tenants. T1 is under by ₪2 109.10 (≈ 4 %); T2 is under by ₪14 976.60 (100 %, GL `1140` balance is zero).

---

## Source-of-drift analysis (Inventory — C)

| Drift source | Class | Notes |
|---|---|---|
| Purchase invoices not posting to GL `1140` | **writer-side (WB-1)** | T2 has 0 movement on `1140` despite 14 976.60 of live inventory. Confirms WB-1 from `docs/tech-debt/p2-writer-side-gaps.md`. Fix lives in purchase-invoice writer / RPC. |
| Adjustment movements unsigned on legacy rows | **writer-side (WB-2)** | Already documented in P2. Compounds the C diff. |
| Manual `products.quantity` edits without GL JE | **historical-data** | Direct row edits bypass the journal — perpetual ledger drifts. |
| Cost basis mismatch (live uses `buy_price`, GL captures historical cost) | **config / accounting-policy** | Even after WB-1/WB-2 are fixed, FIFO/avg-cost vs last `buy_price` will produce permanent diffs. Cost basis must be standardised. |
| COGS posting (5100/5110) without matching `1140` credit | **writer-side** (suspected) | Needs F7 per-product COGS report (deferred) to confirm. |

No read-side bug found in check C. The valuation loader and the GL
balance loader both compute correctly; the diff is genuine drift
upstream.

---

## Hardcoded account-code fallbacks (audit)

Generated via `rg "['\"](1110|1130|1140|1400|4100|5100|2190)['\"]" src`.
No code modified. Accounts considered safe to hard-code (chart-of-accounts
contract) are flagged accordingly; risky ones are flagged for future
`useCompanySettings()` lookup.

| File | Function / location | Code(s) | Purpose | Risk |
|---|---|---|---|---|
| `src/services/travelAccountingService.ts` | `PAYMENT_ACCOUNT_MAP`, line 56 fallback | `1110` | Default cash account when payment method unmapped | **Medium** — silently routes to main cash on misconfig |
| `src/lib/voucher-rpc.ts` | `cashAccountCode` JSDoc example | `1110/1120/1150` | Documentation only | **None** |
| `src/components/LiveKPICards.tsx` | KPI calc, lines 46-66 | `1110, 1130` | Cash + AR KPIs hardcoded | **Low** (display-only) but breaks if codes renamed |
| `src/components/JournalEntryPopup.tsx` | `accountPrefix` line 272 | `1130, 2110` | Default contact account on JE row | **Medium** |
| `src/hooks/useCompanySettings.ts` | defaults, lines 160-164 | `4100, 5100, 1110, 1130` | **Canonical defaults** for `default_*_account` settings | **Low** (intended) |
| `src/components/FinancialRadar.tsx` | Today cash filter, 180-183 | `1110` | Dashboard widget | **Low** |
| `src/lib/buildAIContext.ts` | AI context, lines 59-64 | `1110, 1130` | AI summary numbers | **Low** |
| `src/hooks/useProcurement.ts` | Lines 256, 353 | `1110, 1140, 2110` | Procurement posting paths | **High** (writer-adjacent) |
| `src/pages/ChequesPage.tsx` | Lines 307, 477, 531, 547 | `1130, 1150, 1125` | Cheque posting | **High** (writer) — out of P3 scope |
| `src/pages/JournalNewPage.tsx` | Lines 366, 759, 781 | `1110, 1130, 2110, 2180` | Manual JE defaults | **Medium** |
| `src/components/workshops/WorkshopCostModal.tsx` | Lines 86, 255, 286, 391 | `1110, 1140` | Workshop cost posting | **High** (writer) |
| `src/lib/reports/recon-loaders.ts` | `FALLBACK_OUTPUT_VAT` | `2190` | VAT recon when `vat_output_account_code` not set in settings | **Medium** — already explicit fallback |
| `src/pages/InvoicesPage.tsx` | Lines 313-314, 466-467 | `1130` | AR ledger reads | **Low** (read-side) |
| `src/pages/InvoiceCreatePage.tsx` | Lines 443-444, 1105, 1177, 1352-1353 | `1130, 4100, 5110, 2110` | **Invoice writer** | **High** (writer) — root of WB-1 |
| `src/hooks/useDashboardData.ts` | Lines 239-240, 422, 453-459, 520 | `1110, 1120, 1130` | Dashboard heuristics | **Low** (read-side) |
| `src/pages/InventoryPage.tsx` | Lines 126, 205, 269 | `4100, 5110` | Default sales/purchase account on new product | **Medium** — should pull from `useCompanySettings` |
| `src/pages/CreditDebitNoteCreatePage.tsx` | Lines 371-373 | `4100, 1130` | Credit note writer | **High** (writer) |
| `src/pages/ContactsPage.tsx` | Lines 305, 371 | `1130, 2110` | Contact create defaults | **Medium** |
| `src/pages/ReturnCreatePage.tsx` | Lines 399-401 | `1110, 1130` | Returns writer | **High** (writer) |
| `src/pages/POSPage.tsx` | Lines 3405-3406 | `1110, 1130` | POS shortage posting | **High** (writer) |
| `src/components/CFODashboard.tsx` | Lines 76-78, 95 | `1110-1114, 1130, 1140, 5100/5110` | CFO KPI mapping | **Low** (read-side) |
| `src/pages/LoansPage.tsx` | Lines 839, 1030 | `1110` | Loans default cash | **Medium** |
| `src/pages/SmartAccountantPage.tsx` | Lines 102-103 | `1130` | AI accountant context | **Low** |
| `src/pages/VoucherFormPage.tsx` | Lines 465-622, 1130-1199 | `1110, 1130, 2110` | **Voucher writer** | **High** (writer) |

**Summary of fallback risk:**
- Read-side hardcodes (KPIs, dashboards, AI context): low risk; safe to leave for now, refactor opportunistically.
- Writer-side hardcodes (`InvoiceCreatePage`, `VoucherFormPage`,
  `ReturnCreatePage`, `POSPage`, `WorkshopCostModal`,
  `CreditDebitNoteCreatePage`, `ChequesPage`, `useProcurement`):
  **production risk** if any tenant renumbers their CoA. Should consult
  `useCompanySettings()` defaults or a per-tenant account map.
- `InventoryPage` defaults (`4100`/`5110`) are stamped onto every new
  product → cascades into every future invoice line. Convert to
  settings-driven defaults next cycle.

---

## Drift classification (rolled up)

| Issue | Read-side? | Writer-side? | Historical-data? | Config? |
|---|---|---|---|---|
| C inventory diff | — | ✅ (WB-1, WB-2, COGS posting) | ✅ (manual qty edits) | ✅ (cost basis) |
| Hardcoded writer-side accounts | — | ✅ | — | ✅ (CoA tenant-specific) |
| B VAT vacuous | — | — | ✅ (no VAT data on QA) | — |
| A/D/E | — | — | — | — (PASS) |

---

## P3 closing notes

- Helpers are **read-only** and not wired to any UI. Invoke
  `runIntegrityChecks(uid)` from a console or future debug page.
- No fixes applied. WB-1 / WB-2 from `docs/tech-debt/p2-writer-side-gaps.md`
  remain the dominant source of cross-report drift.
- Recommend re-running on a VAT-active tenant before signing off check B.
- **STOP** here per scope. Awaiting approval before any fixes.

_Last updated: P3 audit run._