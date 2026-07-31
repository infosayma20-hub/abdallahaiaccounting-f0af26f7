CREATE OR REPLACE FUNCTION public.kds_resolve_display_code_v2(_code text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('token', token, 'device_type', coalesce(device_type, device_role, 'customer_display'), 'name', name)
  FROM public.pos_display_devices
  WHERE short_code = lower(btrim(_code))
    AND is_active = true
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.kds_resolve_display_code_v2(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kds_ensure_short_code(_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_code text;
BEGIN
  v_owner := public.get_team_owner_id(auth.uid());
  SELECT short_code INTO v_code FROM public.pos_display_devices WHERE id = _id AND company_id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_code IS NOT NULL AND btrim(v_code) <> '' THEN RETURN v_code; END IF;
  v_code := public.kds_gen_short_code();
  UPDATE public.pos_display_devices SET short_code = v_code WHERE id = _id AND company_id = v_owner;
  RETURN v_code;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kds_ensure_short_code(uuid) TO authenticated, service_role;