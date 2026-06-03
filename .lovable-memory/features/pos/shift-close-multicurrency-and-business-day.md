---
name: POS Multi-Currency Shift Close & Business Day
description: Cash drawer reconciliation contract per currency for POS shift close, plus the centralised business-day helper (cutoff 6 AM, Asia/Jerusalem)
type: feature
---
## pos_payments data contract (set by complete_pos_order)
- `amount` — invoice total, ALWAYS in ILS.
- `tendered` — cash given, ALWAYS in ILS (foreign tender × exchange_rate).
- `currency` — payment currency chosen by customer.
- `exchange_rate` — foreign→ILS rate at sale time.
- `change_amount` — in the unit of `change_currency` (NOT always ILS).
- `change_currency` — currency the change was actually handed back in.

## Cash drawer per currency (audited & correct as of June 2026)
```
expectedILS = openingILS
            + Σ payments(cash, ILS).amount
            − Σ change_amount where change_currency = ILS    (foreign sale w/ ILS change)
            − cash expenses ILS − cash purchases ILS − cash returns ILS

expected[CUR≠ILS] = Σ tendered_ILS / exchange_rate where (cash, currency=CUR)
                  − Σ change_amount where change_currency = CUR
                  − cash returns CUR

variance(CUR) = actual(CUR) − expected(CUR)
totalVariance_ILS_equiv = Σ variance(CUR) × rate(CUR)        # report headline only
```
Real-world example: 10 JOD tendered for a 23.86 ILS invoice with 17 ILS change → JOD +10, ILS −17. ✅

## Pure math: `src/lib/pos/shift-close-math.ts` (unit-tested in `__tests__/`).
## Used by: shift close in `src/pages/POSPage.tsx` (`handleCloseShift`, ≈ line 3650+).

## POS Business Day
- Cutoff: `company_settings.pos_day_cutoff_hour` (default 6 AM, Asia/Jerusalem).
- JS helper: `getPosBusinessDate(ts, cutoff)` in `src/lib/pos/business-day.ts`.
- SQL helper: `public.pos_business_date(ts timestamptz, cutoff int default 6)`.
- Column: `pos_orders.business_date` (auto-set by `trg_pos_orders_set_business_date` trigger from `paid_at`/`created_at` and the owner's cutoff).
- Index: `idx_pos_orders_user_business_date(user_id, business_date)`.
- Reports SHOULD filter on `business_date` (not `created_at::date`); legacy rows have NULL — use `COALESCE(business_date, created_at::date)` until backfill.
