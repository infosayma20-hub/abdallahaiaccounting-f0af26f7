-- 1) Scheduled-order fields on the existing dispatch table.
ALTER TABLE public.call_center_orders
  ADD COLUMN IF NOT EXISTS is_scheduled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS prep_minutes integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS release_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS prepaid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prepaid_method text,
  ADD COLUMN IF NOT EXISTS prepaid_pos_order_id uuid,
  ADD COLUMN IF NOT EXISTS created_channel text NOT NULL DEFAULT 'call_center';

-- 2) Fast lookup for the release job + the scheduled list UI.
CREATE INDEX IF NOT EXISTS idx_cco_scheduled_release
  ON public.call_center_orders (user_id, status, release_at)
  WHERE is_scheduled = true;

-- 3) Idempotent release function: flips due scheduled orders into the normal
--    "pending" dispatch flow exactly once (released_at IS NULL guard).
CREATE OR REPLACE FUNCTION public.release_due_scheduled_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH due AS (
    UPDATE public.call_center_orders
       SET status = 'pending',
           released_at = now(),
           updated_at = now()
     WHERE is_scheduled = true
       AND status = 'scheduled'
       AND released_at IS NULL
       AND release_at IS NOT NULL
       AND release_at <= now()
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM due;
  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_due_scheduled_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_due_scheduled_orders() TO service_role;

-- 4) Server-side safety net: run every minute regardless of open devices.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('release-scheduled-pos-orders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'release-scheduled-pos-orders',
  '* * * * *',
  $$SELECT public.release_due_scheduled_orders();$$
);