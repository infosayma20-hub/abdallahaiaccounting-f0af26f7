
CREATE OR REPLACE FUNCTION public.ensure_party_transfer_clearing_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_system)
  VALUES (p_user_id, '1199', 'حساب وسيط لتحويل الذمم', 'أصول', NULL, true)
  ON CONFLICT (user_id, account_code) DO NOTHING;
END;
$$;
