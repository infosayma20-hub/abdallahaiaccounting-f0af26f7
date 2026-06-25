-- Auto-cancel call center dispatches that stay pending for over 24 hours
CREATE OR REPLACE FUNCTION public.cancel_stale_pending_call_center_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cancelled_count integer := 0;
BEGIN
  WITH updated AS (
    UPDATE public.call_center_orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = COALESCE(cancel_reason, 'تنظيف تلقائي: طلبية معلقة بسجل المحول لأكثر من 24 ساعة')
    WHERE status = 'pending'
      AND created_at < now() - interval '24 hours'
    RETURNING 1
  )
  SELECT count(*) INTO cancelled_count FROM updated;
  RETURN cancelled_count;
END;
$$;

-- Schedule hourly cleanup
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE command ILIKE '%cancel_stale_pending_call_center_orders%';

SELECT cron.schedule(
  'cancel-stale-pending-call-center-orders',
  '0 * * * *',
  $$SELECT public.cancel_stale_pending_call_center_orders();$$
);