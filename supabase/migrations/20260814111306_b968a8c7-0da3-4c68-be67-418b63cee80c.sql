CREATE OR REPLACE FUNCTION public.pos_search_loyalty_customers(_q text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
  v_q text;
  v_digits text;
  v_res jsonb;
BEGIN
  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL THEN RETURN '[]'::jsonb; END IF;

  v_q := trim(COALESCE(_q, ''));
  IF length(v_q) < 2 THEN RETURN '[]'::jsonb; END IF;
  v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'contact_name'), '[]'::jsonb) INTO v_res
  FROM (
    SELECT jsonb_build_object(
      'contact_id', c.id,
      'member_id', m.id,
      'contact_name', COALESCE(c.contact_name, trim(COALESCE(m.first_name,'') || ' ' || COALESCE(m.last_name,''))),
      'phone', COALESCE(c.phone, m.phone_e164),
      'address', c.address,
      'loyalty_card_code', m.card_code,
      'loyalty_points', COALESCE(m.points_balance, 0),
      'wallet_balance', COALESCE(w.balance, 0),
      'wallet_frozen', COALESCE(w.is_frozen, false)
    ) AS t
    FROM public.loyalty_members m
    LEFT JOIN public.contacts c ON c.id = m.contact_id
    LEFT JOIN public.customer_wallets w ON w.contact_id = m.contact_id AND w.user_id = v_owner
    WHERE m.user_id = v_owner
      AND m.is_active = true
      AND (
        COALESCE(c.contact_name, '') ILIKE '%' || v_q || '%'
        OR COALESCE(m.first_name, '') ILIKE '%' || v_q || '%'
        OR COALESCE(m.last_name, '') ILIKE '%' || v_q || '%'
        OR upper(COALESCE(m.card_code, '')) = upper(v_q)
        OR (
          length(v_digits) >= 4 AND (
            regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%'
            OR regexp_replace(COALESCE(m.phone_e164, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%'
          )
        )
      )
    LIMIT 25
  ) s;

  RETURN v_res;
END;
$fn$;

REVOKE ALL ON FUNCTION public.pos_search_loyalty_customers(text) FROM public;
GRANT EXECUTE ON FUNCTION public.pos_search_loyalty_customers(text) TO authenticated;