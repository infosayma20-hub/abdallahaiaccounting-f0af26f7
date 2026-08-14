CREATE OR REPLACE FUNCTION public.pos_link_loyalty_contact(_card_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_member public.loyalty_members%ROWTYPE;
  v_contact_id uuid;
  v_name text;
  v_phone text;
BEGIN
  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL THEN RAISE EXCEPTION 'no_owner'; END IF;

  SELECT * INTO v_member FROM public.loyalty_members
   WHERE user_id = v_owner AND upper(card_code) = upper(trim(_card_code)) AND is_active = true
   LIMIT 1;
  IF v_member.id IS NULL THEN RETURN NULL; END IF;

  IF v_member.contact_id IS NOT NULL THEN
    v_contact_id := v_member.contact_id;
  ELSE
    v_name  := NULLIF(trim(COALESCE(v_member.first_name,'') || ' ' || COALESCE(v_member.last_name,'')), '');
    v_phone := COALESCE(v_member.phone_e164, v_member.phone);

    IF v_phone IS NOT NULL AND length(regexp_replace(v_phone,'\D','','g')) >= 9 THEN
      SELECT id INTO v_contact_id FROM public.contacts
       WHERE user_id = v_owner
         AND replace(COALESCE(phone,''),' ','') LIKE '%' || right(regexp_replace(v_phone,'\D','','g'), 9) || '%'
       LIMIT 1;
    END IF;

    IF v_contact_id IS NULL AND v_name IS NOT NULL THEN
      SELECT id INTO v_contact_id FROM public.contacts
       WHERE user_id = v_owner AND contact_name = v_name LIMIT 1;
    END IF;

    IF v_contact_id IS NULL THEN
      INSERT INTO public.contacts (user_id, contact_name, contact_type, phone, is_active, source, notes)
      VALUES (v_owner, COALESCE(v_name, 'زبون ولاء ' || v_member.card_code), 'عميل', v_phone, true, 'loyalty',
              'تم إنشاؤه تلقائياً من بطاقة الولاء ' || v_member.card_code)
      RETURNING id INTO v_contact_id;
    END IF;

    UPDATE public.loyalty_members SET contact_id = v_contact_id, updated_at = now() WHERE id = v_member.id;
  END IF;

  SELECT contact_name, phone INTO v_name, v_phone FROM public.contacts WHERE id = v_contact_id;

  RETURN jsonb_build_object(
    'contact_id', v_contact_id,
    'contact_name', v_name,
    'phone', v_phone,
    'loyalty_card_code', v_member.card_code,
    'loyalty_points', COALESCE(v_member.points_balance, 0)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.pos_link_loyalty_contact(text) TO authenticated;