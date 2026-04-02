
-- Fix existing foreign currency transactions that stored foreign_amount in the amount field
-- For INV-2026-0003 (دولار, $185.60, should be ~₪685.60 at rate 3.70)
UPDATE public.transactions
SET foreign_amount = amount,
    exchange_rate = 3.70,
    amount = amount * 3.70
WHERE id = '93582a3f-76e1-4321-9f13-ee0ebc160342'
  AND currency = 'دولار'
  AND foreign_amount IS NULL;

-- Fix POS USD transactions (these are cash box entries, keep as-is but mark foreign_amount)
UPDATE public.transactions
SET foreign_amount = amount
WHERE currency IN ('دولار', 'USD', 'JOD', 'دينار', 'يورو', 'EUR')
  AND foreign_amount IS NULL
  AND amount IS NOT NULL;
