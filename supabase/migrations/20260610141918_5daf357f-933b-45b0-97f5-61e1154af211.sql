CREATE OR REPLACE FUNCTION public.kds_get_display_settings(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _settings public.company_settings%ROWTYPE;
BEGIN
  SELECT * INTO _device
  FROM public.pos_display_devices
  WHERE token = _token AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'company_name', '',
      'logo_url', '',
      'pos_voice_template', 'طلب رقم ....{n}',
      'pos_voice_language', 'ar-PS',
      'pos_kds_voice_mode', 'browser_tts'
    );
  END IF;

  SELECT * INTO _settings
  FROM public.company_settings
  WHERE user_id = _device.company_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'company_name', COALESCE(_settings.company_name, ''),
    'logo_url', COALESCE(_settings.logo_url, ''),
    'pos_voice_template', COALESCE(_settings.pos_voice_template, 'طلب رقم ....{n}'),
    'pos_voice_language', COALESCE(_settings.pos_voice_language, 'ar-PS'),
    'pos_kds_voice_mode', COALESCE(_settings.pos_kds_voice_mode, 'browser_tts')
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kds_get_display_settings(text) TO anon, authenticated, service_role;