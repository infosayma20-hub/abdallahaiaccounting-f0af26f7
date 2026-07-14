CREATE OR REPLACE FUNCTION public.prevent_direct_pos_transaction_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_deleted = true
     AND COALESCE(OLD.is_deleted, false) = false
     AND EXISTS (
       SELECT 1
       FROM public.pos_orders po
       WHERE po.state = 'paid'
         AND COALESCE(po.is_return, false) = false
         AND (
           po.transaction_id = NEW.id
           OR po.linked_transaction_id = NEW.id
           OR po.id = NEW.pos_order_id
         )
     )
  THEN
    RAISE EXCEPTION 'POS_TX_DIRECT_DELETE_BLOCKED'
      USING ERRCODE = 'P0001',
            HINT = 'cancel_pos_invoice_from_pos_history',
            DETAIL = 'Directly deleting a paid POS transaction leaves pos_orders paid while accounting is deleted.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_direct_pos_transaction_soft_delete ON public.transactions;
CREATE TRIGGER trg_prevent_direct_pos_transaction_soft_delete
  BEFORE UPDATE OF is_deleted ON public.transactions
  FOR EACH ROW
  WHEN (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted)
  EXECUTE FUNCTION public.prevent_direct_pos_transaction_soft_delete();

WITH effective_session_totals AS (
  SELECT
    s.id AS session_id,
    COALESCE(SUM(o.total) FILTER (
      WHERE o.id IS NOT NULL
        AND o.state = 'paid'
        AND COALESCE(o.is_return, false) = false
        AND NOT COALESCE(tx.is_deleted, false)
    ), 0) AS total_sales,
    COALESCE(COUNT(o.id) FILTER (
      WHERE o.id IS NOT NULL
        AND o.state = 'paid'
        AND COALESCE(o.is_return, false) = false
        AND NOT COALESCE(tx.is_deleted, false)
    ), 0) AS total_orders
  FROM public.pos_sessions s
  LEFT JOIN public.pos_orders o ON o.session_id = s.id
  LEFT JOIN public.transactions tx ON tx.id = COALESCE(o.transaction_id, o.linked_transaction_id)
  WHERE COALESCE(s.is_deleted, false) = false
  GROUP BY s.id
)
UPDATE public.pos_sessions s
SET total_sales = e.total_sales,
    total_orders = e.total_orders,
    updated_at = now()
FROM effective_session_totals e
WHERE s.id = e.session_id
  AND (s.total_sales IS DISTINCT FROM e.total_sales OR s.total_orders IS DISTINCT FROM e.total_orders);