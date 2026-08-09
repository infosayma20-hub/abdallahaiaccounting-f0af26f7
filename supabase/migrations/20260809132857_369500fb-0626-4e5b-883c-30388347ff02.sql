CREATE OR REPLACE FUNCTION public.enqueue_notification(
  _recipient_user_id uuid,
  _event_type text,
  _title text,
  _body text,
  _path text DEFAULT NULL::text,
  _data jsonb DEFAULT '{}'::jsonb,
  _sensitivity text DEFAULT 'low'::text,
  _priority smallint DEFAULT 5,
  _dedup_key text DEFAULT NULL::text,
  _source_created_at timestamptz DEFAULT NULL::timestamptz,
  _scheduled_for timestamptz DEFAULT NULL::timestamptz
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
  v_priority smallint;
BEGIN
  IF _recipient_user_id IS NULL OR _event_type IS NULL OR _title IS NULL OR _body IS NULL THEN
    RETURN NULL;
  END IF;

  v_priority := COALESCE(_priority, 5::smallint)::smallint;

  SELECT * INTO v_pref
    FROM public.get_effective_notification_pref(_recipient_user_id, _event_type);
  IF NOT v_pref.channel_push AND v_priority > 1 THEN
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
    _recipient_user_id, _event_type, v_priority, v_requested
  );

  INSERT INTO public.notification_queue (
    owner_id, recipient_user_id, event_type, sensitivity,
    title, body, data, path, priority, dedup_key,
    scheduled_for, source_created_at
  )
  VALUES (
    v_owner, _recipient_user_id, _event_type, COALESCE(_sensitivity,'low'),
    _title, _body, COALESCE(_data,'{}'::jsonb), _path, v_priority, v_dedup,
    v_scheduled,
    COALESCE(_source_created_at, now())
  )
  ON CONFLICT (dedup_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;