-- Fix existing pos_customer "يزن حبيبة" visits based on actual orders
UPDATE public.pos_customers pc
SET total_visits = sub.cnt,
    total_spent = sub.spent,
    last_visit = sub.last_order
FROM (
  SELECT pos_customer_id, COUNT(*) as cnt, COALESCE(SUM(total), 0) as spent, MAX(created_at) as last_order
  FROM public.pos_orders
  WHERE pos_customer_id IS NOT NULL AND state IN ('completed', 'paid')
  GROUP BY pos_customer_id
) sub
WHERE pc.id = sub.pos_customer_id
  AND pc.id = '79d93b0a-6b23-4e8a-a8de-e6bb03d5c384';