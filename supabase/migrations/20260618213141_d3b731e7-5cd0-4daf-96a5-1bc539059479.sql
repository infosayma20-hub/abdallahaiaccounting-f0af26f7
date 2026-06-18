
ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS last_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS fail_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_device_tokens_last_validated
  ON public.device_tokens (last_validated_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_device_tokens_inactive_since
  ON public.device_tokens (last_seen_at)
  WHERE is_active = false;

CREATE OR REPLACE FUNCTION public.cleanup_stale_device_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deactivated int := 0;
  v_deleted_tokens int := 0;
  v_pruned_queue int := 0;
BEGIN
  WITH upd AS (
    UPDATE public.device_tokens
       SET is_active = false,
           last_seen_at = COALESCE(last_seen_at, now())
     WHERE is_active = true
       AND COALESCE(last_validated_at, last_seen_at, created_at) < now() - interval '60 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_deactivated FROM upd;

  WITH del AS (
    DELETE FROM public.device_tokens
     WHERE is_active = false
       AND COALESCE(last_seen_at, created_at) < now() - interval '90 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted_tokens FROM del;

  WITH q AS (
    DELETE FROM public.notification_queue
     WHERE (status IN ('sent','skipped') AND COALESCE(sent_at, updated_at) < now() - interval '30 days')
        OR (status = 'failed' AND updated_at < now() - interval '60 days')
    RETURNING 1
  )
  SELECT count(*) INTO v_pruned_queue FROM q;

  RETURN jsonb_build_object(
    'deactivated', v_deactivated,
    'deleted_tokens', v_deleted_tokens,
    'pruned_queue', v_pruned_queue,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_device_tokens() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_device_tokens() TO service_role;
