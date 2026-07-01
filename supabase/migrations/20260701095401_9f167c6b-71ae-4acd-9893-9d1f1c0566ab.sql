
DELETE FROM public.pos_orders d
WHERE d.state = 'draft'
  AND d.table_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.pos_payments  pp WHERE pp.order_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM public.kitchen_tickets kt WHERE kt.order_id = d.id)
  AND EXISTS (
    SELECT 1 FROM public.pos_orders p
    WHERE p.id <> d.id
      AND p.session_id = d.session_id
      AND p.state IN ('paid','cancelled')
      AND p.total = d.total
      AND ABS(EXTRACT(EPOCH FROM (p.created_at - d.created_at))) < 120
  );
