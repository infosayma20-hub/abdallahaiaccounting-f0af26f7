
CREATE OR REPLACE FUNCTION public.notif_queue_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_status jsonb;
  v_24h jsonb;
  v_top jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_object_agg(status, c) INTO v_status
  FROM (
    SELECT status, count(*) c FROM public.notification_queue GROUP BY status
  ) s;

  SELECT jsonb_build_object(
    'sent',    count(*) FILTER (WHERE status='sent'    AND sent_at >= v_now - interval '24 hours'),
    'failed',  count(*) FILTER (WHERE status='failed'  AND updated_at >= v_now - interval '24 hours'),
    'skipped', count(*) FILTER (WHERE status='skipped' AND updated_at >= v_now - interval '24 hours'),
    'pending', count(*) FILTER (WHERE status IN ('pending','deferred','processing'))
  )
  INTO v_24h
  FROM public.notification_queue;

  SELECT jsonb_agg(row_to_json(t)) INTO v_top FROM (
    SELECT event_type, count(*) c
      FROM public.notification_queue
     WHERE created_at >= v_now - interval '24 hours'
     GROUP BY event_type
     ORDER BY c DESC
     LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'by_status', COALESCE(v_status, '{}'::jsonb),
    'last_24h', v_24h,
    'top_events_24h', COALESCE(v_top, '[]'::jsonb),
    'active_tokens', (SELECT count(*) FROM public.device_tokens WHERE is_active),
    'inactive_tokens', (SELECT count(*) FROM public.device_tokens WHERE NOT is_active),
    'generated_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notif_queue_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.notif_queue_stats() TO authenticated, service_role;

-- Recent rows for monitoring panel
CREATE OR REPLACE FUNCTION public.notif_queue_recent(_limit integer DEFAULT 50, _status text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  recipient_user_id uuid,
  event_type text,
  sensitivity text,
  title text,
  status text,
  attempts integer,
  last_error text,
  priority smallint,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT q.id, q.owner_id, q.recipient_user_id, q.event_type, q.sensitivity,
         q.title, q.status, q.attempts, q.last_error, q.priority,
         q.scheduled_for, q.sent_at, q.created_at, q.updated_at
    FROM public.notification_queue q
   WHERE (_status IS NULL OR q.status = _status)
   ORDER BY q.created_at DESC
   LIMIT GREATEST(_limit, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.notif_queue_recent(integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.notif_queue_recent(integer, text) TO authenticated, service_role;

-- Manual retry: reset attempts and put back to pending
CREATE OR REPLACE FUNCTION public.notif_queue_requeue(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.notification_queue
     SET status = 'pending',
         attempts = 0,
         last_error = NULL,
         scheduled_for = now(),
         updated_at = now()
   WHERE id = ANY(_ids)
     AND status IN ('failed','skipped','deferred');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notif_queue_requeue(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.notif_queue_requeue(uuid[]) TO authenticated, service_role;
