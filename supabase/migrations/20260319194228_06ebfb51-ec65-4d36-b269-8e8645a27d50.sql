
-- Fix existing foreign payments with correct exchange_rate from related transactions
UPDATE public.pos_payments pp
SET exchange_rate = COALESCE(
  (SELECT t.exchange_rate FROM public.transactions t 
   JOIN public.pos_orders po ON po.transaction_id = t.id 
   WHERE po.id = pp.order_id AND t.exchange_rate IS NOT NULL AND t.exchange_rate > 0
   LIMIT 1),
  CASE pp.currency 
    WHEN 'USD' THEN 3.14
    WHEN 'JOD' THEN 5.0
    ELSE 1
  END
)
WHERE pp.currency != 'ILS' AND (pp.exchange_rate IS NULL OR pp.exchange_rate = 1);
