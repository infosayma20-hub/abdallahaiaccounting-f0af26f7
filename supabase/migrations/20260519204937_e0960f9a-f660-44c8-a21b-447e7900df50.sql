
-- Device type column (new): superset of device_role.
ALTER TABLE public.pos_display_devices
  ADD COLUMN IF NOT EXISTS device_type TEXT NOT NULL DEFAULT 'customer_display';

UPDATE public.pos_display_devices
   SET device_type = COALESCE(NULLIF(device_role,''),'customer_display')
 WHERE device_type IS NULL OR device_type = 'customer_display';

-- Settings: max auto repeats (0 = unlimited).
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pos_call_max_repeats INTEGER NOT NULL DEFAULT 1;

-- Heartbeat: public via token, just bumps last_seen_at.
CREATE OR REPLACE FUNCTION public.kds_device_heartbeat(_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  UPDATE public.pos_display_devices
     SET last_seen_at = now()
   WHERE token = _token AND is_active = true
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kds_device_heartbeat(TEXT) TO anon, authenticated;

-- Rotate token: owner-only.
CREATE OR REPLACE FUNCTION public.kds_rotate_device_token(_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_new TEXT;
BEGIN
  v_owner := public.get_team_owner_id(auth.uid());
  v_new := replace(gen_random_uuid()::text,'-','');
  UPDATE public.pos_display_devices
     SET token = v_new
   WHERE id = _id AND company_id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kds_rotate_device_token(UUID) TO authenticated;

-- Latest auto_call event id per device (for client-side dedupe across reloads).
CREATE OR REPLACE FUNCTION public.kds_recent_call_events(_token TEXT, _since TIMESTAMPTZ DEFAULT NULL)
RETURNS TABLE(id UUID, order_id UUID, display_number TEXT, event_type TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d public.pos_display_devices%ROWTYPE;
BEGIN
  SELECT * INTO _d FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT e.id, e.order_id, e.display_number, e.event_type, e.created_at
  FROM public.kds_call_events e
  WHERE e.company_id = _d.company_id
    AND (_d.branch_id IS NULL OR e.branch_id = _d.branch_id)
    AND (_since IS NULL OR e.created_at > _since)
    AND e.created_at > now() - interval '1 hour'
  ORDER BY e.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kds_recent_call_events(TEXT, TIMESTAMPTZ) TO anon, authenticated;
