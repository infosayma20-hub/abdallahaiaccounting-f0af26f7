UPDATE public.pos_payments
SET currency = 'USD',
    exchange_rate = 3.010515,
    tendered = 150.52575,
    change_amount = 100.52575,
    change_currency = 'ILS',
    notes = '[data-fix 2026-07-15 v2] Reverted earlier ILS reclassification. Confirmed by cashier: paid 50 USD, change = tender_ILS - invoice_ILS = 100.52575 ILS. Invoice GL amount (50 ILS) unchanged.'
WHERE id = '797ec60b-cd02-4494-b1e6-83f6f9eefd49';