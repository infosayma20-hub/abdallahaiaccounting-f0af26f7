---
name: Dashboard Reversal-Aware Calculations
description: All dashboard financial widgets must net debit/credit on revenue & expense accounts to correctly handle reversal entries (عكس قيد) from POS, invoices, and vouchers
type: feature
---

# Dashboard Reversal-Aware Calculations

## Source of Truth
All dashboard financial widgets read directly from the `transactions` table (journal lines), NOT from invoice/voucher UI statuses. The journal is the single source of truth.

## Reversal Handling Rule
A reversal entry (`transaction_type = 'reversal'`, description starts with `عكس قيد`) posts a contra journal line that must be netted, never ignored:

- **Revenue accounts (4xxx)**: natural side = CREDIT
  - `net_revenue = SUM(amount WHERE credit_account_code LIKE '4%') - SUM(amount WHERE debit_account_code LIKE '4%')`
  - A debit to 4xxx (e.g. POS reversal: `Dr 4100 / Cr Cash`) reduces revenue.

- **Expense accounts (5xxx, 6xxx)**: natural side = DEBIT
  - `net_expense = SUM(amount WHERE debit LIKE '5%' OR '6%') - SUM(amount WHERE credit LIKE '5%' OR '6%')`
  - A credit to 5xxx/6xxx (reversal of expense) reduces expense.

- **Cash accounts (111x, 112x)**: natural debit/credit logic already nets correctly.
  - Original POS sale: `Dr Cash / Cr Revenue` → inflow.
  - Reversal: `Dr Revenue / Cr Cash` → outflow (automatic via existing logic).
  - **No special handling needed for cash flow widget** — debit/credit on cash accounts naturally captures the reversal effect.

## Where Applied (`src/hooks/useDashboardData.ts`)
1. `computeKPIs` — revenue, expenses, netProfit
2. `chartData` — daily/weekly/monthly buckets
3. `sparklines` — last-7-days revenue/expense/profit arrays
4. `topSales` — by-contact aggregation (filter out contacts whose net sales ≤ 0 after reversal)
5. `recentActivity` — reversal entries flagged via `isReversal` check; `Dr 4xxx` classified as expense-like, `Cr 5xxx/6xxx` as income-like

## Critical Don'ts
- ❌ Don't filter only `credit_account_code LIKE '4%'` for revenue — overstates by reversal amount.
- ❌ Don't rely on invoice `status` or voucher labels for financial totals.
- ❌ Don't exclude reversal rows entirely — they carry the corrective balance.
