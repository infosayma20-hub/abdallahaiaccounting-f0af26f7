CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON public.contacts USING gin (contact_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);

-- بطاقة العميل بطلب واحد. SECURITY INVOKER: كل القراءات تمر عبر RLS الحالية.
CREATE OR REPLACE FUNCTION public.get_contact_card(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_contact public.contacts%ROWTYPE;
  v_ids uuid[];
  v_name text;
BEGIN
  SELECT * INTO v_contact FROM public.contacts WHERE id = p_contact_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('contact', NULL);
  END IF;
  v_name := btrim(coalesce(v_contact.contact_name, ''));

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_ids
  FROM public.contacts
  WHERE user_id = v_contact.user_id AND contact_name = v_name;
  IF NOT (p_contact_id = ANY(v_ids)) THEN v_ids := v_ids || p_contact_id; END IF;

  RETURN jsonb_build_object(
    'contact', to_jsonb(v_contact),
    'transactions', coalesce((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.transaction_date DESC)
      FROM (
        SELECT * FROM public.transactions
        WHERE is_deleted = false AND contact_id = ANY(v_ids)
        ORDER BY transaction_date DESC
        LIMIT 500
      ) t), '[]'::jsonb),
    'cheques', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.cheque_date DESC)
      FROM public.cheques c
      WHERE c.user_id = v_contact.user_id
        AND (c.contact_id = ANY(v_ids) OR c.party_name = v_name)), '[]'::jsonb),
    'balance', public.get_contact_balance(p_contact_id, (now() AT TIME ZONE 'Asia/Hebron')::date, NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_card(uuid) TO authenticated;