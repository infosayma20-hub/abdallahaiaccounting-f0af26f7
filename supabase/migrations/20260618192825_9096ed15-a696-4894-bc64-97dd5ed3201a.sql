-- Atomic batch claim: marks rows as 'processing' and returns them.
-- Uses FOR UPDATE SKIP LOCKED so concurrent workers never collide.
CREATE OR REPLACE FUNCTION public.claim_notification_batch(_limit int DEFAULT 200)
RETURNS SETOF public.notification_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT id
    FROM public.notification_queue
    WHERE status IN ('pending','deferred')
      AND scheduled_for <= now()
      AND attempts < 5
    ORDER BY priority ASC, scheduled_for ASC
    LIMIT GREATEST(_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_queue q
     SET status = 'processing',
         attempts = q.attempts + 1,
         updated_at = now()
    FROM cte
   WHERE q.id = cte.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_batch(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_batch(int) TO service_role;