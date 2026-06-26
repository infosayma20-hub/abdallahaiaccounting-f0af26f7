
CREATE OR REPLACE FUNCTION public.sparta_dispatch_activity_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT a.id, a.assigned_to, a.subject, a.kind, a.due_at,
           CASE WHEN a.due_at < now() THEN 'overdue' ELSE 'due_soon' END AS bucket
    FROM public.sparta_activities a
    WHERE a.done_at IS NULL
      AND a.assigned_to IS NOT NULL
      AND a.due_at IS NOT NULL
      AND a.due_at <= now() + interval '24 hours'
  LOOP
    INSERT INTO public.notification_queue (
      owner_id, recipient_user_id, event_type, sensitivity,
      title, body, data, path, priority, dedup_key
    ) VALUES (
      r.assigned_to, r.assigned_to,
      'sparta.activity.' || r.bucket, 'low',
      CASE WHEN r.bucket = 'overdue' THEN 'نشاط CRM متأخر' ELSE 'نشاط CRM مستحق قريباً' END,
      COALESCE(r.subject, 'متابعة CRM') || ' — ' || to_char(r.due_at, 'YYYY-MM-DD HH24:MI'),
      jsonb_build_object('activity_id', r.id, 'kind', r.kind, 'due_at', r.due_at),
      '/sparta/crm', 6,
      'sparta_act_' || r.id || '_' || r.bucket || '_' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD')
    )
    ON CONFLICT (dedup_key) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.sparta_dispatch_activity_reminders() TO service_role;

-- Schedule via pg_cron (daily 07:00 Asia/Hebron ≈ 05:00 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sparta-activity-reminders-daily';
    PERFORM cron.schedule(
      'sparta-activity-reminders-daily',
      '0 5 * * *',
      $cron$ SELECT public.sparta_dispatch_activity_reminders(); $cron$
    );
  END IF;
END $$;
