CREATE OR REPLACE FUNCTION public.create_customer_from_rep(
  p_name text,
  p_phone text,
  p_address text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_credit_limit numeric DEFAULT NULL,
  p_payment_terms_days integer DEFAULT 0
)
RETURNS public.contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_rep record;
  v_phone text;
  v_dup record;
  v_new public.contacts;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT id, user_id INTO v_rep
  FROM public.sales_representatives
  WHERE auth_user_id = v_auth
  LIMIT 1;

  IF v_rep.id IS NULL THEN
    RAISE EXCEPTION 'NOT_A_SALES_REP';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'NAME_REQUIRED';
  END IF;

  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  IF length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'PHONE_INVALID';
  END IF;

  SELECT id, contact_name, contact_type INTO v_dup
  FROM public.contacts
  WHERE user_id = v_rep.user_id AND phone = v_phone
  LIMIT 1;

  IF v_dup.id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_PHONE:%:%', v_dup.id, v_dup.contact_name;
  END IF;

  INSERT INTO public.contacts (
    user_id, contact_name, contact_type, phone, address, notes,
    is_active, is_archived, current_balance, credit_limit, payment_terms_days,
    source, sales_rep_id
  ) VALUES (
    v_rep.user_id, trim(p_name), 'عميل', v_phone,
    NULLIF(trim(coalesce(p_address, '')), ''),
    NULLIF(trim(coalesce(p_notes, '')), ''),
    true, false, 0, p_credit_limit, coalesce(p_payment_terms_days, 0),
    'rep_portal', v_rep.id
  )
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_customer_from_rep(text, text, text, text, numeric, integer) TO authenticated;