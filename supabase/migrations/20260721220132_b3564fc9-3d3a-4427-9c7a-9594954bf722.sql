
CREATE OR REPLACE VIEW public.pos_orders_effective AS
SELECT
  o.*,
  CASE
    WHEN o.state = 'cancelled' THEN 'cancelled'
    WHEN o.state = 'paid' AND NOT EXISTS (
      SELECT 1 FROM public.transactions t
       WHERE t.pos_order_id = o.id
         AND t.transaction_type IN ('pos_sale','pos_sale_vat')
         AND COALESCE(t.is_deleted, false) = false
    ) AND EXISTS (
      SELECT 1 FROM public.transactions t2
       WHERE t2.pos_order_id = o.id
         AND t2.transaction_type IN ('pos_sale','pos_sale_vat')
         AND COALESCE(t2.is_deleted, false) = true
    ) THEN 'voided'
    WHEN o.state = 'paid' AND EXISTS (
      SELECT 1 FROM public.transactions t
       WHERE t.id = ANY(ARRAY[o.transaction_id, o.linked_transaction_id])
         AND t.is_deleted = true
    ) AND NOT EXISTS (
      SELECT 1 FROM public.transactions t3
       WHERE t3.pos_order_id = o.id
         AND t3.transaction_type IN ('pos_sale','pos_sale_vat')
         AND COALESCE(t3.is_deleted, false) = false
    ) THEN 'voided'
    WHEN o.state = 'paid' THEN 'active'
    ELSE o.state
  END AS effective_state
FROM public.pos_orders o;
