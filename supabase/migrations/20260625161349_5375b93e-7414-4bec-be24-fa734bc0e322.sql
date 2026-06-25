
-- Cleanup function: revert call_center_orders left in "accepted" without a pos_order_id
-- when their cashier session is closed (or the session row was deleted).
CREATE OR REPLACE FUNCTION public.revert_orphan_call_center_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reverted_count integer := 0;
BEGIN
  WITH updated AS (
    UPDATE public.call_center_orders cco
    SET status = 'pending',
        accepted_by = NULL,
        accepted_at = NULL,
        session_id = NULL
    WHERE cco.status = 'accepted'
      AND cco.pos_order_id IS NULL
      AND cco.session_id IS NOT NULL
      AND (
        NOT EXISTS (SELECT 1 FROM public.pos_sessions s WHERE s.id = cco.session_id)
        OR EXISTS (
          SELECT 1 FROM public.pos_sessions s
          WHERE s.id = cco.session_id AND s.state <> 'open'
        )
      )
    RETURNING 1
  )
  SELECT count(*) INTO reverted_count FROM updated;
  RETURN reverted_count;
END;
$$;

-- Immediate cleanup of the existing 9 orphans
SELECT public.revert_orphan_call_center_orders();

-- Schedule the cleanup every 5 minutes (idempotent: unschedule first if exists)
DO $$
BEGIN
  PERFORM cron.unschedule('revert-orphan-call-center-orders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'revert-orphan-call-center-orders',
  '*/5 * * * *',
  $$ SELECT public.revert_orphan_call_center_orders(); $$
);
