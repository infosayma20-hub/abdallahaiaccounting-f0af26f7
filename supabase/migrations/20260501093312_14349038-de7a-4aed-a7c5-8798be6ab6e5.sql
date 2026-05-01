DO $$
DECLARE
  v_user uuid := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
  v_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.company_settings WHERE user_id = v_user) INTO v_exists;
  IF v_exists THEN
    UPDATE public.company_settings
    SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                        || '{"vouchers_use_rpc": true, "invoices_use_rpc": true}'::jsonb
    WHERE user_id = v_user;
  ELSE
    INSERT INTO public.company_settings (user_id, feature_flags)
    VALUES (v_user, '{"vouchers_use_rpc": true, "invoices_use_rpc": true}'::jsonb);
  END IF;
END $$;