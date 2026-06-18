
-- 1) Preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  event_type text,                       -- NULL = default fallback
  channel_push boolean NOT NULL DEFAULT true,
  digest_mode text NOT NULL DEFAULT 'off'
    CHECK (digest_mode IN ('off','hourly','daily')),
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text NOT NULL DEFAULT 'Asia/Hebron',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Unique (recipient, event_type) treating NULL as a value
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_pref_recipient_event
  ON public.notification_preferences (recipient_user_id, COALESCE(event_type, '__default__'));

CREATE INDEX IF NOT EXISTS idx_notif_pref_recipient
  ON public.notification_preferences (recipient_user_id);

CREATE POLICY "Users manage own notification preferences"
  ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = recipient_user_id)
  WITH CHECK (auth.uid() = recipient_user_id);

CREATE TRIGGER trg_notif_pref_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Effective preference resolver: specific event → default → hardcoded defaults
CREATE OR REPLACE FUNCTION public.get_effective_notification_pref(
  _recipient uuid,
  _event_type text
)
RETURNS TABLE (
  channel_push boolean,
  digest_mode text,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.channel_push, p.digest_mode, p.quiet_hours_start, p.quiet_hours_end, p.timezone
    FROM public.notification_preferences p
   WHERE p.recipient_user_id = _recipient
     AND p.event_type = _event_type
   LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.channel_push, p.digest_mode, p.quiet_hours_start, p.quiet_hours_end, p.timezone
    FROM public.notification_preferences p
   WHERE p.recipient_user_id = _recipient
     AND p.event_type IS NULL
   LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Hardcoded defaults
  RETURN QUERY SELECT true, 'off'::text, NULL::time, NULL::time, 'Asia/Hebron'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.get_effective_notification_pref(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_effective_notification_pref(uuid,text) TO authenticated, service_role;

-- 3) Schedule calculator: shifts time out of quiet hours, snaps to digest window.
CREATE OR REPLACE FUNCTION public.compute_scheduled_for(
  _recipient uuid,
  _event_type text,
  _priority smallint,
  _requested timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref RECORD;
  v_local timestamptz;
  v_local_time time;
  v_target timestamptz;
  v_in_quiet boolean := false;
BEGIN
  -- Emergencies bypass everything.
  IF COALESCE(_priority, 5) <= 1 THEN
    RETURN _requested;
  END IF;

  SELECT * INTO v_pref
    FROM public.get_effective_notification_pref(_recipient, _event_type);

  v_target := _requested;

  -- Digest snap (always before quiet hours so digest output still respects quiet)
  IF v_pref.digest_mode = 'hourly' THEN
    v_target := date_trunc('hour', v_target) + interval '1 hour';
  ELSIF v_pref.digest_mode = 'daily' THEN
    v_local := v_target AT TIME ZONE v_pref.timezone;
    -- next 08:00 local
    v_target := ((date_trunc('day', v_local) + interval '1 day' + interval '8 hours'))
                AT TIME ZONE v_pref.timezone;
  END IF;

  -- Quiet hours
  IF v_pref.quiet_hours_start IS NOT NULL AND v_pref.quiet_hours_end IS NOT NULL THEN
    v_local := v_target AT TIME ZONE v_pref.timezone;
    v_local_time := (v_local)::time;

    IF v_pref.quiet_hours_start < v_pref.quiet_hours_end THEN
      -- Same-day window (e.g. 13:00 - 15:00)
      v_in_quiet := v_local_time >= v_pref.quiet_hours_start
                AND v_local_time <  v_pref.quiet_hours_end;
    ELSE
      -- Overnight window (e.g. 22:00 - 07:00)
      v_in_quiet := v_local_time >= v_pref.quiet_hours_start
                 OR v_local_time <  v_pref.quiet_hours_end;
    END IF;

    IF v_in_quiet THEN
      -- Push to end-of-quiet on the correct day, then convert back to UTC.
      v_target := (date_trunc('day', v_local)
                   + (v_pref.quiet_hours_end - time '00:00:00'))
                  AT TIME ZONE v_pref.timezone;
      IF v_target <= _requested THEN
        v_target := v_target + interval '1 day';
      END IF;
    END IF;
  END IF;

  RETURN GREATEST(v_target, _requested);
END;
$$;

REVOKE ALL ON FUNCTION public.compute_scheduled_for(uuid,text,smallint,timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compute_scheduled_for(uuid,text,smallint,timestamptz) TO authenticated, service_role;

-- 4) Rewrite enqueue_notification to respect preferences
CREATE OR REPLACE FUNCTION public.enqueue_notification(
  _recipient_user_id uuid,
  _event_type text,
  _title text,
  _body text,
  _path text DEFAULT NULL,
  _data jsonb DEFAULT '{}'::jsonb,
  _sensitivity text DEFAULT 'low',
  _priority smallint DEFAULT 5,
  _dedup_key text DEFAULT NULL,
  _source_created_at timestamptz DEFAULT NULL,
  _scheduled_for timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_dedup text;
  v_id uuid;
  v_pref RECORD;
  v_requested timestamptz;
  v_scheduled timestamptz;
BEGIN
  IF _recipient_user_id IS NULL OR _event_type IS NULL OR _title IS NULL OR _body IS NULL THEN
    RETURN NULL;
  END IF;

  -- Channel check (push off → silently skip, except emergencies)
  SELECT * INTO v_pref
    FROM public.get_effective_notification_pref(_recipient_user_id, _event_type);
  IF NOT v_pref.channel_push AND COALESCE(_priority, 5) > 1 THEN
    RETURN NULL;
  END IF;

  v_owner := public.resolve_effective_owner_id(_recipient_user_id);
  IF v_owner IS NULL THEN
    v_owner := _recipient_user_id;
  END IF;

  v_dedup := COALESCE(
    _dedup_key,
    _event_type || ':' || _recipient_user_id::text || ':' ||
      COALESCE((_data->>'source_id'), extract(epoch from now())::text)
  );

  v_requested := COALESCE(_scheduled_for, now());
  v_scheduled := public.compute_scheduled_for(
    _recipient_user_id, _event_type, COALESCE(_priority,5), v_requested
  );

  INSERT INTO public.notification_queue (
    owner_id, recipient_user_id, event_type, sensitivity,
    title, body, data, path, priority, dedup_key,
    scheduled_for, source_created_at
  )
  VALUES (
    v_owner, _recipient_user_id, _event_type, COALESCE(_sensitivity,'low'),
    _title, _body, COALESCE(_data,'{}'::jsonb), _path, COALESCE(_priority,5), v_dedup,
    v_scheduled,
    COALESCE(_source_created_at, now())
  )
  ON CONFLICT (dedup_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
