
-- 1) Re-link orphans that were wrongly reverted (paid pos_orders exist with same name+total today)
WITH matches AS (
  SELECT DISTINCT ON (cco.id)
    cco.id AS cco_id, p.id AS pos_id, p.session_id
  FROM call_center_orders cco
  JOIN pos_orders p
    ON p.customer_name = cco.customer_name
   AND p.total = cco.total
   AND p.state = 'paid'
   AND p.paid_at >= cco.created_at - interval '6 hours'
   AND p.paid_at <= cco.created_at + interval '12 hours'
  WHERE cco.status = 'pending'
    AND cco.pos_order_id IS NULL
    AND cco.customer_name IS NOT NULL
    AND cco.customer_name <> ''
  ORDER BY cco.id, p.paid_at ASC
)
UPDATE call_center_orders cco
SET status = 'completed',
    pos_order_id = m.pos_id,
    session_id = m.session_id,
    accepted_at = COALESCE(cco.accepted_at, now())
FROM matches m
WHERE cco.id = m.cco_id;

-- 2) Safer revert function: never revert if a matching paid pos_order exists today,
-- and require the session to be closed for at least 30 minutes.
CREATE OR REPLACE FUNCTION public.revert_orphan_call_center_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      AND EXISTS (
        SELECT 1 FROM public.pos_sessions s
        WHERE s.id = cco.session_id
          AND s.state <> 'open'
          AND COALESCE(s.closed_at, s.updated_at) < now() - interval '30 minutes'
      )
      -- Safety: skip if a paid pos_order plausibly matches this call-center order
      AND NOT EXISTS (
        SELECT 1 FROM public.pos_orders p
        WHERE p.state = 'paid'
          AND p.session_id = cco.session_id
          AND (
            (cco.customer_name IS NOT NULL AND cco.customer_name <> '' AND p.customer_name = cco.customer_name)
            OR p.total = cco.total
          )
      )
    RETURNING 1
  )
  SELECT count(*) INTO reverted_count FROM updated;
  RETURN reverted_count;
END;
$function$;
